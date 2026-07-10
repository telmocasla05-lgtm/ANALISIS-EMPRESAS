// Informes (§10): listado y generación de borradores con la API de Claude.
// El borrador siempre lo revisa Digital Power en el editor antes de marcarse
// como enviado — el sistema nunca envía nada automáticamente al cliente.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { InformeDetalle, InformeListItem } from '@digital-power/shared';
import { api, ApiError } from '../api/client';
import { useCompany } from '../company/CompanyProvider';
import { useApi } from '../lib/use-api';
import { fmtFecha } from '../lib/format';
import { DateRangeFilter, DEFAULT_FILTER, type DateFilterValue } from '../components/DateRangeFilter';

export const ESTADO_INFORME: Record<InformeListItem['status'], { label: string; chip: string }> = {
  BORRADOR: { label: 'Borrador', chip: 'chip borrador' },
  REVISADO: { label: 'Revisado', chip: 'chip open' },
  ENVIADO: { label: 'Enviado', chip: 'chip ok' },
};

export function InformesPage() {
  const { empresa } = useCompany();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<DateFilterValue>(DEFAULT_FILTER);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyId = empresa?.id ?? null;
  const informes = useApi<InformeListItem[]>(companyId && `/admin/empresas/${companyId}/informes`);

  if (!empresa) return null;
  const rows = informes.data ?? [];

  async function generar() {
    setGenerating(true);
    setError(null);
    try {
      const informe = await api<InformeDetalle>(`/admin/empresas/${companyId}/informes`, {
        method: 'POST',
        body: { desde: filter.range.desde, hasta: filter.range.hasta },
      });
      navigate(`/informes/${informe.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor');
    } finally {
      setGenerating(false);
    }
  }

  async function eliminarBorrador(informe: InformeListItem) {
    if (!window.confirm(`¿Eliminar el borrador "${informe.title}"?`)) return;
    try {
      await api(`/admin/empresas/${companyId}/informes/${informe.id}`, { method: 'DELETE' });
      informes.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor');
    }
  }

  return (
    <>
      <div>
        <h1 className="page-title">Informes · {empresa.name}</h1>
        <p className="page-subtitle">
          Borradores redactados con IA sobre los datos del periodo. Digital Power los revisa y edita antes de enviarlos:
          nunca se envía nada automáticamente al cliente.
        </p>
      </div>

      <section className="card">
        <h2>Generar borrador</h2>
        <div className="filter-row">
          <DateRangeFilter value={filter} onChange={setFilter} />
          <button className="btn btn-primary" onClick={generar} disabled={generating}>
            {generating ? 'Generando borrador…' : 'Generar borrador con IA'}
          </button>
        </div>
        {generating && <p className="empty-note">Analizando el periodo y redactando el borrador (suele tardar menos de un minuto)…</p>}
        {error && <p className="error-note">{error}</p>}
      </section>

      <section className={`card${informes.loading ? ' loading-dim' : ''}`}>
        <h2>Historial</h2>
        {informes.error && <p className="error-note">{informes.error}</p>}
        {rows.length === 0 && !informes.loading ? (
          <p className="empty-note">Todavía no hay informes para esta empresa.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Informe</th>
                  <th>Periodo</th>
                  <th>Estado</th>
                  <th>Última edición</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((informe) => (
                  <tr key={informe.id}>
                    <td>
                      <Link to={`/informes/${informe.id}`}>{informe.title}</Link>
                    </td>
                    <td>
                      {fmtFecha(informe.periodo.desde)} – {fmtFecha(informe.periodo.hasta)}
                    </td>
                    <td>
                      <span className={ESTADO_INFORME[informe.status].chip}>{ESTADO_INFORME[informe.status].label}</span>
                    </td>
                    <td>{fmtFecha(informe.updatedAt)}</td>
                    <td className="cell-actions">
                      {informe.status === 'BORRADOR' && (
                        <button className="btn-link danger" onClick={() => eliminarBorrador(informe)}>
                          Eliminar
                        </button>
                      )}
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
