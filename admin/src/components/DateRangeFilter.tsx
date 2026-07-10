// Filtro de rango de fechas del panel (§interaction: una fila, presets antes
// que el rango a medida; todo lo que hay debajo se recalcula con este rango).
import { addDays, mondayOf, toISODate } from '../lib/format';

export interface Rango {
  desde: string; // YYYY-MM-DD
  hasta: string;
}

export function rangoSemanaActual(): Rango {
  const monday = mondayOf(new Date());
  return { desde: toISODate(monday), hasta: toISODate(addDays(monday, 6)) };
}

function rangoSemanaPasada(): Rango {
  const monday = addDays(mondayOf(new Date()), -7);
  return { desde: toISODate(monday), hasta: toISODate(addDays(monday, 6)) };
}

function rangoUltimos30(): Rango {
  const hoy = new Date();
  return { desde: toISODate(addDays(hoy, -29)), hasta: toISODate(hoy) };
}

const PRESETS: { label: string; make: () => Rango }[] = [
  { label: 'Esta semana', make: rangoSemanaActual },
  { label: 'Semana pasada', make: rangoSemanaPasada },
  { label: 'Últimos 30 días', make: rangoUltimos30 },
];

interface DateRangeFilterProps {
  value: Rango;
  onChange: (rango: Rango) => void;
}

export function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  return (
    <div className="filter-row">
      <div className="filter-presets" role="group" aria-label="Rangos predefinidos">
        {PRESETS.map((preset) => {
          const rango = preset.make();
          const active = rango.desde === value.desde && rango.hasta === value.hasta;
          return (
            <button
              key={preset.label}
              type="button"
              className={active ? 'preset-btn active' : 'preset-btn'}
              onClick={() => onChange(rango)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="filter-custom">
        <label>
          Desde
          <input
            type="date"
            value={value.desde}
            max={value.hasta}
            onChange={(e) => e.target.value && onChange({ ...value, desde: e.target.value })}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={value.hasta}
            min={value.desde}
            onChange={(e) => e.target.value && onChange({ ...value, hasta: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
