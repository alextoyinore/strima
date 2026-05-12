import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, protocol, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import './main/ffmpeg-manager';

if (started) {
  app.quit();
}

// Register custom protocol for local media
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

const WINDOW_STATE_PATH = path.join(app.getPath('userData'), 'window-state.json');

const createWindow = () => {
  let windowState = { width: 1100, height: 700, x: undefined, y: undefined };
  try {
    if (fs.existsSync(WINDOW_STATE_PATH)) {
      windowState = JSON.parse(fs.readFileSync(WINDOW_STATE_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load window state', e);
  }

  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    frame: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
    },
  });

  const saveState = () => {
    try {
      const bounds = mainWindow.getBounds();
      fs.writeFileSync(WINDOW_STATE_PATH, JSON.stringify(bounds));
    } catch (e) {}
  };

  mainWindow.on('resize', saveState);
  mainWindow.on('move', saveState);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

// IPC Handlers
ipcMain.handle('get-sources', async () => {
  return await desktopCapturer.getSources({ types: ['window', 'screen'] });
});

ipcMain.on('window-control', (event, command) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (command === 'minimize') win.minimize();
  if (command === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (command === 'close') win.close();
});

ipcMain.handle('select-file', async (event, options) => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters
  });
  
  if (filePaths && filePaths.length > 0) {
    const filePath = filePaths[0];
    // Use the custom media:// protocol instead of base64
    return `media://get-file/${filePath}`;
  }
  return null;
});

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

ipcMain.on('save-config', (event, config) => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
});

ipcMain.handle('load-config', async () => {
  if (fs.existsSync(CONFIG_PATH)) {
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  }
  return null;
});

app.whenReady().then(() => {
  // Handle media:// protocol
  protocol.handle('media', async (request) => {
    const filePath = request.url.replace('media://get-file/', '');
    const decodedPath = decodeURIComponent(filePath);
    try {
      console.log(`[Media Protocol] Request: ${request.method} ${decodedPath}`);
      console.log(`[Media Protocol] Range Header: ${request.headers.get('Range')}`);
      
      const response = await net.fetch(pathToFileURL(decodedPath).href, {
        method: request.method,
        headers: request.headers
      });

      console.log(`[Media Protocol] Response Status: ${response.status}`);
      console.log(`[Media Protocol] Response Range: ${response.headers.get('Content-Range')}`);

      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Range');
      headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

      // Return a proper Response object with cloned body
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (e) {
      console.error('[Media Protocol] Error:', e);
      return new Response('Error loading file', { status: 500 });
    }
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
