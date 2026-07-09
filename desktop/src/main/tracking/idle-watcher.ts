// Detección de inactividad con aviso previo (§6): tras `thresholdSeconds` sin
// ratón/teclado se avisa ("¿Sigues aquí?"); si no hay respuesta en
// `countdownSeconds`, se pausa (las lecturas pasan a isIdle y no se cuentan en
// ninguna categoría) hasta que vuelve la actividad. Nunca se pausa en silencio.
//
// La política de etiquetado: por debajo del umbral todo cuenta como trabajo
// (leer sin tocar el teclado es trabajo); si el aviso acaba en pausa, la pausa
// se aplica retroactivamente desde que empezó el aviso (por eso el tracker
// retiene los flushes durante el aviso: esas lecturas aún se pueden re-etiquetar).
import { powerMonitor } from 'electron';

export interface IdleWatcherOptions {
  /** Umbral de inactividad en segundos (inactivityMinutes de la empresa). */
  thresholdSeconds: number;
  /** Cuenta atrás del aviso antes de pausar. Por defecto 60 s (§6). */
  countdownSeconds?: number;
  /** Frecuencia de comprobación. Por defecto 1 s. */
  pollMs?: number;
  /** Segundos desde la última entrada del sistema (inyectable en tests). */
  getIdleSeconds?: () => number;
  /** Empezó el aviso: retener flushes y mostrar "¿Sigues aquí?" al empleado. */
  onWarning: (countdownSeconds: number) => void;
  /** Hubo respuesta o actividad durante el aviso: se sigue contando normal. */
  onDismissed: () => void;
  /** Aviso agotado: pausa retroactiva desde warningStartedAtMs. */
  onPaused: (warningStartedAtMs: number) => void;
  /** Volvió la actividad tras una pausa. */
  onResumed: () => void;
}

type IdleState = 'active' | 'warning' | 'paused';

export class IdleWatcher {
  private state: IdleState = 'active';
  private warningStartedAtMs = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly countdownSeconds: number;
  private readonly pollMs: number;
  private readonly getIdleSeconds: () => number;

  constructor(private readonly options: IdleWatcherOptions) {
    this.countdownSeconds = options.countdownSeconds ?? 60;
    this.pollMs = options.pollMs ?? 1_000;
    this.getIdleSeconds = options.getIdleSeconds ?? (() => powerMonitor.getSystemIdleTime());
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.pollMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Respuesta explícita al aviso (botón "Sigo trabajando" del renderer). */
  confirmPresence(): void {
    if (this.state === 'warning') {
      this.state = 'active';
      this.options.onDismissed();
    } else if (this.state === 'paused') {
      this.state = 'active';
      this.options.onResumed();
    }
  }

  private tick(): void {
    const idleSeconds = this.getIdleSeconds();
    if (this.state === 'active') {
      if (idleSeconds >= this.options.thresholdSeconds) {
        this.state = 'warning';
        this.warningStartedAtMs = Date.now();
        this.options.onWarning(this.countdownSeconds);
      }
    } else if (this.state === 'warning') {
      if (idleSeconds < this.options.thresholdSeconds) {
        // Volvió la actividad antes de agotarse el aviso: cuenta como trabajo
        this.state = 'active';
        this.options.onDismissed();
      } else if (Date.now() - this.warningStartedAtMs >= this.countdownSeconds * 1000) {
        this.state = 'paused';
        this.options.onPaused(this.warningStartedAtMs);
      }
    } else if (idleSeconds < this.options.thresholdSeconds) {
      // paused → volvió la actividad
      this.state = 'active';
      this.options.onResumed();
    }
  }
}
