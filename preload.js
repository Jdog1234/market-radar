const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('radar', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:set', s),
  lastScan: () => ipcRenderer.invoke('scan:last'),
  runScan: () => ipcRenderer.invoke('scan:run'),
  search: (q) => ipcRenderer.invoke('stock:search', q),
  lookup: (sym) => ipcRenderer.invoke('stock:lookup', sym),
  trackRecord: () => ipcRenderer.invoke('track:get'),
  guide: () => ipcRenderer.invoke('guide:get'),
  open: (url) => ipcRenderer.invoke('open:external', url),
  appInfo: () => ipcRenderer.invoke('app:info'),
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkUpdates: () => ipcRenderer.invoke('update:check'),
  restartToUpdate: () => ipcRenderer.invoke('update:restart'),
  openInstallerPage: () => ipcRenderer.invoke('update:installer'),
  onUpdate: (fn) => ipcRenderer.on('update:status', (_e, s) => fn(s)),
  onProgress: (fn) => ipcRenderer.on('scan:progress', (_e, p) => fn(p)),
  onResult: (fn) => ipcRenderer.on('scan:result', (_e, r) => fn(r)),
  onError: (fn) => ipcRenderer.on('scan:error', (_e, m) => fn(m)),
});
