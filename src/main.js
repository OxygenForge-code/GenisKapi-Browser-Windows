const { app, BrowserWindow, BrowserView, ipcMain, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const filter = { urls: ['*://*/*'] };
const blocked = new Set(['doubleclick.net','googlesyndication.com','googleadservices.com','adnxs.com','adsrvr.org','scorecardresearch.com','zedo.com']);

function shouldBlock(url) {
  try { return blocked.has(new URL(url).hostname.replace(/^www\./, '')) || [...blocked].some(d => new URL(url).hostname.endsWith('.'+d)); }
  catch { return false; }
}

let win;
let view;

function chromeLikeUserAgent() {
  const chromeVersion = process.versions.chrome || '138.0.0.0';
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#08111f',
    title: 'GenişKapı Browser',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  view = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  view.webContents.setUserAgent(chromeLikeUserAgent());
  win.setBrowserView(view);
  view.setBounds({ x: 0, y: 96, width: win.getBounds().width, height: win.getBounds().height - 96 });
  view.setAutoResize({ width: true, height: true });

  view.webContents.loadURL('https://www.google.com/');
  win.loadFile(path.join(__dirname, 'ui.html'));

  win.webContents.on('did-finish-load', () => {
    try {
      const css = fs.readFileSync(path.join(__dirname, 'animations.css'), 'utf8');
      win.webContents.insertCSS(css).catch(() => {});
    } catch {}
  });

  win.on('resize', () => {
    const b = win.getBounds();
    view.setBounds({ x: 0, y: 96, width: b.width, height: b.height - 96 });
  });

  view.webContents.on('did-start-loading', () => win.webContents.send('page-loading', true));
  view.webContents.on('did-stop-loading', () => win.webContents.send('page-loading', false));
  view.webContents.on('did-navigate', (_, url) => win.webContents.send('page-url', url));
  view.webContents.on('did-navigate-in-page', (_, url) => win.webContents.send('page-url', url));

  session.defaultSession.on('will-download', (_, item) => {
    const filename = item.getFilename();
    const downloads = app.getPath('downloads');
    const target = path.join(downloads, filename);

    item.setSavePath(target);
    win.webContents.send('download-started', { filename, path: target });

    item.on('updated', (_, state) => {
      win.webContents.send('download-progress', {
        filename,
        state,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes()
      });
    });

    item.once('done', (_, state) => {
      win.webContents.send('download-finished', { filename, path: target, state });
    });
  });
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => callback({ cancel: shouldBlock(details.url) }));
  createWindow();

  const menu = Menu.buildFromTemplate([
    { label: 'GenişKapı', submenu: [{ role: 'about' }, { role: 'quit' }] },
    { label: 'Görünüm', submenu: [{ role: 'toggledevtools' }, { role: 'reload' }, { role: 'togglefullscreen' }] }
  ]);
  Menu.setApplicationMenu(menu);
});

ipcMain.handle('navigate', (_, value) => {
  let u = value.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://www.google.com/search?q=' + encodeURIComponent(u);
  return view.webContents.loadURL(u);
});
ipcMain.handle('back', () => view.webContents.goBack());
ipcMain.handle('forward', () => view.webContents.goForward());
ipcMain.handle('reload', () => view.webContents.reload());
ipcMain.handle('home', () => view.webContents.loadURL('https://www.google.com/'));
ipcMain.handle('new-window', () => {
  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });
  w.webContents.setUserAgent(chromeLikeUserAgent());
  w.loadURL('https://www.google.com/');
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
