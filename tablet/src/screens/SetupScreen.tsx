import { useState } from 'react';
import { ApiClient, ApiError } from '@digital-power/shared';
import { saveConfig } from '../lib/config';
import type { TabletConfig } from '../lib/config';

interface Props {
  initial: TabletConfig | null;
  onDone: (config: TabletConfig) => void;
}

// Configuración por dispositivo (una vez por tablet): empresa y, si hace
// falta, URL del servidor. Se valida contra la API antes de guardar.
export default function SetupScreen({ initial, onDone }: Props) {
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [serverUrl, setServerUrl] = useState(initial?.serverUrl ?? '');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const config: TabletConfig = { slug: slug.trim(), serverUrl: serverUrl.trim() };
    if (!config.slug) return;
    setChecking(true);
    setError(null);
    try {
      await new ApiClient(config.serverUrl).getEmpleados(config.slug);
      saveConfig(config);
      onDone(config);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError('No existe ninguna empresa con ese identificador.');
      } else {
        setError(err instanceof ApiError ? err.message : 'Error inesperado');
      }
      setChecking(false);
    }
  };

  return (
    <div className="screen screen-center">
      <h1>Configurar esta tablet</h1>
      <p className="muted">Se hace una sola vez por dispositivo.</p>
      <form className="setup-form" onSubmit={submit}>
        <label>
          Identificador de la empresa
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="p. ej. clinica-demo"
            autoCapitalize="none"
            autoCorrect="off"
            required
          />
        </label>
        <label>
          Servidor (opcional)
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="Vacío = este mismo servidor"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="big-button" disabled={checking || !slug.trim()}>
          {checking ? 'Comprobando…' : 'Guardar y empezar'}
        </button>
      </form>
    </div>
  );
}
