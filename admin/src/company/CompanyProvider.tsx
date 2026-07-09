// Empresa activa del panel. El SUPERADMIN de Digital Power elige entre todas
// (selección recordada en localStorage); un admin CLIENTE solo ve la suya.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EmpresaAdminListItem } from '@digital-power/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';

const COMPANY_KEY = 'dp-admin-company';

interface CompanyContextValue {
  empresas: EmpresaAdminListItem[];
  empresa: EmpresaAdminListItem | null;
  selectEmpresa: (id: string) => void;
  loading: boolean;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [empresas, setEmpresas] = useState<EmpresaAdminListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => localStorage.getItem(COMPANY_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoading(true);
    api<EmpresaAdminListItem[]>('/admin/empresas')
      .then((list) => {
        if (cancelled) return;
        setEmpresas(list);
      })
      .catch(() => {
        if (!cancelled) setEmpresas([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const selectEmpresa = useCallback((id: string) => {
    localStorage.setItem(COMPANY_KEY, id);
    setSelectedId(id);
  }, []);

  const empresa = useMemo(() => {
    if (empresas.length === 0) return null;
    return empresas.find((e) => e.id === selectedId) ?? empresas[0] ?? null;
  }, [empresas, selectedId]);

  const value = useMemo(
    () => ({ empresas, empresa, selectEmpresa, loading }),
    [empresas, empresa, selectEmpresa, loading]
  );
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany(): CompanyContextValue {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany debe usarse dentro de CompanyProvider');
  return context;
}
