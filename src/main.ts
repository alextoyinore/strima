import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, protocol, net, shell } from 'electron';
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
    icon: path.join(__dirname, '../../assets/icon.png'),
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
  return await desktopCapturer.getSources({ 
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });
});

ipcMain.on('window-control', (event, command) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (command === 'minimize') win.minimize();
  if (command === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  if (command === 'close') win.close();
});

ipcMain.on('open-external', (event, url) => {
  shell.openExternal(url);
});

const GLOBAL_CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
const STRIMA_DIR = path.join(app.getPath('documents'), 'Strima');
const WORKSPACES_DIR = path.join(STRIMA_DIR, 'Workspaces');

function getActiveWorkspacePath(): string {
  if (!fs.existsSync(STRIMA_DIR)) fs.mkdirSync(STRIMA_DIR, { recursive: true });
  if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true });

  let activePath = '';
  try {
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      const globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
      activePath = globalConfig.activeWorkspacePath || '';
    }
  } catch (e) {
    console.error('Failed to load global config', e);
  }

  if (!activePath || !fs.existsSync(activePath)) {
    activePath = path.join(WORKSPACES_DIR, 'Default');
    if (!fs.existsSync(activePath)) fs.mkdirSync(activePath, { recursive: true });
    
    try {
      let globalConfig: any = {};
      if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
        globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
      }
      globalConfig.activeWorkspacePath = activePath;
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(globalConfig, null, 2));
    } catch (e) {}
  }

  return activePath;
}

function inflateWorkspaceConfig(workspaceConfig: any, activePath: string) {
  if (!workspaceConfig || !workspaceConfig.scenes) return workspaceConfig;
  workspaceConfig.scenes = workspaceConfig.scenes.map((scene: any) => {
    if (!scene.sources) return scene;
    const sources = scene.sources.map((source: any) => {
      if (source.data && source.data.startsWith('relative://assets/')) {
        const fileName = source.data.replace('relative://assets/', '');
        const absPath = path.join(activePath, 'assets', fileName);
        return { ...source, data: `media://get-file/${absPath}` };
      }
      return source;
    });
    const overlays = (scene.overlays || []).map((overlay: any) => {
      if (overlay.data && overlay.data.startsWith('relative://assets/')) {
        const fileName = overlay.data.replace('relative://assets/', '');
        const absPath = path.join(activePath, 'assets', fileName);
        return { ...overlay, data: `media://get-file/${absPath}` };
      }
      return overlay;
    });
    return { ...scene, sources, overlays };
  });
  return workspaceConfig;
}

function deflateWorkspaceConfig(workspaceConfig: any, activePath: string) {
  if (!workspaceConfig || !workspaceConfig.scenes) return workspaceConfig;
  workspaceConfig.scenes = workspaceConfig.scenes.map((scene: any) => {
    if (!scene.sources) return scene;
    const sources = scene.sources.map((source: any) => {
      const prefix = `media://get-file/${activePath}/assets/`;
      const prefixEncoded = `media://get-file/${encodeURIComponent(activePath)}/assets/`;
      if (source.data && (source.data.startsWith(prefix) || source.data.startsWith(prefixEncoded))) {
        const fileName = source.data.startsWith(prefix) ? source.data.replace(prefix, '') : source.data.replace(prefixEncoded, '');
        return { ...source, data: `relative://assets/${decodeURIComponent(fileName)}` };
      }
      return source;
    });
    const overlays = (scene.overlays || []).map((overlay: any) => {
      const prefix = `media://get-file/${activePath}/assets/`;
      const prefixEncoded = `media://get-file/${encodeURIComponent(activePath)}/assets/`;
      if (overlay.data && (overlay.data.startsWith(prefix) || overlay.data.startsWith(prefixEncoded))) {
        const fileName = overlay.data.startsWith(prefix) ? overlay.data.replace(prefix, '') : overlay.data.replace(prefixEncoded, '');
        return { ...overlay, data: `relative://assets/${decodeURIComponent(fileName)}` };
      }
      return overlay;
    });
    return { ...scene, sources, overlays };
  });
  return workspaceConfig;
}

