// Copia en disco del buffer de registros pendientes de subir: si la app se
// cierra o el equipo se apaga con lecturas sin subir, se recuperan en el
// siguiente turno (la ingesta del backend acepta registros de sesiones ya
// cerradas mientras pertenezcan al empleado del token).
//
// JSON plano en vez de SQLite a propósito: el volumen máximo es pequeño
// (≤ MAX_BUFFERED_RECORDS ≈ unos cientos de KB), la escritura atómica
// (tmp + rename) da la misma garantía frente a cortes, y así no hay módulos
// nativos que recompilar para cada versión de Electron.
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { RegistroInput } from '@digital-power/shared';

export interface PendingBatch {
  sessionId: string;
  employeeId: string;
  savedAt: string;
  registros: RegistroInput[];
}

function pendingDir(): string {
  return path.join(app.getPath('userData'), 'pending');
}

function batchPath(sessionId: string): string {
  // El id viene del backend (cuid), pero se sanea por defensa: nunca debe
  // poder salirse del directorio de pendientes.
  return path.join(pendingDir(), `${sessionId.replace(/[^a-zA-Z0-9_-]/g, '')}.json`);
}

/** Espejo en disco del buffer de la sesión activa. Los fallos de disco no rompen
 *  el tracking: el buffer en memoria sigue siendo la fuente de verdad. */
export class BufferStore {
  constructor(
    private readonly sessionId: string,
    private readonly employeeId: string,
  ) {}

  persist(registros: RegistroInput[]): void {
    try {
      if (registros.length === 0) {
        this.discard();
        return;
      }
      const batch: PendingBatch = {
        sessionId: this.sessionId,
        employeeId: this.employeeId,
        savedAt: new Date().toISOString(),
        registros,
      };
      fs.mkdirSync(pendingDir(), { recursive: true });
      const target = batchPath(this.sessionId);
      fs.writeFileSync(`${target}.tmp`, JSON.stringify(batch), 'utf8');
      fs.renameSync(`${target}.tmp`, target);
    } catch {
      // Solo es la red de seguridad: si el disco falla se sigue en memoria
    }
  }

  discard(): void {
    deletePendingBatch(this.sessionId);
  }
}

function readBatchFile(filePath: string): PendingBatch | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<PendingBatch>;
    if (
      typeof parsed.sessionId === 'string' &&
      typeof parsed.employeeId === 'string' &&
      Array.isArray(parsed.registros) &&
      parsed.registros.length > 0
    ) {
      return {
        sessionId: parsed.sessionId,
        employeeId: parsed.employeeId,
        savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
        registros: parsed.registros,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Lote pendiente de una sesión concreta (p. ej. una sesión reanudada tras un
 *  cierre inesperado). No lo borra: el BufferStore de la nueva sesión lo
 *  sobreescribirá con el buffer completo en el siguiente muestreo. */
export function readPendingBatch(sessionId: string): PendingBatch | null {
  return readBatchFile(batchPath(sessionId));
}

/** Todos los lotes pendientes en disco (sesiones anteriores sin subir del todo). */
export function listPendingBatches(): PendingBatch[] {
  try {
    return fs
      .readdirSync(pendingDir())
      .filter((name) => name.endsWith('.json'))
      .map((name) => readBatchFile(path.join(pendingDir(), name)))
      .filter((batch): batch is PendingBatch => batch !== null);
  } catch {
    // El directorio aún no existe: no hay pendientes
    return [];
  }
}

export function deletePendingBatch(sessionId: string): void {
  try {
    fs.rmSync(batchPath(sessionId), { force: true });
  } catch {
    // Si no se puede borrar se reintentará su subida (duplicado potencial,
    // ver la nota de idempotencia en docs/PENDIENTE.md)
  }
}

/** Aparta un lote imposible de subir (la sesión ya no existe en el backend):
 *  se conserva el dato en disco pero se deja de reintentar. */
export function archivePendingBatch(sessionId: string): void {
  try {
    const dir = path.join(pendingDir(), 'descartados');
    fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(batchPath(sessionId), path.join(dir, path.basename(batchPath(sessionId))));
  } catch {
    // Si falla, el lote seguirá en pendientes y se reintentará
  }
}
