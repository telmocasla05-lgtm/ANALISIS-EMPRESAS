// Icono de bandeja mientras el tracking está activo (transparencia LOPDGDD:
// siempre visible cuando se registra actividad). Discreto: un punto, con menú
// para ver el estado, traer la ventana y hacer OFF rápido.
import path from 'node:path';
import { app, Menu, nativeImage, Tray } from 'electron';
import type { TrackerStatus } from '../common/ipc-contract';

export interface TrayOptions {
  employeeName: string;
  onShowWindow: () => void;
  onRequestOff: () => void;
}

let tray: Tray | null = null;
let options: TrayOptions | null = null;
let lastStatus: TrackerStatus | null = null;
let paused = false;
let offInProgress = false;

function iconPath(): string {
  // En macOS, imagen template (negro + alpha): la bandeja la tiñe según el tema.
  // En Windows/Linux, versión en color (un template negro se pierde en barras oscuras).
  const name = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray-color.png';
  return path.join(app.getAppPath(), 'assets', 'tray', name);
}

export function showTrackingTray(opts: TrayOptions): void {
  options = opts;
  lastStatus = null;
  paused = false;
  offInProgress = false;
  if (!tray) {
    const icon = nativeImage.createFromPath(iconPath());
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon);
  }
  rebuildMenu();
}

export function updateTrackingTray(status: TrackerStatus): void {
  if (!tray) return;
  lastStatus = status;
  rebuildMenu();
}

export function hideTrackingTray(): void {
  tray?.destroy();
  tray = null;
  options = null;
  lastStatus = null;
  paused = false;
  offInProgress = false;
}

/** Refleja la pausa por inactividad en el menú y el tooltip. */
export function setTrackingTrayPaused(value: boolean): void {
  if (!tray || paused === value) return;
  paused = value;
  rebuildMenu();
}

function statusLine(): string {
  if (!lastStatus || lastStatus.buffered === 0) return 'Registros al día';
  const base = `${lastStatus.buffered} registros pendientes de subir`;
  return lastStatus.lastError ? `${base} · sin conexión, se reintentará` : base;
}

function rebuildMenu(): void {
  if (!tray || !options) return;
  const opts = options;
  const headline = paused
    ? `En pausa por inactividad — ${opts.employeeName}`
    : `Registrando actividad — ${opts.employeeName}`;
  tray.setToolTip(`Digital Power — ${headline}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: headline, enabled: false },
      { label: statusLine(), enabled: false },
      { type: 'separator' },
      { label: 'Abrir la ventana de fichaje', click: () => opts.onShowWindow() },
      {
        label: offInProgress ? 'Cerrando turno…' : 'Terminar turno (OFF)',
        enabled: !offInProgress,
        click: () => {
          if (offInProgress) return;
          offInProgress = true;
          rebuildMenu();
          opts.onRequestOff();
        },
      },
    ]),
  );
}
