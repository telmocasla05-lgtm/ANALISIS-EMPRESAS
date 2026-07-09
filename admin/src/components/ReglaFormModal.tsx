// Alta de regla de categorización. Se usa desde Gestión → Reglas y como
// acción rápida de la tabla "Sin categorizar / revisar" del dashboard (ahí
// llega con el patrón prellenado). Puede aplicar la regla al histórico sin
// categorizar (recategorización retroactiva en el backend).
import { useState, type FormEvent } from 'react';
import type { CategoriaAdmin, PatternType } from '@digital-power/shared';
import { api, ApiError } from '../api/client';
import { Modal } from './Modal';

const PATTERN_TYPE_LABELS: Record<PatternType, string> = {
  APP: 'Aplicación',
  DOMAIN: 'Dominio',
  TITLE: 'Título de ventana',
};

interface ReglaFormModalProps {
  companyId: string;
  categorias: CategoriaAdmin[];
  initial?: { patternType: PatternType; pattern: string };
  onClose: () => void;
  onSaved: (recategorizados: number) => void;
}

export function ReglaFormModal({ companyId, categorias, initial, onClose, onSaved }: ReglaFormModalProps) {
  const [patternType, setPatternType] = useState<PatternType>(initial?.patternType ?? 'APP');
  const [pattern, setPattern] = useState(initial?.pattern ?? '');
  const [categoryId, setCategoryId] = useState(categorias[0]?.id ?? '');
  const [priority, setPriority] = useState(100);
  const [recategorizar, setRecategorizar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ recategorizados: number }>(`/admin/empresas/${companyId}/reglas`, {
        method: 'POST',
        body: { patternType, pattern: pattern.trim(), categoryId, priority, recategorizar },
      });
      onSaved(result.recategorizados);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la regla');
      setBusy(false);
    }
  }

  return (
    <Modal title="Nueva regla de categorización" onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          Tipo de patrón
          <select value={patternType} onChange={(event) => setPatternType(event.target.value as PatternType)}>
            {(Object.keys(PATTERN_TYPE_LABELS) as PatternType[]).map((type) => (
              <option key={type} value={type}>
                {PATTERN_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Patrón (coincidencia por texto contenido, sin distinguir mayúsculas)
          <input value={pattern} onChange={(event) => setPattern(event.target.value)} required autoFocus={!initial} />
        </label>
        <label className="field">
          Categoría
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Prioridad (menor = se evalúa antes)
          <input
            type="number"
            min={1}
            max={999}
            value={priority}
            onChange={(event) => setPriority(Number(event.target.value))}
          />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={recategorizar} onChange={(event) => setRecategorizar(event.target.checked)} />
          Aplicar también a los registros ya existentes sin categorizar
        </label>
        {error && <p className="error-note">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !pattern.trim() || !categoryId}>
            {busy ? 'Guardando…' : 'Crear regla'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
