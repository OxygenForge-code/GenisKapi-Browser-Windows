const { app, BrowserWindow, BrowserView, ipcMain, session, Menu, net } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome || '150.0.0.0'} Safari/537.36`;
const CWS_HOSTS = new Set(['chromewebstore.google.com', 'chrome.google.com']);
const filter = { urls: ['*://*/*'] };
const blocked = new Set(['doubleclick.net','googlesyndication.com','googleadservices.com','adnxs.com','adsrvr.org','scorecardresearch.com','zedo.com']);

let win;
let view;
let extensionStoreFile;
const extensions = new Map();

function shouldBlock(url) { try { const host=new URL(url).hostname.replace(/^www\\./,'').toLowerCase(); return blocked.has(host)||[...blocked].some(d=>host.endsWith('.'+d)); } catch { return false; } }
function isCwsUrl(url) { try { return CWS_HOSTS.has(new URL(url).hostname.toLowerCase()); } catch { return false; } }
function readInstalledExtensions() { try { if(!fs.existsSync(extensionStoreFile)) return []; const data=JSON.parse(fs.readFileSync(extensionStoreFile,'utf8')); return Array.isArray(data)?data:[]; } catch { return []; } }
function writeInstalledExtensions() { fs.mkdirSync(path.dirname(extensionStoreFile),{recursive:true}); fs.writeFileSync(extensionStoreFile,JSON.stringify([...extensions.values()],null,2),'utf8'); }
function uiProgress(payload) { win?.webContents.send('extension-install-progress',payload); }

function parseCrx(buffer) {
  const b=Buffer.from(buffer); if(b.length<16||b.subarray(0,4).toString()!=='Cr24')throw new Error('Geçersiz CRX paketi');
  const version=b.readUInt32LE(4);
  if(version===2){const pub=b.readUInt32LE(8),sig=b.readUInt32LE(12),offset=16+pub+sig;if(offset>=b.length)throw new Error('Bozuk CRX2 paketi');return b.subarray(offset);}
  if(version===3){const header=b.readUInt32LE(8),offset=12+header;if(offset>=b.length)throw new Error('Bozuk CRX3 paketi');return b.subarray(offset);}
  throw new Error(`Desteklenmeyen CRX sürümü: ${version}`);
}
function readManifest(dir){const file=path.join(dir,'manifest.json');if(!fs.existsSync(file))throw new Error('Uzantı manifest.json içermiyor');const manifest=JSON.parse(fs.readFileSync(file,'utf8'));if(!manifest.name||!manifest.version||!manifest.manifest_version)throw new Error('Geçersiz uzantı manifesti');if(![2,3].includes(Number(manifest.manifest_version)))throw new Error(`Manifest Version ${manifest.manifest_version} GenişKapı tarafından desteklenmiyor`);return manifest;}

function showExtensionIncompatibility(name, reason) {
  if (!win || win.isDestroyed()) return;
  const dialog = new BrowserWindow({width:520,height:430,minWidth:460,minHeight:380,parent:win,modal:true,resizable:false,backgroundColor:'#060b13',title:'GenişKapı • Eklenti uyumluluğu',webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});
  const params = new URLSearchParams({name:name||'Bu eklenti',reason:String(reason||'Uyumluluk denetimi başarısız.')});
  dialog.loadFile(path.join(__dirname,'extension-error.html'),{query:Object.fromEntries(params.entries())});
  dialog.setMenuBarVisibility(false);
}

async function downloadCrx(id){
  const url=`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(process.versions.chrome||'150.0.0.0')}&acceptformat=crx3,crx2&x=id%3D${encodeURIComponent(id)}%26uc`;
  const response=await net.fetch(url,{headers:{'User-Agent':CHROME_UA,Accept:'*/*'}}); if(!response.ok)throw new Error(`Chrome Web Store indirme başarısız (${response.status})`); return Buffer.from(await response.arrayBuffer());
}

async function installChromeWebStoreExtension(id,storeUrl=''){
  id=String(id||'').toLowerCase(); if(!/^[a-z]{32}$/.test(id))throw new Error('Geçerli Chrome Web Store uzantı kimliği bulunamadı'); if(extensions.has(id))return{ok:true,alreadyInstalled:true,extension:extensions.get(id)};
  uiProgress({id,stage:'download',progress:5,text:'Uzantı indiriliyor…'}); const crx=await downloadCrx(id); uiProgress({id,stage:'downloaded',progress:30,text:'Paket alındı'}); const zip=parseCrx(crx);
  const baseDir=path.join(app.getPath('userData'),'extensions'); const finalDir=path.join(baseDir,id); const tempDir=path.join(baseDir,`${id}.installing-${Date.now()}`); fs.mkdirSync(baseDir,{recursive:true}); fs.mkdirSync(tempDir,{recursive:true});
  let extensionName='Bu eklenti';
  try{
    new AdmZip(zip).extractAllTo(tempDir,true); const manifest=readManifest(tempDir); extensionName=manifest.name||extensionName; uiProgress({id,stage:'unpack',progress:60,text:'Uzantı hazırlanıyor…'});
    if(fs.existsSync(finalDir))fs.rmSync(finalDir,{recursive:true,force:true}); fs.renameSync(tempDir,finalDir);
    let loaded; try{loaded=await session.defaultSession.loadExtension(finalDir,{allowFileAccess:true});}catch(error){throw new Error(`GenişKapı bu uzantıyı yükleyemedi: ${error.message}`);}
    const record={id:loaded.id||id,name:extensionName,version:manifest.version,manifestVersion:manifest.manifest_version,path:finalDir,source:'Chrome Web Store',storeUrl:storeUrl||`https://chromewebstore.google.com/detail/${id}`}; extensions.set(record.id,record); writeInstalledExtensions();
    win?.webContents.send('extension-installed',record); uiProgress({id:record.id,stage:'done',progress:100,text:`${record.name} kuruldu`}); return{ok:true,extension:record};
  }catch(error){try{fs.rmSync(tempDir,{recursive:true,force:true});}catch{} try{fs.rmSync(finalDir,{recursive:true,force:true});}catch{} showExtensionIncompatibility(extensionName,error.message); win?.webContents.send('extension-install-error',{id,error:error.message,incompatible:true}); return{ok:false,incompatible:true,error:error.message};}
}

