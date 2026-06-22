import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  startFFmpeg: (options: any) => ipcRenderer.invoke('start-ffmpeg', options),
  stopFFmpeg: () => ipcRenderer.invoke('stop-ffmpeg'),
  sendChunk: (chunk: ArrayBuffer) => ipcRenderer.send('ffmpeg-chunk', new Uint8Array(chunk)),
  windowControl: (command: 'minimize' | 'maximize' | 'close') => ipcRenderer.send('window-control', command),
  selectFile: (options: any) => ipcRenderer.invoke('select-file', options),
  saveConfig: (config: any) => ipcRenderer.send('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  openWorkspace: () => ipcRenderer.invoke('open-workspace'),
  createWorkspace: (name: string) => ipcRenderer.invoke('create-workspace', name),
  getActiveWorkspaceName: () => ipcRenderer.invoke('get-active-workspace-name'),
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  selectBackgroundFile: (options: any) => ipcRenderer.invoke('select-background-file', options),
  getBackgroundAssets: () => ipcRenderer.invoke('get-background-assets'),
  deleteBackgroundAsset: (fileName: string) => ipcRenderer.invoke('delete-background-asset', fileName),
});
