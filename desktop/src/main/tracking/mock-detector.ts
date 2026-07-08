// Detector simulado para desarrollo: rota entre actividades plausibles de una
// clínica (coinciden con las reglas del seed de la Clínica Demo, así el
// backend las categoriza) sin leer nada del sistema.
import type { ActivityDetector, ActivitySample } from './activity-detector';

const SAMPLES: ActivitySample[] = [
  { app: 'Excel', windowTitle: 'Facturas_Enero.xlsx' },
  { app: 'Outlook', windowTitle: 'Bandeja de entrada' },
  { app: 'Gestión Clínica', windowTitle: 'Agenda del día' },
  { app: 'Chrome', windowTitle: 'WhatsApp Web', domain: 'web.whatsapp.com' },
  { app: 'Excel', windowTitle: 'Pacientes_pendientes.xlsx' },
];

/** Lecturas seguidas con la misma actividad antes de pasar a la siguiente. */
const SAMPLES_PER_ACTIVITY = 4;

export class MockActivityDetector implements ActivityDetector {
  private tick = 0;

  sample(): Promise<ActivitySample | null> {
    const index = Math.floor(this.tick / SAMPLES_PER_ACTIVITY) % SAMPLES.length;
    this.tick += 1;
    return Promise.resolve(SAMPLES[index]);
  }
}
