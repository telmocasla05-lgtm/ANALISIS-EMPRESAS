// Filtro de rango de fechas compartido por dashboard y sesiones: presets
// (semana actual por defecto) + rango personalizado. Una sola fila encima de
// todo lo que filtra.
import { esteMes, semanaActual, semanaPasada, ultimos30Dias, type DateRange } from '../lib/dates';

export type PresetId = 'semana' | 'semana-pasada' | '30dias' | 'mes' | 'personalizado';

export interface DateFilterValue {
  preset: PresetId;
  range: DateRange;
}

export const DEFAULT_FILTER: DateFilterValue = { preset: 'semana', range: semanaActual() };

const PRESETS: Array<{ id: Exclude<PresetId, 'personalizado'>; label: string; range: () => DateRange }> = [
  { id: 'semana', label: 'Esta semana', range: semanaActual },
  { id: 'semana-pasada', label: 'Semana pasada', range: semanaPasada },
  { id: '30dias', label: 'Últimos 30 días', range: ultimos30Dias },
  { id: 'mes', label: 'Este mes', range: esteMes },
];

interface DateRangeFilterProps {
  value: DateFilterValue;
  onChange: (value: DateFilterValue) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className="filter-row">
      <div className="preset-group" role="group" aria-label="Rango de fechas">
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={value.preset === preset.id ? 'active' : ''}
            onClick={() => onChange({ preset: preset.id, range: preset.range() })}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="field">
        Desde
        <input
          type="date"
          value={value.range.desde}
          max={value.range.hasta}
          onChange={(event) => {
            if (!event.target.value) return;
            onChange({ preset: 'personalizado', range: { ...value.range, desde: event.target.value } });
          }}
        />
      </label>
      <label className="field">
        Hasta
        <input
          type="date"
          value={value.range.hasta}
          min={value.range.desde}
          onChange={(event) => {
            if (!event.target.value) return;
            onChange({ preset: 'personalizado', range: { ...value.range, hasta: event.target.value } });
          }}
        />
      </label>
    </div>
  );
}
