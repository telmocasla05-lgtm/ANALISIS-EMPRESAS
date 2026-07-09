import { useCallback, useEffect, useState } from 'react';
import type { PermissionsStatus } from '../../common/ipc-contract';
import BigButton from '../components/BigButton';

interface Props {
  /** Todo concedido (o el usuario decide seguir sin permisos). */
  onContinue: () => void;
  /** Vuelta a la selección de empleado sin abrir turno. */
  onBack: () => void;
}

// Pantalla guiada de permisos de macOS: sin Grabación de pantalla no hay título
// de ventana y sin Accesibilidad no hay dominio del navegador. Se re-comprueba
// en segundo plano para que el estado se actualice solo al conceder cada uno.
export default function PermissionsScreen({ onContinue, onBack }: Props) {
  const [status, setStatus] = useState<PermissionsStatus | null>(null);

  const refresh = useCallback(async () => {
    const result = await window.dpApi.getPermissions();
    if (result.ok) setStatus(result.data);
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  const allGranted = status !== null && status.accessibility && status.screenRecording;

  return (
    <div className="screen screen-center">
      <h1>Permisos de macOS</h1>
      <p className="muted perm-intro">
        Para detectar en qué aplicación se trabaja, macOS pide conceder dos permisos a esta app.
        Solo se registran la aplicación activa, el título de la ventana y el dominio de la web:
        nunca el contenido de la pantalla ni el teclado.
      </p>

      <PermissionCard
        granted={status?.screenRecording ?? false}
        title="Grabación de pantalla"
        description="macOS agrupa bajo este permiso la lectura del título de la ventana activa. No se graba la pantalla ni se hacen capturas."
        buttonLabel="Abrir ajustes de Grabación de pantalla"
        pane="screenRecording"
      />
      <PermissionCard
        granted={status?.accessibility ?? false}
        title="Accesibilidad"
        description="Necesario para saber el dominio de la página activa en el navegador (solo el dominio, nunca la dirección completa)."
        buttonLabel="Abrir ajustes de Accesibilidad"
        pane="accessibility"
      />

      <ol className="perm-steps muted small">
        <li>Pulsa «Abrir ajustes…» y activa el interruptor de «Digital Power» (o «Electron» en desarrollo).</li>
        <li>Si macOS pide salir y reabrir la app, hazlo: esta pantalla recordará dónde ibas.</li>
        <li>El estado de arriba se actualiza solo en cuanto se concede cada permiso.</li>
      </ol>

      <div className="screen-center-block">
        <BigButton onClick={onContinue} disabled={!allGranted}>
          {allGranted ? 'Continuar' : 'Faltan permisos por conceder'}
        </BigButton>
        <button type="button" className="link-button" onClick={onContinue}>
          Continuar sin estos permisos (solo se registrará el nombre de la aplicación)
        </button>
        <button type="button" className="link-button" onClick={onBack}>
          Volver
        </button>
      </div>
    </div>
  );
}

function PermissionCard({
  granted,
  title,
  description,
  buttonLabel,
  pane,
}: {
  granted: boolean;
  title: string;
  description: string;
  buttonLabel: string;
  pane: 'accessibility' | 'screenRecording';
}) {
  return (
    <div className={`card perm-card${granted ? ' perm-card-granted' : ''}`}>
      <div className="perm-card-header">
        <span className={`perm-chip${granted ? ' perm-chip-ok' : ''}`}>
          {granted ? '✓ Concedido' : 'Pendiente'}
        </span>
        <h2 className="perm-title">{title}</h2>
      </div>
      <p className="muted perm-description">{description}</p>
      {!granted && (
        <button
          type="button"
          className="perm-open-button"
          onClick={() => void window.dpApi.requestPermission(pane)}
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}
