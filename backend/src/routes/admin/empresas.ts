import { Router } from 'express';
import type { EmpresaAdminDetalle, EmpresaAdminListItem, SesionAdmin } from '@digital-power/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';
import {
  buildEvolucionSemanal,
  buildResumen,
  buildSinCategorizar,
  getDateRange,
  getWeekRange,
} from '../../services/resumen.js';

export const adminEmpresasRouter = Router();

adminEmpresasRouter.use(requireAdmin);

const MAX_SESSIONS = 1000;

// GET /api/admin/empresas — selector del panel: SUPERADMIN ve todas, CLIENTE solo la suya.
adminEmpresasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const admin = req.admin!;
    const companies = await prisma.company.findMany({
      where: admin.role === 'SUPERADMIN' ? {} : { id: admin.companyId ?? '' },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, sector: true },
    });
    const response: EmpresaAdminListItem[] = companies;
    res.json(response);
  })
);

// GET /api/admin/empresas/:id — detalle con los ajustes configurables.
adminEmpresasRouter.get(
  '/:id',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    const response: EmpresaAdminDetalle = {
      id: company.id,
      slug: company.slug,
      name: company.name,
      sector: company.sector,
      avgHourlyCostCents: company.avgHourlyCostCents,
      inactivityMinutes: company.inactivityMinutes,
      sampleIntervalSeconds: company.sampleIntervalSeconds,
    };
    res.json(response);
  })
);

// PUT /api/admin/empresas/:id/ajustes — coste/hora, minutos de inactividad y muestreo.
adminEmpresasRouter.put(
  '/:id/ajustes',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const { avgHourlyCostCents, inactivityMinutes, sampleIntervalSeconds } = req.body as Partial<{
      avgHourlyCostCents: number;
      inactivityMinutes: number;
      sampleIntervalSeconds: number;
    }>;

    if (avgHourlyCostCents !== undefined && (!Number.isInteger(avgHourlyCostCents) || avgHourlyCostCents <= 0)) {
      res.status(400).json({ error: 'avgHourlyCostCents debe ser un entero positivo (céntimos)' });
      return;
    }
    if (inactivityMinutes !== undefined && (!Number.isInteger(inactivityMinutes) || inactivityMinutes < 1 || inactivityMinutes > 120)) {
      res.status(400).json({ error: 'inactivityMinutes debe estar entre 1 y 120' });
      return;
    }
    // Mismo rango que acota la app de escritorio (5-10 s, §8).
    if (sampleIntervalSeconds !== undefined && (!Number.isInteger(sampleIntervalSeconds) || sampleIntervalSeconds < 5 || sampleIntervalSeconds > 10)) {
      res.status(400).json({ error: 'sampleIntervalSeconds debe estar entre 5 y 10' });
      return;
    }

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        avgHourlyCostCents: avgHourlyCostCents ?? undefined,
        inactivityMinutes: inactivityMinutes ?? undefined,
        sampleIntervalSeconds: sampleIntervalSeconds ?? undefined,
      },
    });
    res.json({
      avgHourlyCostCents: updated.avgHourlyCostCents,
      inactivityMinutes: updated.inactivityMinutes,
      sampleIntervalSeconds: updated.sampleIntervalSeconds,
    });
  })
);

// Rango de fechas de la query: ?desde=&hasta= (días inclusive) o ?semana= (natural UTC).
function rangeFromQuery(query: Record<string, unknown>): { start: Date; end: Date } {
  const desde = query['desde'];
  const hasta = query['hasta'];
  if (typeof desde === 'string' && typeof hasta === 'string') {
    return getDateRange(desde, hasta);
  }
  const semana = query['semana'];
  return getWeekRange(typeof semana === 'string' ? semana : undefined);
}

// GET /api/admin/empresas/:id/resumen?desde=&hasta= (o ?semana=) — horas y coste
// agregados por categoría y por empleado en el rango.
adminEmpresasRouter.get(
  '/:id/resumen',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    try {
      const resumen = await buildResumen(company.id, rangeFromQuery(req.query));
      res.json(resumen);
    } catch {
      res.status(400).json({ error: 'Rango de fechas inválido' });
    }
  })
);

// GET /api/admin/empresas/:id/evolucion?semanas=N — serie de las últimas N semanas.
adminEmpresasRouter.get(
  '/:id/evolucion',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    const semanasParam = Number(req.query['semanas'] ?? 8);
    if (!Number.isInteger(semanasParam) || semanasParam < 1 || semanasParam > 26) {
      res.status(400).json({ error: 'semanas debe estar entre 1 y 26' });
      return;
    }
    res.json(await buildEvolucionSemanal(company.id, semanasParam));
  })
);

// GET /api/admin/empresas/:id/sin-categorizar?desde=&hasta= — grupos de registros
// sin categorizar (app+dominio) para revisar y crear reglas desde el dashboard.
adminEmpresasRouter.get(
  '/:id/sin-categorizar',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    try {
      res.json(await buildSinCategorizar(company.id, rangeFromQuery(req.query)));
    } catch {
      res.status(400).json({ error: 'Rango de fechas inválido' });
    }
  })
);

// GET /api/admin/empresas/:id/sesiones?desde=&hasta=&employeeId= — registro horario:
// sesiones ON/OFF con duración y estado (exportable a CSV desde el panel).
adminEmpresasRouter.get(
  '/:id/sesiones',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    let range: { start: Date; end: Date };
    try {
      range = rangeFromQuery(req.query);
    } catch {
      res.status(400).json({ error: 'Rango de fechas inválido' });
      return;
    }

    const employeeIdParam = req.query['employeeId'];
    const sessions = await prisma.workSession.findMany({
      where: {
        companyId: company.id,
        startedAt: { gte: range.start, lt: range.end },
        employeeId: typeof employeeIdParam === 'string' ? employeeIdParam : undefined,
      },
      include: { employee: { select: { name: true } } },
      orderBy: { startedAt: 'desc' },
      take: MAX_SESSIONS,
    });

    const response: SesionAdmin[] = sessions.map((s) => ({
      id: s.id,
      employeeId: s.employeeId,
      employeeName: s.employee.name,
      device: s.device,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      duracionHoras: s.endedAt ? Math.round(((s.endedAt.getTime() - s.startedAt.getTime()) / 3600000) * 100) / 100 : null,
    }));
    res.json(response);
  })
);
