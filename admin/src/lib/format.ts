// Formateo en castellano (es-ES) de horas, euros y fechas del panel.

export function fmtHoras(horas: number): string {
  return `${horas.toLocaleString('es-ES', { maximumFractionDigits: 1 })} h`;
}

export function fmtEuros(euros: number): string {
  return euros.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

/** Duración legible tipo "7 h 30 min"; null = sesión aún abierta. */
export function fmtDuracion(horas: number | null): string {
  if (horas === null) return 'En curso';
  const enteras = Math.floor(horas);
  const minutos = Math.round((horas - enteras) * 60);
  if (enteras === 0) return `${minutos} min`;
  return minutos === 0 ? `${enteras} h` : `${enteras} h ${minutos} min`;
}

export function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

export function fmtHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
