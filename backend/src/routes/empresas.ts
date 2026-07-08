import { Router } from 'express';
import type { EmpleadoListItem } from '@digital-power/shared';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/async-handler.js';

export const empresasRouter = Router();

// GET /api/empresas/:slug/empleados — lista para la pantalla de fichaje.
empresasRouter.get(
  '/:slug/empleados',
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({ where: { slug: req.params['slug'] } });
    if (!company) {
      res.status(404).json({ error: 'Empresa no encontrada' });
      return;
    }

    const employees = await prisma.employee.findMany({
      where: { companyId: company.id, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, avatarUrl: true },
    });

    const body: EmpleadoListItem[] = employees.map((e) => ({
      id: e.id,
      name: e.name,
      avatarUrl: e.avatarUrl,
    }));
    res.json(body);
  })
);
