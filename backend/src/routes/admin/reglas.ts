import { Router } from 'express';
import type { PatternType } from '../../generated/prisma/client.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { prisma } from '../../lib/prisma.js';
import { requireAdmin, requireCompanyAccess } from '../../middleware/admin-auth.js';

export const adminReglasRouter = Router({ mergeParams: true });

adminReglasRouter.use(requireAdmin, requireCompanyAccess('companyId'));

const PATTERN_TYPES: PatternType[] = ['APP', 'DOMAIN', 'TITLE'];

// Lista las reglas visibles para la empresa: propias (editables aquí) +
// plantilla de su sector (solo lectura — las gestiona Digital Power).
adminReglasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.params['companyId']!;
    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const rules = await prisma.categorizationRule.findMany({
      where: { OR: [{ companyId }, { sector: company.sector }] },
      include: { category: { select: { name: true } } },
      orderBy: [{ priority: 'asc' }],
    });
    res.json(
      rules.map((r) => ({
        id: r.id,
        patternType: r.patternType,
        pattern: r.pattern,
        priority: r.priority,
        active: r.active,
        categoryId: r.categoryId,
        categoryName: r.category.name,
        scope: r.companyId ? 'empresa' : 'sector',
      }))
    );
  })
);

// Campo del registro sobre el que matchea cada tipo de patrón (mismo mapeo que
// fieldFor en services/categorization.ts, pero como columna Prisma).
const RECORD_FIELD: Record<PatternType, 'app' | 'domain' | 'windowTitle'> = {
  APP: 'app',
  DOMAIN: 'domain',
  TITLE: 'windowTitle',
};

adminReglasRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const companyId = req.params['companyId']!;
    const { patternType, pattern, categoryId, priority, recategorizar } = req.body as Partial<{
      patternType: PatternType;
      pattern: string;
      categoryId: string;
      priority: number;
      recategorizar: boolean;
    }>;
    if (!patternType || !PATTERN_TYPES.includes(patternType) || typeof pattern !== 'string' || !pattern.trim() || typeof categoryId !== 'string') {
      res.status(400).json({ error: 'patternType, pattern y categoryId son obligatorios' });
      return;
    }

    const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const category = await prisma.category.findFirst({
      where: { id: categoryId, OR: [{ companyId }, { sector: company.sector }] },
    });
    if (!category) {
      res.status(400).json({ error: 'categoryId no es válido para esta empresa' });
      return;
    }

    const rule = await prisma.categorizationRule.create({
      data: { companyId, patternType, pattern: pattern.trim(), categoryId, priority: priority ?? 100 },
    });

    // Acción rápida del dashboard: aplicar la regla nueva a los registros que
    // siguen sin categorizar (que no matchearon ninguna regla, así que no hay
    // conflicto de prioridades) para que el histórico refleje el cambio.
    let recategorizados = 0;
    if (recategorizar === true) {
      const result = await prisma.activityRecord.updateMany({
        where: {
          companyId,
          categoryId: null,
          isIdle: false,
          [RECORD_FIELD[patternType]]: { contains: rule.pattern, mode: 'insensitive' },
        },
        data: { categoryId },
      });
      recategorizados = result.count;
    }

    res.status(201).json({ ...rule, recategorizados });
  })
);

adminReglasRouter.put(
  '/:ruleId',
  asyncHandler(async (req, res) => {
    // Solo las reglas propias de la empresa son editables; las de sector son plantilla compartida.
    const rule = await prisma.categorizationRule.findFirst({
      where: { id: req.params['ruleId'], companyId: req.params['companyId'] },
    });
    if (!rule) {
      res.status(404).json({ error: 'Regla no encontrada (o es de la plantilla de sector, no editable aquí)' });
      return;
    }

    const { pattern, patternType, priority, active } = req.body as Partial<{
      pattern: string;
      patternType: PatternType;
      priority: number;
      active: boolean;
    }>;
    if (patternType !== undefined && !PATTERN_TYPES.includes(patternType)) {
      res.status(400).json({ error: 'patternType inválido' });
      return;
    }

    const updated = await prisma.categorizationRule.update({
      where: { id: rule.id },
      data: {
        pattern: pattern ?? undefined,
        patternType: patternType ?? undefined,
        priority: priority ?? undefined,
        active: active ?? undefined,
      },
    });
    res.json(updated);
  })
);

adminReglasRouter.delete(
  '/:ruleId',
  asyncHandler(async (req, res) => {
    const rule = await prisma.categorizationRule.findFirst({
      where: { id: req.params['ruleId'], companyId: req.params['companyId'] },
    });
    if (!rule) {
      res.status(404).json({ error: 'Regla no encontrada (o es de la plantilla de sector, no editable aquí)' });
      return;
    }
    await prisma.categorizationRule.delete({ where: { id: rule.id } });
    res.status(204).send();
  })
);
