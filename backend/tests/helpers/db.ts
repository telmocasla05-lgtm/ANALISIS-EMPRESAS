import { prisma } from '../../src/lib/prisma.js';

// Vacía todas las tablas de dominio entre tests, manteniendo el esquema/migraciones.
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "activity_records",
      "sessions",
      "categorization_rules",
      "categories",
      "automation_templates",
      "admin_users",
      "employees",
      "roles",
      "companies"
    RESTART IDENTITY CASCADE
  `);
}
