import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';

export const adminEmpleadosRouter = Router({ mergeParams: true });

adminEmpleadosRouter.use(requireAdmin, requireCompanyAccess('companyId'));

adminEmpleadosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const employees = await prisma.employee.findMany({
      where: { companyId: req.params['companyId'] },
      include: { role: true },
      orderBy: { name: 'asc' },
    });
    res.json(
      employees.map((e) => ({
        id: e.id,
        name: e.name,
        roleId: e.roleId,
        roleName: e.role.name,
        avatarUrl: e.avatarUrl,
        active: e.active,
      }))
    );
  })
);

adminEmpleadosRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.params['companyId']!;
    const { name, roleId, pin, avatarUrl } = req.body as Partial<{
      name: string;
      roleId: string;
      pin: string;
      avatarUrl: string;
    }>;
    if (typeof name !== 'string' || !name.trim() || typeof roleId !== 'string' || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'name, roleId y pin (4 dígitos) son obligatorios' });
      return;
    }

    const role = await prisma.role.findFirst({ where: { id: roleId, companyId } });
    if (!role) {
      res.status(400).json({ error: 'roleId no pertenece a esta empresa' });
      return;
    }

    const employee = await prisma.employee.create({
      data: {
        companyId,
        roleId,
        name: name.trim(),
        pinHash: await bcrypt.hash(pin, 10),
        avatarUrl: avatarUrl ?? null,
      },
    });
    res.status(201).json({ id: employee.id, name: employee.name, roleId: employee.roleId });
  })
);

adminEmpleadosRouter.put(
  '/:employeeId',
  asyncHandler(async (req, res) => {
    const companyId = req.params['companyId']!;
    const employee = await prisma.employee.findFirst({ where: { id: req.params['employeeId'], companyId } });
    if (!employee) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }

    const { name, roleId, active, avatarUrl, pin } = req.body as Partial<{
      name: string;
      roleId: string;
      active: boolean;
      avatarUrl: string | null;
      pin: string;
    }>;

    if (roleId !== undefined) {
      const role = await prisma.role.findFirst({ where: { id: roleId, companyId } });
      if (!role) {
        res.status(400).json({ error: 'roleId no pertenece a esta empresa' });
        return;
      }
    }
    if (pin !== undefined && !/^\d{4}$/.test(pin)) {
      res.status(400).json({ error: 'pin debe tener 4 dígitos' });
      return;
    }

    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        name: name ?? undefined,
        roleId: roleId ?? undefined,
        active: active ?? undefined,
        avatarUrl: avatarUrl === undefined ? undefined : avatarUrl,
        pinHash: pin !== undefined ? await bcrypt.hash(pin, 10) : undefined,
        failedPinAttempts: pin !== undefined ? 0 : undefined,
        lockedUntil: pin !== undefined ? null : undefined,
      },
    });
    res.json({ id: updated.id, name: updated.name, active: updated.active });
  })
);

// Baja lógica: mantiene el histórico de sesiones/registros del empleado.
adminEmpleadosRouter.delete(
  '/:employeeId',
  asyncHandler(async (req, res) => {
    const employee = await prisma.employee.findFirst({
      where: { id: req.params['employeeId'], companyId: req.params['companyId'] },
    });
    if (!employee) {
      res.status(404).json({ error: 'Empleado no encontrado' });
      return;
    }
    await prisma.employee.update({ where: { id: employee.id }, data: { active: false } });
    res.status(204).send();
  })
);
