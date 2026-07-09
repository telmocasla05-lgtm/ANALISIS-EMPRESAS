// Dashboard por empresa: KPIs de horas/coste del rango elegido, horas por
// categoría, apilado por empleado, evolución semanal y la tabla de registros
// sin categorizar con alta rápida de regla.
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CategoriaAdmin,
  EmpresaAdminDetalle,
  EvolucionSemana,
  Resumen,
  SinCategorizarGrupo,
} from '@digital-power/shared';
import { useCompany } from '../company/CompanyProvider';
import { useApi } from '../lib/use-api';
import { buildCategoryColors, IDLE_LABEL, SIN_CATEGORIZAR_LABEL } from '../lib/colors';
import { fmtEuros, fmtFecha, fmtFechaCorta, fmtHoras } from '../lib/format';
import { DateRangeFilter, DEFAULT_FILTER, type DateFilterValue } from '../components/DateRangeFilter';
import { ReglaFormModal } from '../components/ReglaFormModal';

const CHART_INK = { fontSize: 12, fill: 'var(--ink-muted)' };
const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--hairline)',
    borderRadius: 8,
    fontSize: 13,
  },
  labelStyle: { color: 'var(--ink)', fontWeight: 600 },
  itemStyle: { color: 'var(--ink-secondary)' },
} as const;

export function DashboardPage() {
  const { empresa } = useCompany();
  const [filter, setFilter] = useState<DateFilterValue>(DEFAULT_FILTER);
  const [notice, setNotice] = useState<string | null>(null);

  const companyId = empresa?.id ?? null;
  const rangeQuery = `desde=${filter.range.desde}&hasta=${filter.range.hasta}`;
  const resumen = useApi<Resumen>(companyId && `/admin/empresas/${companyId}/resumen?${rangeQuery}`);
  const sinCategorizar = useApi<SinCategorizarGrupo[]>(
    companyId && `/admin/empresas/${companyId}/sin-categorizar?${rangeQuery}`
  );
  const evolucion = useApi<EvolucionSemana[]>(companyId && `/admin/empresas/${companyId}/evolucion?semanas=8`);
  const categorias = useApi<CategoriaAdmin[]>(companyId && `/admin/empresas/${companyId}/categorias`);
  const detalle = useApi<EmpresaAdminDetalle>(companyId && `/admin/empresas/${companyId}`);

  // El color sigue a la categoría en todos los gráficos (asignación estable
  // sobre el listado completo, no sobre lo que aparezca en el rango filtrado).
  const colors = useMemo(() => buildCategoryColors((categorias.data ?? []).map((c) => c.name)), [categorias.data]);

  if (!empresa) return null;

  const porCategoria = resumen.data?.porCategoria ?? [];
  const activas = porCategoria.filter((c) => c.categoryName !== IDLE_LABEL);
  const horasActivas = activas.reduce((total, c) => total + c.horas, 0);
  const costeActivas = activas.reduce((total, c) => total + c.costeEstimado, 0);
  const horasSinCategorizar = porCategoria.find((c) => c.categoryName === SIN_CATEGORIZAR_LABEL)?.horas ?? 0;
  const horasPausa = porCategoria.find((c) => c.categoryName === IDLE_LABEL)?.horas ?? 0;
  const costeHora = detalle.data ? detalle.data.avgHourlyCostCents / 100 : null;

  const error = resumen.error ?? sinCategorizar.error ?? evolucion.error;

  return (
    <>
      <div>
        <h1 className="page-title">{empresa.name}</h1>
        <p className="page-subtitle">
          {fmtFecha(`${filter.range.desde}T00:00:00Z`)} — {fmtFecha(`${filter.range.hasta}T00:00:00Z`)}
        </p>
      </div>

      <DateRangeFilter value={filter} onChange={setFilter} />

      {error && (
        <div className="card">
          <p className="error-note">{error}</p>
        </div>
      )}

      <div className={`grid-kpi${resumen.loading ? ' loading-dim' : ''}`}>
        <div className="card">
          <div className="stat-label">Horas trackeadas</div>
          <div className="stat-value">{fmtHoras(horasActivas)}</div>
          <div className="stat-hint">sin contar pausas</div>
        </div>
        <div className="card">
          <div className="stat-label">Coste estimado</div>
          <div className="stat-value">{fmtEuros(costeActivas)}</div>
          <div className="stat-hint">{costeHora !== null ? `a ${fmtEuros(costeHora)}/h de media` : ' '}</div>
        </div>
        <div className="card">
          <div className="stat-label">Sin categorizar</div>
          <div className="stat-value">{fmtHoras(horasSinCategorizar)}</div>
          <div className="stat-hint">revisar en la tabla de abajo</div>
        </div>
        <div className="card">
          <div className="stat-label">Inactividad / pausa</div>
          <div className="stat-value">{fmtHoras(horasPausa)}</div>
          <div className="stat-hint">no se imputa a ninguna categoría</div>
        </div>
      </div>

      <div className="grid-2">
        <CategoriasCard resumen={resumen.data} loading={resumen.loading} colors={colors} />
        <EmpleadosCard resumen={resumen.data} loading={resumen.loading} colors={colors} />
      </div>

      <EvolucionCard evolucion={evolucion.data} loading={evolucion.loading} colors={colors} />

      <SinCategorizarCard
        grupos={sinCategorizar.data}
        loading={sinCategorizar.loading}
        companyId={empresa.id}
        categorias={categorias.data ?? []}
        notice={notice}
        onRuleSaved={(recategorizados) => {
          setNotice(
            recategorizados > 0
              ? `Regla creada: ${recategorizados.toLocaleString('es-ES')} registros recategorizados.`
              : 'Regla creada.'
          );
          resumen.reload();
          sinCategorizar.reload();
          evolucion.reload();
        }}
      />
    </>
  );
}

