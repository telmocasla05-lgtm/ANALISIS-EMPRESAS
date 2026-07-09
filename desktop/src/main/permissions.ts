// Permisos de macOS que necesita el tracking pasivo:
//  - Grabación de pantalla → sin él, get-windows devuelve el título vacío
//    (no se graba nada: macOS agrupa la lectura de títulos bajo ese permiso).
//  - Accesibilidad → sin él no llega la URL del navegador y no hay dominio.
// En Windows/Linux no hace falta ninguno.
import { shell, systemPreferences } from 'electron';
import type { PermissionsStatus } from '../common/ipc-contract';
import { loadGetWindows } from './tracking/load-get-windows';

export function getPermissionsStatus(): PermissionsStatus {
  if (process.platform !== 'darwin') {
    return { required: false, accessibility: true, screenRecording: true };
  }
  return {
    required: true,
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
    screenRecording: systemPreferences.getMediaAccessStatus('screen') === 'granted',
  };
}

/**
 * Registra la app en la lista del permiso (para que aparezca con su interruptor)
 * y abre el panel correspondiente de Ajustes del Sistema.
 */
export async function requestPermission(pane: 'accessibility' | 'screenRecording'): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (pane === 'accessibility') {
    // true → macOS muestra su aviso y añade la app a la lista de Accesibilidad
    systemPreferences.isTrustedAccessibilityClient(true);
  } else {
    // No hay API directa para registrarse en Grabación de pantalla: una lectura
    // de get-windows con el check activo (opciones por defecto) dispara el
    // aviso del sistema y añade la app a la lista. Sin el permiso, la llamada
    // falla — solo interesaba el efecto secundario del registro.
    try {
      const { activeWindow } = await loadGetWindows();
      await activeWindow();
    } catch {
      // esperado mientras el permiso no esté concedido
    }
  }
  const target = pane === 'accessibility' ? 'Privacy_Accessibility' : 'Privacy_ScreenCapture';
  await shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${target}`);
}
