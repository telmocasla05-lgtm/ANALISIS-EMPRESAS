import { useEffect, useState } from 'react';
import { ApiError } from '@digital-power/shared';
import type { ApiClient, EmpleadoListItem, PinLoginResponse } from '@digital-power/shared';
import PinPad from '../components/PinPad';

interface Props {
  api: ApiClient;
  employee: EmpleadoListItem;
  onBack: () => void;
  onSuccess: (login: PinLoginResponse) => void;
}

const PIN_LENGTH = 4;

// PIN tipo cajero, misma UX que el desktop: auto-submit al cuarto dígito,
// error genérico en el 401 y cuenta atrás en el bloqueo por intentos (429).
export default function PinScreen({ api, employee, onBack, onSuccess }: Props) {
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockSeconds, setLockSeconds] = useState(0);

  const locked = lockSeconds > 0;

  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    setChecking(true);
    setError(null);
    api
      .loginPin({ employeeId: employee.id, pin })
      .then(onSuccess)
      .catch((err: unknown) => {
        setChecking(false);
        setPin('');
        if (err instanceof ApiError && err.status === 429) {
          const seconds = typeof err.body.retryAfterSeconds === 'number' ? err.body.retryAfterSeconds : 300;
          setLockSeconds(Math.max(seconds, 1));
        } else {
          setError(err instanceof ApiError ? err.message : 'Error inesperado');
        }
      });
    // Debe dispararse solo al completar el PIN
  }, [pin, api, employee.id, onSuccess]);

  useEffect(() => {
    if (lockSeconds <= 0) return;
    const timer = setTimeout(() => setLockSeconds((seconds) => seconds - 1), 1_000);
    return () => clearTimeout(timer);
  }, [lockSeconds]);

  const addDigit = (digit: string) => {
    if (checking || locked || pin.length >= PIN_LENGTH) return;
    setError(null);
    setPin((current) => current + digit);
  };

  const removeDigit = () => {
    if (checking || locked) return;
    setPin((current) => current.slice(0, -1));
  };

  return (
    <div className="screen screen-center">
      <button type="button" className="back-button" onClick={onBack} disabled={checking}>
        ← Volver
      </button>
      <h1>Hola, {employee.name}</h1>
      <p className="muted">Introduce tu PIN de {PIN_LENGTH} dígitos</p>
      <div className={`pin-dots${error ? ' pin-dots-error' : ''}`}>
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span key={index} className={`pin-dot${index < pin.length ? ' pin-dot-filled' : ''}`} />
        ))}
      </div>
      <div className="pin-status">
        {checking && <p className="muted">Comprobando…</p>}
        {!checking && error && <p className="error-text">{error}</p>}
        {!checking && locked && (
          <p className="error-text">
            Demasiados intentos fallidos. Inténtalo de nuevo en {formatCountdown(lockSeconds)}.
          </p>
        )}
      </div>
      <PinPad onDigit={addDigit} onDelete={removeDigit} disabled={checking || locked} />
    </div>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} s`;
  return `${minutes}:${String(seconds).padStart(2, '0')} min`;
}
