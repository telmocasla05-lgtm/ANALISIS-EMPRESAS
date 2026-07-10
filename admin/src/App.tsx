// Panel de administración (Fase D): dashboard de horas/coste por categoría y
// empleado, gestión (empleados, roles, reglas, ajustes) y sesiones (registro
// horario). Dos niveles de acceso: SUPERADMIN (todas las empresas) y CLIENTE.
import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthProvider';
import { CompanyProvider } from './company/CompanyProvider';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { GestionPage } from './pages/GestionPage';
import { InformeDetallePage } from './pages/InformeDetallePage';
import { InformesPage } from './pages/InformesPage';
import { LoginPage } from './pages/LoginPage';
import { SesionesPage } from './pages/SesionesPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <CompanyProvider>
              <Layout />
            </CompanyProvider>
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/gestion" element={<GestionPage />} />
        <Route path="/sesiones" element={<SesionesPage />} />
        <Route path="/informes" element={<InformesPage />} />
        <Route path="/informes/:informeId" element={<InformeDetallePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
