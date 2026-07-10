// Marco del panel: cabecera con marca, selector de empresa (solo SUPERADMIN),
// navegación por pestañas y cierre de sesión. Responsive: en móvil la
// navegación se desplaza horizontalmente.
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useCompany } from '../company/CompanyProvider';

export function Layout() {
  const { session, logout } = useAuth();
  const { empresas, empresa, selectEmpresa, loading } = useCompany();
  const isSuperadmin = session?.admin.role === 'SUPERADMIN';

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <div className="brand">
            Digital Power
            <small>Panel de administración</small>
          </div>
          <div className="topbar-spacer" />
          {isSuperadmin && empresas.length > 0 && (
            <select
              className="company-select"
              aria-label="Empresa"
              value={empresa?.id ?? ''}
              onChange={(event) => selectEmpresa(event.target.value)}
            >
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          )}
          <span className="topbar-user">{session?.admin.email}</span>
          <button className="btn btn-sm" onClick={logout}>
            Salir
          </button>
        </div>
        <nav className="nav-tabs">
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/gestion">Gestión</NavLink>
          <NavLink to="/sesiones">Sesiones</NavLink>
          <NavLink to="/informes">Informes</NavLink>
        </nav>
      </header>
      <main className="page">
        {!loading && empresa === null ? (
          <div className="card">
            <p className="empty-note">No hay ninguna empresa disponible para este usuario.</p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </>
  );
}