ipcMain.handle('select-file', async (event, options) => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters
  });
  
  if (filePaths && filePaths.length > 0) {
    const filePath = filePaths[0];
    const activePath = getActiveWorkspacePath();
    const assetsDir = path.join(activePath, 'assets');
    if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const safeName = `${Date.now()}_${base.replace(/[^a-zA-Z0-9_-]/g, '_')}${ext}`;
    const destPath = path.join(assetsDir, safeName);
    try {
      fs.copyFileSync(filePath, destPath);
      return `media://get-file/${destPath}`;
    } catch (e) {
      console.error('Failed to copy file to workspace assets', e);
      return `media://get-file/${filePath}`;
    }
  }
  return null;
});

ipcMain.on('save-config', (event, config) => {
  const activePath = getActiveWorkspacePath();
  
  try {
    let globalConfig: any = {};
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    }
    globalConfig.themeMode = config.themeMode;
    globalConfig.accentColor = config.accentColor;
    globalConfig.streamingConfig = config.streamingConfig;
    globalConfig.consoleHeight = config.consoleHeight;
    globalConfig.sidebarWidth = config.sidebarWidth;
    globalConfig.assetSidebarWidth = config.assetSidebarWidth;
    globalConfig.sourcesWidth = config.sourcesWidth;
    globalConfig.propertiesWidth = config.propertiesWidth;
    globalConfig.activeWorkspacePath = activePath;
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(globalConfig, null, 2));
  } catch (e) {
    console.error('Failed to save global config:', e);
  }

  try {
    const workspaceConfig = {
      scenes: config.scenes,
      activeSceneId: config.activeSceneId,
      isAutoSaveEnabled: config.isAutoSaveEnabled
    };
    const deflated = deflateWorkspaceConfig(workspaceConfig, activePath);
    const workspaceConfigPath = path.join(activePath, 'config.json');
    fs.writeFileSync(workspaceConfigPath, JSON.stringify(deflated, null, 2));
  } catch (e) {
    console.error('Failed to save workspace config:', e);
  }
});

ipcMain.handle('load-config', async () => {
  const activePath = getActiveWorkspacePath();
  
  let globalConfig: any = {};
  if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
    try {
      globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    } catch (e) {}
  }

  let workspaceConfig: any = null;
  const workspaceConfigPath = path.join(activePath, 'config.json');
  if (fs.existsSync(workspaceConfigPath)) {
    try {
      const data = fs.readFileSync(workspaceConfigPath, 'utf-8');
      workspaceConfig = inflateWorkspaceConfig(JSON.parse(data), activePath);
    } catch (e) {
      console.error('Failed to load workspace config:', e);
    }
  }

  return {
    scenes: workspaceConfig?.scenes || [],
    activeSceneId: workspaceConfig?.activeSceneId || null,
    isAutoSaveEnabled: workspaceConfig?.isAutoSaveEnabled !== false,
    themeMode: globalConfig.themeMode || 'system',
    accentColor: globalConfig.accentColor || 'slate',
    streamingConfig: globalConfig.streamingConfig || null,
    consoleHeight: globalConfig.consoleHeight,
    sidebarWidth: globalConfig.sidebarWidth,
    assetSidebarWidth: globalConfig.assetSidebarWidth,
    sourcesWidth: globalConfig.sourcesWidth,
    propertiesWidth: globalConfig.propertiesWidth,
    activeWorkspacePath: activePath
  };
});

ipcMain.handle('open-workspace', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Select Workspace Folder',
    properties: ['openDirectory'],
    defaultPath: WORKSPACES_DIR
  });
  
  if (filePaths && filePaths.length > 0) {
    const selectedPath = filePaths[0];
    const configPath = path.join(selectedPath, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      const emptyConfig = {
        scenes: [],
        activeSceneId: null,
        isAutoSaveEnabled: true
      };
      fs.writeFileSync(configPath, JSON.stringify(emptyConfig, null, 2));
    }
    
    try {
      let globalConfig: any = {};
      if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
        globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
      }
      globalConfig.activeWorkspacePath = selectedPath;
      fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(globalConfig, null, 2));
    } catch (e) {}
    
    const data = fs.readFileSync(configPath, 'utf-8');
    const workspaceConfig = inflateWorkspaceConfig(JSON.parse(data), selectedPath);
    
    let globalConfig: any = {};
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      try {
        globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
      } catch (e) {}
    }
    
    return {
      scenes: workspaceConfig?.scenes || [],
      activeSceneId: workspaceConfig?.activeSceneId || null,
      isAutoSaveEnabled: workspaceConfig?.isAutoSaveEnabled !== false,
      themeMode: globalConfig.themeMode || 'system',
      accentColor: globalConfig.accentColor || 'slate',
      streamingConfig: globalConfig.streamingConfig || null,
      consoleHeight: globalConfig.consoleHeight,
      sidebarWidth: globalConfig.sidebarWidth,
      assetSidebarWidth: globalConfig.assetSidebarWidth,
      sourcesWidth: globalConfig.sourcesWidth,
      propertiesWidth: globalConfig.propertiesWidth,
      activeWorkspacePath: selectedPath
    };
  }
  return null;
});

