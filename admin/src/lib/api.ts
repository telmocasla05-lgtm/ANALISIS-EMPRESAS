// Cliente HTTP del panel admin. Mismo origen que la API (proxy de Vite en dev).
// Ante un 401 (token caducado/inválido) avisa para volver al login.
import {
  ApiError,
  type AdminLoginRequest,
  type AdminLoginResponse,
  type CategoriaListItem,
  type EmpleadoAdminItem,
  type EmpresaAdmin,
  type EvolucionSemana,
  type PatternType,
  type ReglaAdminItem,
  type Resumen,
  type RolAdmin,
  type SesionAdmin,
  type SinCategorizarGrupo,
} from '@digital-power/shared';

export { ApiError };

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function configureApi(opts: { token: string | null; onUnauthorized: (() => void) | null }): void {
  authToken = opts.token;
  onUnauthorized = opts.onUnauthorized;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (init.body) headers['Content-Type'] = 'application/json';
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor');
  }

  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (response.status === 401 && authToken && onUnauthorized) onUnauthorized();
    const message = typeof body.error === 'string' ? body.error : `Error ${response.status}`;
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export interface RangoQuery {
  desde?: string; // YYYY-MM-DD
  hasta?: string;
}

// ── Auth ────────────────────────────────────────────────────────────────

export function login(body: AdminLoginRequest): Promise<AdminLoginResponse> {
  return request('/admin/auth/login', { method: 'POST', body: JSON.stringify(body) });
}

// ── Empresas y dashboard ───────────────────────────────────────────────

export function getEmpresas(): Promise<EmpresaAdmin[]> {
  return request('/admin/empresas');
}

export function getEmpresa(id: string): Promise<EmpresaAdmin> {
  return request(`/admin/empresas/${id}`);
}

export function updateEmpresa(
  id: string,
  body: Partial<Pick<EmpresaAdmin, 'name' | 'avgHourlyCostCents' | 'inactivityMinutes' | 'sampleIntervalSeconds'>>
): Promise<EmpresaAdmin> {
  return request(`/admin/empresas/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function getResumen(id: string, rango: RangoQuery): Promise<Resumen> {
  return request(`/admin/empresas/${id}/resumen${query(rango)}`);
}

export function getEvolucion(id: string, semanas: number): Promise<EvolucionSemana[]> {
  return request(`/admin/empresas/${id}/evolucion${query({ semanas })}`);
}

export function getSinCategorizar(id: string, rango: RangoQuery): Promise<SinCategorizarGrupo[]> {
  return request(`/admin/empresas/${id}/sin-categorizar${query(rango)}`);
}

export function getSesiones(id: string, rango: RangoQuery): Promise<SesionAdmin[]> {
  return request(`/admin/empresas/${id}/sesiones${query(rango)}`);
}

export function getCategorias(id: string): Promise<CategoriaListItem[]> {
  return request(`/admin/empresas/${id}/categorias`);
}

// ── Empleados ──────────────────────────────────────────────────────────

export function getEmpleados(companyId: string): Promise<EmpleadoAdminItem[]> {
  return request(`/admin/empresas/${companyId}/empleados`);
}

export function createEmpleado(companyId: string, body: { name: string; roleId: string; pin: string }): Promise<{ id: string }> {
  return request(`/admin/empresas/${companyId}/empleados`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateEmpleado(
  companyId: string,
  employeeId: string,
  body: Partial<{ name: string; roleId: string; active: boolean; pin: string }>
): Promise<{ id: string }> {
  return request(`/admin/empresas/${companyId}/empleados/${employeeId}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteEmpleado(companyId: string, employeeId: string): Promise<void> {
  return request(`/admin/empresas/${companyId}/empleados/${employeeId}`, { method: 'DELETE' });
}

// ── Roles ──────────────────────────────────────────────────────────────

export function getRoles(companyId: string): Promise<RolAdmin[]> {
  return request(`/admin/empresas/${companyId}/roles`);
}

export function createRol(companyId: string, name: string): Promise<RolAdmin> {
  return request(`/admin/empresas/${companyId}/roles`, { method: 'POST', body: JSON.stringify({ name }) });
}

export function updateRol(companyId: string, roleId: string, name: string): Promise<RolAdmin> {
  return request(`/admin/empresas/${companyId}/roles/${roleId}`, { method: 'PUT', body: JSON.stringify({ name }) });
}

export function deleteRol(companyId: string, roleId: string): Promise<void> {
  return request(`/admin/empresas/${companyId}/roles/${roleId}`, { method: 'DELETE' });
}

// ── Reglas de categorización ───────────────────────────────────────────

export function getReglas(companyId: string): Promise<ReglaAdminItem[]> {
  return request(`/admin/empresas/${companyId}/reglas`);
}

export function createRegla(
  companyId: string,
  body: { patternType: PatternType; pattern: string; categoryId: string; priority?: number; aplicarAExistentes?: boolean }
): Promise<{ id: string; registrosActualizados: number }> {
  return request(`/admin/empresas/${companyId}/reglas`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateRegla(
  companyId: string,
  ruleId: string,
  body: Partial<{ pattern: string; patternType: PatternType; priority: number; active: boolean }>
): Promise<{ id: string }> {
  return request(`/admin/empresas/${companyId}/reglas/${ruleId}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteRegla(companyId: string, ruleId: string): Promise<void> {
  return request(`/admin/empresas/${companyId}/reglas/${ruleId}`, { method: 'DELETE' });
}
