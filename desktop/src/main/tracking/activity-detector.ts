// Detección de la actividad en primer plano. La implementación real
// (get-windows / active-win) llegará más adelante; de momento existe un
// detector simulado en mock-detector.ts con la misma interfaz.

/** Una lectura puntual de la aplicación/ventana activa. */
export interface ActivitySample {
  app: string;
  windowTitle?: string;
  /** Dominio (no URL completa) si la app activa es un navegador. */
  domain?: string;
}

export interface ActivityDetector {
  /** Devuelve la actividad en primer plano, o null si no se puede detectar. */
  sample(): Promise<ActivitySample | null>;
}
