// window.dpApi la inyecta el preload (contextBridge)
import type { DpApi } from '../common/ipc-contract';

declare global {
  interface Window {
    dpApi: DpApi;
  }
}

export {};
