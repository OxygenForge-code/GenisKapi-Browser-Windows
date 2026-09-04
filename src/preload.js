const { contextBridge, ipcRenderer } = require('electron');

const listen = (channel, cb) => ipcRenderer.on(channel, (_, payload) => cb(payload));

contextBridge.exposeInMainWorld('geniskapi', {
  navigate: value => ipcRenderer.invoke('navigate', value),
  back: () => ipcRenderer.invoke('back'),
  forward: () => ipcRenderer.invoke('forward'),
  reload: () => ipcRenderer.invoke('reload'),
  home: () => ipcRenderer.invoke('home'),
  newWindow: () => ipcRenderer.invoke('new-window'),
  onUrl: cb => listen('page-url', cb),
  onLoading: cb => listen('page-loading', value => cb(Boolean(value))),
  onDownloadStarted: cb => listen('download-started', cb),
  onDownloadProgress: cb => listen('download-progress', cb),
  onDownloadFinished: cb => listen('download-finished', cb),
  openDevTools: () => ipcRenderer.invoke('open-devtools'),
  showMenu: () => ipcRenderer.invoke('show-menu'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close')
});
