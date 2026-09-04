const path = require('path');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const JsonStore = require('./core/json-store');
const HistoryStore = require('./state/history-store');
const BookmarkStore = require('./state/bookmark-store');

let historyStore;
let bookmarkStore;
const downloadItems = [];
const hookedViews = new WeakSet();
const injectedWindows = new WeakSet();
const INTERNAL = new Set(['history', 'bookmarks', 'downloads', 'extensions']);

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

function pageName(url) {
  try { return new URL(url).pathname.split('/').pop().replace(/\.html$/, ''); } catch { return ''; }
}

function openPage(page) {
  const view = activeView();
  if (!view || !INTERNAL.has(page)) return false;
  return view.webContents.loadFile(path.join(__dirname, 'pages', `${page}.html`)).then(() => true).catch(() => false);
}

function hydrate(view, page) {
  const wc = view.webContents;
  const payload = {
    history: stores().historyStore.list(),
    bookmarks: stores().bookmarkStore.list(),
    downloads: downloadItems.slice().reverse(),
    extensions: session.defaultSession.getAllExtensions().map(x => ({ id: x.id, name: x.name, version: x.version, manifestVersion: x.manifestVersion }))
  };
  const encoded = JSON.stringify(payload).replace(/</g, '\\u003c');
  const js = `(()=>{const data=${encoded};const esc=s=>String(s??'').replace(/[&<>\\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\\\':'&#92;'}[c]));const p=${JSON.stringify(page)};const list=document.querySelector('#list');if(!list)return;const render=()=>{if(p==='history'){const q=(document.querySelector('#q')?.value||'').toLowerCase();const rows=data.history.filter(x=>(x.title+x.url).toLowerCase().includes(q));list.innerHTML=rows.length?rows.map(x=>'<article class="item" data-open="'+encodeURIComponent(x.url)+'"><div class="title">'+esc(x.title)+'</div><div class="url">'+esc(x.url)+'</div><div class="time">'+new Date(x.timestamp).toLocaleString('tr-TR')+'</div></article>').join(''):'<div class="empty">Geçmiş kaydı yok.</div>';document.querySelectorAll('[data-open]').forEach(e=>e.onclick=()=>location.href=decodeURIComponent(e.dataset.open))}else if(p==='bookmarks'){list.innerHTML=data.bookmarks.length?data.bookmarks.map(x=>'<article class="item"><div class="fav">★</div><div class="copy"><div class="title">'+esc(x.title)+'</div><div class="url">'+esc(x.url)+'</div></div><button class="open" data-open="'+encodeURIComponent(x.url)+'">Aç</button><button class="remove" data-remove="'+encodeURIComponent(x.url)+'">Sil</button></article>').join(''):'<div class="empty">Henüz yer imi yok.</div>';document.querySelectorAll('[data-open]').forEach(e=>e.onclick=()=>location.href=decodeURIComponent(e.dataset.open));document.querySelectorAll('[data-remove]').forEach(e=>e.onclick=()=>location.href='geniskapi-internal://bookmark-remove/'+e.dataset.remove)}else if(p==='downloads'){list.innerHTML=data.downloads.length?data.downloads.map(x=>'<article class="item"><div class="icon">↓</div><div class="copy"><div class="name">'+esc(x.filename||'Dosya')+'</div><div class="meta">'+esc(x.state||'başlatıldı')+' · '+esc(x.path||'')+'</div></div></article>').join(''):'<div class="empty">Henüz indirme yok.</div>'}else{list.innerHTML=data.extensions.length?data.extensions.map(x=>'<article class="item"><div class="icon">E</div><div class="copy"><div class="name">'+esc(x.name)+'</div><div class="meta">v'+esc(x.version)+' · Manifest '+esc(x.manifestVersion)+'</div></div><button class="remove" data-remove-ext="'+encodeURIComponent(x.id)+'">Kaldır</button></article>').join(''):'<div class="empty">Henüz yüklenmiş eklenti yok.<br><br><button class="store" onclick="location.href=\\'https://chromewebstore.google.com/\\'">Chrome Web Store\'u aç</button></div>';document.querySelectorAll('[data-remove-ext]').forEach(e=>e.onclick=()=>location.href='geniskapi-internal://extension-remove/'+e.dataset.removeExt)}};render();document.querySelector('#q')?.addEventListener('input',render);document.querySelector('#clear')?.addEventListener('click',()=>location.href='geniskapi-internal://history-clear')})()`;
  wc.executeJavaScript(js, true).catch(() => {});
}

function hookView(view) {
  if (!view || hookedViews.has(view)) return;
  hookedViews.add(view);
  const wc = view.webContents;
  wc.on('will-navigate', (event, url) => {
    if (!url.startsWith('geniskapi-internal://')) return;
    event.preventDefault();
    try {
      const u = new URL(url);
      const action = u.hostname;
      const value = decodeURIComponent(u.pathname.slice(1));
      if (action === 'history-clear') stores().historyStore.clear();
      if (action === 'bookmark-remove') stores().bookmarkStore.remove(value);
      if (action === 'extension-remove') session.defaultSession.removeExtension(value).catch(() => {});
      const page = pageName(wc.getURL());
      if (INTERNAL.has(page)) wc.loadFile(path.join(__dirname, 'pages', `${page}.html`));
    } catch {}
  });
  wc.on('did-finish-load', () => {
    const page = pageName(wc.getURL());
    if (INTERNAL.has(page)) hydrate(view, page);
  });
  wc.on('did-navigate', (_, url) => {
    if (/^https?:/i.test(url)) stores().historyStore.add({ url, title: wc.getTitle() || url });
  });
  wc.on('page-title-updated', (_, title) => {
    const url = wc.getURL();
    if (/^https?:/i.test(url)) stores().historyStore.add({ url, title });
  });
}

function injectUiNavigation(win) {
  if (!win || win.isDestroyed() || injectedWindows.has(win)) return;
  injectedWindows.add(win);
  const js = `(()=>{if(window.__gkInternalPages)return;window.__gkInternalPages=1;document.addEventListener('click',e=>{const b=e.target.closest?.('.sidebtn[data-panel]');if(!b)return;const p=b.dataset.panel;if(${JSON.stringify([...INTERNAL])}.includes(p)){e.preventDefault();e.stopImmediatePropagation();window.geniskapi?.openInternal?.(p)}},true)})()`;
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
