// Agregación de datos para el informe (§10): horas y coste por categoría, por
// empleado y por semana del periodo elegido, más las plantillas de automatización
// del sector de la empresa. Es el JSON que se pasa a la API de Claude para
// redactar el borrador — solo datos agregados, nunca registros individuales.
import type { EvolucionSemana, InformeDatos } from '@digital-power/shared';
import { prisma } from '../lib/prisma.js';
import { buildResumen, getWeekRange } from './resumen.js';

export async function buildInformeDatos(companyId: string, range: { start: Date; end: Date }): Promise<InformeDatos> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });

  const [resumen, plantillas] = await Promise.all([
    buildResumen(companyId, range),
    prisma.automationTemplate.findMany({
      where: { sector: company.sector },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, description: true },
    }),
  ]);

  // Serie semanal: semanas naturales (UTC) que intersecan el periodo, recortadas
  // a sus bordes. Reutiliza buildResumen para mantener una única estimación de
  // duración por huecos en todo el backend.
  const porSemana: EvolucionSemana[] = [];
  let weekStart = getWeekRange(range.start.toISOString()).start;
  while (weekStart < range.end) {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
    const slice = {
      start: weekStart < range.start ? range.start : weekStart,
      end: weekEnd > range.end ? range.end : weekEnd,
    };
    const semana = await buildResumen(companyId, slice);
    const horas = round2(semana.porCategoria.reduce((total, c) => total + c.horas, 0));
    porSemana.push({
      semana: semana.rango,
      horas,
      costeEstimado: round2(semana.porCategoria.reduce((total, c) => total + c.costeEstimado, 0)),
      porCategoria: semana.porCategoria,
    });
    weekStart = weekEnd;
  }

  return {
    empresa: {
      nombre: company.name,
      sector: company.sector,
      costeHoraEuros: company.avgHourlyCostCents / 100,
    },
    periodo: resumen.rango,
    totales: {
      horas: round2(resumen.porCategoria.reduce((total, c) => total + c.horas, 0)),
      costeEstimado: round2(resumen.porCategoria.reduce((total, c) => total + c.costeEstimado, 0)),
    },
    porCategoria: [...resumen.porCategoria].sort((a, b) => b.horas - a.horas),
    porEmpleado: resumen.porEmpleado,
    porSemana,
    plantillasAutomatizacion: plantillas,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
