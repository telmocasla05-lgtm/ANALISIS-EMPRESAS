// Tipos compartidos del dominio (Empresa, Rol, Empleado, Sesión, Registro…)
// entre backend y los frontends de tracking/admin. Ver docs/ESPECIFICACION.md.

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
  /** Frecuencia de muestreo del tracking configurada para la empresa (§8), 5-10 s. */
  sampleIntervalSeconds: number;
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
}

export interface RegistrosBatchRequest {
  registros: RegistroInput[];
}

export interface RegistrosBatchResponse {
  insertados: number;
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

export interface Resumen {
  rango: { desde: string; hasta: string };
  porCategoria: ResumenCategoria[];
  porEmpleado: ResumenEmpleado[];
}

/** Punto de la serie de evolución semanal del dashboard (una semana natural UTC). */
export interface EvolucionSemana {
  semana: { desde: string; hasta: string };
  horas: number;
  costeEstimado: number;
  porCategoria: ResumenCategoria[];
}

// ── Admin: empresas y ajustes ──────────────────────────────────────────

export interface EmpresaAdminListItem {
  id: string;
  slug: string;
  name: string;
  sector: Sector;
}

export interface EmpresaAdminDetalle extends EmpresaAdminListItem {
  avgHourlyCostCents: number;
  inactivityMinutes: number;
  sampleIntervalSeconds: number;
}

export interface AjustesEmpresaUpdate {
  avgHourlyCostCents?: number;
  inactivityMinutes?: number;
  sampleIntervalSeconds?: number;
}

// ── Admin: gestión (empleados, roles, categorías, reglas) ─────────────

export interface EmpleadoAdmin {
  id: string;
  name: string;
  roleId: string;
  roleName: string;
  avatarUrl: string | null;
  active: boolean;
}

export interface RolAdmin {
  id: string;
  name: string;
}

export type ReglaScope = 'sector' | 'empresa';

export interface CategoriaAdmin {
  id: string;
  name: string;
  scope: ReglaScope;
}

export interface ReglaAdmin {
  id: string;
  patternType: PatternType;
  pattern: string;
  priority: number;
  active: boolean;
  categoryId: string;
  categoryName: string;
  scope: ReglaScope;
}

// ── Admin: registros sin categorizar (dashboard) ──────────────────────

/** Grupo de registros sin categorizar (misma app+dominio) para la tabla de revisión. */
export interface SinCategorizarGrupo {
  app: string;
  domain: string | null;
  /** Un título de ventana de ejemplo del grupo, para dar contexto al crear la regla. */
  windowTitleEjemplo: string | null;
  registros: number;
  horas: number;
  ultimaVez: string;
}

// ── Admin: sesiones (registro horario) ─────────────────────────────────

export interface SesionAdmin {
  id: string;
  employeeId: string;
  employeeName: string;
  device: Device;
  startedAt: string;
  endedAt: string | null;
  /** Duración en horas; null mientras la sesión sigue abierta. */
  duracionHoras: number | null;
}
