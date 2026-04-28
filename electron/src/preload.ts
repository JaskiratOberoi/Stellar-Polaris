import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('stellarElectron', {
  /** Reserved for future IPC (e.g. open external links). */
  version: 1,
});
