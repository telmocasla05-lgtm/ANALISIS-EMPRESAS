import type { ReactNode } from 'react';
import type { EmpresaAdmin } from '@digital-power/shared';

interface LayoutProps {
  route: string;
  onNavigate: (route: string) => void;
  empresas: EmpresaAdmin[];
  empresaId: string | null;
  onEmpresaChange: (id: string) => void;
  adminEmail: string;
  isSuperadmin: boolean;
  onLogout: () => void;
  children: ReactNode;
}

const NAV_ITEMS = [
  { route: '/dashboard', label: 'Dashboard' },
  { route: '/gestion', label: 'Gestión' },
  { route: '/sesiones', label: 'Sesiones' },
];

export function Layout({ route, onNavigate, empresas, empresaId, onEmpresaChange, adminEmail, isSuperadmin, onLogout, children }: LayoutProps) {
  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-name">Digital Power</span>
            <span className="brand-sub">Panel de administración</span>
          </div>

          <nav className="nav" aria-label="Secciones">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.route}
                href={`#${item.route}`}
                className={route.startsWith(item.route) ? 'nav-link active' : 'nav-link'}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.route);
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="topbar-right">
            {isSuperadmin && empresas.length > 0 && (
              <select
                className="empresa-select"
                value={empresaId ?? ''}
                onChange={(e) => onEmpresaChange(e.target.value)}
                aria-label="Empresa"
              >
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.name}
                  </option>
                ))}
              </select>
            )}
            <span className="admin-email" title={adminEmail}>
              {adminEmail}
            </span>
            <button type="button" className="btn btn-ghost" onClick={onLogout}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <main className="content">{children}</main>
    </div>
  );
}
