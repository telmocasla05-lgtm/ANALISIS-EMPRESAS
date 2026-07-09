// Rangos de fechas del panel. Los días se interpretan en UTC, igual que las
// semanas naturales del backend (ver services/resumen.ts).

export interface DateRange {
  desde: string; // YYYY-MM-DD, inclusive
  hasta: string; // YYYY-MM-DD, inclusive
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfWeekUtc(base: Date): Date {
  const day = base.getUTCDay(); // 0 = domingo
  const diffToMonday = (day + 6) % 7;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - diffToMonday));
}

export function semanaActual(): DateRange {
  const start = startOfWeekUtc(new Date());
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { desde: toIsoDate(start), hasta: toIsoDate(end) };
}

export function semanaPasada(): DateRange {
  const start = startOfWeekUtc(new Date());
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { desde: toIsoDate(start), hasta: toIsoDate(end) };
}

export function ultimos30Dias(): DateRange {
  const hoy = new Date();
  const start = new Date(hoy);
  start.setUTCDate(start.getUTCDate() - 29);
  return { desde: toIsoDate(start), hasta: toIsoDate(hoy) };
}

export function esteMes(): DateRange {
  const hoy = new Date();
  const start = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  return { desde: toIsoDate(start), hasta: toIsoDate(hoy) };
}
