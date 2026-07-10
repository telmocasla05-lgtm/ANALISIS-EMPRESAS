import { Router } from 'express';
import type { EmpresaAdmin, SesionAdmin } from '@digital-power/shared';
import type { Company } from '../../generated/prisma/client.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';
import { buildEvolucionSemanal, buildResumen, buildSinCategorizar, parseDateRange } from '../../services/resumen.js';

export const adminEmpresasRouter = Router();

adminEmpresasRouter.use(requireAdmin);

// Frecuencia de muestreo recomendada por la especificación (§8): 5-10 s.
const SAMPLE_INTERVAL_MIN = 5;
const SAMPLE_INTERVAL_MAX = 10;

function toEmpresaAdmin(company: Company): EmpresaAdmin {
  return {
    id: company.id,
    slug: company.slug,
    name: company.name,
    sector: company.sector,
    avgHourlyCostCents: company.avgHourlyCostCents,
    inactivityMinutes: company.inactivityMinutes,
    sampleIntervalSeconds: company.sampleIntervalSeconds,
  };
}

// GET /api/admin/empresas — SUPERADMIN ve todas; CLIENTE solo la suya (para el selector del panel).
adminEmpresasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const admin = req.admin!;
    const companies = await prisma.company.findMany({
      where: admin.role === 'SUPERADMIN' ? {} : { id: admin.companyId ?? '' },
      orderBy: { name: 'asc' },
    });
    res.json(companies.map(toEmpresaAdmin));
  })
);

// GET /api/admin/empresas/:id — detalle y ajustes de la empresa.
adminEmpresasRouter.get(
  '/:id',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    res.json(toEmpresaAdmin(company));
  })
);

// PUT /api/admin/empresas/:id — ajustes: nombre, coste/hora, inactividad y frecuencia de muestreo.
adminEmpresasRouter.put(
  '/:id',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const { name, avgHourlyCostCents, inactivityMinutes, sampleIntervalSeconds } = req.body as Partial<{
      name: string;
      avgHourlyCostCents: number;
      inactivityMinutes: number;
      sampleIntervalSeconds: number;
    }>;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: 'name no puede estar vacío' });
      return;
    }
    if (avgHourlyCostCents !== undefined && (!Number.isInteger(avgHourlyCostCents) || avgHourlyCostCents < 0)) {
      res.status(400).json({ error: 'avgHourlyCostCents debe ser un entero >= 0 (céntimos)' });
      return;
    }
    if (inactivityMinutes !== undefined && (!Number.isInteger(inactivityMinutes) || inactivityMinutes < 1 || inactivityMinutes > 240)) {
      res.status(400).json({ error: 'inactivityMinutes debe estar entre 1 y 240' });
      return;
    }
    if (
      sampleIntervalSeconds !== undefined &&
      (!Number.isInteger(sampleIntervalSeconds) || sampleIntervalSeconds < SAMPLE_INTERVAL_MIN || sampleIntervalSeconds > SAMPLE_INTERVAL_MAX)
    ) {
      res.status(400).json({ error: `sampleIntervalSeconds debe estar entre ${SAMPLE_INTERVAL_MIN} y ${SAMPLE_INTERVAL_MAX}` });
      return;
    }

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        name: name?.trim() ?? undefined,
        avgHourlyCostCents: avgHourlyCostCents ?? undefined,
        inactivityMinutes: inactivityMinutes ?? undefined,
        sampleIntervalSeconds: sampleIntervalSeconds ?? undefined,
      },
    });
    res.json(toEmpresaAdmin(updated));
  })
);

// GET /api/admin/empresas/:id/categorias — categorías visibles (propias + sector),
// para los selectores del panel (crear/editar reglas).
adminEmpresasRouter.get(
  '/:id/categorias',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }
    const categories = await prisma.category.findMany({
      where: { OR: [{ companyId: company.id }, { sector: company.sector }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    res.json(categories);
  })
);

// GET /api/admin/empresas/:id/resumen?desde=&hasta=|?semana= — horas y coste
// agregados por categoría y empleado en el rango (semana en curso por defecto).
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
      const range = parseDateRange(req.query);
      res.json(await buildResumen(company.id, range));
    } catch {
      res.status(400).json({ error: 'Rango de fechas inválido' });
    }
  })
);

// GET /api/admin/empresas/:id/evolucion?semanas=8 — horas activas por semana natural.
adminEmpresasRouter.get(
  '/:id/evolucion',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const semanasParam = typeof req.query['semanas'] === 'string' ? Number(req.query['semanas']) : 8;
    if (!Number.isInteger(semanasParam) || semanasParam < 1 || semanasParam > 52) {
      res.status(400).json({ error: 'semanas debe estar entre 1 y 52' });
      return;
    }
    res.json(await buildEvolucionSemanal(company.id, semanasParam));
  })
);

// GET /api/admin/empresas/:id/sin-categorizar?desde=&hasta= — registros activos sin
// categoría agrupados por app + dominio, para crear reglas desde el dashboard.
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
      const range = parseDateRange(req.query);
      res.json(await buildSinCategorizar(company.id, range));
    } catch {
      res.status(400).json({ error: 'Rango de fechas inválido' });
    }
  })
);

// GET /api/admin/empresas/:id/sesiones?desde=&hasta= — sesiones iniciadas en el rango,
// con duración y estado. Es el listado que sirve de registro horario (control horario).
adminEmpresasRouter.get(
  '/:id/sesiones',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    let range;
    try {
      range = parseDateRange(req.query);
    } catch {
      res.status(400).json({ error: 'Rango de fechas inválido' });
      return;
    }

    const sessions = await prisma.workSession.findMany({
      where: { companyId: company.id, startedAt: { gte: range.start, lt: range.end } },
      orderBy: { startedAt: 'desc' },
      include: { employee: { select: { id: true, name: true } } },
    });

    const now = Date.now();
    const sesiones: SesionAdmin[] = sessions.map((s) => ({
      id: s.id,
      employeeId: s.employee.id,
      employeeName: s.employee.name,
      device: s.device,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt ? s.endedAt.toISOString() : null,
      duracionMinutos: Math.max(Math.round(((s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) / 60000), 0),
    }));
    res.json(sesiones);
  })
);
