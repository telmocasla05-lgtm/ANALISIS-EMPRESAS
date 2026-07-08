import { useEffect, useState } from 'react';
import type { SessionEmployee, TrackerStatus } from '../../common/ipc-contract';
import BigButton from '../components/BigButton';

interface Props {
  employee: SessionEmployee;
  /** Vuelta a la selección de empleado, con aviso opcional a mostrar allí. */
  onFinished: (notice?: string) => void;
}

type Phase =
  | { name: 'idle' }
  | { name: 'starting' }
  | { name: 'tracking'; sessionId: string; startedAt: string; resumed: boolean }
  | { name: 'stopping'; previous: { sessionId: string; startedAt: string; resumed: boolean } };

export default function SessionScreen({ employee, onFinished }: Props) {
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus | null>(null);

  useEffect(() => window.dpApi.onTrackerStatus(setTrackerStatus), []);

  const handleOn = async () => {
    setPhase({ name: 'starting' });
    setError(null);
    const result = await window.dpApi.sesionOn();
    if (result.ok) {
      setPhase({ name: 'tracking', ...result.data });
    } else if (result.code === 'AUTH_EXPIRED') {
      onFinished(result.error);
    } else {
      setError(result.error);
      setPhase({ name: 'idle' });
    }
  };

  const handleOff = async (current: { sessionId: string; startedAt: string; resumed: boolean }) => {
    setPhase({ name: 'stopping', previous: current });
    setError(null);
    const result = await window.dpApi.sesionOff();
    if (result.ok) {
      onFinished(result.data.warning);
    } else if (result.code === 'AUTH_EXPIRED') {
      onFinished(result.error);
    } else {
      // p. ej. fallo de red al cerrar: se vuelve al estado activo para reintentar
      setError(result.error);
      setPhase({ name: 'tracking', ...current });
    }
  };

  const handleChangeUser = async () => {
    await window.dpApi.sesionCancel();
    onFinished();
  };

  if (phase.name === 'idle' || phase.name === 'starting') {
    return (
      <div className="screen screen-center">
        <h1>Hola, {employee.name}</h1>
        <p className="muted">{employee.roleName}</p>
        {error && <p className="error-text">{error}</p>}
        <BigButton variant="on" onClick={() => void handleOn()} disabled={phase.name === 'starting'}>
          <span className="power-label">ON</span>
          <span className="power-sublabel">
            {phase.name === 'starting' ? 'Abriendo turno…' : 'Empezar turno'}
          </span>
        </BigButton>
        <button
          type="button"
          className="link-button"
          onClick={() => void handleChangeUser()}
          disabled={phase.name === 'starting'}
        >
          Cambiar de usuario
        </button>
      </div>
    );
  }

  const session = phase.name === 'tracking' ? phase : phase.previous;
  const stopping = phase.name === 'stopping';

  return (
    <div className="screen screen-center">
      <h1>{employee.name}</h1>
      <p className="tracking-indicator">
        <span className="tracking-dot" aria-hidden="true" />
        Registrando actividad…
      </p>
      <ElapsedClock startedAt={session.startedAt} />
      {session.resumed && (
        <p className="notice">Se ha reanudado una sesión que quedó abierta.</p>
      )}
      {error && <p className="error-text">{error}</p>}
      <BigButton variant="off" onClick={() => void handleOff(session)} disabled={stopping}>
        <span className="power-label">OFF</span>
        <span className="power-sublabel">
          {stopping ? 'Cerrando turno y subiendo registros…' : 'Terminar turno'}
        </span>
      </BigButton>
      <p className="muted small">
        Detección simulada (demo)
        {trackerStatus && ` · ${trackerStatus.buffered} registros pendientes de subir`}
        {trackerStatus?.lastError && ' · sin conexión, se reintentará'}
      </p>
    </div>
  );
}

function ElapsedClock({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const totalSeconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');

  return (
    <p className="elapsed-clock">
      {hours}:{minutes}:{seconds}
    </p>
  );
}
