const path = require('path');
const { app, BrowserWindow, BrowserView, ipcMain, session } = require('electron');
const JsonStore = require('./core/json-store');
const HistoryStore = require('./state/history-store');
const BookmarkStore = require('./state/bookmark-store');

let historyStore;
let bookmarkStore;
const downloadItems = [];
const hookedViews = new WeakSet();
const injectedWindows = new WeakSet();

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

function hookView(view) {
  if (!view || hookedViews.has(view)) return;
  hookedViews.add(view);
  const wc = view.webContents;
  wc.on('did-navigate', (_, url) => {
    if (/^(https?|file):/i.test(url) && !url.includes('/pages/')) {
      stores().historyStore.add({ url, title: wc.getTitle() || url });
    }
  });
  wc.on('page-title-updated', (_, title) => {
    const url = wc.getURL();
    if (/^https?:/i.test(url)) stores().historyStore.add({ url, title });
  });
}

function injectUiNavigation(win) {
  if (!win || win.isDestroyed() || injectedWindows.has(win)) return;
  injectedWindows.add(win);
  const js = `(()=>{if(window.__gkInternalPages)return;window.__gkInternalPages=1;document.addEventListener('click',e=>{const b=e.target.closest?.('.sidebtn[data-panel]');if(!b)return;const p=b.dataset.panel;if(['history','bookmarks','downloads','extensions'].includes(p)){e.preventDefault();e.stopImmediatePropagation();window.geniskapi?.openInternal?.(p)}},true)})()`;
  win.webContents.executeJavaScript(js, true).catch(() => {});
}

function monitor() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    injectUiNavigation(win);
    const view = win.getBrowserView && win.getBrowserView();
    if (view) hookView(view);
  }
}

function registerInternalPages() {
  stores();
  session.defaultSession.on('will-download', (_, item) => {
    const record = { filename: item.getFilename(), path: item.getSavePath(), state: 'progressing', startedAt: Date.now() };
    downloadItems.push(record);
    item.on('updated', () => { record.state = 'progressing'; record.receivedBytes = item.getReceivedBytes(); record.totalBytes = item.getTotalBytes(); });
    item.once('done', (_, state) => { record.state = state; record.finishedAt = Date.now(); record.path = item.getSavePath(); });
    if (downloadItems.length > 200) downloadItems.shift();
  });
  ipcMain.handle('internal-open', (_, page) => openPage(String(page || '')));
  ipcMain.handle('history-list', (_, query = '') => query ? stores().historyStore.search(query) : stores().historyStore.list());
  ipcMain.handle('history-clear', () => { stores().historyStore.clear(); return true; });
  ipcMain.handle('history-add', (_, entry) => stores().historyStore.add(entry || {}));
  ipcMain.handle('bookmarks-list', (_, folder = null) => stores().bookmarkStore.list(folder || null));
  ipcMain.handle('bookmark-add', (_, item) => stores().bookmarkStore.add(item || {}));
  ipcMain.handle('bookmark-remove', (_, url) => { stores().bookmarkStore.remove(String(url || '')); return true; });
  ipcMain.handle('bookmark-find', (_, url) => stores().bookmarkStore.find(String(url || '')));
  ipcMain.handle('downloads-list', () => downloadItems.slice().reverse());
  setInterval(monitor, 1000).unref();
}

module.exports = { registerInternalPages, downloadItems };
