import React, { useState, useEffect, useRef } from 'react';
import { Monitor, Camera, Mic, Play, Square, Settings as SettingsIcon, Layers, Plus, X, Video, Radio, Minus, Square as Maximize, Palette, Sun, Moon, Laptop, Move, Maximize2, Save, Trash2, Type, Image as ImageIcon, Globe, MicOff, Volume2, Zap, ChevronRight, ChevronLeft, Grid, Eye, EyeOff, Film, FileText, Presentation, Pause, RotateCcw, AlignLeft, AlignCenter, AlignRight, Bold, Italic, SkipBack, SkipForward } from 'lucide-react';
import Composer from './components/Composer';

interface Source {
  id: string;
  name: string;
  type: 'screen' | 'window' | 'camera' | 'image' | 'video' | 'text' | 'pdf' | 'slides' | 'audio';
  thumbnail?: string;
  data?: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  playing?: boolean;
  volume?: number;
  fit?: 'cover' | 'contain' | 'fill';
  page?: number;
  totalPages?: number;
  style?: {
    fontSize: number;
    fontFamily: string;
    color: string;
    bold: boolean;
    italic: boolean;
    textAlign: 'left' | 'center' | 'right';
    accentColor?: string;
  };
}

interface Overlay {
  id: string;
  type: 'lower-third' | 'ticker';
  title: string;
  subtitle: string;
  visible: boolean;
  data?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  speed?: number;
  style?: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    accentColor?: string;
  };
}

interface Scene {
  id: string;
  name: string;
  sources: Source[];
  overlays: Overlay[];
}

interface StreamingConfig {
  rtmpUrl: string;
  streamKey: string;
}

type ThemeMode = 'light' | 'dark' | 'system';
type AccentColor = 'slate' | 'gold' | 'teal' | 'crimson' | 'electric';
type SelectorTab = 'screens' | 'cameras';

