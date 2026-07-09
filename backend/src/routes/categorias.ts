import { Router } from 'express';
import type { CategoriaListItem } from '@digital-power/shared';
import { asyncHandler } from '../lib/async-handler.js';
import { prisma } from '../lib/prisma.js';
import { requireEmployeeSession } from '../middleware/employee-auth.js';

export const categoriasRouter = Router();

categoriasRouter.use(requireEmployeeSession);

// GET /api/categorias — categorías visibles para la empresa del empleado
// (ajustes propios de la empresa + plantilla de su sector). La tablet las
// pinta como botones de selección activa (§ tablet de la especificación):
// vienen siempre de la BD, nunca hardcodeadas en los frontends.
categoriasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const { companyId } = req.employeeSession!;
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const categories = await prisma.category.findMany({
      where: { OR: [{ companyId }, { sector: company.sector }] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    const body: CategoriaListItem[] = categories;
    res.json(body);
  })
);
