import type { NextFunction, Request, Response } from 'express';
import { verifyEmployeeSession } from '../lib/jwt.js';

function bearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

// Exige un token de sesión de empleado válido (emitido por POST /api/auth/pin).
export function requireEmployeeSession(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  const payload = token ? verifyEmployeeSession(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Token de sesión inválido o caducado' });
    return;
  }
  req.employeeSession = { employeeId: payload.employeeId, companyId: payload.companyId };
  next();
}
