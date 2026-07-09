import { useEffect, useState } from 'react';
import BigButton from '../components/BigButton';

interface Props {
  onSaved: () => void;
}

const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const DEFAULT_SAMPLE_INTERVAL = '5';

// Configuración inicial del dispositivo: se hace una vez por equipo.
export default function SetupScreen({ onSaved }: Props) {
  const [companySlug, setCompanySlug] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [sampleInterval, setSampleInterval] = useState(DEFAULT_SAMPLE_INTERVAL);
  const [hadConfig, setHadConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.dpApi.getConfig().then((result) => {
      if (result.ok && result.data) {
        setCompanySlug(result.data.companySlug);
        setApiBaseUrl(result.data.apiBaseUrl);
        setSampleInterval(String(result.data.sampleIntervalSeconds));
        setHadConfig(true);
      }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await window.dpApi.setConfig({
      apiBaseUrl: apiBaseUrl.trim(),
      companySlug: companySlug.trim(),
      sampleIntervalSeconds: Number(sampleInterval),
    });
    setSaving(false);
    if (result.ok) {
      onSaved();
    } else {
      setError(result.error);
    }
  };

  const intervalOk = /^\d+$/.test(sampleInterval.trim())
    ? Number(sampleInterval) >= 5 && Number(sampleInterval) <= 10
    : false;
  const canSave = companySlug.trim() !== '' && apiBaseUrl.trim() !== '' && intervalOk && !saving;

  return (
    <div className="screen screen-center">
      <div className="card setup-card">
        <h1>Configuración del dispositivo</h1>
        <p className="muted">
          Introduce el código de empresa que te ha facilitado Digital Power. Solo hay que hacerlo
          una vez en este equipo.
        </p>
        <label className="field">
          <span>Código de empresa</span>
          <input
            type="text"
            value={companySlug}
            onChange={(event) => setCompanySlug(event.target.value)}
            placeholder="p. ej. clinica-demo"
            autoFocus
            disabled={saving}
          />
        </label>
        <label className="field">
          <span>Servidor</span>
          <input
            type="text"
            value={apiBaseUrl}
            onChange={(event) => setApiBaseUrl(event.target.value)}
            placeholder={DEFAULT_API_BASE_URL}
            disabled={saving}
          />
        </label>
        <label className="field">
          <span>Intervalo de muestreo (segundos)</span>
          <input
            type="number"
            min={5}
            max={10}
            step={1}
            value={sampleInterval}
            onChange={(event) => setSampleInterval(event.target.value)}
            disabled={saving}
          />
          <span className="field-help">
            Cada cuántos segundos se lee la ventana activa, entre 5 y 10.
          </span>
        </label>
        {error && <p className="error-text">{error}</p>}
        <div className="setup-actions">
          <BigButton onClick={() => void save()} disabled={!canSave}>
            {saving ? 'Comprobando…' : 'Guardar y continuar'}
          </BigButton>
          {hadConfig && (
            <button type="button" className="link-button" onClick={onSaved} disabled={saving}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
