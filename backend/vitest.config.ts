import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

const parsed = dotenv.config({ path: path.resolve(__dirname, '.env.test') }).parsed ?? {};

// El .env.test commiteado lleva la URL de una máquina concreta; en otra máquina
// (u otro CI) se sobreescribe con TEST_DATABASE_URL sin tocar el archivo.
if (process.env.TEST_DATABASE_URL) {
  parsed['DATABASE_URL'] = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    environment: 'node',
    env: parsed,
    // Los tests comparten una única BD de test (ver scripts/test-db-setup.sh);
    // ejecutarlos en paralelo provocaría que un truncate pisara los datos de otro.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
