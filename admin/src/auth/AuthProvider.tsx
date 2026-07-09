// Sesión de admin del panel: login email+contraseña, persistencia en
// localStorage y logout automático cuando el backend responde 401.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AdminLoginRequest, AdminLoginResponse } from '@digital-power/shared';
import { api, clearStoredSession, getStoredSession, setOnUnauthorized, storeSession, type StoredSession } from '../api/client';

interface AuthContextValue {
  session: StoredSession | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(() => getStoredSession());

  const logout = useCallback(() => {
    clearStoredSession();
    setSession(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(logout);
    return () => setOnUnauthorized(null);
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const body: AdminLoginRequest = { email, password };
    const response = await api<AdminLoginResponse>('/admin/auth/login', { method: 'POST', body });
    const stored: StoredSession = { token: response.token, admin: response.admin };
    storeSession(stored);
    setSession(stored);
  }, []);

  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
