import { useCallback, useEffect, useState } from 'react';
import type { EmpleadoListItem } from '@digital-power/shared';
import EmployeeCard from '../components/EmployeeCard';
import BigButton from '../components/BigButton';

interface Props {
  notice?: string;
  onSelect: (employee: EmpleadoListItem) => void;
  onOpenSetup: () => void;
}

type LoadState =
  | { name: 'loading' }
  | { name: 'error'; message: string }
  | { name: 'ready'; empleados: EmpleadoListItem[] };

export default function EmployeeSelectScreen({ notice, onSelect, onOpenSetup }: Props) {
  const [state, setState] = useState<LoadState>({ name: 'loading' });

  const load = useCallback(() => {
    setState({ name: 'loading' });
    void window.dpApi.listEmpleados().then((result) => {
      if (result.ok) {
        setState({ name: 'ready', empleados: result.data });
      } else {
        setState({ name: 'error', message: result.error });
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="screen">
      <button
        type="button"
        className="settings-button"
        onClick={onOpenSetup}
        title="Configuración del dispositivo"
        aria-label="Configuración del dispositivo"
      >
        ⚙
      </button>
      <header className="screen-header">
        <h1>¿Quién eres?</h1>
        <p className="muted">Toca tu nombre para fichar</p>
      </header>
      {notice && <p className="notice">{notice}</p>}
      {state.name === 'loading' && <p className="muted">Cargando empleados…</p>}
      {state.name === 'error' && (
        <div className="screen-center-block">
          <p className="error-text">{state.message}</p>
          <BigButton onClick={load}>Reintentar</BigButton>
        </div>
      )}
      {state.name === 'ready' && state.empleados.length === 0 && (
        <p className="muted">No hay empleados dados de alta en esta empresa.</p>
      )}
      {state.name === 'ready' && state.empleados.length > 0 && (
        <div className="employee-grid">
          {state.empleados.map((employee) => (
            <EmployeeCard key={employee.id} employee={employee} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
