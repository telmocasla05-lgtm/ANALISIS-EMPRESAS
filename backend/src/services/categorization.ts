// Motor de categorización (§9): reglas de empresa (por prioridad) → reglas de
// sector (por prioridad) → null ("sin categorizar", ver comentario en el schema).
// Las reglas viven en BD (categorization_rules), nunca hardcodeadas aquí.
import type { Sector, PatternType } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

export interface CategorizationRuleLike {
  patternType: PatternType;
  pattern: string;
  categoryId: string;
}

export interface RuleSet {
  companyRules: CategorizationRuleLike[];
  sectorRules: CategorizationRuleLike[];
}

export interface RecordToCategorize {
  app: string;
  domain?: string | null;
  windowTitle?: string | null;
}

export async function loadActiveRules(companyId: string, sector: Sector): Promise<RuleSet> {
  const [companyRules, sectorRules] = await Promise.all([
    prisma.categorizationRule.findMany({
      where: { companyId, active: true },
      orderBy: { priority: 'asc' },
      select: { patternType: true, pattern: true, categoryId: true },
    }),
    prisma.categorizationRule.findMany({
      where: { sector, active: true },
      orderBy: { priority: 'asc' },
      select: { patternType: true, pattern: true, categoryId: true },
    }),
  ]);
  return { companyRules, sectorRules };
}

// Función pura (sin acceso a BD) para poder testearla de forma aislada y
// para aplicar el mismo ruleset a un lote entero sin repetir queries.
export function categorizeRecord(record: RecordToCategorize, rules: RuleSet): string | null {
  return matchFirst(rules.companyRules, record) ?? matchFirst(rules.sectorRules, record);
}

function matchFirst(rules: CategorizationRuleLike[], record: RecordToCategorize): string | null {
  for (const rule of rules) {
    const haystack = fieldFor(rule.patternType, record);
    if (haystack && haystack.toLowerCase().includes(rule.pattern.toLowerCase())) {
      return rule.categoryId;
    }
  }
  return null;
}

function fieldFor(type: PatternType, record: RecordToCategorize): string | null | undefined {
  switch (type) {
    case 'APP':
      return record.app;
    case 'DOMAIN':
      return record.domain;
    case 'TITLE':
      return record.windowTitle;
  }
}
