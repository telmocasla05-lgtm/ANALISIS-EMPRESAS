import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@digital-power/shared';
import type { ApiClient, CategoriaListItem, PinLoginResponse } from '@digital-power/shared';
import { SessionBuffer } from '../lib/pending-store';
import { ActiveSelectionSampler, SAMPLE_INTERVAL_MS } from '../lib/sampler';

interface Props {
  api: ApiClient;
  token: string;
  employee: PinLoginResponse['employee'];
  sessionId: string;
  resumed: boolean;
  onClosed: () => void;
}

const FLUSH_INTERVAL_MS = 60_000;

// Pantalla principal del turno: botones grandes de categoría (selección
// activa). Cada toque cierra el tramo anterior y abre uno nuevo; el OFF
// siempre visible sube lo pendiente y cierra la sesión.
export default function SessionScreen({ api, token, employee, sessionId, resumed, onClosed }: Props) {
  const [categorias, setCategorias] = useState<CategoriaListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<CategoriaListItem | null>(null);
  const [activeSince, setActiveSince] = useState<number | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [, setTick] = useState(0); // re-render por segundo para los cronómetros
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [closing, setClosing] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);

  const buffer = useMemo(() => new SessionBuffer(sessionId, employee.id), [sessionId, employee.id]);
  const sampler = useMemo(
    () => new ActiveSelectionSampler(SAMPLE_INTERVAL_MS, (registro) => buffer.add(registro)),
    [buffer],
  );

  const flush = useCallback(async () => {
    await buffer.flush(api, token);
    setPendingCount(buffer.pendingCount);
  }, [buffer, api, token]);

  // Categorías del empleado, siempre desde el backend (BD), nunca hardcodeadas
  const loadCategorias = useCallback(async () => {
    setLoadError(null);
    setCategorias(null);
    try {
      setCategorias(await api.getCategorias(token));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Error inesperado');
    }
  }, [api, token]);

  useEffect(() => {
    void loadCategorias();
  }, [loadCategorias]);

  // Cronómetros + subida periódica de lotes
  useEffect(() => {
    const second = setInterval(() => setTick((t) => t + 1), 1_000);
    const flusher = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => {
      clearInterval(second);
      clearInterval(flusher);
    };
  }, [flush]);

  // Red y visibilidad: al volver, se ponen al día las muestras y se sube lo pendiente
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void flush();
    };
    const handleOffline = () => setOnline(false);
    const handleVisible = () => {
      if (document.visibilityState === 'visible') {
        sampler.catchUp();
        setPendingCount(buffer.pendingCount);
        void flush();
      }
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisible);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisible);
    };
  }, [flush, sampler, buffer]);

  // Al desmontar (solo dev/StrictMode: en producción se sale con OFF) no se
  // pierde nada: el buffer tiene espejo en localStorage.
  useEffect(() => () => sampler.stop(), [sampler]);

  const selectCategory = (categoria: CategoriaListItem) => {
    if (closing) return;
    sampler.setCategory(categoria);
    setActive(categoria);
    setActiveSince(Date.now());
    setPendingCount(buffer.pendingCount);
  };

  const closeShift = async () => {
    setConfirmingOff(false);
    setClosing(true);
    setOffError(null);
    sampler.stop();
    setActive(null);
    setActiveSince(null);
    try {
      await flush();
      await api.sesionOff(token, sessionId);
      onClosed();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 409)) {
        // La sesión ya no existe o ya estaba cerrada: no hay nada más que cerrar.
        onClosed();
        return;
      }
      setClosing(false);
      setOffError(
        err instanceof ApiError && err.status === 0
          ? 'Sin conexión: no se pudo cerrar el turno. Los registros están guardados en la tablet; reintenta cuando vuelva la red.'
          : err instanceof ApiError
            ? err.message
            : 'Error inesperado',
      );
    }
  };

  return (
    <div className="session-screen">
      <header className="session-header">
        <div className="session-info">
          <strong>{employee.name}</strong>
          <span className="muted">
            En turno · {formatElapsed(Date.now() - startedAt)}
            {resumed ? ' (reanudado)' : ''}
          </span>
        </div>
        {(!online || pendingCount > 0) && (
          <span className="session-badge">
            {online
              ? `Subiendo ${pendingCount} ${pendingCount === 1 ? 'registro' : 'registros'}…`
              : 'Sin conexión — guardando en la tablet'}
          </span>
        )}
        <button type="button" className="off-button" onClick={() => setConfirmingOff(true)} disabled={closing}>
          {closing ? 'Cerrando…' : 'OFF'}
        </button>
      </header>

      {offError && <p className="error-text session-error">{offError}</p>}

      {loadError && (
        <div className="screen-center-block session-loading">
          <p className="error-text">{loadError}</p>
          <button type="button" className="big-button" onClick={() => void loadCategorias()}>
            Reintentar
          </button>
        </div>
      )}
      {!loadError && categorias === null && <p className="muted session-loading">Cargando categorías…</p>}
      {!loadError && categorias !== null && (
        <>
          <p className="session-hint muted">
            {active ? 'Toca otra tarea cuando cambies' : '¿Qué estás haciendo? Toca la tarea para empezar a contar'}
          </p>
          <div className="category-grid">
            {categorias.map((categoria) => {
              const isActive = active?.id === categoria.id;
              return (
                <button
                  key={categoria.id}
                  type="button"
                  className={`category-button${isActive ? ' category-active' : ''}`}
                  onClick={() => selectCategory(categoria)}
                  disabled={closing}
                >
                  <span className="category-name">{categoria.name}</span>
                  {isActive && activeSince !== null && (
                    <span className="category-elapsed">{formatElapsed(Date.now() - activeSince)}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {confirmingOff && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="overlay-card">
            <h2>¿Cerrar el turno?</h2>
            <p className="muted">Se subirán los registros pendientes y dejará de contarse el tiempo.</p>
            <div className="overlay-actions">
              <button type="button" className="big-button button-secondary" onClick={() => setConfirmingOff(false)}>
                Seguir trabajando
              </button>
              <button type="button" className="big-button button-danger" onClick={() => void closeShift()}>
                Cerrar turno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(Math.floor(ms / 1000), 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
