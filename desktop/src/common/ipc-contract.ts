// Contrato IPC entre main, preload y renderer.
// SOLO tipos: el preload corre con sandbox y no puede hacer require de módulos
// locales, así que este archivo no debe contener valores en runtime.
import type { EmpleadoListItem, PinLoginResponse } from '@digital-power/shared';

/** Configuración del dispositivo (una vez por equipo), persistida en userData/config.json. */
export interface DeviceConfig {
  apiBaseUrl: string;
  companySlug: string;
  /** Cada cuántos segundos se lee la ventana activa (5–10; el main lo acota). */
  sampleIntervalSeconds: number;
}

/** Permisos del sistema necesarios para el tracking (solo aplican en macOS). */
export interface PermissionsStatus {
  /** false en Windows/Linux: no hay nada que conceder. */
  required: boolean;
  /** Accesibilidad: necesario para obtener el dominio del navegador. */
  accessibility: boolean;
  /** Grabación de pantalla: macOS lo exige para leer el título de la ventana. */
  screenRecording: boolean;
}

export type IpcErrorCode =
  | 'NETWORK'
  | 'NOT_FOUND'
  | 'INVALID_PIN'
  | 'LOCKED'
  | 'AUTH_EXPIRED'
  | 'UNKNOWN';

export interface IpcFailure {
  ok: false;
  /** Mensaje en castellano listo para mostrar en la UI. */
  error: string;
  code: IpcErrorCode;
  /** Solo con code LOCKED: segundos restantes de bloqueo del PIN. */
  retryAfterSeconds?: number;
}

export type IpcResult<T> = { ok: true; data: T } | IpcFailure;

/** Empleado autenticado, tal y como lo devuelve el login por PIN. */
export type SessionEmployee = PinLoginResponse['employee'];

export interface SesionOnResult {
  sessionId: string;
  startedAt: string;
  /** true si el backend devolvió 409 y se reanudó una sesión que quedó abierta. */
  resumed: boolean;
}

export interface SesionOffResult {
  endedAt: string;
  /** Aviso no bloqueante, p. ej. si el flush final de registros falló. */
  warning?: string;
}

/** Estado del tracker que el main emite al renderer (evento `tracker:status`). */
export interface TrackerStatus {
  buffered: number;
  lastFlushAt?: string;
  lastError?: string;
}

/** Cierre de turno iniciado fuera del renderer (evento `sesion:closed`, p. ej.
 *  el OFF rápido del menú de la bandeja). Con error, la sesión sigue abierta. */
export interface SesionClosedEvent {
  endedAt?: string;
  warning?: string;
  error?: string;
}

/** Ciclo de inactividad (§6), del main al renderer (evento `idle:event`):
 *  warning → dismissed (respondió/actividad) o paused → resumed. */
export type IdleEvent =
  | { type: 'warning'; countdownSeconds: number }
  | { type: 'dismissed' }
  | { type: 'paused' }
  | { type: 'resumed' };

/** API expuesta al renderer por el preload como `window.dpApi`. */
export interface DpApi {
  getConfig(): Promise<IpcResult<DeviceConfig | null>>;
  setConfig(config: DeviceConfig): Promise<IpcResult<DeviceConfig>>;
  listEmpleados(): Promise<IpcResult<EmpleadoListItem[]>>;
  loginPin(employeeId: string, pin: string): Promise<IpcResult<SessionEmployee>>;
  sesionOn(): Promise<IpcResult<SesionOnResult>>;
  sesionOff(): Promise<IpcResult<SesionOffResult>>;
  /** Vuelve atrás sin abrir turno: descarta token y empleado en el main. */
  sesionCancel(): Promise<IpcResult<null>>;
  /** Se suscribe al estado del tracker; devuelve la función para desuscribirse. */
  onTrackerStatus(listener: (status: TrackerStatus) => void): () => void;
  /** Se suscribe a cierres de turno iniciados fuera del renderer (bandeja). */
  onSesionClosed(listener: (event: SesionClosedEvent) => void): () => void;
  /** Se suscribe al ciclo de inactividad (aviso/pausa/reanudación). */
  onIdleEvent(listener: (event: IdleEvent) => void): () => void;
  /** Respuesta al aviso de inactividad ("Sigo trabajando"). */
  idleConfirm(): Promise<IpcResult<null>>;
  /** Estado de los permisos de macOS (en Windows/Linux, required: false). */
  getPermissions(): Promise<IpcResult<PermissionsStatus>>;
  /** Registra la app en la lista del permiso y abre Ajustes del Sistema. */
  requestPermission(pane: 'accessibility' | 'screenRecording'): Promise<IpcResult<null>>;
}
