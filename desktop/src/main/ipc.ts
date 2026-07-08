// Orquestación IPC: estado de la sesión de fichaje en memoria del main y
// puente entre renderer, API del backend y tracker. El token JWT vive aquí,
// nunca en el renderer.
import { ipcMain } from 'electron';
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import type { EmpleadoListItem } from '@digital-power/shared';
import type {
  DeviceConfig,
  IpcFailure,
  IpcResult,
  SesionOffResult,
  SesionOnResult,
  SessionEmployee,
  TrackerStatus,
} from '../common/ipc-contract';
import { ApiClient, ApiError } from './api-client';
import { readConfig, writeConfig } from './config-store';
import { MockActivityDetector } from './tracking/mock-detector';
import { Tracker } from './tracking/tracker';

interface AuthState {
  token: string;
  employee: SessionEmployee;
}

let auth: AuthState | null = null;
let activeSessionId: string | null = null;
let activeTracker: Tracker | null = null;

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

async function stopTracker(): Promise<string | undefined> {
  if (!activeTracker) return undefined;
  const tracker = activeTracker;
  activeTracker = null;
  return tracker.stop();
}

function sendTrackerStatus(target: WebContents, status: TrackerStatus): void {
  if (!target.isDestroyed()) {
    target.send('tracker:status', status);
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
      const normalized: DeviceConfig = { apiBaseUrl, companySlug };
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
        auth = { token: login.token, employee: login.employee };
        return ok(login.employee);
      } catch (err) {
        return toFailure(err, fail('INVALID_PIN', 'Empleado o PIN incorrecto'));
      }
    },
  );

  ipcMain.handle('sesion:on', async (event: IpcMainInvokeEvent): Promise<IpcResult<SesionOnResult>> => {
    const ctx = clientFromConfig();
    if (!ctx || !auth) return fail('UNKNOWN', 'No hay ningún empleado identificado');
    const { client } = ctx;
    const token = auth.token;

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

    await stopTracker(); // defensivo: nunca debería haber uno activo aquí
    activeSessionId = sessionId;
    const sender = event.sender;
    activeTracker = new Tracker(
      new MockActivityDetector(),
      async (registros) => {
        await client.postRegistros(token, sessionId, { registros });
      },
      (status) => sendTrackerStatus(sender, status),
    );
    activeTracker.start();

    return ok({ sessionId, startedAt, resumed });
  });

  ipcMain.handle('sesion:off', async (): Promise<IpcResult<SesionOffResult>> => {
    const ctx = clientFromConfig();
    if (!ctx || !auth || !activeSessionId) {
      return fail('UNKNOWN', 'No hay ninguna sesión abierta');
    }
    const warning = await stopTracker();
    try {
      const closed = await ctx.client.sesionOff(auth.token, activeSessionId);
      auth = null;
      activeSessionId = null;
      return ok({ endedAt: closed.endedAt, warning });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Ya estaba cerrada (p. ej. desde el panel admin): el turno queda cerrado igual
        auth = null;
        activeSessionId = null;
        return ok({ endedAt: new Date().toISOString(), warning });
      }
      if (err instanceof ApiError && err.status === 401) {
        auth = null;
        activeSessionId = null;
        return AUTH_EXPIRED;
      }
      // Fallo de red: se conserva la sesión para poder reintentar el OFF
      return toFailure(err, AUTH_EXPIRED);
    }
  });

  ipcMain.handle('sesion:cancel', async (): Promise<IpcResult<null>> => {
    await stopTracker();
    auth = null;
    activeSessionId = null;
    return ok(null);
  });
}
