import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

// CSP estricta solo en el build: en dev bloquearía el runtime de Vite/react-refresh.
// El renderer no llama a la red (todo va por IPC); https: en img-src es para avatares.
const CSP_META =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: https:" />';

function injectCsp(): PluginOption {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<head>', `<head>\n    ${CSP_META}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), injectCsp()],
  // Rutas relativas para que el build funcione bajo file:// en la app empaquetada
  base: './',
  build: { outDir: 'dist/renderer' },
  server: { port: 5174, strictPort: true },
});
