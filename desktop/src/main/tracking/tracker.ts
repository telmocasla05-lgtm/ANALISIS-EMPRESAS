// Pipeline real de tracking: muestrea el detector cada sampleIntervalMs,
// acumula RegistroInput en memoria (con espejo en disco para no perder nada
// si la app se cierra) y los sube por lotes cada FLUSH_INTERVAL_MS, con un
// flush final (con reintentos) al cerrar el turno.
import { MAX_BATCH_SIZE } from '@digital-power/shared';
import type { RegistroInput } from '@digital-power/shared';
import type { TrackerStatus } from '../../common/ipc-contract';
import type { ActivityDetector } from './activity-detector';

// El backend estima duraciones por hueco entre lecturas con tope de 10 s
// (SAMPLE_CAP_SECONDS en services/resumen.ts): el intervalo configurable
// se acota a 5–10 s para encajar en ese tope.
const DEFAULT_SAMPLE_INTERVAL_MS = 5_000;
const FLUSH_INTERVAL_MS = 60_000;
// Acota memoria si el backend está caído mucho rato (~7 h de lecturas a 5 s)
const MAX_BUFFERED_RECORDS = 5_000;
const FINAL_FLUSH_ATTEMPTS = 3;
const FINAL_FLUSH_RETRY_DELAY_MS = 2_000;

export interface TrackerOptions {
  /** Intervalo de muestreo en ms (el IPC lo acota a 5–10 s antes de llegar aquí). */
  sampleIntervalMs?: number;
  /** Intervalo entre subidas de lotes en ms. Por defecto 60 s; solo los tests lo acortan. */
  flushIntervalMs?: number;
  /** Registros heredados (sesión reanudada tras un cierre inesperado): se suben en el primer lote. */
  initialRecords?: RegistroInput[];
  /** Espejo en disco del buffer (BufferStore.persist). Con [] borra el pendiente. */
  persist?: (registros: RegistroInput[]) => void;
}

export class Tracker {
  private buffer: RegistroInput[];
  private sampleTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private flushHeld = false;
  private idle = false;
  private lastFlushAt?: string;
  private lastError?: string;
  private readonly sampleIntervalMs: number;
  private readonly flushIntervalMs: number;
  private readonly persist: (registros: RegistroInput[]) => void;

  constructor(
    private readonly detector: ActivityDetector,
    private readonly uploadBatch: (registros: RegistroInput[]) => Promise<void>,
    private readonly onStatus: (status: TrackerStatus) => void,
    options: TrackerOptions = {},
  ) {
    this.buffer = options.initialRecords?.slice() ?? [];
    this.sampleIntervalMs = options.sampleIntervalMs ?? DEFAULT_SAMPLE_INTERVAL_MS;
    this.flushIntervalMs = options.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.persist = options.persist ?? (() => {});
  }

  start(): void {
    if (this.sampleTimer) return;
    this.sampleTimer = setInterval(() => void this.takeSample(), this.sampleIntervalMs);
    this.flushTimer = setInterval(() => void this.flush(), this.flushIntervalMs);
  }

  /** Pausa de inactividad (§6): mientras esté activa, las lecturas salen con isIdle. */
  setIdle(idle: boolean): void {
    this.idle = idle;
  }

  /**
   * Retiene los flushes periódicos mientras el aviso de inactividad está en
   * pantalla: si acaba en pausa, esas lecturas aún están en el buffer y se
   * pueden re-etiquetar retroactivamente (markIdleSince). Dura como mucho la
   * cuenta atrás del aviso (60 s); el flush final del OFF la ignora.
   */
  holdFlush(held: boolean): void {
    this.flushHeld = held;
  }

  /** Re-etiqueta como inactividad las lecturas en buffer desde un instante dado. */
  markIdleSince(sinceMs: number): void {
    for (const record of this.buffer) {
      if (Date.parse(record.timestamp) >= sinceMs) record.isIdle = true;
    }
    this.persist(this.buffer);
  }

  /**
   * Para el muestreo y hace el flush final. Devuelve un aviso en castellano
   * si tras los reintentos quedaron registros sin subir (el OFF sigue adelante;
   * lo que quede se conserva en disco y se recupera en el siguiente turno).
   */
  async stop(): Promise<string | undefined> {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flushHeld = false;
    for (let attempt = 1; attempt <= FINAL_FLUSH_ATTEMPTS; attempt += 1) {
      if (await this.flush()) return undefined;
      if (attempt < FINAL_FLUSH_ATTEMPTS) await delay(FINAL_FLUSH_RETRY_DELAY_MS);
    }
    return 'No se pudieron subir los últimos registros de actividad; se guardan en este equipo y se subirán en el próximo turno.';
  }

  private async takeSample(): Promise<void> {
    let sample = null;
    try {
      sample = await this.detector.sample();
    } catch {
      // Detector no disponible en esta lectura: se ignora y se reintenta al siguiente tick
    }
    if (sample) {
      this.buffer.push({
        timestamp: new Date().toISOString(),
        app: sample.app,
        windowTitle: sample.windowTitle,
        domain: sample.domain,
        isIdle: this.idle,
      });
      if (this.buffer.length > MAX_BUFFERED_RECORDS) {
        this.buffer.splice(0, this.buffer.length - MAX_BUFFERED_RECORDS);
      }
      this.persist(this.buffer);
    }
    this.emitStatus();
  }

  /** Sube el buffer actual (troceado en lotes de MAX_BATCH_SIZE). Devuelve true si quedó vacío. */
  private async flush(): Promise<boolean> {
    if (this.flushing || this.flushHeld) return false;
    if (this.buffer.length === 0) return true;
    this.flushing = true;
    try {
      while (this.buffer.length > 0) {
        const batch = this.buffer.slice(0, MAX_BATCH_SIZE);
        await this.uploadBatch(batch);
        // Pueden haber entrado lecturas nuevas durante el await: se quitan solo las enviadas
        this.buffer.splice(0, batch.length);
        this.persist(this.buffer);
        this.lastFlushAt = new Date().toISOString();
      }
      this.lastError = undefined;
      return true;
    } catch (err) {
      // Se conserva lo no enviado (memoria + disco) y se reintenta en el
      // siguiente ciclo. Ojo: si el backend insertó pero la respuesta se
      // perdió, el reintento duplica (idempotencia pendiente, docs/PENDIENTE.md).
      this.lastError = err instanceof Error ? err.message : 'Error al subir registros';
      return false;
    } finally {
      this.flushing = false;
      this.emitStatus();
    }
  }

  private emitStatus(): void {
    this.onStatus({
      buffered: this.buffer.length,
      lastFlushAt: this.lastFlushAt,
      lastError: this.lastError,
    });
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
