// Tipos compartidos del dominio (Empresa, Rol, Empleado, Sesión, Registro…)
// y cliente HTTP de la API de fichaje, compartidos entre backend y frontends.
// Ver docs/ESPECIFICACION.md.
//
// Todo vive en este único fichero a propósito y el build es dual (dist/cjs
// para el main CJS de Electron y Node vía "main"; dist/esm para Vite/Rollup
// vía "module"): los re-exports __exportStar de tsc en CJS rompen la
// detección de exports con nombre en los consumidores.

export type Sector = 'CLINICA' | 'GESTORIA' | 'INMOBILIARIA';
export type Device = 'DESKTOP' | 'TABLET';
export type PatternType = 'APP' | 'DOMAIN' | 'TITLE';
export type AdminRole = 'SUPERADMIN' | 'CLIENTE';

// ── Auth de empleados (apps de tracking) ──────────────────────────────

export interface EmpleadoListItem {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface PinLoginRequest {
  employeeId: string;
  pin: string;
}

export interface PinLoginResponse {
  token: string;
  expiresAt: string;
  /** Umbral de aviso de inactividad de la empresa (§6), para el tracking pasivo. */
  inactivityMinutes: number;
  employee: {
    id: string;
    name: string;
    companyId: string;
    roleId: string;
    roleName: string;
  };
}

// ── Sesiones ON/OFF y registros de tracking ───────────────────────────

export interface SesionOnRequest {
  device: Device;
}

export interface SesionOnResponse {
  id: string;
  startedAt: string;
}

export interface SesionOffResponse {
  id: string;
  startedAt: string;
  endedAt: string;
}

export interface RegistroInput {
  timestamp: string; // ISO 8601
  app: string;
  windowTitle?: string;
  domain?: string;
  isIdle?: boolean;
  /**
   * Selección activa (tablet, §3 de la especificación): categoría elegida por
   * el empleado. El backend la valida contra las categorías visibles de su
   * empresa y la aplica tal cual, sin pasar por las reglas de categorización.
   */
  categoryId?: string;
}

export interface RegistrosBatchRequest {
  registros: RegistroInput[];
}

export interface RegistrosBatchResponse {
  insertados: number;
}

// ── Categorías (selección activa en tablet) ───────────────────────────

/** Categoría visible para la empresa del empleado (propias + plantilla de su sector). */
export interface CategoriaListItem {
  id: string;
  name: string;
}

// ── Admin (panel) ──────────────────────────────────────────────────────

export interface AdminLoginRequest {
  email: string;
  password: string;
}

export interface AdminLoginResponse {
  token: string;
  expiresAt: string;
  admin: {
    id: string;
    email: string;
    role: AdminRole;
    companyId: string | null;
  };
}

export interface ResumenCategoria {
  categoryId: string | null;
  categoryName: string;
  horas: number;
  costeEstimado: number; // euros, según coste/hora medio de la empresa (§10)
}

export interface ResumenEmpleado {
  employeeId: string;
  employeeName: string;
  horas: number;
  costeEstimado: number;
  porCategoria: ResumenCategoria[];
}

export interface ResumenSemanal {
  semana: { desde: string; hasta: string };
  porCategoria: ResumenCategoria[];
  porEmpleado: ResumenEmpleado[];
}

// ── Cliente HTTP de la API de fichaje ──────────────────────────────────
// Corre con fetch nativo: en el main de Electron (desktop) y en el navegador
// (tablet). Solo endpoints de las apps de fichaje; el panel admin no lo usa.

// El express.json() del backend admite ~100 KB por petición: los lotes grandes
// (p. ej. tras horas sin conexión) se trocean para no chocar con ese límite.
export const MAX_BATCH_SIZE = 500;

export class ApiError extends Error {
  readonly status: number; // 0 = fallo de red (sin respuesta HTTP)
  readonly body: Record<string, unknown>;

  constructor(status: number, message: string, body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : `Error ${response.status}`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export class ApiClient {
  private readonly baseUrl: string;

  /** baseUrl vacío = mismo origen (la tablet en producción se sirve junto a la API). */
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private url(path: string): string {
    return `${this.baseUrl}/api${path}`;
  }

  getEmpleados(slug: string): Promise<EmpleadoListItem[]> {
    return request(this.url(`/empresas/${encodeURIComponent(slug)}/empleados`));
  }

  loginPin(body: PinLoginRequest): Promise<PinLoginResponse> {
    return request(this.url('/auth/pin'), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    });
  }

  getCategorias(token: string): Promise<CategoriaListItem[]> {
    return request(this.url('/categorias'), {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  sesionOn(token: string, body: SesionOnRequest): Promise<SesionOnResponse> {
    return request(this.url('/sesiones/on'), {
      method: 'POST',
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  sesionOff(token: string, sessionId: string): Promise<SesionOffResponse> {
    return request(this.url(`/sesiones/${encodeURIComponent(sessionId)}/off`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  postRegistros(
    token: string,
    sessionId: string,
    body: RegistrosBatchRequest,
  ): Promise<RegistrosBatchResponse> {
    return request(this.url(`/sesiones/${encodeURIComponent(sessionId)}/registros`), {
      method: 'POST',
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }
}
