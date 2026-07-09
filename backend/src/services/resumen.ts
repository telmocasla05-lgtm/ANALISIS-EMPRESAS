// Agregación de horas por categoría/empleado para el dashboard admin (§10).
// Los registros son lecturas puntuales (cada 5-10 s, §8), no intervalos con duración
// propia: se estima la duración de cada lectura como el hueco hasta la siguiente,
// con un tope (SAMPLE_CAP_SECONDS) para no contar como "activo" un hueco largo
// (p.ej. el ordenador se apagó sin que llegara el próximo registro).
import type { EvolucionSemana, Resumen, ResumenCategoria, ResumenEmpleado, SinCategorizarGrupo } from '@digital-power/shared';
import { prisma } from '../lib/prisma.js';

const SAMPLE_CAP_SECONDS = 10;
const UNCATEGORIZED_KEY = 'UNCATEGORIZED';
const IDLE_KEY = 'IDLE';
const UNCATEGORIZED_LABEL = 'Sin categorizar / revisar';
const IDLE_LABEL = 'Inactivo / pausa';

export function getWeekRange(semana?: string): { start: Date; end: Date } {
  const base = semana ? new Date(semana) : new Date();
  if (Number.isNaN(base.getTime())) throw new Error('Fecha inválida');

  const day = base.getUTCDay(); // 0 = domingo
  const diffToMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - diffToMonday));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

interface RawRecord {
  timestamp: Date;
  categoryId: string | null;
  isIdle: boolean;
  sessionId: string;
  session: { employeeId: string };
}

// Rango de fechas [desde, hasta] inclusive (días en UTC, como la semana natural).
export function getDateRange(desde: string, hasta: string): { start: Date; end: Date } {
  const start = new Date(desde);
  const hastaDate = new Date(hasta);
  if (Number.isNaN(start.getTime()) || Number.isNaN(hastaDate.getTime()) || start > hastaDate) {
    throw new Error('Rango de fechas inválido');
  }
  const end = new Date(Date.UTC(hastaDate.getUTCFullYear(), hastaDate.getUTCMonth(), hastaDate.getUTCDate() + 1));
  return { start, end };
}

export async function buildResumen(companyId: string, range: { start: Date; end: Date }): Promise<Resumen> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const { start, end } = range;

  const records: RawRecord[] = await prisma.activityRecord.findMany({
    where: { companyId, timestamp: { gte: start, lt: end } },
    orderBy: [{ sessionId: 'asc' }, { timestamp: 'asc' }],
    select: {
      timestamp: true,
      categoryId: true,
      isIdle: true,
      sessionId: true,
      session: { select: { employeeId: true } },
    },
  });

  const [employees, categories] = await Promise.all([
    prisma.employee.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { OR: [{ sector: company.sector }, { companyId }] }, select: { id: true, name: true } }),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const bySession = new Map<string, RawRecord[]>();
  for (const record of records) {
    const list = bySession.get(record.sessionId) ?? [];
    list.push(record);
    bySession.set(record.sessionId, list);
  }

  const perCompany = new Map<string, number>();
  const perEmployee = new Map<string, Map<string, number>>();

  for (const sessionRecords of bySession.values()) {
    for (let i = 0; i < sessionRecords.length; i++) {
      const current = sessionRecords[i]!;
      const next = sessionRecords[i + 1];
      const deltaMs = next ? next.timestamp.getTime() - current.timestamp.getTime() : SAMPLE_CAP_SECONDS * 1000;
      const seconds = Math.min(Math.max(deltaMs, 0), SAMPLE_CAP_SECONDS * 1000) / 1000;

      const key = current.isIdle ? IDLE_KEY : (current.categoryId ?? UNCATEGORIZED_KEY);
      const employeeId = current.session.employeeId;

      perCompany.set(key, (perCompany.get(key) ?? 0) + seconds);
      const employeeMap = perEmployee.get(employeeId) ?? new Map<string, number>();
      employeeMap.set(key, (employeeMap.get(key) ?? 0) + seconds);
      perEmployee.set(employeeId, employeeMap);
    }
  }

  const hourlyCost = company.avgHourlyCostCents / 100;
  const toResumenCategoria = (key: string, seconds: number): ResumenCategoria =>
    toResumenCategoriaGeneric(key, seconds, hourlyCost, categoryName);

  const porCategoria = [...perCompany.entries()].map(([key, seconds]) => toResumenCategoria(key, seconds));

  const porEmpleado: ResumenEmpleado[] = employees.map((employee) => {
    const categoryMap = perEmployee.get(employee.id) ?? new Map<string, number>();
    const porCategoriaEmpleado = [...categoryMap.entries()].map(([key, seconds]) => toResumenCategoria(key, seconds));
    const totalSeconds = [...categoryMap.values()].reduce((a, b) => a + b, 0);
    const horas = round2(totalSeconds / 3600);
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      horas,
      costeEstimado: round2(horas * hourlyCost),
      porCategoria: porCategoriaEmpleado,
    };
  });

  return {
    rango: { desde: start.toISOString(), hasta: new Date(end.getTime() - 1).toISOString() },
    porCategoria,
    porEmpleado,
  };
}