async function restoreExtensions(){
  for(const item of readInstalledExtensions()){
    try{if(!item.path||!fs.existsSync(item.path))continue;const manifest=readManifest(item.path);const loaded=await session.defaultSession.loadExtension(item.path,{allowFileAccess:true});extensions.set(loaded.id||item.id,{...item,id:loaded.id||item.id,name:manifest.name,version:manifest.version});}
    catch(error){console.warn('[GenişKapı] Uzantı yüklenemedi:',item.id,error.message);}
  } writeInstalledExtensions();
}

function injectCwsBridge(contents){
  contents.on('did-finish-load',async()=>{if(!isCwsUrl(contents.getURL()))return;const bridge=`(()=>{const getId=()=>{const m=location.pathname.match(/\\/detail\\/[^/]+\\/([a-z]{32})/i);return m?m[1].toLowerCase():null};const hideWarning=()=>document.querySelectorAll('body *').forEach(el=>{if(!(el instanceof HTMLElement)||el.children.length>4)return;const t=(el.innerText||'').trim();if(t&&t.length<180&&/(chrome|google chrome).*(gerek|gerekiyor|required|needed)/i.test(t))el.style.display='none'});const markButtons=()=>document.querySelectorAll('button,[role="button"],a').forEach(el=>{const t=(el.innerText||el.getAttribute('aria-label')||'').trim();if(/^add to chrome$|^chrome'a ekle$/i.test(t)){el.dataset.gkInstall='1';if(el instanceof HTMLElement)el.innerText="GenişKapı'ya ekle"}});document.addEventListener('click',event=>{const el=event.target instanceof Element?event.target.closest('[data-gk-install],button,[role="button"],a'):null;if(!el)return;const t=(el.innerText||'').trim();if(el.dataset.gkInstall!=='1'&&!/chrome'a ekle|add to chrome/i.test(t))return;const id=getId();if(!id)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();location.href='geniskapi://install/'+id+'?source='+encodeURIComponent(location.href)},true);new MutationObserver(()=>{hideWarning();markButtons()}).observe(document.documentElement,{childList:true,subtree:true});hideWarning();markButtons()})();`;try{await contents.executeJavaScript(bridge,true)}catch{}});
}

function configureSession(){
  session.defaultSession.webRequest.onBeforeRequest(filter,(details,callback)=>callback({cancel:shouldBlock(details.url)}));
  session.defaultSession.webRequest.onBeforeSendHeaders((details,callback)=>{details.requestHeaders['User-Agent']=CHROME_UA;callback({requestHeaders:details.requestHeaders})});
  session.defaultSession.setPermissionRequestHandler((_,permission,callback)=>callback(new Set(['clipboard-read','clipboard-write','notifications']).has(permission)));
  session.defaultSession.on('will-download',(_,item)=>{const target=path.join(app.getPath('downloads'),item.getFilename());item.setSavePath(target);win?.webContents.send('download-started',{filename:item.getFilename(),path:target});item.on('updated',(_,state)=>win?.webContents.send('download-progress',{filename:item.getFilename(),state,receivedBytes:item.getReceivedBytes(),totalBytes:item.getTotalBytes()}));item.once('done',(_,state)=>win?.webContents.send('download-finished',{filename:item.getFilename(),path:target,state}))});
}

