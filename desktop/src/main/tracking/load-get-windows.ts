// Carga perezosa y cacheada de get-windows.
// get-windows es ESM puro y este paquete compila a CommonJS: un require()
// fallaría con ERR_REQUIRE_ESM. new Function impide que tsc transpile el
// import() dinámico a require, así que llega a Node como import real.
export type GetWindowsModule = typeof import('get-windows');

const importGetWindows = new Function('return import("get-windows")') as () => Promise<GetWindowsModule>;

let cached: Promise<GetWindowsModule> | null = null;

export function loadGetWindows(): Promise<GetWindowsModule> {
  cached ??= importGetWindows();
  return cached;
}
