-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPERADMIN', 'CLIENTE');

-- AlterTable: identificador corto en URL para la empresa (ej. pantalla de fichaje)
ALTER TABLE "companies" ADD COLUMN "slug" TEXT;
UPDATE "companies" SET "slug" = "id" WHERE "slug" IS NULL;
ALTER TABLE "companies" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "companies_slug_key" ON "companies"("slug");

-- AlterTable: bloqueo temporal tras 5 intentos de PIN fallidos seguidos
ALTER TABLE "employees" ADD COLUMN "failed_pin_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN "locked_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "company_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_company_id_idx" ON "admin_users"("company_id");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Añadido a mano: SUPERADMIN (Digital Power) no tiene empresa; CLIENTE está atado a una.
-- Prisma no soporta CHECK constraints en el schema; ver plan Fase A.
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_company_check"
  CHECK (
    ("role" = 'SUPERADMIN' AND "company_id" IS NULL) OR
    ("role" = 'CLIENTE' AND "company_id" IS NOT NULL)
  );
