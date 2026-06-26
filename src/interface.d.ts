// Vite ?url import support
declare module '*?url' {
  const url: string;
  export default url;
}

export interface IElectronAPI {
  getSources: () => Promise<Electron.DesktopCapturerSource[]>;
  startFFmpeg: (options: { id?: string; outputPath?: string; isStreaming: boolean; streamUrl?: string }) => Promise<boolean>;
  stopFFmpeg: (id?: string) => Promise<boolean>;
  sendChunk: (chunk: ArrayBuffer, id?: string) => void;
  windowControl: (command: 'minimize' | 'maximize' | 'close') => void;
  selectFile: (options: { filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  saveConfig: (config: any) => void;
  loadConfig: () => Promise<any | null>;
  openWorkspace: () => Promise<any | null>;
  createWorkspace: (name: string) => Promise<any | null>;
  getActiveWorkspaceName: () => Promise<string>;
  selectBackgroundFile: (options: { filters: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  getBackgroundAssets: () => Promise<{ name: string; path: string; type: 'video' | 'image' }[]>;
  deleteBackgroundAsset: (fileName: string) => Promise<boolean>;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
