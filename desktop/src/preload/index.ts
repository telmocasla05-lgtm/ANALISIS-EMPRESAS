// Puente seguro entre renderer y main. Corre con sandbox: solo puede requerir
// 'electron', por eso del contrato IPC se importan únicamente tipos.
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type { DeviceConfig, DpApi, TrackerStatus } from '../common/ipc-contract';

const dpApi: DpApi = {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (config: DeviceConfig) => ipcRenderer.invoke('config:set', config),
  listEmpleados: () => ipcRenderer.invoke('empleados:list'),
  loginPin: (employeeId: string, pin: string) => ipcRenderer.invoke('auth:pin', { employeeId, pin }),
  sesionOn: () => ipcRenderer.invoke('sesion:on'),
  sesionOff: () => ipcRenderer.invoke('sesion:off'),
  sesionCancel: () => ipcRenderer.invoke('sesion:cancel'),
  onTrackerStatus: (listener) => {
    const handler = (_event: IpcRendererEvent, status: TrackerStatus) => listener(status);
    ipcRenderer.on('tracker:status', handler);
    return () => {
      ipcRenderer.removeListener('tracker:status', handler);
    };
  },
};

contextBridge.exposeInMainWorld('dpApi', dpApi);
