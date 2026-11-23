const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radar', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:set', s),
  lastScan: () => ipcRenderer.invoke('scan:last'),
  runScan: () => ipcRenderer.invoke('scan:run'),
  guide: () => ipcRenderer.invoke('guide:get'),
  open: (url) => ipcRenderer.invoke('open:external', url),
  onProgress: (fn) => ipcRenderer.on('scan:progress', (_e, p) => fn(p)),
  onResult: (fn) => ipcRenderer.on('scan:result', (_e, r) => fn(r)),
  onError: (fn) => ipcRenderer.on('scan:error', (_e, m) => fn(m)),
});
