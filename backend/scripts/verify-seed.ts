// Verificación del seed de desarrollo (se ejecuta con: tsx scripts/verify-seed.ts)
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Sector } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

async function main() {
  const company = await prisma.company.findFirstOrThrow({
    where: { name: 'Clínica Demo' },
    include: { roles: true, employees: { include: { role: true } } },
  });
  console.log(`Empresa: ${company.name} · sector ${company.sector} · ${company.avgHourlyCostCents / 100} €/h · inactividad ${company.inactivityMinutes} min`);
  console.log(`Roles (${company.roles.length}): ${company.roles.map((r) => r.name).join(', ')}`);
  for (const e of company.employees) {
    console.log(`  Empleado: ${e.name} — ${e.role.name} — hash PIN: ${e.pinHash.slice(0, 20)}…`);
  }

  const ana = company.employees.find((e) => e.name === 'Ana García')!;
  console.log('PIN 1234 para Ana (correcto):', await bcrypt.compare('1234', ana.pinHash));
  console.log('PIN 9999 para Ana (incorrecto):', await bcrypt.compare('9999', ana.pinHash));

  const rules = await prisma.categorizationRule.findMany({
    where: { sector: Sector.CLINICA },
    include: { category: true },
    orderBy: { priority: 'asc' },
  });
  console.log(`Reglas plantilla clínica (${rules.length}):`);
  for (const r of rules) {
    console.log(`  [${r.patternType}] "${r.pattern}" → ${r.category.name} (prioridad ${r.priority})`);
  }

  const automations = await prisma.automationTemplate.findMany({
    where: { sector: Sector.CLINICA },
    orderBy: { sortOrder: 'asc' },
  });
  console.log(`Plantillas de automatización (${automations.length}): ${automations.map((a) => a.title).join(' · ')}`);

  // El CHECK de doble ámbito debe rechazar una categoría con sector Y empresa a la vez
  try {
    await prisma.category.create({
      data: { sector: Sector.CLINICA, companyId: company.id, name: 'inválida: doble ámbito' },
    });
    console.error('FALLO: el CHECK de doble ámbito NO rechazó una fila inválida');
    process.exitCode = 1;
  } catch {
    console.log('CHECK de doble ámbito: OK (rechaza sector+empresa simultáneos)');
  }
}

main()
  .catch((error) => {
    console.error('Error en la verificación:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
