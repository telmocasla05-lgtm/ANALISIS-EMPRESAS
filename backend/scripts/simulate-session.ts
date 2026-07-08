// Simulación end-to-end de una sesión de trabajo de 2 horas (§8):
// login por PIN → ON → 1440 registros (uno cada 5 s, en lotes de 12 como la app
// de escritorio) → OFF → resumen semanal admin. Comprueba que la agregación por
// categoría del resumen cuadra con lo enviado.
//
// Usa la BD de backend/.env (desarrollo) con una empresa desechable
// "Empresa Simulación" que se borra y recrea en cada ejecución. Requiere que
// las reglas del sector CLINICA existan (npm run db:seed).
//
// Uso: npx tsx scripts/simulate-session.ts
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Sector } from '../src/generated/prisma/client.js';
import { createApp } from '../src/app.js';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

const SLUG = 'empresa-simulacion';
const ADMIN_EMAIL = 'admin@simulacion.dev';
const PIN = '5555';

const SAMPLE_SECONDS = 5; // un registro cada 5 s
const BATCH_SIZE = 12; // la app de escritorio envía lotes de ~60 s
const TOTAL_SECONDS = 2 * 60 * 60;
const TOTAL_RECORDS = TOTAL_SECONDS / SAMPLE_SECONDS; // 1440
const SAMPLE_CAP_SECONDS = 10; // debe coincidir con services/resumen.ts

// Plan de la sesión: qué "hizo" el empleado durante las 2 horas.
// Las apps matchean la plantilla del sector clínica del seed; la app
// desconocida y los tramos idle prueban los casos "Sin categorizar" e "Inactivo".
const PLAN: Array<{ app: string; records: number; idle?: boolean; expectLabel: string }> = [
  { app: 'Microsoft Excel', records: 600, expectLabel: 'Hojas de cálculo / gestión manual' },
  { app: 'Microsoft Outlook', records: 360, expectLabel: 'Email' },
  { app: 'WhatsApp', records: 240, expectLabel: 'Mensajería / atención cliente' },
  { app: 'Gestión Clínica Pro', records: 120, expectLabel: 'Sistema de gestión' },
  { app: 'AppDesconocida', records: 72, expectLabel: 'Sin categorizar / revisar' },
  { app: 'idle', records: 48, idle: true, expectLabel: 'Inactivo / pausa' },
];

interface Registro {
  timestamp: string;
  app: string;
  isIdle?: boolean;
  expectLabel: string;
}

