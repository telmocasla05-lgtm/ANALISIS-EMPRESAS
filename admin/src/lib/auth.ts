// Sesión de admin persistida en localStorage: sobrevive a recargas dentro del
// TTL del token (12 h). Al caducar o recibir un 401 se limpia y se vuelve al login.
import type { AdminLoginResponse } from '@digital-power/shared';

const STORAGE_KEY = 'dp-admin-session';

export type AdminSession = AdminLoginResponse;

export function loadSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as AdminSession;
    if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: AdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
