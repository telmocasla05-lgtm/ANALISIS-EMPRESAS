// Configuración del dispositivo (empresa + servidor), persistida como JSON
// en la carpeta de datos de usuario de la app.
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { DeviceConfig } from '../common/ipc-contract';

function configPath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

export const DEFAULT_SAMPLE_INTERVAL_SECONDS = 5;
const MIN_SAMPLE_INTERVAL_SECONDS = 5;
// El backend estima duraciones con tope de 10 s entre lecturas (SAMPLE_CAP_SECONDS):
// por encima de 10 s se perdería tiempo en el resumen.
const MAX_SAMPLE_INTERVAL_SECONDS = 10;

export function clampSampleInterval(value: unknown): number {
  const parsed =
    typeof value === 'number' && Number.isFinite(value)
      ? Math.round(value)
      : DEFAULT_SAMPLE_INTERVAL_SECONDS;
  return Math.min(MAX_SAMPLE_INTERVAL_SECONDS, Math.max(MIN_SAMPLE_INTERVAL_SECONDS, parsed));
}

export function readConfig(): DeviceConfig | null {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<DeviceConfig>;
    if (typeof parsed.apiBaseUrl === 'string' && typeof parsed.companySlug === 'string') {
      return {
        apiBaseUrl: parsed.apiBaseUrl,
        companySlug: parsed.companySlug,
        sampleIntervalSeconds: clampSampleInterval(parsed.sampleIntervalSeconds),
      };
    }
    return null;
  } catch {
    // Sin config todavía (primer arranque) o JSON corrupto: se pide de nuevo
    return null;
  }
}

export function writeConfig(config: DeviceConfig): void {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
}