async function main() {
  const planTotal = PLAN.reduce((a, p) => a + p.records, 0);
  if (planTotal !== TOTAL_RECORDS) throw new Error(`El plan suma ${planTotal} registros, esperados ${TOTAL_RECORDS}`);

  const sectorRules = await prisma.categorizationRule.count({ where: { sector: Sector.CLINICA, active: true } });
  if (sectorRules === 0) throw new Error('No hay reglas del sector CLINICA. Ejecuta antes: npm run db:seed');

  // ── Empresa desechable ────────────────────────────────────────────────
  await prisma.adminUser.deleteMany({ where: { email: ADMIN_EMAIL } });
  await prisma.company.deleteMany({ where: { slug: SLUG } }); // cascada: roles, empleados, sesiones, registros

  const company = await prisma.company.create({
    data: {
      name: 'Empresa Simulación',
      slug: SLUG,
      sector: Sector.CLINICA,
      avgHourlyCostCents: 2000,
      roles: { create: [{ name: 'Recepción' }] },
    },
    include: { roles: true },
  });
  const employee = await prisma.employee.create({
    data: {
      companyId: company.id,
      roleId: company.roles[0]!.id,
      name: 'Empleada Simulada',
      pinHash: await bcrypt.hash(PIN, 10),
    },
  });
  await prisma.adminUser.create({
    data: {
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash('simulacion', 10),
      role: 'CLIENTE',
      companyId: company.id,
    },
  });

  // ── Servidor real en puerto efímero ───────────────────────────────────
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No se pudo obtener el puerto');
  const base = `http://localhost:${address.port}/api`;

  async function api(path: string, init?: RequestInit & { token?: string }): Promise<{ status: number; body: any }> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
    });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  }

  try {
    // ── Login PIN + ON ──────────────────────────────────────────────────
    const login = await api('/auth/pin', { method: 'POST', body: JSON.stringify({ employeeId: employee.id, pin: PIN }) });
    if (login.status !== 200) throw new Error(`Login PIN falló: ${login.status} ${JSON.stringify(login.body)}`);
    const token = login.body.token as string;

    const on = await api('/sesiones/on', { method: 'POST', token, body: JSON.stringify({ device: 'DESKTOP' }) });
    if (on.status !== 201) throw new Error(`ON falló: ${on.status} ${JSON.stringify(on.body)}`);
    const sessionId = on.body.id as string;

    // ── 2 horas de registros, uno cada 5 s ─────────────────────────────
    const start = new Date(Date.now() - (TOTAL_SECONDS + 300) * 1000); // empezó hace ~2h05m
    const registros: Registro[] = [];
    for (const tramo of PLAN) {
      for (let i = 0; i < tramo.records; i++) {
        registros.push({
          timestamp: new Date(start.getTime() + registros.length * SAMPLE_SECONDS * 1000).toISOString(),
          app: tramo.app,
          ...(tramo.idle ? { isIdle: true } : {}),
          expectLabel: tramo.expectLabel,
        });
      }
    }

    let enviados = 0;
    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const lote = registros.slice(i, i + BATCH_SIZE).map(({ expectLabel: _e, ...r }) => r);
      const res = await api(`/sesiones/${sessionId}/registros`, { method: 'POST', token, body: JSON.stringify({ registros: lote }) });
      if (res.status !== 201) throw new Error(`Lote ${i / BATCH_SIZE} falló: ${res.status} ${JSON.stringify(res.body)}`);
      enviados += res.body.insertados as number;
    }

    const off = await api(`/sesiones/${sessionId}/off`, { method: 'POST', token });
    if (off.status !== 200) throw new Error(`OFF falló: ${off.status} ${JSON.stringify(off.body)}`);

    // ── Horas esperadas: misma regla de estimación que services/resumen.ts
    // (cada lectura dura hasta la siguiente, con tope de 10 s; la última
    // lectura de la sesión cuenta el tope entero).
    const expectedSeconds = new Map<string, number>();
    for (let i = 0; i < registros.length; i++) {
      const seconds = i + 1 < registros.length ? SAMPLE_SECONDS : SAMPLE_CAP_SECONDS;
      const label = registros[i]!.expectLabel;
      expectedSeconds.set(label, (expectedSeconds.get(label) ?? 0) + seconds);
    }

    // ── Resumen semanal vía API admin ───────────────────────────────────
    const adminLogin = await api('/admin/auth/login', { method: 'POST', body: JSON.stringify({ email: ADMIN_EMAIL, password: 'simulacion' }) });
    const adminToken = adminLogin.body.token as string;
    const semana = start.toISOString().slice(0, 10);
    const resumen = await api(`/admin/empresas/${company.id}/resumen?semana=${semana}`, { token: adminToken });
    if (resumen.status !== 200) throw new Error(`Resumen falló: ${resumen.status} ${JSON.stringify(resumen.body)}`);

    // ── Comparación ─────────────────────────────────────────────────────
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const porCategoria = resumen.body.porCategoria as Array<{ categoryName: string; horas: number }>;
    const obtainedByLabel = new Map(porCategoria.map((c) => [c.categoryName, c.horas]));

    console.log(`Sesión simulada: ${enviados} registros (${TOTAL_SECONDS / 3600} h a 1 registro/${SAMPLE_SECONDS} s, lotes de ${BATCH_SIZE})`);
    console.log('');
    console.log('Categoría                              enviados   esperado(h)   resumen(h)   ');
    let ok = true;
    for (const tramo of PLAN) {
      const expected = round2((expectedSeconds.get(tramo.expectLabel) ?? 0) / 3600);
      const obtained = obtainedByLabel.get(tramo.expectLabel);
      const match = obtained !== undefined && Math.abs(obtained - expected) < 0.005;
      if (!match) ok = false;
      console.log(
        `${tramo.expectLabel.padEnd(40)}${String(tramo.records).padStart(6)}${expected.toFixed(2).padStart(12)}${(obtained ?? NaN).toFixed(2).padStart(13)}   ${match ? '✓' : '✗ NO CUADRA'}`
      );
    }

    const totalExpected = round2([...expectedSeconds.values()].reduce((a, b) => a + b, 0) / 3600);
    const totalObtained = round2(porCategoria.reduce((a, c) => a + c.horas, 0));
    const empleado = (resumen.body.porEmpleado as Array<{ employeeName: string; horas: number }>).find(
      (e) => e.employeeName === 'Empleada Simulada'
    );
    const totalOk = Math.abs(totalObtained - totalExpected) < 0.01 && empleado !== undefined && Math.abs(empleado.horas - totalExpected) < 0.01;
    if (!totalOk) ok = false;
    console.log('');
    console.log(`Total: esperado ${totalExpected.toFixed(2)} h · resumen ${totalObtained.toFixed(2)} h · empleada ${empleado?.horas.toFixed(2) ?? '—'} h   ${totalOk ? '✓' : '✗ NO CUADRA'}`);
    console.log('');
    console.log(ok ? '✅ La agregación por categoría cuadra con lo enviado.' : '❌ Hay desviaciones entre lo enviado y el resumen.');
    if (!ok) process.exitCode = 1;
  } finally {
    server.close();
  }
}

main()
  .catch((error) => {
    console.error('Error en la simulación:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