const App: React.FC = () => {
  const [programSources, setProgramSources] = useState<Source[]>([]);
  const [programOverlays, setProgramOverlays] = useState<Overlay[]>([]);
  const [previewSources, setPreviewSources] = useState<Source[]>([]);
  const [previewOverlays, setPreviewOverlays] = useState<Overlay[]>([
    { id: 'lt-1', type: 'lower-third', title: 'STRIMA BROADCAST', subtitle: 'LIVE PRODUCTION ENGINE', visible: true }
  ]);
  const [scenes, setScenes] = useState<Scene[]>([
    { id: 'scene-1', name: 'Main Scene', sources: [], overlays: [] }
  ]);
  const [streamingConfig, setStreamingConfig] = useState<StreamingConfig>({
    rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
    streamKey: ''
  });
  
  const [activeSceneId, setActiveSceneId] = useState('scene-1');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState<SelectorTab>('screens');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [availableScreens, setAvailableScreens] = useState<any[]>([]);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');
  const [accentColor, setAccentColor] = useState<AccentColor>('slate');
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  // Resizable state
  const [consoleHeight, setConsoleHeight] = useState(400);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [assetSidebarWidth, setAssetSidebarWidth] = useState(160);
  const [isPdfGridOpen, setIsPdfGridOpen] = useState(false);
  const [pdfGridSourceId, setPdfGridSourceId] = useState<string | null>(null);
  const isResizingRef = useRef<'console' | 'sidebar' | 'asset-sidebar' | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const composerStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const [playbackStatus, setPlaybackStatus] = useState<{ id: string, currentTime: number, duration: number } | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ id: string, time: number, timestamp: number } | null>(null);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const skip = (seconds: number) => {
    if (playbackStatus && selectedSourceId === playbackStatus.id) {
      setSeekRequest({ id: playbackStatus.id, time: Math.max(0, Math.min(playbackStatus.duration, playbackStatus.currentTime + seconds)), timestamp: Date.now() });
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const config = await window.electron.loadConfig();
        if (config) {
          if (config.scenes) setScenes(config.scenes);
          if (config.activeSceneId) {
              setActiveSceneId(config.activeSceneId);
              const activeScene = config.scenes.find((s: any) => s.id === config.activeSceneId);
              if (activeScene) {
                  setPreviewSources(activeScene.sources || []);
                  setPreviewOverlays(activeScene.overlays || []);
              }
          }
          if (config.streamingConfig) setStreamingConfig(config.streamingConfig);
          if (config.themeMode) setThemeMode(config.themeMode);
          if (config.accentColor) setAccentColor(config.accentColor);
          if (config.consoleHeight) setConsoleHeight(config.consoleHeight);
          if (config.sidebarWidth) setSidebarWidth(config.sidebarWidth);
          if (config.assetSidebarWidth) setAssetSidebarWidth(config.assetSidebarWidth);
        }
      } catch (e) {}
    };
    loadData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
        window.electron.saveConfig({ 
            scenes, 
            activeSceneId, 
            streamingConfig, 
            themeMode, 
            accentColor,
            consoleHeight,
            sidebarWidth,
            assetSidebarWidth
        });
    }, 1000);
    return () => clearTimeout(timer);
  }, [scenes, activeSceneId, streamingConfig, themeMode, accentColor, consoleHeight, sidebarWidth, assetSidebarWidth]);

  useEffect(() => {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      if (themeMode === 'system') setResolvedTheme(darkQuery.matches ? 'dark' : 'light');
      else setResolvedTheme(themeMode);
    };
    updateTheme();
    darkQuery.addEventListener('change', updateTheme);
    return () => darkQuery.removeEventListener('change', updateTheme);
  }, [themeMode]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      if (isResizingRef.current === 'console') {
        const newHeight = window.innerHeight - e.clientY;
        if (newHeight > 100 && newHeight < window.innerHeight - 200) setConsoleHeight(newHeight);
      } else if (isResizingRef.current === 'sidebar') {
        const newWidth = e.clientX;
        if (newWidth > 100 && newWidth < 400) setSidebarWidth(newWidth);
      } else if (isResizingRef.current === 'asset-sidebar') {
        const newWidth = e.clientX;
        if (newWidth > 80 && newWidth < 400) setAssetSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      isResizingRef.current = null;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        const keyNum = parseInt(e.key);
        if (!isNaN(keyNum) && keyNum > 0 && keyNum <= scenes.length) switchScene(scenes[keyNum - 1].id);
        if (e.code === 'Enter') executeTransition();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scenes, previewSources, previewOverlays]);

  const toggleMic = async () => {
    if (isMicEnabled) {
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
      setIsMicEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = stream;
        setIsMicEnabled(true);
      } catch (e) { alert('Mic access denied'); }
    }
  };

  const openSelector = async () => {
    const screens = await window.electron.getSources();
    setAvailableScreens(screens);
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAvailableCameras(devices.filter(d => d.kind === 'videoinput'));
    } catch (e) {}
    setIsSelectorOpen(true);
  };

  const addSource = (source: any) => {
    const newSource: Source = {
      id: source.id,
      name: source.name,
      type: source.id.startsWith('screen') || source.id.startsWith('window') ? (source.id.startsWith('screen') ? 'screen' : 'window') : 'screen',
      thumbnail: source.thumbnail.toDataURL(),
      visible: true, x: 0, y: 0, width: 1920, height: 1080
    };
    const updated = [...previewSources, newSource];
    setPreviewSources(updated);
    setSelectedSourceId(newSource.id);
    setIsSelectorOpen(false);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const addCameraSource = (device: MediaDeviceInfo) => {
    const newSource: Source = {
      id: device.deviceId,
      name: device.label || `Camera ${availableCameras.indexOf(device) + 1}`,
      type: 'camera', visible: true, x: 1400, y: 700, width: 480, height: 270
    };
    const updated = [...previewSources, newSource];
    setPreviewSources(updated);
    setSelectedSourceId(newSource.id);
    setIsSelectorOpen(false);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const addImageSource = async () => {
    const dataUrl = await window.electron.selectFile({ filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg'] }] });
    if (dataUrl) {
      const newSource: Source = { id: `img-${Date.now()}`, name: 'Image', type: 'image', data: dataUrl, visible: true, x: 100, y: 100, width: 400, height: 300 };
      const updated = [...previewSources, newSource];
      setPreviewSources(updated);
      setSelectedSourceId(newSource.id);
      setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
    }
  };

  const addVideoSource = async () => {
    const dataUrl = await window.electron.selectFile({ filters: [{ name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'ts'] }] });
    if (dataUrl) {
      const newSource: Source = { id: `vid-${Date.now()}`, name: 'Video', type: 'video', data: dataUrl, visible: true, x: 0, y: 0, width: 1920, height: 1080, playing: true };
      const updated = [...previewSources, newSource];
      setPreviewSources(updated);
      setSelectedSourceId(newSource.id);
      setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
    }
  };

  const addTextSource = () => {
    const newSource: Source = { 
      id: `txt-${Date.now()}`, 
      name: 'New Text', 
      type: 'text', 
      data: 'Type your text here...', 
      visible: true, x: 100, y: 100, width: 800, height: 100,
      style: { fontSize: 64, fontFamily: 'Outfit', color: '#ffffff', bold: true, italic: false, textAlign: 'left' }
    };
    const updated = [...previewSources, newSource];
    setPreviewSources(updated);
    setSelectedSourceId(newSource.id);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const addFileSource = async (type: 'pdf' | 'slides') => {
    const exts = type === 'pdf' ? ['pdf'] : ['pptx', 'ppt'];
    const dataUrl = await window.electron.selectFile({ filters: [{ name: type === 'pdf' ? 'PDF' : 'PowerPoint', extensions: exts }] });
    if (dataUrl) {
      const newSource: Source = { 
        id: `${type}-${Date.now()}`, 
        name: type.toUpperCase(), 
        type, 
        data: dataUrl, 
        visible: true, x: 0, y: 0, width: 1920, height: 1080,
        page: 1,
        totalPages: 1
      };
      const updated = [...previewSources, newSource];
      setPreviewSources(updated);
      setSelectedSourceId(newSource.id);
      setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
    }
  };

  const addAudioSource = async () => {
    const dataUrl = await window.electron.selectFile({ filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }] });
    if (dataUrl) {
      const newSource: Source = { id: `aud-${Date.now()}`, name: 'Audio', type: 'audio', data: dataUrl, visible: true, x: 100, y: 100, width: 400, height: 120, playing: true };
      const updated = [...previewSources, newSource];
      setPreviewSources(updated);
      setSelectedSourceId(newSource.id);
      setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
    }
  };

  const linkVideoSource = () => {
    const url = prompt('Enter Video URL:');
    if (url) {
      const newSource: Source = { id: `vid-${Date.now()}`, name: 'Linked Video', type: 'video', data: url, visible: true, x: 0, y: 0, width: 1920, height: 1080, playing: true };
      const updated = [...previewSources, newSource];
      setPreviewSources(updated);
      setSelectedSourceId(newSource.id);
      setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
    }
  };

  const updateSourceTransform = (id: string, updates: Partial<Pick<Source, 'x' | 'y' | 'width' | 'height' | 'fit'>>) => {
    const updated = previewSources.map(s => s.id === id ? { ...s, ...updates } : s);
    setPreviewSources(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const updateSourceStyle = (id: string, styleUpdates: Partial<Required<Source>['style']>) => {
    const updated = previewSources.map(s => s.id === id ? { ...s, style: { ...s.style!, ...styleUpdates } } : s);
    setPreviewSources(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const toggleSourceFullscreen = (id: string) => {
    const source = previewSources.find(s => s.id === id);
    if (!source) return;
    if (source.width === 1920) {
      updateSourceTransform(id, { x: 1400, y: 700, width: 480, height: 270, fit: 'cover' });
    } else {
      updateSourceTransform(id, { x: 0, y: 0, width: 1920, height: 1080, fit: 'contain' });
    }
  };

  const updateOverlay = (id: string, updates: Partial<Overlay>) => {
    const updated = previewOverlays.map(o => o.id === id ? { ...o, ...updates } : o);
    setPreviewOverlays(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, overlays: updated } : s));
  };

  const handleSourceMetadata = (id: string, metadata: { totalPages?: number }) => {
    const updated = previewSources.map(s => s.id === id ? { ...s, ...metadata } : s);
    setPreviewSources(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const toggleVisibility = (id: string) => {
    const updated = previewSources.map(s => s.id === id ? { ...s, visible: !s.visible } : s);
    setPreviewSources(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const toggleOverlayVisibility = (id: string) => {
    const updated = previewOverlays.map(o => o.id === id ? { ...o, visible: !o.visible } : o);
    setPreviewOverlays(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, overlays: updated } : s));
  };

  const addOverlay = (type: 'lower-third' | 'ticker' | 'logo', data?: string) => {
    const newOverlay: Overlay = {
      id: `ovl-${Date.now()}`,
      type,
      title: type === 'logo' ? 'Branding Logo' : (type === 'ticker' ? 'Scroll Text' : 'New Lower Third'),
      subtitle: type === 'lower-third' ? 'Presenter Title' : '',
      visible: true,
      data,
      x: type === 'logo' ? 1700 : undefined,
      y: type === 'logo' ? 50 : undefined,
      width: type === 'logo' ? 150 : undefined,
      height: type === 'logo' ? 150 : undefined,
      style: type === 'lower-third' ? { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1', accentColor: '#0f172a' } : undefined
    };
    const updated = [...previewOverlays, newOverlay];
    setPreviewOverlays(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, overlays: updated } : s));
    setSelectedOverlayId(newOverlay.id);
    setSelectedSourceId(null);
  };

  const removeSource = (id: string) => {
    const updated = previewSources.filter(s => s.id !== id);
    setPreviewSources(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
    if (selectedSourceId === id) setSelectedSourceId(null);
  };

  const removeOverlay = (id: string) => {
    const updated = previewOverlays.filter(o => o.id !== id);
    setPreviewOverlays(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, overlays: updated } : s));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const createScene = () => {
    const newScene: Scene = { id: `scene-${Date.now()}`, name: `Scene ${scenes.length + 1}`, sources: [...previewSources], overlays: [...previewOverlays] };
    setScenes([...scenes, newScene]);
    setActiveSceneId(newScene.id);
  };

  const switchScene = (id: string) => {
    const scene = scenes.find(s => s.id === id);
    if (scene) { setActiveSceneId(id); setPreviewSources(scene.sources || []); setPreviewOverlays(scene.overlays || []); setSelectedSourceId(null); setSelectedOverlayId(null); }
  };

  const deleteScene = (id: string) => {
    if (scenes.length === 1) return;
    const filtered = scenes.filter(s => s.id !== id);
    setScenes(filtered);
    if (activeSceneId === id) switchScene(filtered[0].id);
  };

  const executeTransition = () => { setProgramSources([...previewSources]); setProgramOverlays([...previewOverlays]); };

  const handleLiveStreamCreated = (stream: MediaStream) => {
    composerStreamRef.current = stream;
  };

  const startStreaming = async () => {
    if (!composerStreamRef.current) return;
    if (!streamingConfig.streamKey) { alert('Stream Key missing'); return; }
    setIsStreaming(true);
    await window.electron.startFFmpeg({ isStreaming: true, streamUrl: `${streamingConfig.rtmpUrl}/${streamingConfig.streamKey}` });
    const recorder = new MediaRecorder(composerStreamRef.current, { mimeType: 'video/webm;codecs=h264', videoBitsPerSecond: 6000000 });
    recorder.ondataavailable = async (e) => { if (e.data.size > 0) window.electron.sendChunk(await e.data.arrayBuffer()); };
    recorder.start(100);
    mediaRecorderRef.current = recorder;
  };

  const stopStreaming = async () => { setIsStreaming(false); if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); mediaRecorderRef.current = null; } await window.electron.stopFFmpeg(); };

  const startRecording = async () => {
    if (!composerStreamRef.current) return;
    setIsRecording(true);
    await window.electron.startFFmpeg({ outputPath: `recording-${Date.now()}.mp4`, isStreaming: false });
    const recorder = new MediaRecorder(composerStreamRef.current, { mimeType: 'video/webm;codecs=h264', videoBitsPerSecond: 5000000 });
    recorder.ondataavailable = async (e) => { if (e.data.size > 0) window.electron.sendChunk(await e.data.arrayBuffer()); };
    recorder.start(100);
    mediaRecorderRef.current = recorder;
  };

  const stopRecording = async () => { setIsRecording(false); if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); mediaRecorderRef.current = null; } await window.electron.stopFFmpeg(); };

  const themeMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isThemeMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isThemeMenuOpen]);

  const selectedSource = previewSources.find(s => s.id === selectedSourceId);
  const selectedOverlay = previewOverlays.find(o => o.id === selectedOverlayId);

  return (
    <div className={`app-container theme-${resolvedTheme} accent-${accentColor}`}>
      <div className="title-bar">
        <div className="title-bar-drag-area">
          <Layers size={16} className="brand-icon" />
          <span className="app-title">STRIMA STUDIO PRO</span>
        </div>
        <div className="window-controls">
          <button onClick={() => window.electron.windowControl('minimize')} className="control-btn"><Minus size={14} /></button>
          <button onClick={() => window.electron.windowControl('maximize')} className="control-btn"><Maximize size={12} /></button>
          <button onClick={() => window.electron.windowControl('close')} className="control-btn close-btn"><X size={14} /></button>
        </div>
      </div>

      <header className="app-header">
        <div className="header-left">
           <span className="studio-label">Production Console</span>
        </div>
        <div className="header-center">
            <div className="broadcast-controls">
              <button className={`btn-mini ${isStreaming ? 'live' : 'primary'}`} onClick={isStreaming ? stopStreaming : startStreaming}>
                {isStreaming ? <Square size={14} /> : <Radio size={14} />}
                <span>{isStreaming ? 'Stop Stream' : 'Go Live'}</span>
              </button>
              <button className={`btn-mini ${isRecording ? 'recording' : 'secondary'}`} onClick={isRecording ? stopRecording : startRecording}>
                {isRecording ? <Square size={14} /> : <Play size={14} />}
                <span>{isRecording ? 'Stop Rec' : 'Record'}</span>
              </button>
            </div>
        </div>
        <div className="header-right">
          <div className="theme-selector-container" ref={themeMenuRef}>
            <button className="icon-btn" onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}>
              {resolvedTheme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            {isThemeMenuOpen && (
              <div className="theme-menu">
                <div className="menu-group">
                  <span className="menu-label">Mode</span>
                  <button onClick={() => setThemeMode('light')} className={`menu-opt ${themeMode === 'light' ? 'selected' : ''}`}><Sun size={14} /> Light</button>
                  <button onClick={() => setThemeMode('dark')} className={`menu-opt ${themeMode === 'dark' ? 'selected' : ''}`}><Moon size={14} /> Dark</button>
                  <button onClick={() => setThemeMode('system')} className={`menu-opt ${themeMode === 'system' ? 'selected' : ''}`}><Laptop size={14} /> System</button>
                </div>
                <div className="menu-divider"></div>
                <div className="menu-group">
                  <span className="menu-label">Accent Palette</span>
                  <div className="accent-grid">
                    <button onClick={() => setAccentColor('slate')} className={`accent-dot slate ${accentColor === 'slate' ? 'active' : ''}`}></button>
                    <button onClick={() => setAccentColor('gold')} className={`accent-dot gold ${accentColor === 'gold' ? 'active' : ''}`}></button>
                    <button onClick={() => setAccentColor('teal')} className={`accent-dot teal ${accentColor === 'teal' ? 'active' : ''}`}></button>
                    <button onClick={() => setAccentColor('crimson')} className={`accent-dot crimson ${accentColor === 'crimson' ? 'active' : ''}`}></button>
                    <button onClick={() => setAccentColor('electric')} className={`accent-dot electric ${accentColor === 'electric' ? 'active' : ''}`}></button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button className="icon-btn" onClick={() => setIsSettingsOpen(true)}><SettingsIcon size={20} /></button>
        </div>
      </header>

      <main className="studio-layout-pro">
        <section className="studio-main-viewport">
            <aside className="asset-sidebar" style={{ width: assetSidebarWidth }}>
                <h3 className="sidebar-title">Assets</h3>
                <div className="asset-grid-mini">
                    <button className="asset-btn" title="Screen Share" onClick={openSelector}><Monitor size={18} /><span>Screen</span></button>
                    <button className="asset-btn" title="Add Image" onClick={addImageSource}><ImageIcon size={18} /><span>Image</span></button>
                    <button className="asset-btn" title="Add Video" onClick={addVideoSource}><Film size={18} /><span>Video</span></button>
                    <button className="asset-btn" title="Add Audio" onClick={addAudioSource}><Volume2 size={18} /><span>Audio</span></button>
                    <button className="asset-btn" title="Link Video" onClick={linkVideoSource}><Globe size={18} /><span>Link</span></button>
                    <button className="asset-btn" title="Add Text" onClick={addTextSource}><Type size={18} /><span>Text</span></button>
                    <button className="asset-btn" title="Add PDF / Slides" onClick={() => addFileSource('pdf')}><Presentation size={18} /><span>Slides</span></button>
                    <button className="asset-btn" title="Add Lower Third" onClick={() => addOverlay('lower-third')}><Layers size={18} /><span>Lower</span></button>
                    <button className="asset-btn" title="Add Ticker" onClick={() => addOverlay('ticker')}><Zap size={18} /><span>Ticker</span></button>
                    <button className="asset-btn" title="Add Logo" onClick={async () => {
                        const path = await (window as any).electron.selectFile({ filters: [{ name: 'Logos', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }] });
                        if (path) addOverlay('logo', path);
                    }}><ImageIcon size={18} /><span>Logo</span></button>
                </div>
            </aside>

            <div className="resizer-v" onMouseDown={() => { isResizingRef.current = 'asset-sidebar'; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}></div>

            <section className="dual-monitor-section">
                <div className="monitor-container preview">
                    <div className="monitor-header">
                        <span>PREVIEW</span>
                        <span className="status-tag">STAGING</span>
                    </div>
                    <div className="monitor-view">
                        <Composer 
                            sources={previewSources} 
                            overlays={previewOverlays} 
                            interactive={true}
                            selectedSourceId={selectedSourceId}
                            onSourceUpdate={updateSourceTransform}
                            onSourceSelect={setSelectedSourceId}
                            onSourceMetadata={handleSourceMetadata}
                            onPlaybackUpdate={(id, current, duration) => setPlaybackStatus({ id, currentTime: current, duration })}
                            seekRequest={seekRequest}
                        />
                    </div>
                </div>
                <div className="monitor-container live">
                    <div className="monitor-header">
                        <span>PROGRAM</span>
                        <span className="status-tag live">LIVE</span>
                    </div>
                    <div className="monitor-view">
                        <Composer sources={programSources} overlays={programOverlays} onStreamCreated={handleLiveStreamCreated} />
                    </div>
                </div>
            </section>
        </section>

        <div className="resizer-h" onMouseDown={() => { isResizingRef.current = 'console'; document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none'; }}></div>

        <section className="bottom-console" style={{ height: consoleHeight }}>
            <div className="console-column" style={{ width: sidebarWidth }}>
                <div className="column-header-with-controls">
                    <h3 className="column-title">Scenes</h3>
                    <button className="icon-btn xs accent" onClick={createScene} title="New Scene"><Plus size={16} /></button>
                </div>
                <div className="column-body">
                    {scenes.map(scene => (
                        <div key={scene.id} className={`scene-row ${activeSceneId === scene.id ? 'active' : ''}`} onClick={() => switchScene(scene.id)}>
                            <Layers size={14} className="row-icon" />
                            <span className="row-label">{scene.name}</span>
                            <button className="row-action" onClick={(e) => { e.stopPropagation(); deleteScene(scene.id); }}><Trash2 size={12} /></button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="resizer-v" onMouseDown={() => { isResizingRef.current = 'sidebar'; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}></div>

            <div className="console-column flex-1">
                <div className="column-header-with-controls">
                    <h3 className="column-title">Sources</h3>
                    <div className="overlay-transitions">
                        <button className="btn-transition cut" onClick={executeTransition}>CUT</button>
                        <button className="btn-transition fade" onClick={executeTransition}>FADE</button>
                    </div>
                </div>
                <div className="column-body">
                    {previewSources.map(source => (
                        <div key={source.id} className={`source-row ${selectedSourceId === source.id ? 'selected' : ''}`} onClick={() => { setSelectedSourceId(source.id); setSelectedOverlayId(null); }}>
                            <div className="row-meta">
                                {source.type === 'camera' ? <Camera size={14} /> : 
                                 source.type === 'video' ? <Film size={14} /> : 
                                 source.type === 'audio' ? <Volume2 size={14} /> : 
                                 source.type === 'text' ? <Type size={14} /> :
                                 source.type === 'pdf' ? <FileText size={14} /> :
                                 source.type === 'slides' ? <Presentation size={14} /> :
                                 <Monitor size={14} />}
                                <span className="row-name">{source.name}</span>
                            </div>
                            <div className="row-controls">
                                {(source.type === 'camera' || source.type === 'video' || source.type === 'image' || source.type === 'pdf' || source.type === 'slides' || source.type === 'audio') && (
                                    <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); toggleSourceFullscreen(source.id); }}><Maximize2 size={12} /></button>
                                )}
                                <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); toggleVisibility(source.id); }}>
                                    {source.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); removeSource(source.id); }}><X size={12} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="console-column flex-1">
                <h3 className="column-title">Mixer & Overlays</h3>
                <div className="column-body">
                    <div className="audio-mixer-widget">
                        <button className={`toggle-btn ${isMicEnabled ? 'active' : ''}`} onClick={toggleMic}>
                            {isMicEnabled ? <Mic size={14} /> : <MicOff size={14} />}
                            <span>Microphone</span>
                        </button>
                        {isMicEnabled && (
                            <div className="v-meter">
                                <div className="meter-label">Master</div>
                                <div className="meter-track"><div className="meter-fill"></div></div>
                            </div>
                        )}
                    </div>
                        <div className="overlay-list-widget">
                            {previewOverlays.map(overlay => (
                                <div key={overlay.id} className={`source-row ${selectedOverlayId === overlay.id ? 'selected' : ''}`} onClick={() => { setSelectedOverlayId(overlay.id); setSelectedSourceId(null); }}>
                                    <Type size={14} />
                                    <span className="row-label">{overlay.title}</span>
                                    <div className="row-controls">
                                        <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); toggleOverlayVisibility(overlay.id); }}>
                                            {overlay.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                        </button>
                                        <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); removeOverlay(overlay.id); }}><X size={12} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                </div>
            </div>

            <div className="console-column" style={{ width: 240 }}>
                <h3 className="column-title">Properties</h3>
                <div className="column-body">
                    {selectedSource ? (
                        <div className="editor-grid single">
                            <div className="editor-field"><label>Label</label><input type="text" value={selectedSource.name} onChange={(e) => {
                                const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, name: e.target.value } : s);
                                setPreviewSources(updated);
                                setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
                            }} /></div>

                            {(selectedSource.type === 'pdf' || selectedSource.type === 'slides') && (
                                <div className="pdf-controls-wrapper" style={{ margin: '8px 0', padding: '12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div className="column-header-with-controls" style={{ marginBottom: '8px' }}>
                                        <label className="menu-label" style={{ margin: 0 }}>Slide Navigation</label>
                                        <button className="icon-btn xs" title="View All Slides" onClick={() => { setPdfGridSourceId(selectedSource.id); setIsPdfGridOpen(true); }}><Grid size={14} /></button>
                                    </div>
                                    <div className="action-row" style={{ marginTop: '4px', gap: '4px' }}>
                                        <button className="btn-mini secondary" onClick={() => {
                                            const p = Math.max(1, (selectedSource.page || 1) - 1);
                                            handleSourceMetadata(selectedSource.id, { page: p });
                                        }}><ChevronLeft size={14} /></button>
                                        <div className="flex-1" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '800', color: 'var(--accent)' }}>
                                            {selectedSource.page || 1} <span style={{ opacity: 0.5, margin: '0 4px' }}>/</span> {selectedSource.totalPages || '?'}
                                        </div>
                                        <button className="btn-mini secondary" onClick={() => {
                                            const p = Math.min(selectedSource.totalPages || 999, (selectedSource.page || 1) + 1);
                                            handleSourceMetadata(selectedSource.id, { page: p });
                                        }}><ChevronRight size={14} /></button>
                                    </div>
                                </div>
                            )}
                            
                            {selectedSource.type === 'text' && (
                                <>
                                    <div className="editor-field"><label>Content</label><textarea value={selectedSource.data} onChange={(e) => {
                                        const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, data: e.target.value } : s);
                                        setPreviewSources(updated);
                                        setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
                                    }} style={{ height: '60px', resize: 'none' }} /></div>
                                    
                                    <div className="editor-field"><label>Font Family</label>
                                        <select value={selectedSource.style?.fontFamily} onChange={(e) => updateSourceStyle(selectedSource.id, { fontFamily: e.target.value })}>
                                            <option value="Inter">Inter</option>
                                            <option value="Outfit">Outfit</option>
                                            <option value="serif">Serif</option>
                                            <option value="monospace">Monospace</option>
                                        </select>
                                    </div>

                                    <div className="editor-grid" style={{ marginTop: '8px' }}>
                                        <div className="editor-field"><label>Size</label><input type="number" value={selectedSource.style?.fontSize} onChange={(e) => updateSourceStyle(selectedSource.id, { fontSize: parseInt(e.target.value) || 12 })} /></div>
                                        <div className="editor-field"><label>Color</label><input type="color" value={selectedSource.style?.color} onChange={(e) => updateSourceStyle(selectedSource.id, { color: e.target.value })} style={{ padding: '2px', height: '32px' }} /></div>
                                    </div>

                                    <div className="font-tool-row">
                                        <button className={`font-tool-btn ${selectedSource.style?.bold ? 'active' : ''}`} onClick={() => updateSourceStyle(selectedSource.id, { bold: !selectedSource.style?.bold })}><Bold size={14} /></button>
                                        <button className={`font-tool-btn ${selectedSource.style?.italic ? 'active' : ''}`} onClick={() => updateSourceStyle(selectedSource.id, { italic: !selectedSource.style?.italic })}><Italic size={14} /></button>
                                        <div style={{ width: '8px' }}></div>
                                        <button className={`font-tool-btn ${selectedSource.style?.textAlign === 'left' ? 'active' : ''}`} onClick={() => updateSourceStyle(selectedSource.id, { textAlign: 'left' })}><AlignLeft size={14} /></button>
                                        <button className={`font-tool-btn ${selectedSource.style?.textAlign === 'center' ? 'active' : ''}`} onClick={() => updateSourceStyle(selectedSource.id, { textAlign: 'center' })}><AlignCenter size={14} /></button>
                                        <button className={`font-tool-btn ${selectedSource.style?.textAlign === 'right' ? 'active' : ''}`} onClick={() => updateSourceStyle(selectedSource.id, { textAlign: 'right' })}><AlignRight size={14} /></button>
                                    </div>
                                </>
                            )}

                            {(selectedSource.type === 'video' || selectedSource.type === 'audio') && (
                                <div className="video-playback-controls">
                                    <label className="menu-label">{selectedSource.type === 'video' ? 'Video' : 'Audio'} Playback</label>
                                    <div className="action-row" style={{ marginTop: '4px' }}>
                                        <button className="btn-mini primary flex-1" onClick={() => {
                                            const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, playing: !s.playing } : s);
                                            setPreviewSources(updated);
                                            setScenes(scenes.map(sc => sc.id === activeSceneId ? { ...sc, sources: updated } : sc));
                                        }}>
                                            {selectedSource.playing ? <Pause size={14} /> : <Play size={14} />}
                                            <span>{selectedSource.playing ? 'Pause' : 'Play'}</span>
                                        </button>
                                        <button className="btn-mini secondary" onClick={() => {
                                            const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, playing: true } : s);
                                            setPreviewSources(updated);
                                        }} title="Restart"><RotateCcw size={14} /></button>
                                    </div>

                                    {playbackStatus && playbackStatus.id === selectedSource.id && (
                                        <div className="seeker-widget" style={{ marginTop: '12px' }}>
                                            <div className="time-info" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '4px', opacity: 0.7 }}>
                                                <span>{formatTime(playbackStatus.currentTime)}</span>
                                                <span>{formatTime(playbackStatus.duration)}</span>
                                            </div>
                                            <input 
                                                type="range" 
                                                className="seeker-bar"
                                                min="0" 
                                                max={playbackStatus.duration} 
                                                step="0.1"
                                                value={playbackStatus.currentTime} 
                                                onChange={(e) => setSeekRequest({ id: selectedSource.id, time: parseFloat(e.target.value), timestamp: Date.now() })}
                                            />
                                            <div className="skip-controls" style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                                                <button className="btn-mini secondary flex-1" onClick={() => skip(-10)} title="Skip Backward 10s">
                                                    <SkipBack size={14} />
                                                    <span>-10s</span>
                                                </button>
                                                <button className="btn-mini secondary flex-1" onClick={() => skip(10)} title="Skip Forward 10s">
                                                    <span>+10s</span>
                                                    <SkipForward size={14} />
                                                </button>
                                            </div>

                                            <div className="volume-control" style={{ marginTop: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                    <Volume2 size={14} />
                                                    <label className="menu-label" style={{ marginBottom: 0 }}>Volume</label>
                                                    <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.7 }}>{Math.round((selectedSource.volume ?? 1) * 100)}%</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    className="seeker-bar"
                                                    min="0" 
                                                    max="1" 
                                                    step="0.01"
                                                    value={selectedSource.volume ?? 1} 
                                                    onChange={(e) => {
                                                        const val = parseFloat(e.target.value);
                                                        const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, volume: val } : s);
                                                        setPreviewSources(updated);
                                                        setScenes(scenes.map(sc => sc.id === activeSceneId ? { ...sc, sources: updated } : sc));
                                                    }}
                                                />
                                            </div>

                                            {selectedSource.type === 'audio' && (
                                                <div className="audio-theme-control" style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                                                    <label className="menu-label">Preview Theme</label>
                                                    <div className="editor-grid" style={{ marginTop: '8px' }}>
                                                        <div className="editor-field">
                                                            <label>Primary</label>
                                                            <input type="color" value={selectedSource.style?.color || '#6366f1'} onChange={(e) => updateSourceStyle(selectedSource.id, { color: e.target.value })} style={{ padding: '2px', height: '32px' }} />
                                                        </div>
                                                        <div className="editor-field">
                                                            <label>Accent</label>
                                                            <input type="color" value={selectedSource.style?.accentColor || '#0f172a'} onChange={(e) => updateSourceStyle(selectedSource.id, { accentColor: e.target.value })} style={{ padding: '2px', height: '32px' }} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="layout-tools" style={{ marginTop: '16px', padding: '0 12px' }}>
                                <label className="menu-label">Fit & Layout</label>
                                <div className="editor-grid" style={{ marginTop: '8px', gap: '4px' }}>
                                    <button className={`btn-mini ${(!selectedSource.fit || selectedSource.fit === 'fill') ? 'primary' : 'secondary'}`} onClick={() => updateSourceTransform(selectedSource.id, { fit: 'fill' })}>Stretch</button>
                                    <button className={`btn-mini ${selectedSource.fit === 'cover' ? 'primary' : 'secondary'}`} onClick={() => updateSourceTransform(selectedSource.id, { fit: 'cover' })}>Cover (Center)</button>
                                    <button className={`btn-mini ${selectedSource.fit === 'contain' ? 'primary' : 'secondary'}`} onClick={() => updateSourceTransform(selectedSource.id, { fit: 'contain' })}>Contain</button>
                                </div>
                                <div className="editor-grid" style={{ marginTop: '8px', gap: '4px' }}>
                                    <button className="btn-mini secondary" onClick={() => updateSourceTransform(selectedSource.id, { x: 0, y: 0, width: 960, height: 1080 })}>Left Half</button>
                                    <button className="btn-mini secondary" onClick={() => updateSourceTransform(selectedSource.id, { x: 960, y: 0, width: 960, height: 1080 })}>Right Half</button>
                                    <button className="btn-mini secondary" onClick={() => updateSourceTransform(selectedSource.id, { x: 0, y: 0, width: 1920, height: 1080 })}>Full</button>
                                </div>
                            </div>

                            <div className="editor-grid" style={{ marginTop: '16px', padding: '0 12px' }}>
                                <div className="editor-field"><label>X</label><input type="number" value={selectedSource.x} onChange={(e) => updateSourceTransform(selectedSource.id, { x: parseInt(e.target.value) || 0 })} /></div>
                                <div className="editor-field"><label>Y</label><input type="number" value={selectedSource.y} onChange={(e) => updateSourceTransform(selectedSource.id, { y: parseInt(e.target.value) || 0 })} /></div>
                                <div className="editor-field"><label>W</label><input type="number" value={selectedSource.width} onChange={(e) => updateSourceTransform(selectedSource.id, { width: parseInt(e.target.value) || 0 })} /></div>
                                <div className="editor-field"><label>H</label><input type="number" value={selectedSource.height} onChange={(e) => updateSourceTransform(selectedSource.id, { height: parseInt(e.target.value) || 0 })} /></div>
                            </div>
                            <button className="btn-ghost" style={{ marginTop: '12px' }} onClick={() => setSelectedSourceId(null)}>Deselect</button>
                        </div>
                    ) : selectedOverlay ? (
                        <div className="properties-panel-content">
                            <div className="column-header-with-controls">
                                <span className="column-title">{selectedOverlay.type.toUpperCase()}</span>
                            </div>
                            <div className="column-body">
                                <div className="editor-grid single">
                                    <div className="editor-field"><label>Text</label><input type="text" value={selectedOverlay.title} onChange={(e) => updateOverlay(selectedOverlay.id, { title: e.target.value })} /></div>
                                    {selectedOverlay.type === 'lower-third' && (
                                        <div className="editor-field"><label>Subtitle</label><input type="text" value={selectedOverlay.subtitle} onChange={(e) => updateOverlay(selectedOverlay.id, { subtitle: e.target.value })} /></div>
                                    )}
                                </div>

                                {selectedOverlay.type === 'lower-third' && (
                                    <>
                                        <div className="editor-grid" style={{ marginTop: '12px' }}>
                                            <div className="editor-field">
                                                <label>Main Color</label>
                                                <input type="color" value={selectedOverlay.style?.backgroundColor || '#6366f1'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), backgroundColor: e.target.value } })} />
                                            </div>
                                            <div className="editor-field">
                                                <label>Accent</label>
                                                <input type="color" value={selectedOverlay.style?.accentColor || '#0f172a'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), accentColor: e.target.value } })} />
                                            </div>
                                        </div>
                                        <div className="editor-field" style={{ marginTop: '12px' }}>
                                            <label>Font Size</label>
                                            <input type="number" value={selectedOverlay.style?.fontSize || 44} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), fontSize: parseInt(e.target.value) || 44 } })} />
                                        </div>
                                    </>
                                )}

                                {selectedOverlay.type === 'logo' && (
                                    <div className="logo-controls" style={{ marginTop: '12px' }}>
                                        <div className="editor-grid">
                                            <div className="editor-field">
                                                <label>X Position</label>
                                                <input type="number" value={selectedOverlay.x || 1700} onChange={(e) => updateOverlay(selectedOverlay.id, { x: parseInt(e.target.value) || 0 })} />
                                            </div>
                                            <div className="editor-field">
                                                <label>Y Position</label>
                                                <input type="number" value={selectedOverlay.y || 50} onChange={(e) => updateOverlay(selectedOverlay.id, { y: parseInt(e.target.value) || 0 })} />
                                            </div>
                                        </div>
                                        <div className="editor-field" style={{ marginTop: '12px' }}>
                                            <label>Logo Size</label>
                                            <input type="range" min="50" max="800" value={selectedOverlay.width || 150} onChange={(e) => updateOverlay(selectedOverlay.id, { width: parseInt(e.target.value), height: parseInt(e.target.value) })} />
                                        </div>
                                    </div>
                                )}

                                {selectedOverlay.type === 'ticker' && (
                                    <div className="ticker-controls" style={{ marginTop: '12px' }}>
                                        <div className="editor-field">
                                            <label>Scroll Speed</label>
                                            <input 
                                                type="range" 
                                                className="seeker-bar"
                                                min="1" 
                                                max="20" 
                                                value={selectedOverlay.speed || 3} 
                                                onChange={(e) => updateOverlay(selectedOverlay.id, { speed: parseInt(e.target.value) })}
                                            />
                                        </div>
                                        <div className="editor-grid" style={{ marginTop: '12px' }}>
                                            <div className="editor-field">
                                                <label>Text Color</label>
                                                <input type="color" value={selectedOverlay.style?.color || '#ffffff'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 24, color: '#ffffff', backgroundColor: 'rgba(15, 23, 42, 0.95)' }), color: e.target.value } })} />
                                            </div>
                                            <div className="editor-field">
                                                <label>Background</label>
                                                <input type="color" value={selectedOverlay.style?.backgroundColor || '#0f172a'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 24, color: '#ffffff', backgroundColor: 'rgba(15, 23, 42, 0.95)' }), backgroundColor: e.target.value } })} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <Move size={24} />
                            <p>Select Item</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
      </main>

      {isSelectorOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-head">
                <h2>Add Input</h2>
                <div className="tab-row">
                    <button className={selectorTab === 'screens' ? 'active' : ''} onClick={() => setSelectorTab('screens')} style={{ color: selectorTab === 'screens' ? 'var(--accent)' : 'var(--tx-1)' }}>Screens</button>
                    <button className={selectorTab === 'cameras' ? 'active' : ''} onClick={() => setSelectorTab('cameras')} style={{ color: selectorTab === 'cameras' ? 'var(--accent)' : 'var(--tx-1)' }}>Cameras</button>
                </div>
                <button onClick={() => setIsSelectorOpen(false)} className="close-x"><X size={20} /></button>
            </div>
            <div className="modal-grid">
                {selectorTab === 'screens' ? availableScreens.map(source => (
                    <div key={source.id} className="grid-item" onClick={() => addSource(source)}>
                        <img src={source.thumbnail.toDataURL()} alt="" />
                        <span>{source.name}</span>
                    </div>
                )) : availableCameras.map(device => (
                    <div key={device.deviceId} className="grid-item camera" onClick={() => addCameraSource(device)}>
                        <Video size={40} />
                        <span>{device.label || 'Camera'}</span>
                    </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="modal-box settings">
            <div className="modal-head">
                <h2>Broadcasting</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="close-x"><X size={20} /></button>
            </div>
            <div className="modal-form">
                <div className="form-group"><label>RTMP URL</label><input type="text" value={streamingConfig.rtmpUrl} onChange={(e) => setStreamingConfig({ ...streamingConfig, rtmpUrl: e.target.value })} /></div>
                <div className="form-group"><label>Stream Key</label><input type="password" value={streamingConfig.streamKey} onChange={(e) => setStreamingConfig({ ...streamingConfig, streamKey: e.target.value })} /></div>
            </div>
            <div className="modal-foot"><button className="btn-primary" onClick={() => setIsSettingsOpen(false)}>Save</button></div>
          </div>
        </div>
      )}
      {isPdfGridOpen && pdfGridSourceId && (
        <PdfGridModal 
            source={previewSources.find(s => s.id === pdfGridSourceId)!}
            onClose={() => setIsPdfGridOpen(false)}
            onSelect={(page) => {
                handleSourceMetadata(pdfGridSourceId, { page });
                setIsPdfGridOpen(false);
            }}
        />
      )}
    </div>
  );
}

