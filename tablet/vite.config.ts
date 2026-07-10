import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // En desarrollo la app habla con la API local por el proxy (mismo origen),
    // igual que en producción cuando se sirve junto al backend.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