// Serie de las últimas `weeks` semanas naturales (incluida la actual) para el
// gráfico de evolución del dashboard. Reutiliza la misma estimación de duración
// que el resumen, agrupando por semana en un solo recorrido.
export async function buildEvolucionSemanal(companyId: string, weeks: number): Promise<EvolucionSemana[]> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const { start: currentWeekStart, end } = getWeekRange();
  const start = new Date(currentWeekStart);
  start.setUTCDate(start.getUTCDate() - 7 * (weeks - 1));

  const records: RawRecord[] = await prisma.activityRecord.findMany({
    where: { companyId, timestamp: { gte: start, lt: end } },
    orderBy: [{ sessionId: 'asc' }, { timestamp: 'asc' }],
    select: {
      timestamp: true,
      categoryId: true,
      isIdle: true,
      sessionId: true,
      session: { select: { employeeId: true } },
    },
  });

  const categories = await prisma.category.findMany({
    where: { OR: [{ sector: company.sector }, { companyId }] },
    select: { id: true, name: true },
  });
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const hourlyCost = company.avgHourlyCostCents / 100;

  const bySession = new Map<string, RawRecord[]>();
  for (const record of records) {
    const list = bySession.get(record.sessionId) ?? [];
    list.push(record);
    bySession.set(record.sessionId, list);
  }

  // Índice de semana (0 = la más antigua) → segundos por clave de categoría.
  const perWeek = new Map<number, Map<string, number>>();
  for (const sessionRecords of bySession.values()) {
    for (let i = 0; i < sessionRecords.length; i++) {
      const current = sessionRecords[i]!;
      const next = sessionRecords[i + 1];
      const deltaMs = next ? next.timestamp.getTime() - current.timestamp.getTime() : SAMPLE_CAP_SECONDS * 1000;
      const seconds = Math.min(Math.max(deltaMs, 0), SAMPLE_CAP_SECONDS * 1000) / 1000;

      const weekIndex = Math.floor((current.timestamp.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
      const key = current.isIdle ? IDLE_KEY : (current.categoryId ?? UNCATEGORIZED_KEY);
      const weekMap = perWeek.get(weekIndex) ?? new Map<string, number>();
      weekMap.set(key, (weekMap.get(key) ?? 0) + seconds);
      perWeek.set(weekIndex, weekMap);
    }
  }

  const result: EvolucionSemana[] = [];
  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() + 7 * w);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

    const weekMap = perWeek.get(w) ?? new Map<string, number>();
    const porCategoria = [...weekMap.entries()].map(([key, seconds]) =>
      toResumenCategoriaGeneric(key, seconds, hourlyCost, categoryName)
    );
    const totalSeconds = [...weekMap.values()].reduce((a, b) => a + b, 0);
    const horas = round2(totalSeconds / 3600);
    result.push({
      semana: { desde: weekStart.toISOString(), hasta: new Date(weekEnd.getTime() - 1).toISOString() },
      horas,
      costeEstimado: round2(horas * hourlyCost),
      porCategoria,
    });
  }
  return result;
}

// Grupos de registros sin categorizar (misma app+dominio) en el rango, con horas
// estimadas por el mismo método de huecos, para la tabla "Sin categorizar / revisar"
// del dashboard (de ahí sale la acción rápida de crear una regla).
export async function buildSinCategorizar(
  companyId: string,
  range: { start: Date; end: Date },
  limit = 50
): Promise<SinCategorizarGrupo[]> {
  const records = await prisma.activityRecord.findMany({
    where: { companyId, timestamp: { gte: range.start, lt: range.end } },
    orderBy: [{ sessionId: 'asc' }, { timestamp: 'asc' }],
    select: {
      timestamp: true,
      categoryId: true,
      isIdle: true,
      sessionId: true,
      app: true,
      domain: true,
      windowTitle: true,
    },
  });

  interface Grupo {
    app: string;
    domain: string | null;
    windowTitleEjemplo: string | null;
    registros: number;
    seconds: number;
    ultimaVez: Date;
  }
  const grupos = new Map<string, Grupo>();

  const bySession = new Map<string, typeof records>();
  for (const record of records) {
    const list = bySession.get(record.sessionId) ?? [];
    list.push(record);
    bySession.set(record.sessionId, list);
  }

  for (const sessionRecords of bySession.values()) {
    for (let i = 0; i < sessionRecords.length; i++) {
      const current = sessionRecords[i]!;
      if (current.isIdle || current.categoryId !== null) continue;
      const next = sessionRecords[i + 1];
      const deltaMs = next ? next.timestamp.getTime() - current.timestamp.getTime() : SAMPLE_CAP_SECONDS * 1000;
      const seconds = Math.min(Math.max(deltaMs, 0), SAMPLE_CAP_SECONDS * 1000) / 1000;

      const key = `${current.app} ${current.domain ?? ''}`;
      const grupo = grupos.get(key) ?? {
        app: current.app,
        domain: current.domain,
        windowTitleEjemplo: null,
        registros: 0,
        seconds: 0,
        ultimaVez: current.timestamp,
      };
      grupo.registros += 1;
      grupo.seconds += seconds;
      if (current.windowTitle) grupo.windowTitleEjemplo = current.windowTitle;
      if (current.timestamp > grupo.ultimaVez) grupo.ultimaVez = current.timestamp;
      grupos.set(key, grupo);
    }
  }

  return [...grupos.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit)
    .map((g) => ({
      app: g.app,
      domain: g.domain,
      windowTitleEjemplo: g.windowTitleEjemplo,
      registros: g.registros,
      horas: round2(g.seconds / 3600),
      ultimaVez: g.ultimaVez.toISOString(),
    }));
}

function toResumenCategoriaGeneric(
  key: string,
  seconds: number,
  hourlyCost: number,
  categoryName: Map<string, string>
): ResumenCategoria {
  const horas = round2(seconds / 3600);
  const isSpecial = key === IDLE_KEY || key === UNCATEGORIZED_KEY;
  return {
    categoryId: isSpecial ? null : key,
    categoryName: key === IDLE_KEY ? IDLE_LABEL : key === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : (categoryName.get(key) ?? UNCATEGORIZED_LABEL),
    horas,
    costeEstimado: round2(horas * hourlyCost),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
