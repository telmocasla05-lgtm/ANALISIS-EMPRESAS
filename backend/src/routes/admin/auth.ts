import { Router } from 'express';
import bcrypt from 'bcryptjs';
import type { AdminLoginRequest, AdminLoginResponse } from '@digital-power/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { ADMIN_SESSION_TTL_SECONDS, signAdminSession } from '../../lib/jwt.js';

export const adminAuthRouter = Router();

// POST /api/admin/auth/login — email + password (JWT), roles superadmin/cliente.
adminAuthRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<AdminLoginRequest>;
    if (typeof body.email !== 'string' || typeof body.password !== 'string') {
      res.status(400).json({ error: 'email y password son obligatorios' });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { email: body.email } });
    const valid = admin ? await bcrypt.compare(body.password, admin.passwordHash) : false;
    if (!admin || !valid) {
      res.status(401).json({ error: 'Email o contraseña incorrectos' });
      return;
    }

    const token = signAdminSession({ adminId: admin.id, role: admin.role, companyId: admin.companyId });
    const response: AdminLoginResponse = {
      token,
      expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000).toISOString(),
      admin: { id: admin.id, email: admin.email, role: admin.role, companyId: admin.companyId },
    };
    res.json(response);
  })
);
