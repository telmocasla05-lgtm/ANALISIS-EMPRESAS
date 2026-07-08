// Proceso principal de Electron: ventana de fichaje e IPC. El tracking pasivo
// real (get-windows), la inactividad con aviso y el icono de bandeja llegarán
// en iteraciones posteriores de la Fase B.
import path from 'node:path';
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipc';

// Carpeta de datos propia también en desarrollo (por defecto sería "Electron"
// y la config del dispositivo chocaría con la de otras apps Electron en dev)
app.setPath('userData', path.join(app.getPath('appData'), 'digital-power-desktop'));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'Digital Power — Fichaje',
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServerUrl = process.env.ELECTRON_RENDERER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Ordenadores compartidos: al cerrar la ventana se cierra la app entera.
// Si había turno abierto sin OFF, el siguiente ON lo reanuda (409 del backend).
app.on('window-all-closed', () => {
  app.quit();
});
