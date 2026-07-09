// Gestión de la empresa activa: empleados (con reseteo de PIN), roles,
// reglas de categorización y ajustes (coste/hora, inactividad, muestreo).
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { CategoriaAdmin, EmpleadoAdmin, EmpresaAdminDetalle, PatternType, ReglaAdmin, RolAdmin } from '@digital-power/shared';
import { api, ApiError } from '../api/client';
import { useCompany } from '../company/CompanyProvider';
import { useApi } from '../lib/use-api';
import { Modal } from '../components/Modal';
import { ReglaFormModal } from '../components/ReglaFormModal';

type TabId = 'empleados' | 'roles' | 'reglas' | 'ajustes';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'empleados', label: 'Empleados' },
  { id: 'roles', label: 'Roles' },
  { id: 'reglas', label: 'Reglas de categorización' },
  { id: 'ajustes', label: 'Ajustes' },
];

export function GestionPage() {
  const { empresa } = useCompany();
  const [tab, setTab] = useState<TabId>('empleados');

  if (!empresa) return null;

  return (
    <>
      <h1 className="page-title">Gestión · {empresa.name}</h1>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'empleados' && <EmpleadosTab companyId={empresa.id} />}
      {tab === 'roles' && <RolesTab companyId={empresa.id} />}
      {tab === 'reglas' && <ReglasTab companyId={empresa.id} />}
      {tab === 'ajustes' && <AjustesTab companyId={empresa.id} />}
    </>
  );
}

function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de conexión con el servidor');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { error, busy, run, setError };
}

// ── Empleados ───────────────────────────────────────────────────────────────

type EmpleadoModal =
  | { kind: 'alta' }
  | { kind: 'editar'; empleado: EmpleadoAdmin }
  | { kind: 'pin'; empleado: EmpleadoAdmin }
  | { kind: 'baja'; empleado: EmpleadoAdmin };

