// Pipeline real de tracking: muestrea el detector cada SAMPLE_INTERVAL_MS,
// acumula RegistroInput en memoria y los sube por lotes cada FLUSH_INTERVAL_MS,
// con un flush final (con reintentos) al cerrar el turno.
import type { RegistroInput } from '@digital-power/shared';
import type { TrackerStatus } from '../../common/ipc-contract';
import type { ActivityDetector } from './activity-detector';

// El backend estima duraciones por hueco entre lecturas con tope de 10 s
// (SAMPLE_CAP_SECONDS en services/resumen.ts): muestrear cada 5 s encaja.
const SAMPLE_INTERVAL_MS = 5_000;
const FLUSH_INTERVAL_MS = 60_000;
// Acota memoria si el backend está caído mucho rato (~7 h de lecturas a 5 s)
const MAX_BUFFERED_RECORDS = 5_000;
const FINAL_FLUSH_ATTEMPTS = 3;
const FINAL_FLUSH_RETRY_DELAY_MS = 2_000;

export class Tracker {
  private buffer: RegistroInput[] = [];
  private sampleTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;
  private lastFlushAt?: string;
  private lastError?: string;

  constructor(
    private readonly detector: ActivityDetector,
    private readonly uploadBatch: (registros: RegistroInput[]) => Promise<void>,
    private readonly onStatus: (status: TrackerStatus) => void,
  ) {}

  start(): void {
    if (this.sampleTimer) return;
    this.sampleTimer = setInterval(() => void this.takeSample(), SAMPLE_INTERVAL_MS);
    this.flushTimer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  /**
   * Para el muestreo y hace el flush final. Devuelve un aviso en castellano
   * si tras los reintentos quedaron registros sin subir (el OFF sigue adelante).
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
    for (let attempt = 1; attempt <= FINAL_FLUSH_ATTEMPTS; attempt += 1) {
      if (await this.flush()) return undefined;
      if (attempt < FINAL_FLUSH_ATTEMPTS) await delay(FINAL_FLUSH_RETRY_DELAY_MS);
    }
    return 'No se pudieron subir los últimos registros de actividad.';
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
        isIdle: false,
      });
      if (this.buffer.length > MAX_BUFFERED_RECORDS) {
        this.buffer.splice(0, this.buffer.length - MAX_BUFFERED_RECORDS);
      }
    }
    this.emitStatus();
  }

  /** Sube el buffer actual. Devuelve true si el buffer quedó vacío. */
  private async flush(): Promise<boolean> {
    if (this.flushing) return false;
    if (this.buffer.length === 0) return true;
    this.flushing = true;
    const batch = this.buffer.slice();
    try {
      await this.uploadBatch(batch);
      // Pueden haber entrado lecturas nuevas durante el await: se quitan solo las enviadas
      this.buffer.splice(0, batch.length);
      this.lastFlushAt = new Date().toISOString();
      this.lastError = undefined;
      return this.buffer.length === 0;
    } catch (err) {
      // Se conserva el buffer y se reintenta en el siguiente ciclo. Ojo: si el
      // backend insertó pero la respuesta se perdió, el reintento duplica
      // (idempotencia pendiente en backend, docs/PENDIENTE.md).
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
