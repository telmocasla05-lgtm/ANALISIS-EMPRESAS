import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // En desarrollo el panel habla con la API local por el proxy (mismo origen);
    // en producción se decidirá hosting (Vercel + CORS o servido junto al backend).
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
