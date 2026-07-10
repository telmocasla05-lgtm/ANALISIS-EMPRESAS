// Configuración por dispositivo de la tablet, persistida en localStorage
// (equivalente al config.json del desktop): slug de la empresa y URL del
// servidor. `?empresa=<slug>` en la URL permite aprovisionar el dispositivo
// sin tocar la pantalla de configuración.
export interface TabletConfig {
  slug: string;
  serverUrl: string;
}

// URL del servidor por defecto, fijada en build con VITE_API_URL (en Vercel,
// el backend de Railway). Vacía = mismo origen: el caso de desarrollo con el
// proxy de Vite o de un build servido junto al backend.
export const DEFAULT_SERVER_URL: string = import.meta.env['VITE_API_URL'] ?? '';

const CONFIG_KEY = 'dp-tablet:config';

function readStored(): TabletConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TabletConfig>;
    if (typeof parsed.slug !== 'string' || !parsed.slug) return null;
    return {
      slug: parsed.slug,
      serverUrl:
        typeof parsed.serverUrl === 'string' && parsed.serverUrl !== '' ? parsed.serverUrl : DEFAULT_SERVER_URL,
    };
  } catch {
    return null;
  }
}

export function loadConfig(): TabletConfig | null {
  const stored = readStored();
  const slugParam = new URLSearchParams(window.location.search).get('empresa');
  if (slugParam) {
    const config: TabletConfig = { slug: slugParam, serverUrl: stored?.serverUrl ?? DEFAULT_SERVER_URL };
    saveConfig(config);
    return config;
  }
  return stored;
}

export function saveConfig(config: TabletConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
}
