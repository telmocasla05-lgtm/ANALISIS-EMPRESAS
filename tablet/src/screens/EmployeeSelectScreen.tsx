import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@digital-power/shared';
import type { ApiClient, EmpleadoListItem } from '@digital-power/shared';

interface Props {
  api: ApiClient;
  slug: string;
  notice: string | null;
  onSelect: (employee: EmpleadoListItem) => void;
  onReconfigure: () => void;
}

// Pantalla de fichaje compartida: cada empleado toca su nombre al sentarse.
export default function EmployeeSelectScreen({ api, slug, notice, onSelect, onReconfigure }: Props) {
  const [employees, setEmployees] = useState<EmpleadoListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setEmployees(null);
    try {
      setEmployees(await api.getEmpleados(slug));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
    }
  }, [api, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="screen">
      <header className="screen-header">
        <h1>¿Quién eres?</h1>
        <p className="muted">Toca tu nombre para fichar</p>
      </header>
      {notice && <p className="notice">{notice}</p>}
      {error && (
        <div className="screen-center-block">
          <p className="error-text">{error}</p>
          <button type="button" className="big-button" onClick={() => void load()}>
            Reintentar
          </button>
        </div>
      )}
      {!error && employees === null && <p className="muted">Cargando…</p>}
      {!error && employees !== null && employees.length === 0 && (
        <p className="muted">No hay empleados dados de alta en esta empresa.</p>
      )}
      {!error && employees !== null && employees.length > 0 && (
        <div className="employee-grid">
          {employees.map((employee) => (
            <button
              key={employee.id}
              type="button"
              className="employee-button"
              onClick={() => onSelect(employee)}
            >
              <span className="employee-avatar" aria-hidden="true">
                {initials(employee.name)}
              </span>
              {employee.name}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="link-button" onClick={onReconfigure}>
        Cambiar de empresa o servidor
      </button>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
