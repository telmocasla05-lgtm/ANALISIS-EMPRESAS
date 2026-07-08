import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { isUniqueConstraintError, isForeignKeyConstraintError } from '../../lib/prisma-errors.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';

export const adminRolesRouter = Router({ mergeParams: true });

adminRolesRouter.use(requireAdmin, requireCompanyAccess('companyId'));

adminRolesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const roles = await prisma.role.findMany({
      where: { companyId: req.params['companyId'] },
      orderBy: { name: 'asc' },
    });
    res.json(roles);
  })
);

adminRolesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name } = req.body as Partial<{ name: string }>;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name es obligatorio' });
      return;
    }
    try {
      const role = await prisma.role.create({ data: { companyId: req.params['companyId']!, name: name.trim() } });
      res.status(201).json(role);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        res.status(409).json({ error: 'Ya existe un rol con ese nombre en esta empresa' });
        return;
      }
      throw err;
    }
  })
);

adminRolesRouter.put(
  '/:roleId',
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findFirst({ where: { id: req.params['roleId'], companyId: req.params['companyId'] } });
    if (!role) {
      res.status(404).json({ error: 'Rol no encontrado' });
      return;
    }
    const { name } = req.body as Partial<{ name: string }>;
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name es obligatorio' });
      return;
    }
    try {
      const updated = await prisma.role.update({ where: { id: role.id }, data: { name: name.trim() } });
      res.json(updated);
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        res.status(409).json({ error: 'Ya existe un rol con ese nombre en esta empresa' });
        return;
      }
      throw err;
    }
  })
);

adminRolesRouter.delete(
  '/:roleId',
  asyncHandler(async (req, res) => {
    const role = await prisma.role.findFirst({ where: { id: req.params['roleId'], companyId: req.params['companyId'] } });
    if (!role) {
      res.status(404).json({ error: 'Rol no encontrado' });
      return;
    }
    try {
      await prisma.role.delete({ where: { id: role.id } });
      res.status(204).send();
    } catch (err) {
      if (isForeignKeyConstraintError(err)) {
        res.status(409).json({ error: 'No se puede eliminar: hay empleados con este rol' });
        return;
      }
      throw err;
    }
  })
);
