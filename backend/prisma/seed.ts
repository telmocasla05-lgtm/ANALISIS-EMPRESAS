// Seed de desarrollo: empresa "Clínica Demo" + plantilla de categorización
// del sector clínica (docs/ESPECIFICACION.md §9) + plantillas de automatización.
// Idempotente: borra y recrea los datos de demo en cada ejecución.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Sector, PatternType, AdminRole } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

const DEMO_COMPANY = 'Clínica Demo';
const DEMO_SLUG = 'clinica-demo';

// Credenciales solo para desarrollo — en producción las crea Digital Power.
const ADMIN_USERS = [
  { email: 'superadmin@digitalpower.dev', password: 'digitalpower', role: AdminRole.SUPERADMIN, forCompany: false },
  { email: 'admin@clinicademo.dev', password: 'clinicademo', role: AdminRole.CLIENTE, forCompany: true },
];

// PINs solo para desarrollo — en producción los asigna Digital Power por empleado.
const EMPLOYEES = [
  { name: 'Ana García', role: 'Gerente', pin: '1234' },
  { name: 'Luis Martín', role: 'Recepción', pin: '2345' },
  { name: 'Carmen Ruiz', role: 'Recepción', pin: '4567' },
  { name: 'María López', role: 'Médico', pin: '3456' },
];

const CLINIC_CATEGORIES = [
  'Hojas de cálculo / gestión manual',
  'Email',
  'Mensajería / atención cliente',
  'Sistema de gestión',
  'Sin categorizar / revisar',
];

// Plantilla clínica (§9). El fallback "dominio no reconocido → Sin categorizar"
// lo aplica el motor de categorización, no es una fila de esta tabla.
const CLINIC_RULES: Array<{ type: PatternType; pattern: string; category: string }> = [
  { type: 'APP', pattern: 'Excel', category: 'Hojas de cálculo / gestión manual' },
  { type: 'APP', pattern: 'Google Sheets', category: 'Hojas de cálculo / gestión manual' },
  { type: 'DOMAIN', pattern: 'docs.google.com', category: 'Hojas de cálculo / gestión manual' },
  { type: 'APP', pattern: 'Outlook', category: 'Email' },
  { type: 'APP', pattern: 'Gmail', category: 'Email' },
  { type: 'DOMAIN', pattern: 'mail.google.com', category: 'Email' },
  { type: 'APP', pattern: 'WhatsApp', category: 'Mensajería / atención cliente' },
  { type: 'DOMAIN', pattern: 'web.whatsapp.com', category: 'Mensajería / atención cliente' },
  // Placeholder: se sustituye por el software real de cada clínica al configurar el cliente.
  { type: 'APP', pattern: 'Gestión Clínica', category: 'Sistema de gestión' },
];

const CLINIC_AUTOMATIONS = [
  {
    title: 'Recordatorios de cita automáticos por WhatsApp',
    description:
      'Envío automático de confirmaciones y recordatorios de cita a pacientes vía WhatsApp, ' +
      'reduciendo el tiempo de la categoría "Mensajería / atención cliente".',
    sortOrder: 1,
  },
  {
    title: 'Clasificación y respuesta automática de emails frecuentes',
    description:
      'Triaje automático del buzón (citas, recetas, dudas frecuentes) con borradores de respuesta, ' +
      'reduciendo el tiempo de la categoría "Email".',
    sortOrder: 2,
  },
  {
    title: 'Volcado de hojas de cálculo al sistema de gestión',
    description:
      'Sincronización automática de los datos que hoy se copian a mano entre Excel/Sheets y el ' +
      'software de gestión clínica, eliminando la doble entrada de datos.',
    sortOrder: 3,
  },
];

async function main() {
  // ── Limpieza (orden inverso a las FKs) ──────────────────────────────
  await prisma.adminUser.deleteMany({ where: { email: { in: ADMIN_USERS.map((a) => a.email) } } });
  await prisma.company.deleteMany({ where: { name: DEMO_COMPANY } }); // cascada: roles, empleados, sesiones, registros
  await prisma.categorizationRule.deleteMany({ where: { sector: Sector.CLINICA } });
  await prisma.category.deleteMany({ where: { sector: Sector.CLINICA } });
  await prisma.automationTemplate.deleteMany({ where: { sector: Sector.CLINICA } });

  // ── Plantilla del sector clínica (ámbito sector, compartida) ────────
  const categoryIdByName = new Map<string, string>();
  for (const name of CLINIC_CATEGORIES) {
    const category = await prisma.category.create({ data: { sector: Sector.CLINICA, name } });
    categoryIdByName.set(name, category.id);
  }

  await prisma.categorizationRule.createMany({
    data: CLINIC_RULES.map((rule, index) => ({
      sector: Sector.CLINICA,
      patternType: rule.type,
      pattern: rule.pattern,
      categoryId: categoryIdByName.get(rule.category)!,
      priority: (index + 1) * 10,
    })),
  });

  await prisma.automationTemplate.createMany({
    data: CLINIC_AUTOMATIONS.map((a) => ({ sector: Sector.CLINICA, ...a })),
  });

  // ── Empresa demo con roles y empleados ──────────────────────────────
  const company = await prisma.company.create({
    data: {
      name: DEMO_COMPANY,
      slug: DEMO_SLUG,
      sector: Sector.CLINICA,
      avgHourlyCostCents: 2000, // 20 €/h de coste medio (§10)
      inactivityMinutes: 10,
      roles: { create: [{ name: 'Gerente' }, { name: 'Recepción' }, { name: 'Médico' }] },
    },
    include: { roles: true },
  });

  const roleIdByName = new Map(company.roles.map((r) => [r.name, r.id]));
  for (const employee of EMPLOYEES) {
    await prisma.employee.create({
      data: {
        companyId: company.id,
        roleId: roleIdByName.get(employee.role)!,
        name: employee.name,
        pinHash: await bcrypt.hash(employee.pin, 10),
      },
    });
  }

  // ── Usuarios admin de demo (panel) ──────────────────────────────────
  for (const admin of ADMIN_USERS) {
    await prisma.adminUser.create({
      data: {
        email: admin.email,
        passwordHash: await bcrypt.hash(admin.password, 10),
        role: admin.role,
        companyId: admin.forCompany ? company.id : null,
      },
    });
  }

  // ── Resumen ─────────────────────────────────────────────────────────
  const counts = {
    empresas: await prisma.company.count(),
    roles: await prisma.role.count(),
    empleados: await prisma.employee.count(),
    categorias: await prisma.category.count(),
    reglas: await prisma.categorizationRule.count(),
    plantillasAutomatizacion: await prisma.automationTemplate.count(),
    adminUsers: await prisma.adminUser.count(),
  };
  console.log('Seed completado:', counts);
  console.log(`Slug de la empresa demo: ${DEMO_SLUG}`);
}

main()
  .catch((error) => {
    console.error('Error en el seed:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
