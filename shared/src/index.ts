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

export interface ResumenSemanal {
  semana: { desde: string; hasta: string };
  porCategoria: ResumenCategoria[];
  porEmpleado: ResumenEmpleado[];
}
