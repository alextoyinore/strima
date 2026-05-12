import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, protocol } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import './main/ffmpeg-manager';

if (started) {
  app.quit();
}

// Register custom protocol for local media
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { bypassCSP: true, stream: true, secure: true, supportFetchAPI: true } }
]);

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
    },
  });

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
  protocol.handle('media', (request) => {
    const filePath = request.url.replace('media://get-file/', '');
    // Decode the path in case it has special characters
    const decodedPath = decodeURIComponent(filePath);
    return Response.redirect(`file://${decodedPath}`);
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