// ── Horas por categoría (barras horizontales) ──────────────────────────────

function CategoriasCard({
  resumen,
  loading,
  colors,
}: {
  resumen: Resumen | null;
  loading: boolean;
  colors: Map<string, string>;
}) {
  const data = (resumen?.porCategoria ?? [])
    .filter((c) => c.horas > 0)
    .sort((a, b) => b.horas - a.horas)
    .map((c) => ({ name: c.categoryName, horas: c.horas, coste: c.costeEstimado }));

  return (
    <section className={`card${loading ? ' loading-dim' : ''}`}>
      <h2>Horas por categoría</h2>
      {data.length === 0 ? (
        <p className="empty-note">Sin registros en este rango.</p>
      ) : (
        <ResponsiveContainer width="100%" height={data.length * 36 + 40}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="var(--hairline)" />
            <XAxis type="number" tick={CHART_INK} stroke="var(--baseline)" tickLine={false} unit=" h" />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ ...CHART_INK, fill: 'var(--ink-secondary)' }}
              stroke="var(--baseline)"
              tickLine={false}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(11, 11, 11, 0.04)' }}
              formatter={(value, _name, item) => {
                const coste = (item?.payload as { coste?: number } | undefined)?.coste;
                return [`${fmtHoras(Number(value))}${coste !== undefined ? ` · ${fmtEuros(coste)}` : ''}`, 'Horas'];
              }}
            />
            <Bar dataKey="horas" barSize={18} radius={[0, 4, 4, 0]}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={colors.get(entry.name) ?? 'var(--ink-muted)'} />
              ))}
              <LabelList
                dataKey="horas"
                position="right"
                formatter={(value: number) => value.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                style={{ fill: 'var(--ink-secondary)', fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

// ── Horas por empleado y categoría (barras apiladas) ───────────────────────

function EmpleadosCard({
  resumen,
  loading,
  colors,
}: {
  resumen: Resumen | null;
  loading: boolean;
  colors: Map<string, string>;
}) {
  const empleados = (resumen?.porEmpleado ?? []).filter((e) => e.horas > 0);

  // Claves de categoría presentes, en orden estable: reales primero
  // (alfabético, igual que la asignación de color), especiales al final.
  const keys = useMemo(() => {
    const present = new Set<string>();
    for (const empleado of empleados) {
      for (const categoria of empleado.porCategoria) {
        if (categoria.horas > 0) present.add(categoria.categoryName);
      }
    }
    const reales = [...present]
      .filter((name) => name !== SIN_CATEGORIZAR_LABEL && name !== IDLE_LABEL)
      .sort((a, b) => a.localeCompare(b, 'es'));
    if (present.has(SIN_CATEGORIZAR_LABEL)) reales.push(SIN_CATEGORIZAR_LABEL);
    if (present.has(IDLE_LABEL)) reales.push(IDLE_LABEL);
    return reales;
  }, [empleados]);

  const data = empleados
    .sort((a, b) => b.horas - a.horas)
    .map((empleado) => {
      const row: Record<string, number | string> = { name: empleado.employeeName };
      for (const categoria of empleado.porCategoria) {
        row[categoria.categoryName] = categoria.horas;
      }
      return row;
    });

  return (
    <section className={`card${loading ? ' loading-dim' : ''}`}>
      <h2>Horas por empleado y categoría</h2>
      {data.length === 0 ? (
        <p className="empty-note">Sin registros en este rango.</p>
      ) : (
        <ResponsiveContainer width="100%" height={data.length * 40 + 80}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="var(--hairline)" />
            <XAxis type="number" tick={CHART_INK} stroke="var(--baseline)" tickLine={false} unit=" h" />
            <YAxis
              type="category"
              dataKey="name"
              width={110}
              tick={{ ...CHART_INK, fill: 'var(--ink-secondary)' }}
              stroke="var(--baseline)"
              tickLine={false}
            />
            <Tooltip
              {...TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(11, 11, 11, 0.04)' }}
              formatter={(value) => fmtHoras(Number(value))}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>{value}</span>}
            />
            {keys.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="horas"
                barSize={18}
                fill={colors.get(key) ?? 'var(--ink-muted)'}
                stroke="var(--surface)"
                strokeWidth={1}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

// ── Evolución semanal (líneas) ──────────────────────────────────────────────

function EvolucionCard({
  evolucion,
  loading,
  colors,
}: {
  evolucion: EvolucionSemana[] | null;
  loading: boolean;
  colors: Map<string, string>;
}) {
  const semanas = evolucion ?? [];

  // Además del total, las 3 categorías reales con más horas del periodo.
  const topCategorias = useMemo(() => {
    const totales = new Map<string, number>();
    for (const semana of semanas) {
      for (const categoria of semana.porCategoria) {
        if (categoria.categoryName === IDLE_LABEL || categoria.categoryName === SIN_CATEGORIZAR_LABEL) continue;
        totales.set(categoria.categoryName, (totales.get(categoria.categoryName) ?? 0) + categoria.horas);
      }
    }
    return [...totales.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
  }, [semanas]);

  const data = semanas.map((semana) => {
    const row: Record<string, number | string> = {
      label: fmtFechaCorta(semana.semana.desde),
      Total: semana.horas,
    };
    for (const name of topCategorias) {
      row[name] = semana.porCategoria.find((c) => c.categoryName === name)?.horas ?? 0;
    }
    return row;
  });

  const hayDatos = semanas.some((semana) => semana.horas > 0);

  return (
    <section className={`card${loading ? ' loading-dim' : ''}`}>
      <h2>Evolución semanal (últimas 8 semanas)</h2>
      {!hayDatos ? (
        <p className="empty-note">Todavía no hay actividad registrada.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis dataKey="label" tick={CHART_INK} stroke="var(--baseline)" tickLine={false} />
            <YAxis tick={CHART_INK} stroke="var(--baseline)" tickLine={false} unit=" h" width={48} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(value) => fmtHoras(Number(value))} />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value: string) => <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>{value}</span>}
            />
            <Line
              type="monotone"
              dataKey="Total"
              stroke="var(--ink)"
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: 'var(--ink)' }}
            />
            {topCategorias.map((name) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={colors.get(name) ?? 'var(--ink-muted)'}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: colors.get(name) ?? 'var(--ink-muted)' }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

// ── Sin categorizar / revisar ───────────────────────────────────────────────

function SinCategorizarCard({
  grupos,
  loading,
  companyId,
  categorias,
  notice,
  onRuleSaved,
}: {
  grupos: SinCategorizarGrupo[] | null;
  loading: boolean;
  companyId: string;
  categorias: CategoriaAdmin[];
  notice: string | null;
  onRuleSaved: (recategorizados: number) => void;
}) {
  const [reglaPara, setReglaPara] = useState<SinCategorizarGrupo | null>(null);
  const rows = grupos ?? [];

  return (
    <section className={`card${loading ? ' loading-dim' : ''}`}>
      <h2>Sin categorizar / revisar</h2>
      {notice && <p style={{ color: 'var(--ok)', fontSize: 13, marginTop: 0 }}>{notice}</p>}
      {rows.length === 0 ? (
        <p className="empty-note">No hay registros sin categorizar en este rango. Todo revisado.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Aplicación</th>
                <th>Dominio</th>
                <th>Título de ejemplo</th>
                <th className="num">Registros</th>
                <th className="num">Horas</th>
                <th>Última vez</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((grupo) => (
                <tr key={`${grupo.app}|${grupo.domain ?? ''}`}>
                  <td>{grupo.app}</td>
                  <td>{grupo.domain ?? '—'}</td>
                  <td
                    style={{
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: 'var(--ink-secondary)',
                    }}
                    title={grupo.windowTitleEjemplo ?? undefined}
                  >
                    {grupo.windowTitleEjemplo ?? '—'}
                  </td>
                  <td className="num">{grupo.registros.toLocaleString('es-ES')}</td>
                  <td className="num">{fmtHoras(grupo.horas)}</td>
                  <td>{fmtFecha(grupo.ultimaVez)}</td>
                  <td>
                    <div className="cell-actions">
                      <button className="btn btn-sm" onClick={() => setReglaPara(grupo)}>
                        Crear regla
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reglaPara && (
        <ReglaFormModal
          companyId={companyId}
          categorias={categorias}
          initial={{
            patternType: reglaPara.domain ? 'DOMAIN' : 'APP',
            pattern: reglaPara.domain ?? reglaPara.app,
          }}
          onClose={() => setReglaPara(null)}
          onSaved={(recategorizados) => {
            setReglaPara(null);
            onRuleSaved(recategorizados);
          }}
        />
      )}
    </section>
  );
}
