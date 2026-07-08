// Agregación de horas por categoría/empleado para el resumen semanal admin (§10).
// Los registros son lecturas puntuales (cada 5-10 s, §8), no intervalos con duración
// propia: se estima la duración de cada lectura como el hueco hasta la siguiente,
// con un tope (SAMPLE_CAP_SECONDS) para no contar como "activo" un hueco largo
// (p.ej. el ordenador se apagó sin que llegara el próximo registro).
import type { ResumenCategoria, ResumenEmpleado, ResumenSemanal } from '@digital-power/shared';
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

export async function buildResumenSemanal(companyId: string, semana?: string): Promise<ResumenSemanal> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const { start, end } = getWeekRange(semana);

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

  function toResumenCategoria(key: string, seconds: number): ResumenCategoria {
    const horas = round2(seconds / 3600);
    const isSpecial = key === IDLE_KEY || key === UNCATEGORIZED_KEY;
    return {
      categoryId: isSpecial ? null : key,
      categoryName: key === IDLE_KEY ? IDLE_LABEL : key === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : (categoryName.get(key) ?? UNCATEGORIZED_LABEL),
      horas,
      costeEstimado: round2(horas * hourlyCost),
    };
  }

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
    semana: { desde: start.toISOString(), hasta: new Date(end.getTime() - 1).toISOString() },
    porCategoria,
    porEmpleado,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
