// Cliente HTTP tipado contra la API del backend (solo endpoints de las apps
// de fichaje). Corre en el proceso main: el token nunca llega al renderer.
import type {
  EmpleadoListItem,
  PinLoginRequest,
  PinLoginResponse,
  RegistrosBatchRequest,
  RegistrosBatchResponse,
  SesionOffResponse,
  SesionOnRequest,
  SesionOnResponse,
} from '@digital-power/shared';

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
