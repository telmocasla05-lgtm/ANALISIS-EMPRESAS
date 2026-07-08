import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';
import { buildResumenSemanal } from '../../services/resumen.js';

export const adminEmpresasRouter = Router();

adminEmpresasRouter.use(requireAdmin);

// GET /api/admin/empresas/:id/resumen?semana= — horas agregadas por categoría y empleado.
adminEmpresasRouter.get(
  '/:id/resumen',
  requireCompanyAccess('id'),
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { id: req.params['id'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const semanaParam = req.query['semana'];
    const semana = typeof semanaParam === 'string' ? semanaParam : undefined;
    try {
      const resumen = await buildResumenSemanal(company.id, semana);
      res.json(resumen);
    } catch {
      res.status(400).json({ error: 'Parámetro semana inválido' });
    }
  })
);
