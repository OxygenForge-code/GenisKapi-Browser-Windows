const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('geniskapi', {
  navigate: value => ipcRenderer.invoke('navigate', value),
  back: () => ipcRenderer.invoke('back'),
  forward: () => ipcRenderer.invoke('forward'),
  reload: () => ipcRenderer.invoke('reload'),
  home: () => ipcRenderer.invoke('home'),
  newWindow: () => ipcRenderer.invoke('new-window'),
  onUrl: cb => ipcRenderer.on('page-url', (_, url) => cb(url)),
  onLoading: cb => ipcRenderer.on('page-loading', (_, loading) => cb(Boolean(loading))),
  onDownloadStarted: cb => ipcRenderer.on('download-started', (_, data) => cb(data)),
  onDownloadProgress: cb => ipcRenderer.on('download-progress', (_, data) => cb(data)),
  onDownloadFinished: cb => ipcRenderer.on('download-finished', (_, data) => cb(data))
});
