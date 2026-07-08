import type { NextFunction, Request, Response } from 'express';
import { verifyAdminSession } from '../lib/jwt.js';

function bearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

// Exige un token de admin válido (emitido por POST /api/admin/auth/login).
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  const payload = token ? verifyAdminSession(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Token de admin inválido o caducado' });
    return;
  }
  req.admin = { adminId: payload.adminId, role: payload.role, companyId: payload.companyId };
  next();
}

// SUPERADMIN (Digital Power) ve todas las empresas; CLIENTE solo la suya.
// Debe ir después de requireAdmin y de un middleware que exponga :companyId (o :id) en req.params.
export function requireCompanyAccess(paramName: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const admin = req.admin;
    if (!admin) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }
    if (admin.role === 'SUPERADMIN') {
      next();
      return;
    }
    const companyId = req.params[paramName];
    if (admin.companyId !== companyId) {
      res.status(403).json({ error: 'No tienes acceso a esta empresa' });
      return;
    }
    next();
  };
}
