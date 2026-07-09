// Sesiones ON/OFF por empleado con duración y estado. Hace las veces de
// registro horario (obligatorio por ley en España): exportable a CSV.
import { useState } from 'react';
import type { EmpleadoAdmin, SesionAdmin } from '@digital-power/shared';
import { useCompany } from '../company/CompanyProvider';
import { useApi } from '../lib/use-api';
import { downloadCsv } from '../lib/csv';
import { fmtDuracion, fmtFecha, fmtHora, fmtHoras } from '../lib/format';
import { DateRangeFilter, DEFAULT_FILTER, type DateFilterValue } from '../components/DateRangeFilter';

export function SesionesPage() {
  const { empresa } = useCompany();
  const [filter, setFilter] = useState<DateFilterValue>(DEFAULT_FILTER);
  const [employeeId, setEmployeeId] = useState('');

  const companyId = empresa?.id ?? null;
  const query = `desde=${filter.range.desde}&hasta=${filter.range.hasta}${employeeId ? `&employeeId=${employeeId}` : ''}`;
  const sesiones = useApi<SesionAdmin[]>(companyId && `/admin/empresas/${companyId}/sesiones?${query}`);
  const empleados = useApi<EmpleadoAdmin[]>(companyId && `/admin/empresas/${companyId}/empleados`);

  if (!empresa) return null;

  const rows = sesiones.data ?? [];
  const totalHoras = rows.reduce((total, sesion) => total + (sesion.duracionHoras ?? 0), 0);
  const abiertas = rows.filter((sesion) => sesion.endedAt === null).length;

  function exportCsv() {
    const header = ['Empleado', 'Fecha', 'Inicio', 'Fin', 'Duración (h)', 'Dispositivo', 'Estado'];
    const body = rows.map((sesion) => [
      sesion.employeeName,
      fmtFecha(sesion.startedAt),
      fmtHora(sesion.startedAt),
      sesion.endedAt ? fmtHora(sesion.endedAt) : '',
      sesion.duracionHoras !== null ? sesion.duracionHoras.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '',
      sesion.device === 'DESKTOP' ? 'Ordenador' : 'Tablet',
      sesion.endedAt ? 'Cerrada' : 'Abierta',
    ]);
    downloadCsv(`sesiones-${empresa!.slug}-${filter.range.desde}-a-${filter.range.hasta}.csv`, [header, ...body]);
  }

  return (
    <>
      <div>
        <h1 className="page-title">Sesiones · {empresa.name}</h1>
        <p className="page-subtitle">Registro horario: turnos fichados con ON/OFF, con duración y estado.</p>
      </div>

      <div className="filter-row">
        <DateRangeFilter value={filter} onChange={setFilter} />
        <label className="field">
          Empleado
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">Todos</option>
            {(empleados.data ?? []).map((empleado) => (
              <option key={empleado.id} value={empleado.id}>
                {empleado.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" onClick={exportCsv} disabled={rows.length === 0}>
          Exportar CSV
        </button>
      </div>

      <div className="grid-kpi">
        <div className="card">
          <div className="stat-label">Sesiones en el rango</div>
          <div className="stat-value">{rows.length.toLocaleString('es-ES')}</div>
        </div>
        <div className="card">
          <div className="stat-label">Horas fichadas (cerradas)</div>
          <div className="stat-value">{fmtHoras(totalHoras)}</div>
        </div>
        <div className="card">
          <div className="stat-label">Sesiones abiertas ahora</div>
          <div className="stat-value">{abiertas.toLocaleString('es-ES')}</div>
        </div>
      </div>

      <section className={`card${sesiones.loading ? ' loading-dim' : ''}`}>
        {sesiones.error && <p className="error-note">{sesiones.error}</p>}
        {rows.length === 0 && !sesiones.loading ? (
          <p className="empty-note">No hay sesiones en este rango.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Empleado</th>
                  <th>Fecha</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                  <th className="num">Duración</th>
                  <th>Dispositivo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((sesion) => (
                  <tr key={sesion.id}>
                    <td>{sesion.employeeName}</td>
                    <td>{fmtFecha(sesion.startedAt)}</td>
                    <td>{fmtHora(sesion.startedAt)}</td>
                    <td>{sesion.endedAt ? fmtHora(sesion.endedAt) : '—'}</td>
                    <td className="num">{fmtDuracion(sesion.duracionHoras)}</td>
                    <td>{sesion.device === 'DESKTOP' ? 'Ordenador' : 'Tablet'}</td>
                    <td>
                      <span className={`chip ${sesion.endedAt ? 'off' : 'open'}`}>
                        {sesion.endedAt ? 'Cerrada' : 'Abierta'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
