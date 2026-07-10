// Editor de un informe (§10): Digital Power revisa/edita el borrador en markdown,
// lo avanza de estado (borrador → revisado → enviado, siempre a mano) y exporta
// el informe revisado a PDF. Un informe enviado queda de solo lectura.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { InformeDetalle, InformeUpdateRequest } from '@digital-power/shared';
import { api, ApiError } from '../api/client';
import { useCompany } from '../company/CompanyProvider';
import { useApi } from '../lib/use-api';
import { fmtFecha } from '../lib/format';
import { markdownToHtml } from '../lib/markdown';
import { exportInformePdf } from '../lib/informe-pdf';
import { ESTADO_INFORME } from './InformesPage';

export function InformeDetallePage() {
  const { empresa } = useCompany();
  const { informeId } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<string | null>(null); // null = sin ediciones locales
  const [tab, setTab] = useState<'editar' | 'vista'>('editar');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyId = empresa?.id ?? null;
  const informe = useApi<InformeDetalle>(
    companyId && informeId ? `/admin/empresas/${companyId}/informes/${informeId}` : null
  );

  if (!empresa) return null;
  if (informe.error) {
    return (
      <div className="card">
        <p className="error-note">{informe.error}</p>
        <Link to="/informes">← Volver a informes</Link>
      </div>
    );
  }
  if (!informe.data) return <div className="card loading-dim">Cargando informe…</div>;

  const data = informe.data;
  const estado = ESTADO_INFORME[data.status];
  const content = draft ?? data.content;
  const dirty = draft !== null && draft !== data.content;
  const readonly = data.status === 'ENVIADO';

  async function actualizar(body: InformeUpdateRequest) {
    setSaving(true);
    setError(null);
    try {
      await api<InformeDetalle>(`/admin/empresas/${companyId}/informes/${informeId}`, { method: 'PUT', body });
      setDraft(null);
      informe.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor');
    } finally {
      setSaving(false);
    }
  }

  async function eliminarBorrador() {
    if (!window.confirm(`¿Eliminar el borrador "${data.title}"?`)) return;
    try {
      await api(`/admin/empresas/${companyId}/informes/${informeId}`, { method: 'DELETE' });
      navigate('/informes');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor');
    }
  }

  function marcarEnviado() {
    const confirmado = window.confirm(
      'Marcar como enviado solo registra que ya se lo has hecho llegar tú al cliente (el sistema no envía nada). ' +
        'Después el informe queda de solo lectura. ¿Continuar?'
    );
    if (confirmado) void actualizar({ status: 'ENVIADO' });
  }

  return (
    <>
      <div>
        <p className="page-subtitle">
          <Link to="/informes">← Informes</Link>
        </p>
        <h1 className="page-title">{data.title}</h1>
        <p className="page-subtitle">
          <span className={estado.chip}>{estado.label}</span>
          {'  '}Periodo: {fmtFecha(data.periodo.desde)} – {fmtFecha(data.periodo.hasta)} · Borrador generado con la API de
          Claude ({data.model}) el {fmtFecha(data.createdAt)} · Última edición: {fmtFecha(data.updatedAt)}
        </p>
      </div>

      <section className="card">
        <div className="informe-toolbar">
          <div className="tabs">
            <button className={tab === 'editar' ? 'active' : ''} onClick={() => setTab('editar')} disabled={readonly}>
              Editar
            </button>
            <button className={tab === 'vista' || readonly ? 'active' : ''} onClick={() => setTab('vista')}>
              Vista previa
            </button>
          </div>
          <div className="informe-actions">
            {!readonly && (
              <button className="btn" onClick={() => void actualizar({ content })} disabled={saving || !dirty}>
                Guardar cambios
              </button>
            )}
            {data.status === 'BORRADOR' && (
              <button
                className="btn btn-primary"
                onClick={() => void actualizar({ ...(dirty ? { content } : {}), status: 'REVISADO' })}
                disabled={saving}
              >
                Marcar como revisado
              </button>
            )}
            {data.status === 'REVISADO' && (
              <button className="btn btn-primary" onClick={marcarEnviado} disabled={saving || dirty}>
                Marcar como enviado
              </button>
            )}
            <button
              className="btn"
              onClick={() => exportInformePdf({ ...data, content }, empresa.name)}
              disabled={data.status === 'BORRADOR'}
              title={data.status === 'BORRADOR' ? 'Marca el informe como revisado para poder exportarlo' : 'Exportar a PDF'}
            >
              Exportar a PDF
            </button>
            {data.status === 'BORRADOR' && (
              <button className="btn btn-danger" onClick={() => void eliminarBorrador()} disabled={saving}>
                Eliminar
              </button>
            )}
          </div>
        </div>

        {error && <p className="error-note">{error}</p>}
        {readonly && <p className="empty-note">Informe enviado: solo lectura.</p>}

        {tab === 'editar' && !readonly ? (
          <textarea
            className="informe-editor"
            value={content}
            onChange={(event) => setDraft(event.target.value)}
            spellCheck={false}
            aria-label="Contenido del informe en markdown"
          />
        ) : (
          <div className="informe-preview" dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }} />
        )}
      </section>
    </>
  );
}