ipcMain.handle('create-workspace', async (event, name) => {
  if (!name) return null;
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const selectedPath = path.join(WORKSPACES_DIR, safeName);
  
  if (!fs.existsSync(selectedPath)) {
    fs.mkdirSync(selectedPath, { recursive: true });
  }
  
  const configPath = path.join(selectedPath, 'config.json');
  const emptyConfig = {
    scenes: [],
    activeSceneId: null,
    isAutoSaveEnabled: true
  };
  fs.writeFileSync(configPath, JSON.stringify(emptyConfig, null, 2));
  
  try {
    let globalConfig: any = {};
    if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
      globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    }
    globalConfig.activeWorkspacePath = selectedPath;
    fs.writeFileSync(GLOBAL_CONFIG_PATH, JSON.stringify(globalConfig, null, 2));
  } catch (e) {}
  
  let globalConfig: any = {};
  if (fs.existsSync(GLOBAL_CONFIG_PATH)) {
    try {
      globalConfig = JSON.parse(fs.readFileSync(GLOBAL_CONFIG_PATH, 'utf-8'));
    } catch (e) {}
  }
  
  return {
    scenes: [],
    activeSceneId: null,
    isAutoSaveEnabled: true,
    themeMode: globalConfig.themeMode || 'system',
    accentColor: globalConfig.accentColor || 'slate',
    streamingConfig: globalConfig.streamingConfig || null,
    consoleHeight: globalConfig.consoleHeight,
    sidebarWidth: globalConfig.sidebarWidth,
    assetSidebarWidth: globalConfig.assetSidebarWidth,
    sourcesWidth: globalConfig.sourcesWidth,
    propertiesWidth: globalConfig.propertiesWidth,
    activeWorkspacePath: selectedPath
  };
});

ipcMain.handle('get-active-workspace-name', async () => {
  const activePath = getActiveWorkspacePath();
  return path.basename(activePath);
});

ipcMain.handle('select-background-file', async (event, options) => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: options.filters
  });
  
  if (filePaths && filePaths.length > 0) {
    const filePath = filePaths[0];
    const globalAssetsDir = path.join(STRIMA_DIR, 'Assets');
    if (!fs.existsSync(globalAssetsDir)) fs.mkdirSync(globalAssetsDir, { recursive: true });
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);
    const safeName = `${Date.now()}_${base.replace(/[^a-zA-Z0-9_-]/g, '_')}${ext}`;
    const destPath = path.join(globalAssetsDir, safeName);
    try {
      fs.copyFileSync(filePath, destPath);
      return `media://get-file/${destPath}`;
    } catch (e) {
      console.error('Failed to copy background asset:', e);
      return `media://get-file/${filePath}`;
    }
  }
  return null;
});

ipcMain.handle('get-background-assets', async () => {
  const globalAssetsDir = path.join(STRIMA_DIR, 'Assets');
  if (!fs.existsSync(globalAssetsDir)) return [];
  try {
    const files = fs.readdirSync(globalAssetsDir);
    return files.map(file => {
      const absPath = path.join(globalAssetsDir, file);
      const ext = path.extname(file).toLowerCase();
      const isVideo = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.ts'].includes(ext);
      return {
        name: file,
        path: `media://get-file/${absPath}`,
        type: isVideo ? 'video' : 'image'
      };
    });
  } catch (e) {
    console.error('Failed to get background assets:', e);
    return [];
  }
});

ipcMain.handle('delete-background-asset', async (event, fileName) => {
  const globalAssetsDir = path.join(STRIMA_DIR, 'Assets');
  const filePath = path.join(globalAssetsDir, fileName);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (e) {
    console.error('Failed to delete background asset:', e);
  }
  return false;
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
