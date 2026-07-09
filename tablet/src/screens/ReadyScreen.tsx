import { useState } from 'react';
import { ApiError } from '@digital-power/shared';
import type { ApiClient, PinLoginResponse } from '@digital-power/shared';

interface Props {
  api: ApiClient;
  token: string;
  employee: PinLoginResponse['employee'];
  onSession: (sessionId: string, opts: { resumed: boolean }) => void;
  onBack: () => void;
}

// Pantalla grande con el botón ON (§5). Si el backend responde 409 es que ya
// hay un turno abierto (p. ej. la página se recargó): se reanuda esa sesión.
export default function ReadyScreen({ api, token, employee, onSession, onBack }: Props) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const session = await api.sesionOn(token, { device: 'TABLET' });
      onSession(session.id, { resumed: false });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && typeof err.body.sessionId === 'string') {
        onSession(err.body.sessionId, { resumed: true });
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Error inesperado');
      setStarting(false);
    }
  };

  return (
    <div className="screen screen-center">
      <button type="button" className="back-button" onClick={onBack} disabled={starting}>
        ← No soy yo
      </button>
      <h1>Hola, {employee.name}</h1>
      <p className="muted">{employee.roleName}</p>
      <div className="screen-center-block">
        <button type="button" className="on-button" onClick={() => void start()} disabled={starting}>
          {starting ? '…' : 'ON'}
        </button>
        <p className="muted">Pulsa ON al empezar tu turno</p>
        {error && <p className="error-text">{error}</p>}
      </div>
    </div>
  );
}
