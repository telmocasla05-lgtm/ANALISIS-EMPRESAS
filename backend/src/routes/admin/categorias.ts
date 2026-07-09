import { Router } from 'express';
import type { CategoriaAdmin } from '@digital-power/shared';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';

export const adminCategoriasRouter = Router({ mergeParams: true });

adminCategoriasRouter.use(requireAdmin, requireCompanyAccess('companyId'));

// Categorías visibles para la empresa (plantilla de su sector + propias), para
// los selectores de reglas del panel.
adminCategoriasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.params['companyId']!;
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const categories = await prisma.category.findMany({
      where: { OR: [{ companyId }, { sector: company.sector }] },
      orderBy: { name: 'asc' },
    });
    const response: CategoriaAdmin[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      scope: c.companyId ? 'empresa' : 'sector',
    }));
    res.json(response);
  })
);
