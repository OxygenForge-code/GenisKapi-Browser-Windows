const { app, BrowserWindow, BrowserView, ipcMain, session, Menu } = require('electron');
const path = require('path');

const filter = { urls: ['*://*/*'] };
const blocked = new Set(['doubleclick.net','googlesyndication.com','googleadservices.com','adnxs.com','adsrvr.org','scorecardresearch.com','zedo.com']);

function shouldBlock(url) {
  try { return blocked.has(new URL(url).hostname.replace(/^www\./, '')) || [...blocked].some(d => new URL(url).hostname.endsWith('.'+d)); }
  catch { return false; }
}

let win;
let view;

function createWindow() {
  win = new BrowserWindow({ width: 1440, height: 900, minWidth: 900, minHeight: 600, backgroundColor: '#08111f', title: 'GenişKapı Browser', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  view = new BrowserView({ webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  win.setBrowserView(view);
  view.setBounds({ x: 0, y: 96, width: win.getBounds().width, height: win.getBounds().height - 96 });
  view.setAutoResize({ width: true, height: true });
  view.webContents.loadURL('https://www.google.com/');
  win.loadFile(path.join(__dirname, 'ui.html'));
  win.on('resize', () => { const b = win.getBounds(); view.setBounds({ x:0, y:96, width:b.width, height:b.height-96 }); });
  view.webContents.on('did-navigate', (_, url) => win.webContents.send('page-url', url));
  view.webContents.on('did-navigate-in-page', (_, url) => win.webContents.send('page-url', url));
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => callback({ cancel: shouldBlock(details.url) }));
  createWindow();
  const menu = Menu.buildFromTemplate([{ label:'GenişKapı', submenu:[{role:'about'},{role:'quit'}] }, { label:'Görünüm', submenu:[{role:'toggledevtools'},{role:'reload'},{role:'togglefullscreen'}] }]);
  Menu.setApplicationMenu(menu);
});

ipcMain.handle('navigate', (_, value) => { let u=value.trim(); if (!/^https?:\/\//i.test(u)) u='https://www.google.com/search?q='+encodeURIComponent(u); return view.webContents.loadURL(u); });
ipcMain.handle('back', () => view.webContents.goBack());
ipcMain.handle('forward', () => view.webContents.goForward());
ipcMain.handle('reload', () => view.webContents.reload());
ipcMain.handle('home', () => view.webContents.loadURL('https://www.google.com/'));
ipcMain.handle('new-window', () => { const w=new BrowserWindow({width:1200,height:800,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}}); w.loadURL('https://www.google.com/'); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
