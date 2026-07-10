// Selección activa (§ tablet de la especificación): el empleado toca una
// categoría al cambiar de tarea y el tramo queda vigente hasta el siguiente
// toque o el OFF. Para reutilizar el mismo modelo de datos y agregación que el
// tracking pasivo (lecturas cada 5-10 s, hueco con tope de 10 s en el resumen),
// el tramo activo se materializa como muestras periódicas con su categoryId.
import type { CategoriaListItem, RegistroInput } from '@digital-power/shared';

export const SAMPLE_INTERVAL_MS = 5_000;
export const TABLET_APP_NAME = 'Selección activa (tablet)';

export class ActiveSelectionSampler {
  private category: CategoriaListItem | null = null;
  private lastSampleAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly onSample: (registro: RegistroInput) => void,
  ) {}

  /** Cambia el tramo activo: pone al día el anterior y emite ya la primera muestra del nuevo. */
  setCategory(category: CategoriaListItem): void {
    this.catchUp();
    this.category = category;
    this.emit(Date.now());
    if (!this.timer) {
      this.timer = setInterval(() => this.catchUp(), 1_000);
    }
  }

  /**
   * Emite las muestras que falten desde la última, a pasos de intervalMs.
   * Cubre los periodos con la pantalla bloqueada o la pestaña en segundo plano
   * (el navegador estrangula los timers): la selección sigue vigente hasta que
   * el empleado la cambie, así que al despertar se rellenan retroactivamente.
   */
  catchUp(): void {
    if (!this.category) return;
    while (Date.now() - this.lastSampleAt >= this.intervalMs) {
      this.emit(this.lastSampleAt + this.intervalMs);
    }
  }

  /** Cierra el tramo (pone al día sus muestras) y detiene el muestreo. */
  stop(): void {
    this.catchUp();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.category = null;
  }

  private emit(timestamp: number): void {
    if (!this.category) return;
    this.lastSampleAt = timestamp;
    this.onSample({
      timestamp: new Date(timestamp).toISOString(),
      app: TABLET_APP_NAME,
      windowTitle: this.category.name,
      categoryId: this.category.id,
    });
  }
}
