// Auth de empleados por PIN (§5): máximo 5 intentos fallidos seguidos,
// luego bloqueo temporal de 5 minutos. Los PINs solo se comparan hasheados.
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

export interface AuthenticatedEmployee {
  id: string;
  name: string;
  companyId: string;
  roleId: string;
  roleName: string;
}

export type PinAuthResult =
  | { outcome: 'ok'; employee: AuthenticatedEmployee }
  | { outcome: 'not_found' }
  | { outcome: 'locked'; lockedUntil: Date }
  | { outcome: 'invalid_pin' };

export async function authenticateWithPin(employeeId: string, pin: string): Promise<PinAuthResult> {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { role: true },
  });
  if (!employee || !employee.active) return { outcome: 'not_found' };

  if (employee.lockedUntil && employee.lockedUntil.getTime() > Date.now()) {
    return { outcome: 'locked', lockedUntil: employee.lockedUntil };
  }

  const valid = await bcrypt.compare(pin, employee.pinHash);
  if (!valid) {
    const attempts = employee.failedPinAttempts + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MS);
      await prisma.employee.update({
        where: { id: employee.id },
        data: { failedPinAttempts: 0, lockedUntil },
      });
      return { outcome: 'locked', lockedUntil };
    }
    await prisma.employee.update({
      where: { id: employee.id },
      data: { failedPinAttempts: attempts },
    });
    return { outcome: 'invalid_pin' };
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: { failedPinAttempts: 0, lockedUntil: null },
  });

  return {
    outcome: 'ok',
    employee: {
      id: employee.id,
      name: employee.name,
      companyId: employee.companyId,
      roleId: employee.roleId,
      roleName: employee.role.name,
    },
  };
}
