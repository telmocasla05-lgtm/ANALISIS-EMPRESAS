import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers/app.js';
import { resetDatabase } from './helpers/db.js';
import {
  createAdminUser,
  createCategory,
  createCompany,
  createEmployee,
  createRole,
} from './helpers/fixtures.js';
import { prisma } from '../src/lib/prisma.js';
import { AdminRole, Device } from '../src/generated/prisma/client.js';

beforeEach(async () => {
  await resetDatabase();
});

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/admin/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

async function createSession(companyId: string, employeeId: string, startedAt: Date, endedAt: Date | null = null) {
  return prisma.workSession.create({
    data: { companyId, employeeId, device: Device.DESKTOP, startedAt, endedAt },
  });
}

// N registros espaciados exactamente 10 s (el tope de estimación de duración):
// cada uno aporta 10 s, así que N registros = N*10 segundos de tiempo estimado.
async function createRecords(
  companyId: string,
  sessionId: string,
  from: Date,
  count: number,
  opts: { app?: string; domain?: string | null; windowTitle?: string | null; categoryId?: string | null; isIdle?: boolean } = {}
) {
  await prisma.activityRecord.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      companyId,
      sessionId,
      timestamp: new Date(from.getTime() + i * 10_000),
      app: opts.app ?? 'Excel',
      domain: opts.domain ?? null,
      windowTitle: opts.windowTitle ?? null,
      categoryId: opts.categoryId ?? null,
      isIdle: opts.isIdle ?? false,
    })),
  });
}

describe('panel admin — empresas y ajustes', () => {
  it('GET /admin/empresas: superadmin ve todas, cliente solo la suya', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    await createAdminUser({ email: 'super@dp.dev', password: 'secreto', role: AdminRole.SUPERADMIN });
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: companyA.id });

    const superToken = await loginAdmin('super@dp.dev', 'secreto');
    const superRes = await request(app).get('/api/admin/empresas').set('Authorization', `Bearer ${superToken}`);
    expect(superRes.status).toBe(200);
    expect(superRes.body.map((c: { id: string }) => c.id).sort()).toEqual([companyA.id, companyB.id].sort());

    const clienteToken = await loginAdmin('cliente@a.dev', 'secreto');
    const clienteRes = await request(app).get('/api/admin/empresas').set('Authorization', `Bearer ${clienteToken}`);
    expect(clienteRes.status).toBe(200);
    expect(clienteRes.body).toHaveLength(1);
    expect(clienteRes.body[0].id).toBe(companyA.id);
    expect(clienteRes.body[0].avgHourlyCostCents).toBe(2000);
  });

  it('PUT /admin/empresas/:id actualiza los ajustes y valida los rangos', async () => {
    const company = await createCompany({ name: 'Clínica Ajustes' });
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: company.id });
    const token = await loginAdmin('cliente@a.dev', 'secreto');

    const update = await request(app)
      .put(`/api/admin/empresas/${company.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ avgHourlyCostCents: 2500, inactivityMinutes: 15, sampleIntervalSeconds: 8 });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ avgHourlyCostCents: 2500, inactivityMinutes: 15, sampleIntervalSeconds: 8 });

    const detail = await request(app).get(`/api/admin/empresas/${company.id}`).set('Authorization', `Bearer ${token}`);
    expect(detail.body).toMatchObject({ avgHourlyCostCents: 2500, inactivityMinutes: 15, sampleIntervalSeconds: 8 });

    // Fuera del rango 5-10 s recomendado por la especificación (§8)
    const invalid = await request(app)
      .put(`/api/admin/empresas/${company.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sampleIntervalSeconds: 3 });
    expect(invalid.status).toBe(400);
  });

  it('un cliente no puede ver ni tocar los ajustes de otra empresa', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: companyA.id });
    const token = await loginAdmin('cliente@a.dev', 'secreto');

    for (const req_ of [
      request(app).get(`/api/admin/empresas/${companyB.id}`),
      request(app).put(`/api/admin/empresas/${companyB.id}`).send({ inactivityMinutes: 5 }),
      request(app).get(`/api/admin/empresas/${companyB.id}/sesiones`),
      request(app).get(`/api/admin/empresas/${companyB.id}/sin-categorizar`),
      request(app).get(`/api/admin/empresas/${companyB.id}/evolucion`),
      request(app).get(`/api/admin/empresas/${companyB.id}/categorias`),
    ]) {
      const res = await req_.set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    }
  });
});

