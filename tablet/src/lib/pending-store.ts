// Buffer de registros con espejo en localStorage (equivalente al
// userData/pending/<sessionId>.json del desktop): si se va la red o se cierra
// la app con registros sin subir, se conservan en el dispositivo y se
// recuperan en el siguiente turno del empleado.
import { ApiClient, ApiError, MAX_BATCH_SIZE } from '@digital-power/shared';
import type { RegistroInput } from '@digital-power/shared';

const PENDING_PREFIX = 'dp-tablet:pending:';
// Acota el espejo si el backend está caído mucho rato (~27 h de muestras a 5 s);
// localStorage ronda los 5 MB y no hay que dejar que un olvido lo llene.
const MAX_BUFFERED_RECORDS = 20_000;

interface PendingPayload {
  employeeId: string;
  registros: RegistroInput[];
}

function pendingKey(sessionId: string): string {
  return `${PENDING_PREFIX}${sessionId}`;
}

function readPayload(key: string): PendingPayload | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingPayload>;
    if (typeof parsed.employeeId !== 'string' || !Array.isArray(parsed.registros)) return null;
    return { employeeId: parsed.employeeId, registros: parsed.registros };
  } catch {
    return null;
  }
}

export class SessionBuffer {
  private registros: RegistroInput[];
  private flushing = false;

  constructor(
    private readonly sessionId: string,
    private readonly employeeId: string,
  ) {
    // Reanudación: si la página se recargó con registros sin subir, se heredan.
    const existing = readPayload(pendingKey(sessionId));
    this.registros = existing && existing.employeeId === employeeId ? existing.registros : [];
  }

  get pendingCount(): number {
    return this.registros.length;
  }

  add(registro: RegistroInput): void {
    this.registros.push(registro);
    if (this.registros.length > MAX_BUFFERED_RECORDS) {
      this.registros.splice(0, this.registros.length - MAX_BUFFERED_RECORDS);
    }
    this.persist();
  }

  /**
   * Sube el buffer en lotes de MAX_BATCH_SIZE. Devuelve true si quedó vacío.
   * Los errores recuperables (red, 5xx, token caducado) conservan lo pendiente;
   * los permanentes (400/404: sesión inexistente o datos inválidos) descartan
   * el lote, que jamás va a poder subirse.
   */
  async flush(api: ApiClient, token: string): Promise<boolean> {
    if (this.flushing) return this.registros.length === 0;
    this.flushing = true;
    try {
      while (this.registros.length > 0) {
        const batch = this.registros.slice(0, MAX_BATCH_SIZE);
        try {
          await api.postRegistros(token, this.sessionId, { registros: batch });
        } catch (err) {
          if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
            console.warn(`Lote descartado (${err.status}: ${err.message})`);
            this.registros.splice(0, batch.length);
            this.persist();
            continue;
          }
          return false;
        }
        this.registros.splice(0, batch.length);
        this.persist();
      }
      return true;
    } finally {
      this.flushing = false;
    }
  }

  clear(): void {
    this.registros = [];
    localStorage.removeItem(pendingKey(this.sessionId));
  }

  private persist(): void {
    const key = pendingKey(this.sessionId);
    if (this.registros.length === 0) {
      localStorage.removeItem(key);
      return;
    }
    const payload: PendingPayload = { employeeId: this.employeeId, registros: this.registros };
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Cuota llena: se sacrifica la mitad más antigua del espejo y se reintenta.
      this.registros.splice(0, Math.ceil(this.registros.length / 2));
      try {
        localStorage.setItem(key, JSON.stringify({ employeeId: this.employeeId, registros: this.registros }));
      } catch {
        // Sin espacio ni así: el buffer sigue en memoria mientras viva la página.
      }
    }
  }
}

/**
 * Recuperación al iniciar sesión: sube los buffers pendientes de turnos
 * anteriores de ESTE empleado (el token no vale para sesiones de otros).
 */
export async function recoverPending(api: ApiClient, token: string, employeeId: string): Promise<void> {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(PENDING_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    const payload = readPayload(key);
    if (!payload || payload.employeeId !== employeeId) continue;
    const sessionId = key.slice(PENDING_PREFIX.length);
    const buffer = new SessionBuffer(sessionId, employeeId);
    await buffer.flush(api, token);
  }
}
