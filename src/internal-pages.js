const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const JsonStore = require('./core/json-store');
const HistoryStore = require('./state/history-store');
const BookmarkStore = require('./state/bookmark-store');

let historyStore;
let bookmarkStore;
const downloadItems = [];

function stores() {
  if (!historyStore) {
    const data = app.getPath('userData');
    historyStore = new HistoryStore(new JsonStore(path.join(data, 'history.json'), { items: [] }));
    bookmarkStore = new BookmarkStore(new JsonStore(path.join(data, 'bookmarks.json'), { items: [] }));
  }
  return { historyStore, bookmarkStore };
}

function activeView() {
  const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
  return win && win.getBrowserView ? win.getBrowserView() : null;
}

function openPage(page) {
  const view = activeView();
  if (!view) return false;
  const allowed = new Set(['history', 'bookmarks', 'downloads', 'extensions']);
  if (!allowed.has(page)) return false;
  return view.webContents.loadFile(path.join(__dirname, 'pages', `${page}.html`)).then(() => true).catch(() => false);
}

function registerInternalPages() {
  stores();
  ipcMain.handle('internal-open', (_, page) => openPage(String(page || '')));
  ipcMain.handle('history-list', (_, query = '') => query ? stores().historyStore.search(query) : stores().historyStore.list());
  ipcMain.handle('history-clear', () => { stores().historyStore.clear(); return true; });
  ipcMain.handle('history-add', (_, entry) => stores().historyStore.add(entry || {}));
  ipcMain.handle('bookmarks-list', (_, folder = null) => stores().bookmarkStore.list(folder || null));
  ipcMain.handle('bookmark-add', (_, item) => stores().bookmarkStore.add(item || {}));
  ipcMain.handle('bookmark-remove', (_, url) => { stores().bookmarkStore.remove(String(url || '')); return true; });
  ipcMain.handle('bookmark-find', (_, url) => stores().bookmarkStore.find(String(url || '')));
  ipcMain.handle('downloads-list', () => downloadItems.slice().reverse());
  ipcMain.handle('extensions-page-list', () => {
    const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
    return mainWindow ? mainWindow.webContents.executeJavaScript('window.geniskapi?.getExtensions?.() || []', true).catch(() => []) : [];
  });
}

module.exports = { registerInternalPages, downloadItems };