describe('panel admin — resumen por rango de fechas', () => {
  it('filtra por desde/hasta y excluye la inactividad de los totales', async () => {
    const company = await createCompany({ name: 'Clínica Resumen' }); // 20 €/h
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Ana', pin: '1111' });
    const category = await createCategory(company.id, 'Email');
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: company.id });
    const token = await loginAdmin('cliente@a.dev', 'secreto');

    const day1 = new Date('2026-01-05T09:00:00.000Z');
    const day2 = new Date('2026-01-06T09:00:00.000Z');
    const s1 = await createSession(company.id, employee.id, day1, new Date('2026-01-05T10:00:00.000Z'));
    const s2 = await createSession(company.id, employee.id, day2, new Date('2026-01-06T10:00:00.000Z'));
    // Día 1: 36 registros activos (0,1 h) + 36 idle (0,1 h). Día 2: 72 activos (0,2 h).
    await createRecords(company.id, s1.id, day1, 36, { categoryId: category.id });
    await createRecords(company.id, s1.id, new Date('2026-01-05T09:30:00.000Z'), 36, { isIdle: true });
    await createRecords(company.id, s2.id, day2, 72, { categoryId: category.id });

    const soloDia1 = await request(app)
      .get(`/api/admin/empresas/${company.id}/resumen?desde=2026-01-05&hasta=2026-01-05`)
      .set('Authorization', `Bearer ${token}`);
    expect(soloDia1.status).toBe(200);
    expect(soloDia1.body.totales).toEqual({ horas: 0.1, costeEstimado: 2, horasInactivas: 0.1 });
    const idle = soloDia1.body.porCategoria.find((c: { categoryName: string }) => c.categoryName === 'Inactivo / pausa');
    expect(idle).toMatchObject({ horas: 0.1, costeEstimado: 0 });

    const rangoCompleto = await request(app)
      .get(`/api/admin/empresas/${company.id}/resumen?desde=2026-01-05&hasta=2026-01-06`)
      .set('Authorization', `Bearer ${token}`);
    expect(rangoCompleto.body.totales.horas).toBe(0.3);
    expect(rangoCompleto.body.totales.costeEstimado).toBe(6);
    expect(rangoCompleto.body.porEmpleado[0]).toMatchObject({ employeeName: 'Ana', horas: 0.3 });

    const invalido = await request(app)
      .get(`/api/admin/empresas/${company.id}/resumen?desde=2026-01-06&hasta=2026-01-05`)
      .set('Authorization', `Bearer ${token}`);
    expect(invalido.status).toBe(400);
  });
});

describe('panel admin — evolución semanal', () => {
  it('agrega horas activas por semana natural', async () => {
    const company = await createCompany({ name: 'Clínica Evolución' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Ana', pin: '1111' });
    const category = await createCategory(company.id, 'Email');
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: company.id });
    const token = await loginAdmin('cliente@a.dev', 'secreto');

    // Lunes UTC de la semana en curso + 1 h; y el de la semana anterior.
    const now = new Date();
    const day = now.getUTCDay();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((day + 6) % 7), 1));
    const prevMonday = new Date(monday.getTime() - 7 * 24 * 3600 * 1000);

    const s1 = await createSession(company.id, employee.id, prevMonday, new Date(prevMonday.getTime() + 3600_000));
    const s2 = await createSession(company.id, employee.id, monday);
    await createRecords(company.id, s1.id, prevMonday, 36, { categoryId: category.id }); // 0,1 h
    await createRecords(company.id, s2.id, monday, 72, { categoryId: category.id }); // 0,2 h
    await createRecords(company.id, s2.id, new Date(monday.getTime() + 1800_000), 36, { isIdle: true }); // no cuenta

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/evolucion?semanas=2`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toEqual({ semana: prevMonday.toISOString().slice(0, 10), horas: 0.1, costeEstimado: 2 });
    expect(res.body[1]).toEqual({ semana: monday.toISOString().slice(0, 10), horas: 0.2, costeEstimado: 4 });
  });
});

describe('panel admin — registros sin categorizar', () => {
  it('agrupa por app y dominio, excluye idle y categorizados, y ordena por horas', async () => {
    const company = await createCompany({ name: 'Clínica Revisar' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Ana', pin: '1111' });
    const category = await createCategory(company.id, 'Email');
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: company.id });
    const token = await loginAdmin('cliente@a.dev', 'secreto');

    const start = new Date('2026-01-05T09:00:00.000Z');
    const session = await createSession(company.id, employee.id, start);
    await createRecords(company.id, session.id, start, 72, { app: 'Chrome', domain: 'misteriosa.example', windowTitle: 'Panel interno' });
    await createRecords(company.id, session.id, new Date('2026-01-05T10:00:00.000Z'), 36, { app: 'Notas' });
    await createRecords(company.id, session.id, new Date('2026-01-05T11:00:00.000Z'), 36, { app: 'Outlook', categoryId: category.id });
    await createRecords(company.id, session.id, new Date('2026-01-05T12:00:00.000Z'), 36, { app: 'Chrome', isIdle: true });

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/sin-categorizar?desde=2026-01-05&hasta=2026-01-05`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { app: 'Chrome', domain: 'misteriosa.example', ejemploTitulo: 'Panel interno', registros: 72, horas: 0.2 },
      { app: 'Notas', domain: null, ejemploTitulo: null, registros: 36, horas: 0.1 },
    ]);
  });
});

