import { useEffect, useState } from 'react';
import type { EmpleadoListItem } from '@digital-power/shared';
import type { SessionEmployee } from '../../common/ipc-contract';
import PinPad from '../components/PinPad';

interface Props {
  employee: EmpleadoListItem;
  onBack: () => void;
  onSuccess: (employee: SessionEmployee) => void;
}

const PIN_LENGTH = 4;

export default function PinScreen({ employee, onBack, onSuccess }: Props) {
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockSeconds, setLockSeconds] = useState(0);

  const locked = lockSeconds > 0;

  // Auto-submit al cuarto dígito, como en un cajero
  useEffect(() => {
    if (pin.length !== PIN_LENGTH) return;
    setChecking(true);
    setError(null);
    void window.dpApi.loginPin(employee.id, pin).then((result) => {
      if (result.ok) {
        onSuccess(result.data);
        return;
      }
      setChecking(false);
      setPin('');
      if (result.code === 'LOCKED') {
        setLockSeconds(result.retryAfterSeconds ?? 300);
      } else {
        setError(result.error);
      }
    });
    // eslint no está configurado; deps mínimas a propósito: solo debe dispararse al completar el PIN
  }, [pin, employee.id, onSuccess]);

  // Cuenta atrás del bloqueo por intentos fallidos (429)
  useEffect(() => {
    if (lockSeconds <= 0) return;
    const timer = setTimeout(() => setLockSeconds((seconds) => seconds - 1), 1000);
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
          <span
            key={index}
            className={`pin-dot${index < pin.length ? ' pin-dot-filled' : ''}`}
          />
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
