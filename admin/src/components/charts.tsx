// Gráficos del dashboard (Recharts). Especificación de marcas: barras finas
// (≤24px) con el extremo de dato redondeado, líneas de 2px con puntos anillados
// en el color de superficie, rejilla en gris recesivo, tooltips donde el valor
// es lo prominente y leyenda siempre que hay ≥2 series.
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EvolucionSemana, ResumenCategoria, ResumenEmpleado } from '@digital-power/shared';
import { colorFor, IDLE_LABEL } from '../lib/colors';
import { formatEuros, formatFechaCorta, formatHoras } from '../lib/format';

const GRID = '#e5e3dd';
const AXIS_INK = '#6b6a65';
const SURFACE = '#ffffff';
const LINE_BLUE = '#2a78d6';

const AXIS_TICK = { fontSize: 12, fill: AXIS_INK };

function truncate(value: string, max = 22): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// ── Tooltip común ───────────────────────────────────────────────────────

interface TooltipRow {
  name: string;
  value: string;
  color?: string;
}

function TooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{title}</div>
      {rows.map((row) => (
        <div key={row.name} className="chart-tooltip-row">
          {row.color && <span className="chart-tooltip-key" style={{ background: row.color }} />}
          <span className="chart-tooltip-value">{row.value}</span>
          <span className="chart-tooltip-name">{row.name}</span>
        </div>
      ))}
    </div>
  );
}

// ── Leyenda (chips) ─────────────────────────────────────────────────────

export function ChartLegend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((item) => (
        <span key={item.name} className="chart-legend-item">
          <span className="chart-legend-swatch" style={{ background: item.color }} />
          {item.name}
        </span>
      ))}
    </div>
  );
}

// ── Horas por categoría (barras horizontales) ──────────────────────────

interface HorasPorCategoriaProps {
  data: ResumenCategoria[];
  colors: Map<string, string>;
}

export function HorasPorCategoriaChart({ data, colors }: HorasPorCategoriaProps) {
  const rows = [...data].sort((a, b) => b.horas - a.horas);
  const height = rows.length * 34 + 40;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 8 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} unit=" h" />
        <YAxis
          type="category"
          dataKey="categoryName"
          width={150}
          tick={{ ...AXIS_TICK, fontSize: 12.5 }}
          tickFormatter={(value: string) => truncate(value)}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'rgba(0,0,0,0.04)' }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as ResumenCategoria | undefined;
            if (!active || !row) return null;
            const rows2: TooltipRow[] = [{ name: 'trackeadas', value: formatHoras(row.horas) }];
            if (row.categoryName !== IDLE_LABEL) rows2.push({ name: 'coste estimado', value: formatEuros(row.costeEstimado) });
            return <TooltipCard title={row.categoryName} rows={rows2} />;
          }}
        />
        <Bar dataKey="horas" barSize={18} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.categoryName} fill={colorFor(colors, row.categoryName)} />
          ))}
          <LabelList
            dataKey="horas"
            position="right"
            formatter={(value: unknown) => formatHoras(Number(value))}
            style={{ fill: AXIS_INK, fontSize: 12 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Horas por empleado y categoría (barras apiladas) ───────────────────

interface HorasPorEmpleadoProps {
  data: ResumenEmpleado[];
  /** Orden estable de categorías de la empresa (define el orden de apilado). */
  categoryOrder: string[];
  colors: Map<string, string>;
}

interface EmpleadoRow {
  employeeName: string;
  total: number;
  [seriesKey: string]: string | number;
}

export function HorasPorEmpleadoChart({ data, categoryOrder, colors }: HorasPorEmpleadoProps) {
  // Solo empleados y categorías con actividad en el rango. Las claves de serie
  // son índices ("c0", "c1"…): los nombres de categoría pueden llevar puntos y
  // Recharts los interpretaría como rutas anidadas.
  const presentes = categoryOrder.filter((name) => data.some((e) => e.porCategoria.some((c) => c.categoryName === name && c.horas > 0)));
  const series = presentes.map((name, i) => ({ key: `c${i}`, name, color: colorFor(colors, name) }));

  const rows: EmpleadoRow[] = data
    .filter((e) => e.porCategoria.some((c) => c.horas > 0))
    .map((empleado) => {
      const row: EmpleadoRow = { employeeName: empleado.employeeName, total: 0 };
      for (const serie of series) {
        const horas = empleado.porCategoria.find((c) => c.categoryName === serie.name)?.horas ?? 0;
        row[serie.key] = horas;
        row.total += horas;
      }
      return row;
    })
    .sort((a, b) => b.total - a.total);

  const height = rows.length * 34 + 40;

  return (
    <>
      <ChartLegend items={series.map(({ name, color }) => ({ name, color }))} />
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} unit=" h" />
          <YAxis
            type="category"
            dataKey="employeeName"
            width={110}
            tick={{ ...AXIS_TICK, fontSize: 12.5 }}
            tickFormatter={(value: string) => truncate(value, 16)}
            axisLine={{ stroke: GRID }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as EmpleadoRow | undefined;
              if (!active || !row) return null;
              const detalles: TooltipRow[] = series
                .filter((serie) => Number(row[serie.key]) > 0)
                .map((serie) => ({ name: serie.name, value: formatHoras(Number(row[serie.key])), color: serie.color }));
              return <TooltipCard title={row.employeeName} rows={detalles} />;
            }}
          />
          {series.map((serie, i) => (
            <Bar
              key={serie.key}
              dataKey={serie.key}
              stackId="horas"
              fill={serie.color}
              barSize={18}
              stroke={SURFACE}
              strokeWidth={1}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : undefined}
              isAnimationActive={false}
            >
              {i === series.length - 1 && (
                <LabelList
                  dataKey="total"
                  position="right"
                  formatter={(value: unknown) => formatHoras(Number(value))}
                  style={{ fill: AXIS_INK, fontSize: 12 }}
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Vista tabla: los valores de cada segmento, accesibles sin hover. */}
      <details className="chart-table">
        <summary>Ver como tabla</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                {series.map((serie) => (
                  <th key={serie.key}>{serie.name}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.employeeName}>
                  <td>{row.employeeName}</td>
                  {series.map((serie) => (
                    <td key={serie.key}>{Number(row[serie.key]) > 0 ? formatHoras(Number(row[serie.key])) : '—'}</td>
                  ))}
                  <td>{formatHoras(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

// ── Evolución semanal (líneas) ──────────────────────────────────────────

export function EvolucionChart({ data }: { data: EvolucionSemana[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 12, right: 24, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="semana"
          tick={AXIS_TICK}
          tickFormatter={(value: string) => formatFechaCorta(value)}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} unit=" h" width={52} />
        <Tooltip
          cursor={{ stroke: GRID }}
          content={({ active, payload }) => {
            const row = payload?.[0]?.payload as EvolucionSemana | undefined;
            if (!active || !row) return null;
            return (
              <TooltipCard
                title={`Semana del ${formatFechaCorta(row.semana)}`}
                rows={[
                  { name: 'horas activas', value: formatHoras(row.horas) },
                  { name: 'coste estimado', value: formatEuros(row.costeEstimado) },
                ]}
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="horas"
          stroke={LINE_BLUE}
          strokeWidth={2}
          dot={{ r: 4, fill: LINE_BLUE, stroke: SURFACE, strokeWidth: 2 }}
          activeDot={{ r: 5, fill: LINE_BLUE, stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
