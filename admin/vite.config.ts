import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo el panel llama a /api y Vite lo redirige al backend local
// (puerto de backend/.env, 3001 por defecto). DP_API_PROXY permite apuntar a
// otro puerto sin tocar este archivo. En producción se usa VITE_API_URL.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env['DP_API_PROXY'] ?? 'http://localhost:3001',
    },
  },
});
