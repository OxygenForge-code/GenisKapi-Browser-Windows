const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('geniskapi', {
  navigate: value => ipcRenderer.invoke('navigate', value),
  back: () => ipcRenderer.invoke('back'),
  forward: () => ipcRenderer.invoke('forward'),
  reload: () => ipcRenderer.invoke('reload'),
  home: () => ipcRenderer.invoke('home'),
  newWindow: () => ipcRenderer.invoke('new-window'),
  onUrl: cb => ipcRenderer.on('page-url', (_, url) => cb(url))
});
