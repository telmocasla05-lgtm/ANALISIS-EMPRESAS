import { Router } from 'express';
import type { PinLoginRequest, PinLoginResponse } from '@digital-power/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { EMPLOYEE_SESSION_TTL_SECONDS, signEmployeeSession } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { authenticateWithPin } from '../services/pin-auth.js';

export const authRouter = Router();

// POST /api/auth/pin — valida empleado_id + PIN, devuelve token de sesión corto.
authRouter.post(
  '/pin',
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<PinLoginRequest>;
    if (typeof body.employeeId !== 'string' || typeof body.pin !== 'string' || !/^\d{4}$/.test(body.pin)) {
      res.status(400).json({ error: 'employeeId y pin (4 dígitos) son obligatorios' });
      return;
    }

    const result = await authenticateWithPin(body.employeeId, body.pin);

    if (result.outcome === 'not_found' || result.outcome === 'invalid_pin') {
      // Mensaje genérico: no revela si el empleado existe o si el PIN es el que falla.
      res.status(401).json({ error: 'Empleado o PIN incorrecto' });
      return;
    }

    if (result.outcome === 'locked') {
      const retryAfterSeconds = Math.max(Math.ceil((result.lockedUntil.getTime() - Date.now()) / 1000), 0);
      res.status(429).json({
        error: 'Demasiados intentos fallidos. Cuenta bloqueada temporalmente.',
        lockedUntil: result.lockedUntil.toISOString(),
        retryAfterSeconds,
      });
      return;
    }

    const token = signEmployeeSession({
      employeeId: result.employee.id,
      companyId: result.employee.companyId,
    });
    // El desktop necesita el umbral de inactividad de la empresa (§6) para
    // saber cuándo avisar; se entrega con el login para ahorrar otra llamada.
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: result.employee.companyId },
      select: { inactivityMinutes: true },
    });
    const response: PinLoginResponse = {
      token,
      expiresAt: new Date(Date.now() + EMPLOYEE_SESSION_TTL_SECONDS * 1000).toISOString(),
      inactivityMinutes: company.inactivityMinutes,
      employee: result.employee,
    };
    res.json(response);
  })
);