const PdfGridModal = ({ source, onClose, onSelect }: { source: Source, onClose: () => void, onSelect: (page: number) => void }) => {
    const [thumbs, setThumbs] = useState<string[]>([]);

    useEffect(() => {
        const loadThumbs = async () => {
            if (!(window as any).pdfjsLib) return;
            const pdfjsLib = (window as any).pdfjsLib;
            const pdf = await pdfjsLib.getDocument(source.data).promise;
            const newThumbs = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.3 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
                newThumbs.push(canvas.toDataURL());
            }
            setThumbs(newThumbs);
        };
        loadThumbs();
    }, [source]);

    return (
        <div className="modal-overlay">
            <div className="modal-box" style={{ maxWidth: '900px' }}>
                <div className="modal-head">
                    <h2>Select Slide</h2>
                    <button className="icon-btn" onClick={onClose}><X size={20} /></button>
                </div>
                <div className="modal-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                    {thumbs.length > 0 ? thumbs.map((t, i) => (
                        <div key={i} className={`grid-item ${source.page === i + 1 ? 'active' : ''}`} onClick={() => onSelect(i + 1)} style={{ border: source.page === i + 1 ? '2px solid var(--accent)' : '' }}>
                            <img src={t} alt={`Page ${i + 1}`} />
                            <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '4px' }}>Page {i + 1}</div>
                        </div>
                    )) : (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', opacity: 0.5 }}>Generating slide previews...</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default App;
