import jwt from 'jsonwebtoken';
import type { AdminRole } from '@digital-power/shared';

function secret(): string {
  const value = process.env['JWT_SECRET'];
  if (!value) throw new Error('JWT_SECRET no está configurado');
  return value;
}

// Duración de la sesión de tracking: cubre un turno largo sin re-pedir el PIN.
export const EMPLOYEE_SESSION_TTL_SECONDS = 16 * 60 * 60;
// Duración de la sesión del panel admin.
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface EmployeeSessionPayload {
  typ: 'employee_session';
  employeeId: string;
  companyId: string;
}

export interface AdminSessionPayload {
  typ: 'admin';
  adminId: string;
  role: AdminRole;
  companyId: string | null;
}

export function signEmployeeSession(payload: Omit<EmployeeSessionPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'employee_session' }, secret(), {
    expiresIn: EMPLOYEE_SESSION_TTL_SECONDS,
  });
}

export function signAdminSession(payload: Omit<AdminSessionPayload, 'typ'>): string {
  return jwt.sign({ ...payload, typ: 'admin' }, secret(), {
    expiresIn: ADMIN_SESSION_TTL_SECONDS,
  });
}

// Discrimina explícitamente por `typ` para que un token de empleado nunca
// se acepte como token de admin (o viceversa) aunque compartan el mismo secreto.
export function verifyEmployeeSession(token: string): EmployeeSessionPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'object' && decoded !== null && decoded['typ'] === 'employee_session') {
      return decoded as unknown as EmployeeSessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyAdminSession(token: string): AdminSessionPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    if (typeof decoded === 'object' && decoded !== null && decoded['typ'] === 'admin') {
      return decoded as unknown as AdminSessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}
