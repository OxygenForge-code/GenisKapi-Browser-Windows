const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('geniskapi', {
  navigate: value => ipcRenderer.invoke('navigate', value),
  back: () => ipcRenderer.invoke('back'),
  forward: () => ipcRenderer.invoke('forward'),
  reload: () => ipcRenderer.invoke('reload'),
  home: () => ipcRenderer.invoke('home'),
  newWindow: () => ipcRenderer.invoke('new-window'),
  newTab: () => ipcRenderer.invoke('tab-new'),
  selectTab: id => ipcRenderer.invoke('tab-select', id),
  closeTab: id => ipcRenderer.invoke('tab-close', id),
  duplicateTab: id => ipcRenderer.invoke('tab-duplicate', id),
  getTabs: () => ipcRenderer.invoke('tab-list'),
  onTabs: cb => ipcRenderer.on('tabs-updated', (_, tabs) => cb(tabs)),
  onUrl: cb => ipcRenderer.on('page-url', (_, data) => cb(data)),
  onTitle: cb => ipcRenderer.on('page-title', (_, data) => cb(data)),
  onLoading: cb => ipcRenderer.on('page-loading', (_, data) => cb(data)),
  onActiveTab: cb => ipcRenderer.on('active-tab', (_, id) => cb(id)),
  onDownloadStarted: cb => ipcRenderer.on('download-started', (_, data) => cb(data)),
  onDownloadProgress: cb => ipcRenderer.on('download-progress', (_, data) => cb(data)),
  onDownloadFinished: cb => ipcRenderer.on('download-finished', (_, data) => cb(data))
});
