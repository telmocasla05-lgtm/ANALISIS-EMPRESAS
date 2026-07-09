// Puente seguro entre renderer y main. Corre con sandbox: solo puede requerir
// 'electron', por eso del contrato IPC se importan únicamente tipos.
import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import type {
  DeviceConfig,
  DpApi,
  IdleEvent,
  SesionClosedEvent,
  TrackerStatus,
} from '../common/ipc-contract';

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
  onSesionClosed: (listener) => {
    const handler = (_event: IpcRendererEvent, event: SesionClosedEvent) => listener(event);
    ipcRenderer.on('sesion:closed', handler);
    return () => {
      ipcRenderer.removeListener('sesion:closed', handler);
    };
  },
  onIdleEvent: (listener) => {
    const handler = (_event: IpcRendererEvent, event: IdleEvent) => listener(event);
    ipcRenderer.on('idle:event', handler);
    return () => {
      ipcRenderer.removeListener('idle:event', handler);
    };
  },
  idleConfirm: () => ipcRenderer.invoke('idle:confirm'),
  getPermissions: () => ipcRenderer.invoke('permissions:status'),
  requestPermission: (pane) => ipcRenderer.invoke('permissions:request', pane),
};

contextBridge.exposeInMainWorld('dpApi', dpApi);
