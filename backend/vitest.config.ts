import path from 'node:path';
import dotenv from 'dotenv';
import { defineConfig } from 'vitest/config';

const parsed = dotenv.config({ path: path.resolve(__dirname, '.env.test') }).parsed ?? {};

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
