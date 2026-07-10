// Informes (§10): generación de borradores con la API de Claude y ciclo de
// revisión BORRADOR → REVISADO → ENVIADO. El estado ENVIADO solo registra que
// Digital Power lo envió por su cuenta: el sistema nunca envía nada al cliente.
import { Router } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import type { InformeDetalle, InformeListItem } from '@digital-power/shared';
import type { Report, ReportStatus } from '../../generated/prisma/client.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';
import { buildInformeDatos } from '../../services/informe-datos.js';
import { generarBorradorInforme } from '../../services/informe-claude.js';
import { getDateRange } from '../../services/resumen.js';

export const adminInformesRouter = Router({ mergeParams: true });

adminInformesRouter.use(requireAdmin, requireCompanyAccess('companyId'));

// Único avance permitido de estado; nunca se salta ni se retrocede.
const NEXT_STATUS: Record<ReportStatus, ReportStatus | null> = {
  BORRADOR: 'REVISADO',
  REVISADO: 'ENVIADO',
  ENVIADO: null,
};

function toListItem(report: Report): InformeListItem {
  return {
    id: report.id,
    status: report.status,
    title: report.title,
    periodo: {
      desde: report.periodStart.toISOString(),
      hasta: new Date(report.periodEnd.getTime() - 1).toISOString(),
    },
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

function toDetalle(report: Report): InformeDetalle {
  return { ...toListItem(report), content: report.content, model: report.model };
}

function fmtFecha(date: Date): string {
  return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

adminInformesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const reports = await prisma.report.findMany({
      where: { companyId: req.params['companyId']! },
      orderBy: { createdAt: 'desc' },
    });
    res.json(reports.map(toListItem));
  })
);

adminInformesRouter.get(
  '/:informeId',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findFirst({
      where: { id: req.params['informeId'], companyId: req.params['companyId'] },
    });
    if (!report) {
      res.status(404).json({ error: 'Informe no encontrado' });
      return;
    }
    res.json(toDetalle(report));
  })
);

// POST /api/admin/empresas/:companyId/informes — agrega los datos del periodo,
// redacta el borrador con la API de Claude y lo guarda en estado BORRADOR.
adminInformesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.params['companyId']!;
    const { desde, hasta } = req.body as Partial<{ desde: string; hasta: string }>;

    let range: { start: Date; end: Date };
    try {
      if (typeof desde !== 'string' || typeof hasta !== 'string') throw new Error();
      range = getDateRange(desde, hasta);
    } catch {
      res.status(400).json({ error: 'desde y hasta (YYYY-MM-DD) son obligatorios y deben formar un rango válido' });
      return;
    }

    const datos = await buildInformeDatos(companyId, range);
    if (datos.totales.horas === 0) {
      res.status(400).json({ error: 'No hay actividad registrada en el periodo elegido' });
      return;
    }
    if (datos.plantillasAutomatizacion.length === 0) {
      res.status(400).json({ error: 'No hay plantillas de automatización para el sector de esta empresa' });
      return;
    }

    let borrador;
    try {
      borrador = await generarBorradorInforme(datos);
    } catch (err) {
      const detail = err instanceof Anthropic.APIError || err instanceof Error ? err.message : 'error desconocido';
      res.status(502).json({ error: `No se pudo generar el borrador con la API de Claude: ${detail}` });
      return;
    }

    const report = await prisma.report.create({
      data: {
        companyId,
        periodStart: range.start,
        periodEnd: range.end,
        title: `Informe de actividad · ${fmtFecha(range.start)} a ${fmtFecha(new Date(range.end.getTime() - 1))}`,
        content: borrador.content,
        draftContent: borrador.content,
        model: borrador.model,
      },
    });
    res.status(201).json(toDetalle(report));
  })
);

// PUT /api/admin/empresas/:companyId/informes/:informeId — edición del contenido
// (mientras no esté enviado) y avance de estado de uno en uno.
adminInformesRouter.put(
  '/:informeId',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findFirst({
      where: { id: req.params['informeId'], companyId: req.params['companyId'] },
    });
    if (!report) {
      res.status(404).json({ error: 'Informe no encontrado' });
      return;
    }

    const { content, status } = req.body as Partial<{ content: string; status: ReportStatus }>;
    if (content === undefined && status === undefined) {
      res.status(400).json({ error: 'Nada que actualizar: se esperaba content y/o status' });
      return;
    }

    if (content !== undefined) {
      if (typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ error: 'content debe ser un texto no vacío' });
        return;
      }
      if (report.status === 'ENVIADO') {
        res.status(400).json({ error: 'Un informe enviado ya no se puede editar' });
        return;
      }
    }

    if (status !== undefined && status !== NEXT_STATUS[report.status]) {
      res.status(400).json({ error: `Transición de estado no permitida (${report.status} → ${status})` });
      return;
    }

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: { content: content ?? undefined, status: status ?? undefined },
    });
    res.json(toDetalle(updated));
  })
);

// DELETE — solo borradores: lo revisado/enviado se conserva como histórico.
adminInformesRouter.delete(
  '/:informeId',
  asyncHandler(async (req, res) => {
    const report = await prisma.report.findFirst({
      where: { id: req.params['informeId'], companyId: req.params['companyId'] },
    });
    if (!report) {
      res.status(404).json({ error: 'Informe no encontrado' });
      return;
    }
    if (report.status !== 'BORRADOR') {
      res.status(400).json({ error: 'Solo se pueden eliminar informes en estado borrador' });
      return;
    }
    await prisma.report.delete({ where: { id: report.id } });
    res.status(204).send();
  })
);