function createWindow(){
  win=new BrowserWindow({width:1440,height:900,minWidth:900,minHeight:600,backgroundColor:'#08111f',title:'GenişKapı Browser',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
  view=new BrowserView({webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}}); view.webContents.setUserAgent(CHROME_UA); win.setBrowserView(view);
  const resize=()=>{const b=win.getBounds();view.setBounds({x:0,y:112,width:b.width,height:Math.max(0,b.height-112)})}; resize(); view.setAutoResize({width:true,height:true});
  view.webContents.on('will-navigate',async(event,url)=>{if(!url.startsWith('geniskapi://install/'))return;event.preventDefault();try{const u=new URL(url);const id=u.pathname.replace(/^\\//,'').split('/').pop();const source=u.searchParams.get('source')||'';const result=await installChromeWebStoreExtension(id,source);win.webContents.send('extension-install-result',result)}catch(error){showExtensionIncompatibility('Bu eklenti',error.message);win.webContents.send('extension-install-error',{error:error.message,incompatible:true});uiProgress({stage:'error',progress:0,text:`Kurulum başarısız: ${error.message}`})}});
  view.webContents.loadURL('https://www.google.com/'); win.loadFile(path.join(__dirname,'ui.html')); win.webContents.on('did-finish-load',()=>{try{const css=fs.readFileSync(path.join(__dirname,'animations.css'),'utf8'); win.webContents.insertCSS(css).catch(()=>{}); const modern=fs.readFileSync(path.join(__dirname,'modern-ui.css'),'utf8'); win.webContents.insertCSS(modern).catch(()=>{});}catch{}}); win.on('resize',resize);
  view.webContents.on('did-start-loading',()=>win.webContents.send('page-loading',true)); view.webContents.on('did-stop-loading',()=>win.webContents.send('page-loading',false));
  view.webContents.on('did-navigate',(_,url)=>{win.webContents.send('page-url',url);injectCwsBridge(view.webContents)}); view.webContents.on('did-navigate-in-page',(_,url)=>{win.webContents.send('page-url',url);if(isCwsUrl(url))injectCwsBridge(view.webContents)}); injectCwsBridge(view.webContents);
}

app.whenReady().then(async()=>{extensionStoreFile=path.join(app.getPath('userData'),'installed-extensions.json');configureSession();await restoreExtensions();createWindow();Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'GenişKapı',submenu:[{role:'about'},{role:'quit'}]},{label:'Görünüm',submenu:[{role:'toggledevtools'},{role:'reload'},{role:'togglefullscreen'}]}]))});

ipcMain.handle('navigate',(_,value)=>{let u=String(value||'').trim();if(!/^https?:\\/\\//i.test(u))u='https://www.google.com/search?q='+encodeURIComponent(u);return view.webContents.loadURL(u)});
ipcMain.handle('back',()=>view.webContents.goBack());
ipcMain.handle('forward',()=>view.webContents.goForward());
ipcMain.handle('reload',()=>view.webContents.reload());
ipcMain.handle('home',()=>view.webContents.loadURL('https://www.google.com/'));
ipcMain.handle('new-window',()=>{const w=new BrowserWindow({width:1200,height:800,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});w.webContents.setUserAgent(CHROME_UA);w.loadURL('https://www.google.com/')});
ipcMain.handle('cws-install',async(_,id,url)=>installChromeWebStoreExtension(id,url));
ipcMain.handle('extensions-list',()=>[...extensions.values()]);
ipcMain.handle('extensions-remove',async(_,id)=>{if(!extensions.has(id))return false;try{await session.defaultSession.removeExtension(id)}catch{}extensions.delete(id);writeInstalledExtensions();return true});
ipcMain.handle('open-devtools',()=>{view?.webContents.openDevTools({mode:'detach'});return true});
ipcMain.handle('window-minimize',()=>{win?.minimize();return true});
ipcMain.handle('window-maximize',()=>{if(!win)return false;win.isMaximized()?win.unmaximize():win.maximize();return true});
ipcMain.handle('window-close',()=>{win?.close();return true});
ipcMain.handle('show-menu',()=>{Menu.getApplicationMenu()?.popup({window:win});return true});

app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
