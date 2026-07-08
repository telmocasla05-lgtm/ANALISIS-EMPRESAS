import { Router } from 'express';
import type {
  Device,
  RegistrosBatchRequest,
  RegistrosBatchResponse,
  SesionOffResponse,
  SesionOnRequest,
  SesionOnResponse,
} from '@digital-power/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { prisma } from '../lib/prisma.js';
import { requireEmployeeSession } from '../middleware/employee-auth.js';
import { categorizeRecord, loadActiveRules } from '../services/categorization.js';

export const sesionesRouter = Router();

sesionesRouter.use(requireEmployeeSession);

const VALID_DEVICES: Device[] = ['DESKTOP', 'TABLET'];

// POST /api/sesiones/on — abre sesión (empleado, dispositivo, timestamp).
sesionesRouter.post(
  '/on',
  asyncHandler(async (req, res) => {
    const { employeeId, companyId } = req.employeeSession!;
    const body = req.body as Partial<SesionOnRequest>;
    if (!body.device || !VALID_DEVICES.includes(body.device)) {
      res.status(400).json({ error: 'device debe ser DESKTOP o TABLET' });
      return;
    }

    const openSession = await prisma.workSession.findFirst({ where: { employeeId, endedAt: null } });
    if (openSession) {
      res.status(409).json({ error: 'Ya existe una sesión abierta', sessionId: openSession.id });
      return;
    }

    const session = await prisma.workSession.create({
      data: { companyId, employeeId, device: body.device, startedAt: new Date() },
    });

    const response: SesionOnResponse = { id: session.id, startedAt: session.startedAt.toISOString() };
    res.status(201).json(response);
  })
);

// POST /api/sesiones/:id/off — cierra sesión.
sesionesRouter.post(
  '/:id/off',
  asyncHandler(async (req, res) => {
    const { employeeId } = req.employeeSession!;
    const session = await prisma.workSession.findUnique({ where: { id: req.params['id'] } });

    // Aislamiento: una sesión solo puede cerrarla el empleado dueño del token, nunca otro.
    if (!session || session.employeeId !== employeeId) {
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }
    if (session.endedAt) {
      res.status(409).json({ error: 'La sesión ya estaba cerrada' });
      return;
    }

    const updated = await prisma.workSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() },
    });

    const response: SesionOffResponse = {
      id: updated.id,
      startedAt: updated.startedAt.toISOString(),
      endedAt: updated.endedAt!.toISOString(),
    };
    res.json(response);
  })
);

// POST /api/sesiones/:id/registros — recibe lotes de registros de tracking (batch cada 60s + al hacer OFF).
sesionesRouter.post(
  '/:id/registros',
  asyncHandler(async (req, res) => {
    const { employeeId, companyId } = req.employeeSession!;
    const session = await prisma.workSession.findUnique({ where: { id: req.params['id'] } });

    if (!session || session.employeeId !== employeeId) {
      res.status(404).json({ error: 'Sesión no encontrada' });
      return;
    }

    const body = req.body as Partial<RegistrosBatchRequest>;
    if (!Array.isArray(body.registros) || body.registros.length === 0) {
      res.status(400).json({ error: 'registros debe ser un array no vacío' });
      return;
    }
    for (const registro of body.registros) {
      if (
        typeof registro.timestamp !== 'string' ||
        Number.isNaN(Date.parse(registro.timestamp)) ||
        typeof registro.app !== 'string' ||
        !registro.app
      ) {
        res.status(400).json({ error: 'Cada registro necesita timestamp (ISO) y app' });
        return;
      }
    }

    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const rules = await loadActiveRules(companyId, company.sector);

    await prisma.activityRecord.createMany({
      data: body.registros.map((registro) => ({
        companyId,
        sessionId: session.id,
        timestamp: new Date(registro.timestamp),
        app: registro.app,
        windowTitle: registro.windowTitle ?? null,
        domain: registro.domain ?? null,
        isIdle: registro.isIdle ?? false,
        categoryId: registro.isIdle ? null : categorizeRecord(registro, rules),
      })),
    });

    const response: RegistrosBatchResponse = { insertados: body.registros.length };
    res.status(201).json(response);
  })
);