function EmpleadosTab({ companyId }: { companyId: string }) {
  const empleados = useApi<EmpleadoAdmin[]>(`/admin/empresas/${companyId}/empleados`);
  const roles = useApi<RolAdmin[]>(`/admin/empresas/${companyId}/roles`);
  const [modal, setModal] = useState<EmpleadoModal | null>(null);

  const closeAndReload = () => {
    setModal(null);
    empleados.reload();
  };

  return (
    <section className={`card${empleados.loading ? ' loading-dim' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ marginBottom: 0 }}>Empleados</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setModal({ kind: 'alta' })} disabled={!roles.data?.length}>
          Nuevo empleado
        </button>
      </div>
      {empleados.error && <p className="error-note">{empleados.error}</p>}
      {roles.data?.length === 0 && <p className="empty-note">Crea primero un rol en la pestaña "Roles".</p>}
      {empleados.data && empleados.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Rol</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {empleados.data.map((empleado) => (
                <tr key={empleado.id}>
                  <td>{empleado.name}</td>
                  <td>{empleado.roleName}</td>
                  <td>
                    <span className={`chip ${empleado.active ? 'ok' : 'off'}`}>{empleado.active ? 'Activo' : 'De baja'}</span>
                  </td>
                  <td>
                    <div className="cell-actions">
                      <button className="btn-link" onClick={() => setModal({ kind: 'editar', empleado })}>
                        Editar
                      </button>
                      <button className="btn-link" onClick={() => setModal({ kind: 'pin', empleado })}>
                        Resetear PIN
                      </button>
                      {empleado.active && (
                        <button className="btn-link danger" onClick={() => setModal({ kind: 'baja', empleado })}>
                          Dar de baja
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {empleados.data?.length === 0 && roles.data && roles.data.length > 0 && (
        <p className="empty-note">Todavía no hay empleados.</p>
      )}

      {modal?.kind === 'alta' && roles.data && (
        <EmpleadoFormModal companyId={companyId} roles={roles.data} onClose={() => setModal(null)} onSaved={closeAndReload} />
      )}
      {modal?.kind === 'editar' && roles.data && (
        <EmpleadoFormModal
          companyId={companyId}
          roles={roles.data}
          empleado={modal.empleado}
          onClose={() => setModal(null)}
          onSaved={closeAndReload}
        />
      )}
      {modal?.kind === 'pin' && (
        <ResetPinModal companyId={companyId} empleado={modal.empleado} onClose={() => setModal(null)} onSaved={closeAndReload} />
      )}
      {modal?.kind === 'baja' && (
        <ConfirmModal
          title={`Dar de baja a ${modal.empleado.name}`}
          confirmLabel="Dar de baja"
          onClose={() => setModal(null)}
          onConfirm={async () => {
            await api(`/admin/empresas/${companyId}/empleados/${modal.empleado.id}`, { method: 'DELETE' });
          }}
          onDone={closeAndReload}
        >
          <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>
            La baja es lógica: el empleado deja de aparecer en la pantalla de fichaje, pero su histórico de sesiones y
            registros se conserva.
          </p>
        </ConfirmModal>
      )}
    </section>
  );
}

function EmpleadoFormModal({
  companyId,
  roles,
  empleado,
  onClose,
  onSaved,
}: {
  companyId: string;
  roles: RolAdmin[];
  empleado?: EmpleadoAdmin;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(empleado?.name ?? '');
  const [roleId, setRoleId] = useState(empleado?.roleId ?? roles[0]?.id ?? '');
  const [pin, setPin] = useState('');
  const [active, setActive] = useState(empleado?.active ?? true);
  const { error, busy, run } = useAction();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      if (empleado) {
        await api(`/admin/empresas/${companyId}/empleados/${empleado.id}`, {
          method: 'PUT',
          body: { name: name.trim(), roleId, active },
        });
      } else {
        await api(`/admin/empresas/${companyId}/empleados`, {
          method: 'POST',
          body: { name: name.trim(), roleId, pin },
        });
      }
    });
    if (ok) onSaved();
  }

  return (
    <Modal title={empleado ? `Editar a ${empleado.name}` : 'Nuevo empleado'} onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          Nombre
          <input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
        </label>
        <label className="field">
          Rol
          <select value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
            {roles.map((rol) => (
              <option key={rol.id} value={rol.id}>
                {rol.name}
              </option>
            ))}
          </select>
        </label>
        {!empleado && (
          <label className="field">
            PIN de fichaje (4 dígitos)
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              pattern="\d{4}"
              required
              placeholder="0000"
            />
          </label>
        )}
        {empleado && (
          <label className="checkbox-row">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Activo (aparece en la pantalla de fichaje)
          </label>
        )}
        {error && <p className="error-note">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !name.trim() || !roleId || (!empleado && pin.length !== 4)}
          >
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPinModal({
  companyId,
  empleado,
  onClose,
  onSaved,
}: {
  companyId: string;
  empleado: EmpleadoAdmin;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pin, setPin] = useState('');
  const { error, busy, run } = useAction();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      await api(`/admin/empresas/${companyId}/empleados/${empleado.id}`, { method: 'PUT', body: { pin } });
    });
    if (ok) onSaved();
  }

  return (
    <Modal title={`Resetear PIN de ${empleado.name}`} onClose={onClose}>
      <form className="form-grid" onSubmit={onSubmit}>
        <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 13 }}>
          El PIN actual no se puede consultar (se guarda cifrado). Al resetearlo también se desbloquea el fichaje si
          estaba bloqueado por intentos fallidos.
        </p>
        <label className="field">
          Nuevo PIN (4 dígitos)
          <input
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            pattern="\d{4}"
            required
            autoFocus
            placeholder="0000"
          />
        </label>
        {error && <p className="error-note">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || pin.length !== 4}>
            {busy ? 'Guardando…' : 'Resetear PIN'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmModal({
  title,
  confirmLabel,
  onClose,
  onConfirm,
  onDone,
  children,
}: {
  title: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  onDone: () => void;
  children: ReactNode;
}) {
  const { error, busy, run } = useAction();

  return (
    <Modal title={title} onClose={onClose}>
      {children}
      {error && <p className="error-note">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={async () => {
            const ok = await run(onConfirm);
            if (ok) onDone();
          }}
        >
          {busy ? 'Un momento…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ── Roles ───────────────────────────────────────────────────────────────────

function RolesTab({ companyId }: { companyId: string }) {
  const roles = useApi<RolAdmin[]>(`/admin/empresas/${companyId}/roles`);
  const [nuevo, setNuevo] = useState('');
  const [editando, setEditando] = useState<RolAdmin | null>(null);
  const [borrando, setBorrando] = useState<RolAdmin | null>(null);
  const [nombreEditado, setNombreEditado] = useState('');
  const { error, busy, run } = useAction();

  async function crear(event: FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      await api(`/admin/empresas/${companyId}/roles`, { method: 'POST', body: { name: nuevo.trim() } });
    });
    if (ok) {
      setNuevo('');
      roles.reload();
    }
  }

  return (
    <section className={`card${roles.loading ? ' loading-dim' : ''}`}>
      <h2>Roles</h2>
      {roles.error && <p className="error-note">{roles.error}</p>}
      <form className="filter-row" onSubmit={crear} style={{ marginBottom: 12 }}>
        <label className="field" style={{ flex: 1, maxWidth: 320 }}>
          Nuevo rol
          <input value={nuevo} onChange={(event) => setNuevo(event.target.value)} placeholder="Ej. Recepción" />
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || !nuevo.trim()}>
          Añadir
        </button>
      </form>
      {error && <p className="error-note">{error}</p>}
      {roles.data?.length === 0 ? (
        <p className="empty-note">Todavía no hay roles.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <tbody>
              {(roles.data ?? []).map((rol) => (
                <tr key={rol.id}>
                  <td>{rol.name}</td>
                  <td>
                    <div className="cell-actions">
                      <button
                        className="btn-link"
                        onClick={() => {
                          setEditando(rol);
                          setNombreEditado(rol.name);
                        }}
                      >
                        Renombrar
                      </button>
                      <button className="btn-link danger" onClick={() => setBorrando(rol)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <Modal title={`Renombrar "${editando.name}"`} onClose={() => setEditando(null)}>
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(async () => {
                await api(`/admin/empresas/${companyId}/roles/${editando.id}`, {
                  method: 'PUT',
                  body: { name: nombreEditado.trim() },
                });
              });
              if (ok) {
                setEditando(null);
                roles.reload();
              }
            }}
          >
            <label className="field">
              Nombre
              <input value={nombreEditado} onChange={(event) => setNombreEditado(event.target.value)} required autoFocus />
            </label>
            {error && <p className="error-note">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || !nombreEditado.trim()}>
                Guardar
              </button>
            </div>
          </form>
        </Modal>
      )}
      {borrando && (
        <ConfirmModal
          title={`Eliminar el rol "${borrando.name}"`}
          confirmLabel="Eliminar"
          onClose={() => setBorrando(null)}
          onConfirm={async () => {
            await api(`/admin/empresas/${companyId}/roles/${borrando.id}`, { method: 'DELETE' });
          }}
          onDone={() => {
            setBorrando(null);
            roles.reload();
          }}
        >
          <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>
            Solo se puede eliminar si ningún empleado tiene este rol asignado.
          </p>
        </ConfirmModal>
      )}
    </section>
  );
}

// ── Reglas de categorización ────────────────────────────────────────────────

const PATTERN_TYPE_LABELS: Record<PatternType, string> = {
  APP: 'Aplicación',
  DOMAIN: 'Dominio',
  TITLE: 'Título',
};

function ReglasTab({ companyId }: { companyId: string }) {
  const reglas = useApi<ReglaAdmin[]>(`/admin/empresas/${companyId}/reglas`);
  const categorias = useApi<CategoriaAdmin[]>(`/admin/empresas/${companyId}/categorias`);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<ReglaAdmin | null>(null);
  const [borrando, setBorrando] = useState<ReglaAdmin | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <section className={`card${reglas.loading ? ' loading-dim' : ''}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ marginBottom: 0 }}>Reglas de categorización</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setCreando(true)} disabled={!categorias.data?.length}>
          Nueva regla
        </button>
      </div>
      <p style={{ marginTop: 0, fontSize: 13, color: 'var(--ink-muted)' }}>
        Las reglas de empresa se evalúan antes que la plantilla del sector (gestionada por Digital Power, solo lectura).
      </p>
      {notice && <p style={{ color: 'var(--ok)', fontSize: 13 }}>{notice}</p>}
      {reglas.error && <p className="error-note">{reglas.error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ámbito</th>
              <th>Tipo</th>
              <th>Patrón</th>
              <th>Categoría</th>
              <th className="num">Prioridad</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(reglas.data ?? []).map((regla) => (
              <tr key={regla.id}>
                <td>
                  <span className="chip">{regla.scope === 'empresa' ? 'Empresa' : 'Sector'}</span>
                </td>
                <td>{PATTERN_TYPE_LABELS[regla.patternType]}</td>
                <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>{regla.pattern}</td>
                <td>{regla.categoryName}</td>
                <td className="num">{regla.priority}</td>
                <td>
                  <span className={`chip ${regla.active ? 'ok' : 'off'}`}>{regla.active ? 'Activa' : 'Inactiva'}</span>
                </td>
                <td>
                  {regla.scope === 'empresa' && (
                    <div className="cell-actions">
                      <button className="btn-link" onClick={() => setEditando(regla)}>
                        Editar
                      </button>
                      <button className="btn-link danger" onClick={() => setBorrando(regla)}>
                        Eliminar
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creando && categorias.data && (
        <ReglaFormModal
          companyId={companyId}
          categorias={categorias.data}
          onClose={() => setCreando(false)}
          onSaved={(recategorizados) => {
            setCreando(false);
            setNotice(
              recategorizados > 0
                ? `Regla creada: ${recategorizados.toLocaleString('es-ES')} registros recategorizados.`
                : 'Regla creada.'
            );
            reglas.reload();
          }}
        />
      )}
      {editando && (
        <ReglaEditModal
          companyId={companyId}
          regla={editando}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            reglas.reload();
          }}
        />
      )}
      {borrando && (
        <ConfirmModal
          title="Eliminar regla"
          confirmLabel="Eliminar"
          onClose={() => setBorrando(null)}
          onConfirm={async () => {
            await api(`/admin/empresas/${companyId}/reglas/${borrando.id}`, { method: 'DELETE' });
          }}
          onDone={() => {
            setBorrando(null);
            reglas.reload();
          }}
        >
          <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>
            Los registros ya categorizados por esta regla conservan su categoría; solo deja de aplicarse a partir de
            ahora.
          </p>
        </ConfirmModal>
      )}
    </section>
  );
}

function ReglaEditModal({
  companyId,
  regla,
  onClose,
  onSaved,
}: {
  companyId: string;
  regla: ReglaAdmin;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pattern, setPattern] = useState(regla.pattern);
  const [patternType, setPatternType] = useState<PatternType>(regla.patternType);
  const [priority, setPriority] = useState(regla.priority);
  const [active, setActive] = useState(regla.active);
  const { error, busy, run } = useAction();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const ok = await run(async () => {
      await api(`/admin/empresas/${companyId}/reglas/${regla.id}`, {
        method: 'PUT',
        body: { pattern: pattern.trim(), patternType, priority, active },
      });
    });
    if (ok) onSaved();
  }

  return (
    <Modal title="Editar regla" onClose={onClose}>
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
          Patrón
          <input value={pattern} onChange={(event) => setPattern(event.target.value)} required />
        </label>
        <label className="field">
          Prioridad (menor = se evalúa antes)
          <input type="number" min={1} max={999} value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Regla activa
        </label>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-muted)' }}>
          La categoría de destino no se puede cambiar: elimina la regla y crea otra si hace falta.
        </p>
        {error && <p className="error-note">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || !pattern.trim()}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

function AjustesTab({ companyId }: { companyId: string }) {
  const detalle = useApi<EmpresaAdminDetalle>(`/admin/empresas/${companyId}`);
  const [costeHora, setCosteHora] = useState('');
  const [inactividad, setInactividad] = useState('');
  const [muestreo, setMuestreo] = useState('');
  const [saved, setSaved] = useState(false);
  const { error, busy, run } = useAction();

  useEffect(() => {
    if (!detalle.data) return;
    setCosteHora((detalle.data.avgHourlyCostCents / 100).toString());
    setInactividad(detalle.data.inactivityMinutes.toString());
    setMuestreo(detalle.data.sampleIntervalSeconds.toString());
  }, [detalle.data]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    const ok = await run(async () => {
      await api(`/admin/empresas/${companyId}/ajustes`, {
        method: 'PUT',
        body: {
          avgHourlyCostCents: Math.round(Number(costeHora.replace(',', '.')) * 100),
          inactivityMinutes: Number(inactividad),
          sampleIntervalSeconds: Number(muestreo),
        },
      });
    });
    if (ok) {
      setSaved(true);
      detalle.reload();
    }
  }

  return (
    <section className={`card${detalle.loading ? ' loading-dim' : ''}`} style={{ maxWidth: 480 }}>
      <h2>Ajustes de la empresa</h2>
      {detalle.error && <p className="error-note">{detalle.error}</p>}
      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          Coste por hora medio (€) — para convertir horas en coste estimado
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={costeHora}
            onChange={(event) => setCosteHora(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Minutos de inactividad antes del aviso (1–120)
          <input
            type="number"
            min={1}
            max={120}
            value={inactividad}
            onChange={(event) => setInactividad(event.target.value)}
            required
          />
        </label>
        <label className="field">
          Frecuencia de muestreo del tracking (segundos, 5–10)
          <input
            type="number"
            min={5}
            max={10}
            value={muestreo}
            onChange={(event) => setMuestreo(event.target.value)}
            required
          />
        </label>
        {error && <p className="error-note">{error}</p>}
        {saved && !error && <p style={{ color: 'var(--ok)', fontSize: 13, margin: 0 }}>Ajustes guardados.</p>}
        <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={busy || detalle.loading}>
            {busy ? 'Guardando…' : 'Guardar ajustes'}
          </button>
        </div>
      </form>
    </section>
  );
}
