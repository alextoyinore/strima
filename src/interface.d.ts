export interface IElectronAPI {
  getSources: () => Promise<Electron.DesktopCapturerSource[]>;
  startFFmpeg: (options: { outputPath?: string; isStreaming: boolean; streamUrl?: string }) => Promise<boolean>;
  stopFFmpeg: () => Promise<boolean>;
  sendChunk: (chunk: ArrayBuffer) => void;
  windowControl: (command: 'minimize' | 'maximize' | 'close') => void;
  selectFile: (options: { filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  saveConfig: (config: any) => void;
  loadConfig: () => Promise<any | null>;
  openWorkspace: () => Promise<any | null>;
  createWorkspace: (name: string) => Promise<any | null>;
  getActiveWorkspaceName: () => Promise<string>;
  selectBackgroundFile: (options: { filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  getBackgroundAssets: () => Promise<{ name: string; path: string; type: 'video' | 'image' }[]>;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