describe('panel admin — sesiones (registro horario)', () => {
  it('lista sesiones del rango con duración y estado', async () => {
    const company = await createCompany({ name: 'Clínica Sesiones' });
    const role = await createRole(company.id);
    const employee = await createEmployee(company.id, role.id, { name: 'Ana', pin: '1111' });
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: company.id });
    const token = await loginAdmin('cliente@a.dev', 'secreto');

    await createSession(company.id, employee.id, new Date('2026-01-05T09:00:00.000Z'), new Date('2026-01-05T10:30:00.000Z'));
    await createSession(company.id, employee.id, new Date('2026-01-06T09:00:00.000Z')); // abierta
    await createSession(company.id, employee.id, new Date('2025-12-01T09:00:00.000Z'), new Date('2025-12-01T17:00:00.000Z')); // fuera de rango

    const res = await request(app)
      .get(`/api/admin/empresas/${company.id}/sesiones?desde=2026-01-05&hasta=2026-01-06`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Orden descendente por inicio: primero la abierta del día 6.
    expect(res.body[0]).toMatchObject({ employeeName: 'Ana', device: 'DESKTOP', endedAt: null });
    expect(res.body[0].duracionMinutos).toBeGreaterThan(0);
    expect(res.body[1]).toMatchObject({ endedAt: '2026-01-05T10:30:00.000Z', duracionMinutos: 90 });
  });
});

describe('panel admin — crear regla con aplicarAExistentes', () => {
  it('recategoriza los registros sin categoría que coinciden, sin tocar otras empresas ni lo ya categorizado', async () => {
    const companyA = await createCompany({ name: 'Clínica A' });
    const companyB = await createCompany({ name: 'Clínica B' });
    const roleA = await createRole(companyA.id);
    const roleB = await createRole(companyB.id);
    const empleadoA = await createEmployee(companyA.id, roleA.id, { name: 'Ana', pin: '1111' });
    const empleadoB = await createEmployee(companyB.id, roleB.id, { name: 'Berta', pin: '2222' });
    const categoriaA = await createCategory(companyA.id, 'Hojas de cálculo');
    const otraCategoriaA = await createCategory(companyA.id, 'Email');
    await createAdminUser({ email: 'cliente@a.dev', password: 'secreto', role: AdminRole.CLIENTE, companyId: companyA.id });
    const token = await loginAdmin('cliente@a.dev', 'secreto');

    const start = new Date('2026-01-05T09:00:00.000Z');
    const sessionA = await createSession(companyA.id, empleadoA.id, start);
    const sessionB = await createSession(companyB.id, empleadoB.id, start);
    await createRecords(companyA.id, sessionA.id, start, 10, { app: 'Microsoft Excel' }); // sin categoría → debe cambiar
    await createRecords(companyA.id, sessionA.id, new Date('2026-01-05T10:00:00.000Z'), 5, { app: 'Excel', categoryId: otraCategoriaA.id }); // ya categorizado → no se toca
    await createRecords(companyA.id, sessionA.id, new Date('2026-01-05T11:00:00.000Z'), 5, { app: 'Excel', isIdle: true }); // idle → no se toca
    await createRecords(companyB.id, sessionB.id, start, 7, { app: 'Excel' }); // otra empresa → no se toca

    const res = await request(app)
      .post(`/api/admin/empresas/${companyA.id}/reglas`)
      .set('Authorization', `Bearer ${token}`)
      .send({ patternType: 'APP', pattern: 'excel', categoryId: categoriaA.id, aplicarAExistentes: true });
    expect(res.status).toBe(201);
    expect(res.body.registrosActualizados).toBe(10);

    expect(await prisma.activityRecord.count({ where: { companyId: companyA.id, categoryId: categoriaA.id } })).toBe(10);
    expect(await prisma.activityRecord.count({ where: { companyId: companyA.id, categoryId: otraCategoriaA.id } })).toBe(5);
    expect(await prisma.activityRecord.count({ where: { companyId: companyB.id, categoryId: { not: null } } })).toBe(0);
  });
});
