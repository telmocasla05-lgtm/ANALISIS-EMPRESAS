import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma.js';
import { AdminRole, PatternType, Sector } from '../../src/generated/prisma/client.js';

let slugCounter = 0;

export async function createCompany(opts: { name: string; sector?: Sector; avgHourlyCostCents?: number }) {
  slugCounter += 1;
  return prisma.company.create({
    data: {
      name: opts.name,
      slug: `${opts.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${slugCounter}`,
      sector: opts.sector ?? Sector.CLINICA,
      avgHourlyCostCents: opts.avgHourlyCostCents ?? 2000,
    },
  });
}

export async function createRole(companyId: string, name = 'Recepción') {
  return prisma.role.create({ data: { companyId, name } });
}

export async function createEmployee(companyId: string, roleId: string, opts: { name: string; pin: string }) {
  return prisma.employee.create({
    data: { companyId, roleId, name: opts.name, pinHash: await bcrypt.hash(opts.pin, 10) },
  });
}

export async function createCategory(companyId: string, name: string) {
  return prisma.category.create({ data: { companyId, name } });
}

export async function createCompanyRule(
  companyId: string,
  categoryId: string,
  opts: { patternType: PatternType; pattern: string; priority?: number }
) {
  return prisma.categorizationRule.create({
    data: {
      companyId,
      categoryId,
      patternType: opts.patternType,
      pattern: opts.pattern,
      priority: opts.priority ?? 10,
    },
  });
}

export async function createAdminUser(opts: { email: string; password: string; role: AdminRole; companyId?: string | null }) {
  return prisma.adminUser.create({
    data: {
      email: opts.email,
      passwordHash: await bcrypt.hash(opts.password, 10),
      role: opts.role,
      companyId: opts.companyId ?? null,
    },
  });
}
