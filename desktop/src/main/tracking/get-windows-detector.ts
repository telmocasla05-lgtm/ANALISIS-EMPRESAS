// Detector real de ventana activa sobre get-windows (el sucesor oficial de
// active-win: mismo autor, active-win quedó congelada en la 9.0.0 en 2024 y
// deprecada con "Renamed to get-windows"). En macOS usa un binario universal
// precompilado y en Windows un addon N-API precompilado: no hay que recompilar
// nada para Electron.
//
// Privacidad: de cada lectura solo salen app, título de ventana y dominio.
// La URL completa del navegador (que get-windows da en macOS) se reduce a su
// hostname aquí mismo y no se guarda ni se envía jamás. Nunca se capturan
// contenido ni pulsaciones de teclado.
import type { PermissionsStatus } from '../../common/ipc-contract';
import type { ActivityDetector, ActivitySample } from './activity-detector';
import { loadGetWindows } from './load-get-windows';

export class GetWindowsDetector implements ActivityDetector {
  /** El estado de permisos se consulta en cada lectura: si se conceden a mitad
   *  de turno, el título/dominio empiezan a llegar sin reiniciar nada. */
  constructor(private readonly getPermissions: () => PermissionsStatus) {}

  async sample(): Promise<ActivitySample | null> {
    const { activeWindow } = await loadGetWindows();
    // En macOS, cada check de permiso se desactiva mientras el permiso falte:
    // con el check activo y el permiso denegado el binario falla entero (en
    // vez de degradar) y además macOS relanzaría su aviso en cada lectura.
    // Pedir los permisos es trabajo de la pantalla guiada, no del muestreo.
    // Sin Grabación de pantalla no hay título; sin Accesibilidad no hay URL.
    const permissions = this.getPermissions();
    const win = await activeWindow({
      screenRecordingPermission: permissions.screenRecording,
      accessibilityPermission: permissions.accessibility,
    });
    if (!win) return null;
    const app = win.owner.name.trim();
    if (!app) return null;
    return {
      app,
      windowTitle: win.title || undefined,
      // url solo existe en macOS y para navegadores conocidos (Safari, Chrome,
      // Edge, Brave, Opera, Vivaldi…). En Windows get-windows no expone la URL:
      // allí el dominio queda vacío y categorizan las reglas APP/TITLE.
      domain: win.platform === 'macos' && win.url ? domainFromUrl(win.url) : undefined,
    };
  }
}

/** Reduce una URL a su dominio; cualquier otra parte (ruta, query…) se descarta. */
function domainFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}
