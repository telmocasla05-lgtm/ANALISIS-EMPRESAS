// Proceso principal de Electron (FASE B pendiente).
// Aquí irán: login por PIN + pantalla ON/OFF, tracking pasivo con librería
// de ventana activa (tipo active-win / get-windows), detección de
// inactividad con aviso, e icono en la bandeja del sistema.
import { app } from 'electron';

app.whenReady().then(() => {
  console.log('Digital Power — desktop: esqueleto inicial, sin lógica todavía.');
  app.quit();
});
