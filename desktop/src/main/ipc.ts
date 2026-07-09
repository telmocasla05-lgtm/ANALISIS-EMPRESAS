// Orquestación IPC: estado de la sesión de fichaje en memoria del main y
// puente entre renderer, API del backend, tracker y bandeja. El token JWT
// vive aquí, nunca en el renderer.
import { BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import { ApiClient, ApiError, MAX_BATCH_SIZE } from '@digital-power/shared';
import type { EmpleadoListItem } from '@digital-power/shared';
import type {
  DeviceConfig,
  IdleEvent,
  IpcFailure,
  IpcResult,
  PermissionsStatus,
  SesionClosedEvent,
  SesionOffResult,
  SesionOnResult,
  SessionEmployee,
  TrackerStatus,
} from '../common/ipc-contract';
import { clampSampleInterval, readConfig, writeConfig } from './config-store';
import { getPermissionsStatus, requestPermission } from './permissions';
import type { ActivityDetector } from './tracking/activity-detector';
import {
  archivePendingBatch,
  BufferStore,
  listPendingBatches,
  readPendingBatch,
} from './tracking/buffer-store';
import { GetWindowsDetector } from './tracking/get-windows-detector';
import { IdleWatcher } from './tracking/idle-watcher';
import { MockActivityDetector } from './tracking/mock-detector';
import { Tracker } from './tracking/tracker';
import { hideTrackingTray, setTrackingTrayPaused, showTrackingTray, updateTrackingTray } from './tray';

interface AuthState {
  token: string;
  employee: SessionEmployee;
  /** Umbral de aviso de inactividad de la empresa (§6), del login. */
  inactivityMinutes: number;
}

/** Todo lo necesario para operar (y si hace falta, rearmar) el tracking de un turno. */
interface TrackingContext {
  sender: WebContents;
  client: ApiClient;
  config: DeviceConfig;
  token: string;
  employee: SessionEmployee;
  inactivityMinutes: number;
  sessionId: string;
  tracker: Tracker;
  watcher: IdleWatcher;
}

let auth: AuthState | null = null;
let tracking: TrackingContext | null = null;

const AUTH_EXPIRED: IpcFailure = {
  ok: false,
  code: 'AUTH_EXPIRED',
  error: 'La sesión ha caducado, vuelve a identificarte.',
};

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(code: IpcFailure['code'], error: string): IpcFailure {
  return { ok: false, code, error };
}

/** Traduce errores del ApiClient a fallos IPC; `unauthorized` decide qué es un 401 en cada contexto. */
function toFailure(err: unknown, unauthorized: IpcFailure | null = null): IpcFailure {
  if (err instanceof ApiError) {
    if (err.status === 0) return fail('NETWORK', 'No se pudo conectar con el servidor');
    if (err.status === 401 && unauthorized) return unauthorized;
    if (err.status === 404) return fail('NOT_FOUND', err.message);
    if (err.status === 429) {
      const retry = err.body.retryAfterSeconds;
      return {
        ...fail('LOCKED', err.message),
        retryAfterSeconds: typeof retry === 'number' ? retry : undefined,
      };
    }
    return fail('UNKNOWN', err.message);
  }
  return fail('UNKNOWN', 'Error inesperado');
}

function clientFromConfig(): { client: ApiClient; config: DeviceConfig } | null {
  const config = readConfig();
  if (!config) return null;
  return { client: new ApiClient(config.apiBaseUrl), config };
}

function sendTrackerStatus(target: WebContents, status: TrackerStatus): void {
  if (!target.isDestroyed()) {
    target.send('tracker:status', status);
  }
}

function createDetector(): ActivityDetector {
  // DP_MOCK_TRACKING=1 → detector simulado (demos y desarrollo sin permisos)
  return process.env.DP_MOCK_TRACKING === '1'
    ? new MockActivityDetector()
    : new GetWindowsDetector(getPermissionsStatus);
}

function sendIdleEvent(target: WebContents, event: IdleEvent): void {
  if (!target.isDestroyed()) {
    target.send('idle:event', event);
  }
}

function showWindowOf(sender: WebContents): void {
  const win = BrowserWindow.fromWebContents(sender);
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

/** Umbral y cuenta atrás de inactividad; DP_IDLE_*_SECONDS los acorta en pruebas. */
function idleTiming(inactivityMinutes: number): { thresholdSeconds: number; countdownSeconds: number } {
  const threshold = Number(process.env.DP_IDLE_THRESHOLD_SECONDS);
  const countdown = Number(process.env.DP_IDLE_COUNTDOWN_SECONDS);
  return {
    thresholdSeconds: Number.isFinite(threshold) && threshold > 0 ? threshold : inactivityMinutes * 60,
    countdownSeconds: Number.isFinite(countdown) && countdown > 0 ? countdown : 60,
  };
}

/** Arranca tracker + vigilante de inactividad + espejo en disco + bandeja. */
function startTracking(context: Omit<TrackingContext, 'tracker' | 'watcher'>): void {
  const { sender, client, config, token, employee, sessionId } = context;
  const store = new BufferStore(sessionId, employee.id);
  // Si la sesión se reanudó tras un cierre inesperado, lo que quedó en disco
  // entra al buffer inicial y sube con el primer lote.
  const pending = readPendingBatch(sessionId);
  const tracker = new Tracker(
    createDetector(),
    async (registros) => {
      await client.postRegistros(token, sessionId, { registros });
    },
    (status) => {
      sendTrackerStatus(sender, status);
      updateTrackingTray(status);
    },
    {
      sampleIntervalMs: config.sampleIntervalSeconds * 1000,
      initialRecords: pending && pending.employeeId === employee.id ? pending.registros : [],
      persist: (registros) => store.persist(registros),
    },
  );
  const { thresholdSeconds, countdownSeconds } = idleTiming(context.inactivityMinutes);
  const watcher = new IdleWatcher({
    thresholdSeconds,
    countdownSeconds,
    onWarning: (seconds) => {
      // Retener flushes: si el aviso acaba en pausa, estas lecturas se
      // re-etiquetan retroactivamente (siguen en el buffer).
      tracker.holdFlush(true);
      showWindowOf(sender);
      sendIdleEvent(sender, { type: 'warning', countdownSeconds: seconds });
    },
    onDismissed: () => {
      tracker.holdFlush(false);
      sendIdleEvent(sender, { type: 'dismissed' });
    },
    onPaused: (warningStartedAtMs) => {
      tracker.holdFlush(false);
      tracker.markIdleSince(warningStartedAtMs);
      tracker.setIdle(true);
      setTrackingTrayPaused(true);
      sendIdleEvent(sender, { type: 'paused' });
    },
    onResumed: () => {
      tracker.setIdle(false);
      setTrackingTrayPaused(false);
      sendIdleEvent(sender, { type: 'resumed' });
    },
  });
  tracking = { ...context, tracker, watcher };
  tracker.start();
  watcher.start();
  showTrackingTray({
    employeeName: employee.name,
    onShowWindow: () => showWindowOf(sender),
    onRequestOff: () => void closeSessionFromTray(),
  });
}

/**
 * Cierra el turno activo: para el muestreo, intenta el flush final y hace el
 * OFF en el backend. Si el OFF falla por red, rearma el tracking (la sesión
 * sigue abierta en el backend y el turno no debe quedar sin registrar).
 */
async function closeSession(): Promise<IpcResult<SesionOffResult>> {
  if (!tracking) return fail('UNKNOWN', 'No hay ninguna sesión abierta');
  const context = tracking;
  tracking = null;
  context.watcher.stop();
  hideTrackingTray();
  const warning = await context.tracker.stop();
  try {
    const closed = await context.client.sesionOff(context.token, context.sessionId);
    auth = null;
    return ok({ endedAt: closed.endedAt, warning });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Ya estaba cerrada (p. ej. desde el panel admin): el turno queda cerrado igual
      auth = null;
      return ok({ endedAt: new Date().toISOString(), warning });
    }
    if (err instanceof ApiError && err.status === 401) {
      auth = null;
      return AUTH_EXPIRED;
    }
    startTracking(context);
    return toFailure(err);
  }
}

/** OFF rápido desde el menú de la bandeja: cierra y avisa al renderer. */
async function closeSessionFromTray(): Promise<void> {
  const sender = tracking?.sender;
  const result = await closeSession();
  if (!sender || sender.isDestroyed()) return;
  const event: SesionClosedEvent = result.ok
    ? { endedAt: result.data.endedAt, warning: result.data.warning }
    : { error: result.error };
  sender.send('sesion:closed', event);
}

/**
 * Sube (troceado) lo que quedó en disco de turnos anteriores de este empleado.
 * Corre en segundo plano tras el ON; los fallos de red se reintentan en el
 * siguiente turno y un 404 (la sesión ya no existe) aparta el lote sin borrarlo.
 */
async function recoverPendingBatches(
  client: ApiClient,
  token: string,
  employeeId: string,
  excludeSessionId: string,
): Promise<void> {
  for (const batch of listPendingBatches()) {
    if (batch.sessionId === excludeSessionId || batch.employeeId !== employeeId) continue;
    const store = new BufferStore(batch.sessionId, batch.employeeId);
    const remaining = batch.registros.slice();
    try {
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, MAX_BATCH_SIZE);
        await client.postRegistros(token, batch.sessionId, { registros: chunk });
        remaining.splice(0, chunk.length);
        store.persist(remaining); // con [] borra el archivo pendiente
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        archivePendingBatch(batch.sessionId);
      }
      // Red/5xx: el lote sigue en disco y se reintentará en el siguiente ON
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle('config:get', (): IpcResult<DeviceConfig | null> => ok(readConfig()));

  ipcMain.handle(
    'config:set',
    async (_event, config: DeviceConfig): Promise<IpcResult<DeviceConfig>> => {
      const apiBaseUrl = config.apiBaseUrl.trim().replace(/\/+$/, '');
      const companySlug = config.companySlug.trim().toLowerCase();
      if (!apiBaseUrl || !companySlug) {
        return fail('UNKNOWN', 'El código de empresa y el servidor son obligatorios');
      }
      try {
        // Valida contra el backend antes de guardar
        await new ApiClient(apiBaseUrl).getEmpleados(companySlug);
      } catch (err) {
        const failure = toFailure(err);
        if (failure.code === 'NOT_FOUND') {
          return fail('NOT_FOUND', 'No existe ninguna empresa con ese código');
        }
        return failure;
      }
      const normalized: DeviceConfig = {
        apiBaseUrl,
        companySlug,
        sampleIntervalSeconds: clampSampleInterval(config.sampleIntervalSeconds),
      };
      writeConfig(normalized);
      return ok(normalized);
    },
  );

  ipcMain.handle('empleados:list', async (): Promise<IpcResult<EmpleadoListItem[]>> => {
    const ctx = clientFromConfig();
    if (!ctx) return fail('UNKNOWN', 'El dispositivo no está configurado');
    try {
      return ok(await ctx.client.getEmpleados(ctx.config.companySlug));
    } catch (err) {
      return toFailure(err);
    }
  });

  ipcMain.handle(
    'auth:pin',
    async (_event, body: { employeeId: string; pin: string }): Promise<IpcResult<SessionEmployee>> => {
      const ctx = clientFromConfig();
      if (!ctx) return fail('UNKNOWN', 'El dispositivo no está configurado');
      try {
        const login = await ctx.client.loginPin({ employeeId: body.employeeId, pin: body.pin });
        auth = {
          token: login.token,
          employee: login.employee,
          inactivityMinutes: login.inactivityMinutes,
        };
        return ok(login.employee);
      } catch (err) {
        return toFailure(err, fail('INVALID_PIN', 'Empleado o PIN incorrecto'));
      }
    },
  );

  ipcMain.handle('sesion:on', async (event: IpcMainInvokeEvent): Promise<IpcResult<SesionOnResult>> => {
    const ctx = clientFromConfig();
    if (!ctx || !auth) return fail('UNKNOWN', 'No hay ningún empleado identificado');
    const { client, config } = ctx;
    const { token, employee, inactivityMinutes } = auth;

    let sessionId: string;
    let startedAt: string;
    let resumed = false;
    try {
      const session = await client.sesionOn(token, { device: 'DESKTOP' });
      sessionId = session.id;
      startedAt = session.startedAt;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.body.sessionId === 'string') {
        // Quedó una sesión abierta (p. ej. el equipo se apagó sin OFF): se reanuda.
        // La API no devuelve su startedAt, así que el cronómetro cuenta desde ahora.
        sessionId = err.body.sessionId;
        startedAt = new Date().toISOString();
        resumed = true;
      } else {
        return toFailure(err, AUTH_EXPIRED);
      }
    }

    if (tracking) {
      // Defensivo: nunca debería haber un tracking activo aquí
      tracking.watcher.stop();
      hideTrackingTray();
      void tracking.tracker.stop();
      tracking = null;
    }
    startTracking({ sender: event.sender, client, config, token, employee, inactivityMinutes, sessionId });
    void recoverPendingBatches(client, token, employee.id, sessionId);

    return ok({ sessionId, startedAt, resumed });
  });

  ipcMain.handle('sesion:off', (): Promise<IpcResult<SesionOffResult>> => closeSession());

  ipcMain.handle('sesion:cancel', async (): Promise<IpcResult<null>> => {
    if (tracking) {
      tracking.watcher.stop();
      hideTrackingTray();
      await tracking.tracker.stop();
      tracking = null;
    }
    auth = null;
    return ok(null);
  });

  ipcMain.handle('idle:confirm', (): IpcResult<null> => {
    tracking?.watcher.confirmPresence();
    return ok(null);
  });

  ipcMain.handle('permissions:status', (): IpcResult<PermissionsStatus> => ok(getPermissionsStatus()));

  ipcMain.handle(
    'permissions:request',
    async (_event, pane: unknown): Promise<IpcResult<null>> => {
      await requestPermission(pane === 'screenRecording' ? 'screenRecording' : 'accessibility');
      return ok(null);
    },
  );
}
