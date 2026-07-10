// Formateo en castellano (es-ES) de horas, euros y fechas del panel.

const EUROS = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const FECHA = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const FECHA_HORA = new Intl.DateTimeFormat('es-ES', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const FECHA_CORTA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** 12.53 → "12 h 32 min"; 0.1 → "6 min". */
export function formatHoras(horas: number): string {
  const totalMin = Math.round(horas * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatEuros(euros: number): string {
  return EUROS.format(euros);
}

export function formatDuracionMinutos(minutos: number): string {
  return formatHoras(minutos / 60);
}

/** ISO → "09/07/2026" (día natural UTC, como agrega el backend). */
export function formatFecha(iso: string): string {
  return FECHA.format(new Date(iso));
}

/** ISO → "9 jul" para ejes de gráficos. */
export function formatFechaCorta(iso: string): string {
  return FECHA_CORTA.format(new Date(iso));
}

/** ISO → "09/07/2026, 08:30" en hora local (sesiones ON/OFF). */
export function formatFechaHora(iso: string): string {
  return FECHA_HORA.format(new Date(iso));
}

/** Date → "YYYY-MM-DD" en UTC (valor para <input type="date"> y la query de la API). */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Lunes (UTC) de la semana de `date`. */
export function mondayOf(date: Date): Date {
  const day = date.getUTCDay();
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - ((day + 6) % 7)));
  return monday;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
