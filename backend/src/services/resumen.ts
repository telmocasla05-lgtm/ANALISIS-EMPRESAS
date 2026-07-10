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

export interface DateRange {
  start: Date;
  end: Date; // exclusivo
}

export function getWeekRange(semana?: string): DateRange {
  const base = semana ? new Date(semana) : new Date();
  if (Number.isNaN(base.getTime())) throw new Error('Fecha inválida');

  const day = base.getUTCDay(); // 0 = domingo
  const diffToMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - diffToMonday));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

// Rango de fechas de la query admin: `desde`/`hasta` (días naturales UTC, ambos
// inclusive) tienen prioridad; si no vienen, `semana` o la semana en curso.
export function parseDateRange(query: { desde?: unknown; hasta?: unknown; semana?: unknown }): DateRange {
  const desde = typeof query.desde === 'string' ? query.desde : undefined;
  const hasta = typeof query.hasta === 'string' ? query.hasta : undefined;
  const semana = typeof query.semana === 'string' ? query.semana : undefined;

  if (!desde && !hasta) return getWeekRange(semana);

  if (!desde || !hasta) throw new Error('desde y hasta van juntos');
  const start = new Date(`${desde}T00:00:00.000Z`);
  const endDay = new Date(`${hasta}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(endDay.getTime()) || endDay < start) {
    throw new Error('Rango de fechas inválido');
  }
  const end = new Date(endDay);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

interface RawRecord {
  timestamp: Date;
  categoryId: string | null;
  isIdle: boolean;
  sessionId: string;
  session: { employeeId: string };
}

// Recorre los registros de un rango sesión a sesión estimando la duración de
// cada lectura (hueco hasta la siguiente, con tope) y la entrega al callback.
async function walkRecords<T extends RawRecord>(
  companyId: string,
  range: DateRange,
  extraSelect: Record<string, true>,
  visit: (record: T, seconds: number) => void
): Promise<void> {
  const records = (await prisma.activityRecord.findMany({
    where: { companyId, timestamp: { gte: range.start, lt: range.end } },
    orderBy: [{ sessionId: 'asc' }, { timestamp: 'asc' }],
    select: {
      timestamp: true,
      categoryId: true,
      isIdle: true,
      sessionId: true,
      session: { select: { employeeId: true } },
      ...extraSelect,
    },
  })) as unknown as T[];

  for (let i = 0; i < records.length; i++) {
    const current = records[i]!;
    const next = records[i + 1];
    const sameSession = next && next.sessionId === current.sessionId;
    const deltaMs = sameSession ? next.timestamp.getTime() - current.timestamp.getTime() : SAMPLE_CAP_SECONDS * 1000;
    const seconds = Math.min(Math.max(deltaMs, 0), SAMPLE_CAP_SECONDS * 1000) / 1000;
    visit(current, seconds);
  }
}

export async function buildResumen(companyId: string, range: DateRange): Promise<Resumen> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  const [employees, categories] = await Promise.all([
    prisma.employee.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { OR: [{ sector: company.sector }, { companyId }] }, select: { id: true, name: true } }),
  ]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const perCompany = new Map<string, number>();
  const perEmployee = new Map<string, Map<string, number>>();

  await walkRecords<RawRecord>(companyId, range, {}, (record, seconds) => {
    const key = record.isIdle ? IDLE_KEY : (record.categoryId ?? UNCATEGORIZED_KEY);
    const employeeId = record.session.employeeId;

    perCompany.set(key, (perCompany.get(key) ?? 0) + seconds);
    const employeeMap = perEmployee.get(employeeId) ?? new Map<string, number>();
    employeeMap.set(key, (employeeMap.get(key) ?? 0) + seconds);
    perEmployee.set(employeeId, employeeMap);
  });

  const hourlyCost = company.avgHourlyCostCents / 100;

  function toResumenCategoria(key: string, seconds: number): ResumenCategoria {
    const horas = round2(seconds / 3600);
    const isSpecial = key === IDLE_KEY || key === UNCATEGORIZED_KEY;
    return {
      categoryId: isSpecial ? null : key,
      categoryName: key === IDLE_KEY ? IDLE_LABEL : key === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : (categoryName.get(key) ?? UNCATEGORIZED_LABEL),
      horas,
      // La inactividad no cuesta: ese tiempo no se cuenta en ninguna categoría (§6).
      costeEstimado: key === IDLE_KEY ? 0 : round2(horas * hourlyCost),
    };
  }

  const porCategoria = [...perCompany.entries()].map(([key, seconds]) => toResumenCategoria(key, seconds));

  const porEmpleado: ResumenEmpleado[] = employees.map((employee) => {
    const categoryMap = perEmployee.get(employee.id) ?? new Map<string, number>();
    const porCategoriaEmpleado = [...categoryMap.entries()].map(([key, seconds]) => toResumenCategoria(key, seconds));
    const activeSeconds = [...categoryMap.entries()].filter(([key]) => key !== IDLE_KEY).reduce((a, [, s]) => a + s, 0);
    const horas = round2(activeSeconds / 3600);
    return {
      employeeId: employee.id,
      employeeName: employee.name,
      horas,
      costeEstimado: round2(horas * hourlyCost),
      porCategoria: porCategoriaEmpleado,
    };
  });

  const activeSeconds = [...perCompany.entries()].filter(([key]) => key !== IDLE_KEY).reduce((a, [, s]) => a + s, 0);
  const idleSeconds = perCompany.get(IDLE_KEY) ?? 0;
  const horasActivas = round2(activeSeconds / 3600);

  return {
    rango: { desde: range.start.toISOString(), hasta: new Date(range.end.getTime() - 1).toISOString() },
    totales: {
      horas: horasActivas,
      costeEstimado: round2(horasActivas * hourlyCost),
      horasInactivas: round2(idleSeconds / 3600),
    },
    porCategoria,
    porEmpleado,
  };
}

// Horas activas por semana natural (UTC) de las últimas `weeks` semanas,
// incluida la actual — para el gráfico de evolución del dashboard.
export async function buildEvolucionSemanal(companyId: string, weeks: number): Promise<EvolucionSemana[]> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const currentWeek = getWeekRange();
  const start = new Date(currentWeek.start);
  start.setUTCDate(start.getUTCDate() - 7 * (weeks - 1));

  const secondsByWeek = new Map<string, number>();
  await walkRecords<RawRecord>(companyId, { start, end: currentWeek.end }, {}, (record, seconds) => {
    if (record.isIdle) return;
    const key = getWeekRange(record.timestamp.toISOString()).start.toISOString().slice(0, 10);
    secondsByWeek.set(key, (secondsByWeek.get(key) ?? 0) + seconds);
  });

  const hourlyCost = company.avgHourlyCostCents / 100;
  const result: EvolucionSemana[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(start);
    weekStart.setUTCDate(weekStart.getUTCDate() + 7 * i);
    const key = weekStart.toISOString().slice(0, 10);
    const horas = round2((secondsByWeek.get(key) ?? 0) / 3600);
    result.push({ semana: key, horas, costeEstimado: round2(horas * hourlyCost) });
  }
  return result;
}

interface RawRecordConVentana extends RawRecord {
  app: string;
  domain: string | null;
  windowTitle: string | null;
}

// Registros activos sin categorizar del rango, agrupados por app + dominio y
// ordenados por horas: la cola de revisión desde la que el admin crea reglas.
export async function buildSinCategorizar(companyId: string, range: DateRange, limit = 50): Promise<SinCategorizarGrupo[]> {
  const groups = new Map<string, SinCategorizarGrupo & { seconds: number }>();

  await walkRecords<RawRecordConVentana>(
    companyId,
    range,
    { app: true, domain: true, windowTitle: true },
    (record, seconds) => {
      if (record.isIdle || record.categoryId !== null) return;
      const key = `${record.app} ${record.domain ?? ''}`;
      const group = groups.get(key) ?? {
        app: record.app,
        domain: record.domain,
        ejemploTitulo: null,
        registros: 0,
        horas: 0,
        seconds: 0,
      };
      group.registros += 1;
      group.seconds += seconds;
      if (record.windowTitle) group.ejemploTitulo = record.windowTitle;
      groups.set(key, group);
    }
  );

  return [...groups.values()]
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit)
    .map(({ seconds, ...group }) => ({ ...group, horas: round2(seconds / 3600) }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
