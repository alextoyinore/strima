import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Monitor, Camera, Mic, Play, Square, Settings as SettingsIcon, Layers, Plus, X, Video, Radio, Minus, Square as Maximize, Palette, Sun, Moon, Laptop, Move, Maximize2, Save, Trash2, Type, Image as ImageIcon, Globe, MicOff, Volume2, Zap, ChevronRight, ChevronLeft, Grid, Eye, EyeOff, Film, FileText, Presentation, Pause, RotateCcw, AlignLeft, AlignCenter, AlignRight, Bold, Italic, SkipBack, SkipForward, HelpCircle, Info, MousePointer2, ExternalLink, BookOpen, Check } from 'lucide-react';
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
  title?: string;
  subtitle?: string;
  cover?: string;
  style?: {
    fontSize: number;
    fontFamily: string;
    color: string;
    bold: boolean;
    italic: boolean;
    textAlign: 'left' | 'center' | 'right';
  };
  audioDeviceId?: string;
}

interface Overlay {
  id: string;
  type: 'lower-third' | 'ticker' | 'logo' | 'headline';
  title: string;
  subtitle: string;
  visible: boolean;
  data?: string;
  variant?: 'classic' | 'modern' | 'minimal';
  animation?: 'fade' | 'slide-left' | 'slide-up';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  speed?: number;
  style?: {
    fontSize: number;
    color: string;
    backgroundColor: string;
    opacity?: number;
    subtitleColor?: string;
    subtitleBackgroundColor?: string;
    subtitleFontSize?: number;
    accentColor?: string;
    showAccent?: boolean;
    fontFamily?: string;
    subtitleFontFamily?: string;
    textAlign?: 'left' | 'center' | 'right';
  };
  subtitleX?: number;
  subtitleY?: number;
  subtitleWidth?: number;
  subtitleHeight?: number;
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
  bitrate: number;
}

type ThemeMode = 'light' | 'dark' | 'system';
type AccentColor = 'slate' | 'gold' | 'teal' | 'crimson' | 'electric';
type SelectorTab = 'screens' | 'windows' | 'cameras';
type SourceEditMode = 'screen' | 'camera' | 'audio' | 'video' | 'image' | null;

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
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [streamingConfig, setStreamingConfig] = useState({ rtmpUrl: 'rtmps://a.rtmp.youtube.com/live2', streamKey: '', bitrate: 4000 });
  
  const [activeSceneId, setActiveSceneId] = useState('scene-1');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectorTab, setSelectorTab] = useState<SelectorTab>('screens');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [availableScreens, setAvailableScreens] = useState<any[]>([]);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordingPaused, setIsRecordingPaused] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'error' | 'success' | 'info' } | null>(null);
  const [statusBarHint, setStatusBarHint] = useState<string | null>(null);
  const [streamElapsed, setStreamElapsed] = useState(0);
  const [recordElapsed, setRecordElapsed] = useState(0);
  const streamStartRef = useRef<number | null>(null);
  const recordStartRef = useRef<number | null>(null);
  
  const showStatus = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
    setStatusMessage({ text, type });
    setTimeout(() => setStatusMessage(null), 3000);
  };
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
  const [sourceEditModal, setSourceEditModal] = useState<{ sourceId: string; mode: SourceEditMode } | null>(null);
  const [editCameraId, setEditCameraId] = useState<string>('');
  const [editMicId, setEditMicId] = useState<string>('default');
  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [isHowToUseOpen, setIsHowToUseOpen] = useState(false);
  const [isInfoMenuOpen, setIsInfoMenuOpen] = useState(false);
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
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
          if (config.isAutoSaveEnabled !== undefined) setIsAutoSaveEnabled(config.isAutoSaveEnabled);
          if (config.consoleHeight) setConsoleHeight(config.consoleHeight);
          if (config.sidebarWidth) setSidebarWidth(config.sidebarWidth);
          if (config.assetSidebarWidth) setAssetSidebarWidth(config.assetSidebarWidth);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    const updateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAvailableCameras(devices.filter(d => d.kind === 'videoinput'));
        setAvailableMics(devices.filter(d => d.kind === 'audioinput'));
      } catch (e) {
        console.error(e);
      }
    };
    updateDevices();
    navigator.mediaDevices.addEventListener('devicechange', updateDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', updateDevices);
    };
  }, []);

  const saveWorkspace = () => {
    setIsSaving(true);
    window.electron.saveConfig({ 
      scenes, activeSceneId, streamingConfig, themeMode, accentColor, isAutoSaveEnabled,
      consoleHeight, sidebarWidth, assetSidebarWidth 
    });
    setTimeout(() => {
        setIsSaving(false);
        showStatus('Workspace Saved', 'success');
    }, 1000);
  };

  useEffect(() => {
    if (isAutoSaveEnabled) {
      window.electron.saveConfig({ 
        scenes, activeSceneId, streamingConfig, themeMode, accentColor, isAutoSaveEnabled,
        consoleHeight, sidebarWidth, assetSidebarWidth 
      });
    }
  }, [scenes, activeSceneId, streamingConfig, themeMode, accentColor, isAutoSaveEnabled, consoleHeight, sidebarWidth, assetSidebarWidth]);

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

  // Status bar: global mouseover reads data-hint attributes
  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      let el = e.target as HTMLElement | null;
      while (el) {
        const hint = el.dataset?.hint;
        if (hint) { setStatusBarHint(hint); return; }
        el = el.parentElement;
      }
      setStatusBarHint(null);
    };
    document.addEventListener('mouseover', handleMouseOver);
    return () => document.removeEventListener('mouseover', handleMouseOver);
  }, []);

  // Status bar: elapsed time tickers for stream + recording
  useEffect(() => {
    const interval = setInterval(() => {
      if (streamStartRef.current !== null)
        setStreamElapsed(Math.floor((Date.now() - streamStartRef.current) / 1000));
      if (recordStartRef.current !== null && !isRecordingPaused)
        setRecordElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecordingPaused]);

  const toggleMic = async () => {
    if (isMicEnabled) {
      if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
      setIsMicEnabled(false);
    } else {
      try {
        const audioConstraints = selectedMicId && selectedMicId !== 'default'
            ? { deviceId: { exact: selectedMicId } }
            : true;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
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
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        const audioDevices = devices.filter(d => d.kind === 'audioinput');
        setAvailableCameras(videoDevices);
        setAvailableMics(audioDevices);
        
        if (videoDevices.length > 0) {
          setSelectedCameraId(videoDevices[0].deviceId);
        } else {
          setSelectedCameraId('');
        }
        setSelectedMicId('default');
    } catch (e) {
      console.error(e);
    }
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

  const addCameraSource = (device: MediaDeviceInfo, micId = 'default') => {
    const newSource: Source = {
      id: device.deviceId,
      name: device.label || `Camera ${availableCameras.indexOf(device) + 1}`,
      type: 'camera', 
      visible: true, 
      x: 1400, y: 700, width: 480, height: 270,
      audioDeviceId: micId
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
      const newSource: Source = { 
        id: `aud-${Date.now()}`, 
        name: 'Audio Source', 
        type: 'audio', 
        data: dataUrl, 
        visible: true, 
        x: 0, y: 0, width: 1920, height: 1080, 
        playing: true,
        title: 'NOW PLAYING',
        subtitle: 'Audio Track'
      };
      const updated = [...previewSources, newSource];
      setPreviewSources(updated);
      setSelectedSourceId(newSource.id);
      setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
    }
  };

  // ─── Source In-place Replacement ───────────────────────────────────────────

  const replaceSourceData = (id: string, updates: Partial<Source>) => {
    const updated = previewSources.map(s => s.id === id ? { ...s, ...updates } : s);
    setPreviewSources(updated);
    setScenes(scenes.map(s => s.id === activeSceneId ? { ...s, sources: updated } : s));
  };

  const handleSourceDoubleClick = async (source: Source, e: React.MouseEvent) => {
    e.stopPropagation();
    if (source.type === 'screen' || source.type === 'window') {
      // Re-open the screen/window selector in the appropriate tab
      const screens = await window.electron.getSources();
      setAvailableScreens(screens);
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAvailableCameras(devices.filter(d => d.kind === 'videoinput'));
        setAvailableMics(devices.filter(d => d.kind === 'audioinput'));
      } catch (e) { console.error(e); }
      setSelectorTab(source.type === 'screen' ? 'screens' : 'windows');
      setSourceEditModal({ sourceId: source.id, mode: source.type });
    } else if (source.type === 'camera') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setAvailableCameras(devices.filter(d => d.kind === 'videoinput'));
        setAvailableMics(devices.filter(d => d.kind === 'audioinput'));
      } catch (e) { console.error(e); }
      setEditCameraId(source.id);
      setEditMicId(source.audioDeviceId || 'default');
      setSourceEditModal({ sourceId: source.id, mode: 'camera' });
    } else if (source.type === 'audio') {
      setSourceEditModal({ sourceId: source.id, mode: 'audio' });
    } else if (source.type === 'video') {
      setSourceEditModal({ sourceId: source.id, mode: 'video' });
    } else if (source.type === 'image') {
      setSourceEditModal({ sourceId: source.id, mode: 'image' });
    }
  };

  const applyScreenEdit = (newScreen: any) => {
    if (!sourceEditModal) return;
    const id = sourceEditModal.sourceId;
    // Stop existing stream for this source so Composer re-creates it
    replaceSourceData(id, {
      id: newScreen.id,
      name: newScreen.name,
      type: newScreen.id.startsWith('screen') ? 'screen' : 'window',
      thumbnail: newScreen.thumbnail.toDataURL(),
    });
    // Also update selectedSourceId if it was the edited one
    if (selectedSourceId === id) setSelectedSourceId(newScreen.id);
    setSourceEditModal(null);
  };

  const applyCameraEdit = () => {
    if (!sourceEditModal) return;
    const id = sourceEditModal.sourceId;
    const camDevice = availableCameras.find(c => c.deviceId === editCameraId);
    if (!camDevice) return;
    replaceSourceData(id, {
      id: camDevice.deviceId,
      name: camDevice.label || `Camera ${availableCameras.indexOf(camDevice) + 1}`,
      audioDeviceId: editMicId,
    });
    if (selectedSourceId === id) setSelectedSourceId(camDevice.deviceId);
    setSourceEditModal(null);
  };

  const applyFileEdit = async (mode: 'audio' | 'video' | 'image') => {
    if (!sourceEditModal) return;
    const id = sourceEditModal.sourceId;
    let filters: { name: string; extensions: string[] }[] = [];
    if (mode === 'audio') filters = [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }];
    else if (mode === 'video') filters = [{ name: 'Videos', extensions: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'wmv', 'ts'] }];
    else filters = [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }];
    const dataUrl = await window.electron.selectFile({ filters });
    if (dataUrl) {
      replaceSourceData(id, { data: dataUrl });
    }
    setSourceEditModal(null);
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

  const addOverlay = (type: 'lower-third' | 'ticker' | 'logo' | 'headline', data?: string) => {
    const newOverlay: Overlay = {
      id: `ovl-${Date.now()}`,
      type,
      title: type === 'logo' ? 'Branding Logo' : (type === 'ticker' ? 'Scroll Text' : (type === 'headline' ? 'MAIN HEADLINE' : 'New Lower Third')),
      subtitle: type === 'lower-third' ? 'Presenter Title' : (type === 'headline' ? 'Supporting text or sub-headline' : ''),
      visible: true,
      data,
      variant: type === 'lower-third' ? 'classic' : undefined,
      animation: 'fade',
      x: type === 'logo' ? 1700 : (type === 'headline' ? 0 : (type === 'ticker' ? 0 : 100)),
      y: type === 'logo' ? 50 : (type === 'headline' ? 800 : (type === 'ticker' ? 1030 : 850)),
      width: type === 'logo' ? 150 : (type === 'headline' ? 1200 : (type === 'ticker' ? 1920 : 650)),
      height: type === 'logo' ? 150 : (type === 'headline' ? 140 : (type === 'ticker' ? 50 : 100)),
      subtitleX: type === 'headline' ? 0 : (type === 'lower-third' ? 100 : undefined),
      subtitleY: type === 'headline' ? 890 : (type === 'lower-third' ? 950 : undefined),
      subtitleWidth: type === 'headline' ? 1200 : (type === 'lower-third' ? 450 : undefined),
      subtitleHeight: type === 'headline' ? 50 : (type === 'lower-third' ? 50 : undefined),
      speed: type === 'ticker' ? 3 : undefined,
      style: (type === 'lower-third' || type === 'headline' || type === 'ticker') ? { 
        fontSize: type === 'headline' ? 60 : (type === 'ticker' ? 24 : 44), 
        color: '#ffffff', 
        backgroundColor: type === 'headline' ? 'rgba(0,0,0,0.85)' : (type === 'ticker' ? '#0f172a' : '#6366f1'), 
        subtitleBackgroundColor: type === 'headline' ? 'rgba(0,0,0,0.6)' : (type === 'lower-third' ? '#0f172a' : undefined),
        accentColor: type === 'lower-third' ? '#0f172a' : '#6366f1',
        showAccent: true,
        opacity: 1,
        fontFamily: 'Outfit, sans-serif',
        subtitleFontFamily: 'Inter, sans-serif',
        textAlign: 'left'
      } : undefined
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

  const handleLiveStreamCreated = useCallback((stream: MediaStream) => {
    composerStreamRef.current = stream;
  }, []);

  const getBestSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm'
    ];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return 'video/webm';
  };

  const startStreaming = async () => {
    if (!composerStreamRef.current) {
        showStatus('Engine not ready. Try again in a moment.', 'error');
        return;
    }
    if (!streamingConfig.streamKey) { 
        showStatus('Stream Key missing! Check settings.', 'error');
        setIsSettingsOpen(true);
        return; 
    }
    setIsStreaming(true);
    streamStartRef.current = Date.now();
    setStreamElapsed(0);
    showStatus('Connecting to stream...', 'info');
    try {
        const baseUrl = streamingConfig.rtmpUrl.trim();
        const normalizedUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
        const fullStreamUrl = `${normalizedUrl}${streamingConfig.streamKey.trim()}`;

        await window.electron.startFFmpeg({ 
          isStreaming: true, 
          streamUrl: fullStreamUrl,
          bitrate: streamingConfig.bitrate
        });

        const mime = getBestSupportedMimeType();
        console.log('Starting MediaRecorder for streaming with mimeType:', mime);

        const recorder = new MediaRecorder(composerStreamRef.current, { mimeType: mime, videoBitsPerSecond: 6000000 });
        recorder.ondataavailable = async (e) => { if (e.data.size > 0) window.electron.sendChunk(await e.data.arrayBuffer()); };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        showStatus('Live!', 'success');
    } catch (e) {
        console.error('Streaming failed to start:', e);
        showStatus('Streaming failed to start.', 'error');
        setIsStreaming(false);
    }
  };

  const stopStreaming = async () => { setIsStreaming(false); streamStartRef.current = null; setStreamElapsed(0); if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); mediaRecorderRef.current = null; } await window.electron.stopFFmpeg(); };

  const startRecording = async () => {
    if (!composerStreamRef.current) {
        showStatus('Engine not ready.', 'error');
        return;
    }
    setIsRecording(true);
    setIsRecordingPaused(false);
    recordStartRef.current = Date.now();
    setRecordElapsed(0);
    showStatus('Starting recording...', 'info');
    try {
        await window.electron.startFFmpeg({ outputPath: `recording-${Date.now()}.mp4`, isStreaming: false });
        const mime = getBestSupportedMimeType();
        console.log('Starting MediaRecorder for recording with mimeType:', mime);

        const recorder = new MediaRecorder(composerStreamRef.current, { mimeType: mime, videoBitsPerSecond: 5000000 });
        recorder.ondataavailable = async (e) => { if (e.data.size > 0) window.electron.sendChunk(await e.data.arrayBuffer()); };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        showStatus('Recording Started', 'success');
    } catch (e) {
        console.error('Recording failed to start:', e);
        showStatus('Recording failed to start.', 'error');
        setIsRecording(false);
    }
  };

  const stopRecording = async () => { 
    setIsRecording(false); 
    setIsRecordingPaused(false);
    recordStartRef.current = null;
    setRecordElapsed(0);
    if (mediaRecorderRef.current) { 
        mediaRecorderRef.current.stop(); 
        mediaRecorderRef.current = null; 
    } 
    await window.electron.stopFFmpeg();
    showStatus('Recording saved to Videos folder', 'success');
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.pause();
        setIsRecordingPaused(true);
        showStatus('Recording Paused', 'info');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
        mediaRecorderRef.current.resume();
        setIsRecordingPaused(false);
        showStatus('Recording Resumed', 'success');
    }
  };

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
              <button data-hint="Start live stream to your configured RTMP destination" className={`btn-mini ${isStreaming ? 'live' : 'primary'}`} onClick={isStreaming ? stopStreaming : startStreaming}>
                {isStreaming ? <Square size={14} /> : <Radio size={14} />}
                <span>{isStreaming ? 'Stop Stream' : 'Go Live'}</span>
              </button>
              {!isRecording ? (
                <button data-hint="Start recording to a local MP4 file" className="btn-mini secondary" onClick={startRecording}>
                  <Play size={14} />
                  <span>Record</span>
                </button>
              ) : (
                <>
                  <button data-hint="Stop recording and save the file to your Videos folder" className={`btn-mini ${isRecordingPaused ? 'secondary' : 'recording'}`} onClick={stopRecording}>
                    <Square size={14} />
                    <span>Stop Rec</span>
                  </button>
                  <button data-hint={isRecordingPaused ? 'Resume the paused recording' : 'Pause the current recording'} className={`btn-mini ${isRecordingPaused ? 'primary' : 'secondary'}`} onClick={isRecordingPaused ? resumeRecording : pauseRecording}>
                    {isRecordingPaused ? <Play size={14} /> : <Pause size={14} />}
                    <span>{isRecordingPaused ? 'Resume' : 'Pause'}</span>
                  </button>
                </>
              )}
            </div>
        </div>
        <div className="header-right">
          {statusMessage && (
            <div className={`status-toast ${statusMessage.type}`} style={{ 
                marginRight: '12px', 
                fontSize: '12px', 
                fontWeight: '600', 
                padding: '6px 12px', 
                borderRadius: '4px',
                background: statusMessage.type === 'error' ? 'var(--accent-crimson)' : (statusMessage.type === 'success' ? 'var(--accent-teal)' : 'var(--bg-3)'),
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                animation: 'slide-in 0.3s ease-out'
            }}>
                {statusMessage.type === 'error' ? <X size={14} /> : (statusMessage.type === 'success' ? <Check size={14} /> : <Info size={14} />)}
                {statusMessage.text}
            </div>
          )}
          <button data-hint="Save the current workspace, scenes and layout configuration" className="icon-btn" onClick={saveWorkspace} title={isSaving ? 'Workspace Saved!' : 'Save Workspace'} style={{ marginRight: '8px' }}>
            <Save size={20} className={isSaving ? 'animate-pulse' : ''} style={{ color: isSaving ? 'var(--accent-solid)' : 'inherit' }} />
          </button>
          <div className="theme-selector-container" ref={themeMenuRef}>
            <button data-hint="Toggle dark / light theme and change accent colour palette" className="icon-btn" onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}>
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
          <button data-hint="Open broadcast settings — RTMP URL, stream key, bitrate" className="icon-btn" onClick={() => setIsSettingsOpen(true)} title="Settings"><SettingsIcon size={20} /></button>
          
          <div className="theme-selector-container" style={{ marginLeft: '4px' }}>
            <button data-hint="About Strima, keyboard shortcuts, and usage guide" className="icon-btn" onClick={() => setIsInfoMenuOpen(!isInfoMenuOpen)} title="Information">
              <Info size={20} />
            </button>
            {isInfoMenuOpen && (
              <div className="theme-menu" style={{ right: 0 }}>
                <div className="menu-group">
                  <button onClick={() => { setIsAboutOpen(true); setIsInfoMenuOpen(false); }} className="menu-opt">
                    <Info size={14} /> About Strima
                  </button>
                  <button onClick={() => { setIsHelpOpen(true); setIsInfoMenuOpen(false); }} className="menu-opt">
                    <HelpCircle size={14} /> Shortcuts & Help
                  </button>
                  <button onClick={() => { setIsHowToUseOpen(true); setIsInfoMenuOpen(false); }} className="menu-opt">
                    <BookOpen size={14} /> How to Use
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="studio-layout-pro">
        <section className="studio-main-viewport">
            <aside className="asset-sidebar" style={{ width: assetSidebarWidth }}>
                <h3 className="sidebar-title">Assets</h3>
                <div className="asset-grid-mini">
                    <button data-hint="Add screen share or window capture — pick a display or app window" className="asset-btn" title="Screen Share" onClick={openSelector}><Monitor size={18} /><span>Screen</span></button>
                    <button data-hint="Import an image file (JPG, PNG, WebP) into the scene" className="asset-btn" title="Add Image" onClick={addImageSource}><ImageIcon size={18} /><span>Image</span></button>
                    <button data-hint="Import a video file (MP4, MKV, MOV…) — plays on loop" className="asset-btn" title="Add Video" onClick={addVideoSource}><Film size={18} /><span>Video</span></button>
                    <button data-hint="Import an audio file (MP3, WAV, AAC…) — plays on loop" className="asset-btn" title="Add Audio" onClick={addAudioSource}><Volume2 size={18} /><span>Audio</span></button>
                    <button data-hint="Add a video from a URL — paste a direct video link" className="asset-btn" title="Link Video" onClick={linkVideoSource}><Globe size={18} /><span>Link</span></button>
                    <button data-hint="Add a text element — style font, size, colour and alignment" className="asset-btn" title="Add Text" onClick={addTextSource}><Type size={18} /><span>Text</span></button>
                    <button data-hint="Import a PDF or PowerPoint presentation as a slide source" className="asset-btn" title="Add PDF / Slides" onClick={() => addFileSource('pdf')}><Presentation size={18} /><span>Slides</span></button>
                    <button data-hint="Add a lower third graphic — name, title and animated entry" className="asset-btn" title="Add Lower Third" onClick={() => addOverlay('lower-third')}><Layers size={18} /><span>Lower</span></button>
                    <button data-hint="Add a scrolling news ticker — text scrolls continuously across the bottom" className="asset-btn" title="Add Ticker" onClick={() => addOverlay('ticker')}><Zap size={18} /><span>Ticker</span></button>
                    <button data-hint="Add a headline graphic — bold main title with supporting subtitle bar" className="asset-btn" title="Add Headline" onClick={() => addOverlay('headline')}><FileText size={18} /><span>Headline</span></button>
                    <button data-hint="Add a logo or branding image overlay — drag to reposition" className="asset-btn" title="Add Logo" onClick={async () => {
                        const path = await (window as any).electron.selectFile({ filters: [{ name: 'Logos', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }] });
                        if (path) addOverlay('logo', path);
                    }}><ImageIcon size={18} /><span>Logo</span></button>
                </div>
            </aside>

            <div className="resizer-v" onMouseDown={() => { isResizingRef.current = 'asset-sidebar'; document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none'; }}></div>

            <section className="dual-monitor-section">
                <div className="monitor-container preview">
                    <div className="monitor-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>PREVIEW</span>
                            <button data-hint="Toggle safe area guides and 9:16 social media zone overlay" className={`icon-btn xs ${showSafeAreas ? 'accent' : ''}`} onClick={() => setShowSafeAreas(!showSafeAreas)} title="Toggle Safe Areas & 9:16 Zone">
                                <Maximize size={14} />
                            </button>
                            <button data-hint="Toggle rule of thirds composition grid" className={`icon-btn xs ${showGrid ? 'accent' : ''}`} onClick={() => setShowGrid(!showGrid)} title="Toggle Rule of Thirds Grid">
                                <Grid size={14} />
                            </button>
                        </div>
                        <span className="status-tag">STAGING</span>
                    </div>
                    <div className="monitor-view">
                        <Composer 
                            sources={previewSources} 
                            overlays={previewOverlays} 
                            interactive={true}
                            showSafeAreas={showSafeAreas}
                            showGrid={showGrid}
                            selectedSourceId={selectedSourceId}
                            onSourceUpdate={updateSourceTransform}
                            onSourceSelect={setSelectedSourceId}
                            onSourceMetadata={handleSourceMetadata}
                            onPlaybackUpdate={(id, current, duration) => setPlaybackStatus({ id, currentTime: current, duration })}
                            seekRequest={seekRequest}
                            micStream={micStreamRef.current}
                        />
                    </div>
                </div>
                <div className="monitor-container live">
                    <div className="monitor-header">
                        <span>PROGRAM</span>
                        <span className="status-tag live">LIVE</span>
                    </div>
                    <div className="monitor-view">
                        <Composer 
                            sources={programSources} 
                            overlays={programOverlays} 
                            onStreamCreated={handleLiveStreamCreated} 
                            micStream={micStreamRef.current}
                        />
                    </div>
                </div>
            </section>
        </section>

        <div className="resizer-h" onMouseDown={() => { isResizingRef.current = 'console'; document.body.style.cursor = 'ns-resize'; document.body.style.userSelect = 'none'; }}></div>

        <section className="bottom-console" style={{ height: consoleHeight }}>
            <div className="console-column" style={{ width: sidebarWidth }}>
                <div className="column-header-with-controls">
                    <h3 className="column-title">Scenes</h3>
                    <button data-hint="Create a new empty scene — keyboard shortcut: press a number key to switch" className="icon-btn xs accent" onClick={createScene} title="New Scene"><Plus size={16} /></button>
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
                        <button data-hint="Instantly cut to this layout in the program output" className="btn-transition cut" onClick={executeTransition}>CUT</button>
                        <button data-hint="Fade transition to program output" className="btn-transition fade" onClick={executeTransition}>FADE</button>
                    </div>
                </div>
                <div className="column-body">
                    {previewSources.map(source => {
                        const canEdit = ['screen','window','camera','audio','video','image'].includes(source.type);
                        return (
                        <div
                            key={source.id}
                            className={`source-row ${selectedSourceId === source.id ? 'selected' : ''}`}
                            onClick={() => { setSelectedSourceId(source.id); setSelectedOverlayId(null); }}
                            onDoubleClick={(e) => canEdit && handleSourceDoubleClick(source, e)}
                            title={canEdit ? 'Double-click to change source' : ''}
                            style={{ cursor: canEdit ? 'pointer' : 'default' }}
                        >
                            <div className="row-meta">
                                {source.type === 'camera' ? <Camera size={14} /> : 
                                 source.type === 'video' ? <Film size={14} /> : 
                                 source.type === 'audio' ? <Volume2 size={14} /> : 
                                 source.type === 'text' ? <Type size={14} /> :
                                 source.type === 'pdf' ? <FileText size={14} /> :
                                 source.type === 'slides' ? <Presentation size={14} /> :
                                 <Monitor size={14} />}
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    <span className="row-name">{source.name}</span>
                                    {canEdit && (
                                        <span style={{ fontSize: '9px', color: 'var(--tx-2)', opacity: 0.6, fontWeight: 600, letterSpacing: '0.3px' }}>double-click to change</span>
                                    )}
                                </div>
                            </div>
                            <div className="row-controls">
                                {(source.type === 'camera' || source.type === 'video' || source.type === 'image' || source.type === 'pdf' || source.type === 'slides') && (
                                    <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); toggleSourceFullscreen(source.id); }}><Maximize2 size={12} /></button>
                                )}
                                <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); toggleVisibility(source.id); }}>
                                    {source.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                                </button>
                                <button className="icon-btn xs" onClick={(e) => { e.stopPropagation(); removeSource(source.id); }}><X size={12} /></button>
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>

            <div className="console-column flex-1">
                <h3 className="column-title">Mixer & Overlays</h3>
                <div className="column-body">
                    <div className="audio-mixer-widget">
                        <button data-hint="Toggle live microphone — adds your voice to the stream and recording" className={`toggle-btn ${isMicEnabled ? 'active' : ''}`} onClick={toggleMic}>
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

                            {selectedSource.type === 'camera' && (
                                <div className="camera-audio-settings" style={{ margin: '8px 0', padding: '12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div className="editor-field">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '600', color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            <Mic size={14} style={{ color: 'var(--accent)' }} /> Audio Input Device
                                        </label>
                                        <select 
                                            value={selectedSource.audioDeviceId || 'default'} 
                                            onChange={(e) => {
                                                const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, audioDeviceId: e.target.value } : s);
                                                setPreviewSources(updated);
                                                setScenes(scenes.map(sc => sc.id === activeSceneId ? { ...sc, sources: updated } : sc));
                                            }}
                                            style={{ width: '100%', marginTop: '6px', padding: '8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--tx-1)', outline: 'none' }}
                                        >
                                            <option value="default">Default Microphone</option>
                                            <option value="none">No Audio (Mute)</option>
                                            {availableMics.map(mic => (
                                                <option key={mic.deviceId} value={mic.deviceId}>
                                                    {mic.label || `Microphone (${mic.deviceId.slice(0, 5)})`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="volume-control" style={{ marginTop: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <Volume2 size={14} style={{ color: 'var(--accent)' }} />
                                            <label className="menu-label" style={{ marginBottom: 0, fontSize: '11px', fontWeight: '600', color: 'var(--tx-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Volume</label>
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
                                </div>
                            )}

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

                            {selectedSource.type === 'audio' && (
                                <div className="audio-metadata-editor" style={{ marginBottom: '16px', padding: '12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                    <div className="editor-field"><label>Track Title</label><input type="text" value={selectedSource.title || ''} onChange={(e) => {
                                        const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, title: e.target.value } : s);
                                        setPreviewSources(updated);
                                        setScenes(scenes.map(sc => sc.id === activeSceneId ? { ...sc, sources: updated } : sc));
                                    }} /></div>
                                    <div className="editor-field" style={{ marginTop: '8px' }}><label>Subtitle / Artist</label><input type="text" value={selectedSource.subtitle || ''} onChange={(e) => {
                                        const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, subtitle: e.target.value } : s);
                                        setPreviewSources(updated);
                                        setScenes(scenes.map(sc => sc.id === activeSceneId ? { ...sc, sources: updated } : sc));
                                    }} /></div>
                                    <button className="btn-ghost" style={{ marginTop: '12px' }} onClick={async () => {
                                        const path = await (window as any).electron.selectFile({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
                                        if (path) {
                                            const updated = previewSources.map(s => s.id === selectedSource.id ? { ...s, cover: path } : s);
                                            setPreviewSources(updated);
                                            setScenes(scenes.map(sc => sc.id === activeSceneId ? { ...sc, sources: updated } : sc));
                                        }
                                    }}><ImageIcon size={14} /> Change Background Image</button>
                                </div>
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
                                        </div>
                                    )}
                                    
                                    <div className="volume-control" style={{ marginTop: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                            <Volume2 size={14} />
                                            <label className="menu-label" style={{ marginBottom: 0 }}>Audio Settings</label>
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
                                </div>
                            )}

                            <div className="layout-tools" style={{ marginTop: '16px', padding: '0 12px' }}>
                                <div className="editor-grid" style={{ gap: '4px' }}>
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
                            
                            <div className="menu-divider" style={{ margin: '16px 12px' }}></div>
                            <div style={{ padding: '0 12px' }}>
                                <button className="btn-ghost w-full" onClick={() => setSelectedSourceId(null)}>Deselect Asset</button>
                            </div>
                        </div>
                    ) : selectedOverlay ? (
                        <>
                                 <div className="editor-grid single">
                                    <div className="editor-field"><label>Text</label><input type="text" value={selectedOverlay.title} onChange={(e) => updateOverlay(selectedOverlay.id, { title: e.target.value })} /></div>
                                    {(selectedOverlay.type === 'lower-third' || selectedOverlay.type === 'headline') && (
                                        <div className="editor-field"><label>Subtitle</label><input type="text" value={selectedOverlay.subtitle} onChange={(e) => updateOverlay(selectedOverlay.id, { subtitle: e.target.value })} /></div>
                                    )}
                                </div>

                                 <div className="editor-grid" style={{ marginTop: '12px' }}>
                                     <div className="editor-field">
                                         <label>Animation</label>
                                         <select value={selectedOverlay.animation} onChange={(e) => updateOverlay(selectedOverlay.id, { animation: e.target.value as any })}>
                                             <option value="fade">Fade In</option>
                                             <option value="slide-left">Slide Left</option>
                                             <option value="slide-up">Slide Up</option>
                                         </select>
                                     </div>
                                     <div className="editor-field">
                                         <label>Text Alignment</label>
                                         <select value={selectedOverlay.style?.textAlign || 'left'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), textAlign: e.target.value as any } })}>
                                             <option value="left">Left</option>
                                             <option value="center">Center</option>
                                             <option value="right">Right</option>
                                         </select>
                                     </div>
                                 </div>

                                 <div className="editor-field" style={{ marginTop: '12px' }}>
                                     <label>Global Opacity</label>
                                     <input type="range" className="seeker-bar" min="0.1" max="1" step="0.01" value={selectedOverlay.style?.opacity ?? 1} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), opacity: parseFloat(e.target.value) } })} />
                                 </div>

                                 <div className="editor-grid" style={{ marginTop: '12px' }}>
                                     <div className="editor-field">
                                         <label>Main Font</label>
                                         <select value={selectedOverlay.style?.fontFamily || 'Outfit, sans-serif'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), fontFamily: e.target.value } })}>
                                             <option value="Outfit, sans-serif">Outfit (Modern)</option>
                                             <option value="Inter, sans-serif">Inter (Clean)</option>
                                             <option value="Roboto, sans-serif">Roboto (Tech)</option>
                                             <option value="serif">Classic Serif</option>
                                             <option value="monospace">Monospace</option>
                                         </select>
                                     </div>
                                     {(selectedOverlay.type === 'headline' || selectedOverlay.type === 'lower-third') && (
                                         <div className="editor-field">
                                             <label>Sub Font</label>
                                             <select value={selectedOverlay.style?.subtitleFontFamily || 'Inter, sans-serif'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), subtitleFontFamily: e.target.value } })}>
                                                 <option value="Inter, sans-serif">Inter (Clean)</option>
                                                 <option value="Outfit, sans-serif">Outfit (Modern)</option>
                                                 <option value="Roboto, sans-serif">Roboto (Tech)</option>
                                                 <option value="serif">Classic Serif</option>
                                             </select>
                                         </div>
                                     )}
                                 </div>

                                 {selectedOverlay.type === 'lower-third' && (
                                     <div className="form-group" style={{ marginTop: '12px' }}>
                                         <label>Style Variant</label>
                                         <select value={selectedOverlay.variant} onChange={(e) => updateOverlay(selectedOverlay.id, { variant: e.target.value as any })}>
                                             <option value="classic">Classic Bar</option>
                                             <option value="modern">Modern Glass</option>
                                             <option value="minimal">Minimal Floating</option>
                                         </select>
                                     </div>
                                 )}

                                <div className="editor-grid" style={{ marginTop: '12px' }}>
                                    <div className="editor-field">
                                        <label>Main Background</label>
                                        <input type="color" value={selectedOverlay.style?.backgroundColor || '#6366f1'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), backgroundColor: e.target.value } })} />
                                    </div>
                                    {(selectedOverlay.type === 'headline' || selectedOverlay.type === 'lower-third') && (
                                        <div className="editor-field">
                                            <label>Sub Background</label>
                                            <input type="color" value={selectedOverlay.style?.subtitleBackgroundColor || '#000000'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), subtitleBackgroundColor: e.target.value } })} />
                                        </div>
                                    )}
                                    <div className="editor-field">
                                        <label>Accent / Border</label>
                                        <input type="color" value={selectedOverlay.style?.accentColor || '#0f172a'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), accentColor: e.target.value } })} />
                                    </div>
                                </div>

                                <div className="editor-grid" style={{ marginTop: '12px' }}>
                                    <div className="editor-field">
                                        <label>Main Text Color</label>
                                        <input type="color" value={selectedOverlay.style?.color || '#ffffff'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), color: e.target.value } })} />
                                    </div>
                                    {(selectedOverlay.type === 'headline' || selectedOverlay.type === 'lower-third') && (
                                        <div className="editor-field">
                                            <label>Sub Text Color</label>
                                            <input type="color" value={selectedOverlay.style?.subtitleColor || '#ffffff'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), subtitleColor: e.target.value } })} />
                                        </div>
                                    )}
                                    <div className="editor-field">
                                        <label>Show Accent</label>
                                        <button className={`toggle-btn xs ${selectedOverlay.style?.showAccent !== false ? 'active' : ''}`} onClick={() => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), showAccent: selectedOverlay.style?.showAccent === false } })}>
                                            {selectedOverlay.style?.showAccent !== false ? 'ON' : 'OFF'}
                                        </button>
                                    </div>
                                </div>

                                <div className="editor-grid" style={{ marginTop: '12px' }}>
                                    <div className="editor-field">
                                        <label>Main Font Size</label>
                                        <input type="number" value={selectedOverlay.style?.fontSize || 44} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), fontSize: parseInt(e.target.value) || 44 } })} />
                                    </div>
                                    {(selectedOverlay.type === 'headline' || selectedOverlay.type === 'lower-third') && (
                                        <div className="editor-field">
                                            <label>Sub Font Size</label>
                                            <input type="number" value={selectedOverlay.style?.subtitleFontSize || 24} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 44, color: '#ffffff', backgroundColor: '#6366f1' }), subtitleFontSize: parseInt(e.target.value) || 24 } })} />
                                        </div>
                                    )}
                                </div>

                                <div className="menu-divider" style={{ margin: '16px 0' }}></div>
                                
                                {selectedOverlay.type !== 'logo' && (
                                    <div className="editor-grid">
                                        <div className="editor-field"><label>X</label><input type="number" value={selectedOverlay.x || 0} onChange={(e) => updateOverlay(selectedOverlay.id, { x: parseInt(e.target.value) || 0 })} /></div>
                                        <div className="editor-field"><label>Y</label><input type="number" value={selectedOverlay.y || 0} onChange={(e) => updateOverlay(selectedOverlay.id, { y: parseInt(e.target.value) || 0 })} /></div>
                                        <div className="editor-field"><label>W</label><input type="number" value={selectedOverlay.width || 0} onChange={(e) => updateOverlay(selectedOverlay.id, { width: parseInt(e.target.value) || 0 })} /></div>
                                        <div className="editor-field"><label>H</label><input type="number" value={selectedOverlay.height || 0} onChange={(e) => updateOverlay(selectedOverlay.id, { height: parseInt(e.target.value) || 0 })} /></div>
                                    </div>
                                )}

                                {selectedOverlay.type === 'lower-third' && (
                                    <div style={{ marginTop: '12px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--tx-2)', margin: '12px 0 8px 0' }}>SUBTITLE OFFSET (CLASSIC)</div>
                                        <div className="editor-grid">
                                            <div className="editor-field"><label>X</label><input type="number" value={selectedOverlay.subtitleX || 0} onChange={(e) => updateOverlay(selectedOverlay.id, { subtitleX: parseInt(e.target.value) || 0 })} /></div>
                                            <div className="editor-field"><label>Y</label><input type="number" value={selectedOverlay.subtitleY || 0} onChange={(e) => updateOverlay(selectedOverlay.id, { subtitleY: parseInt(e.target.value) || 0 })} /></div>
                                        </div>
                                    </div>
                                )}

                                {selectedOverlay.type === 'logo' && (
                                    <div className="logo-controls">
                                        <div className="editor-grid">
                                            <div className="editor-field"><label>X</label><input type="number" value={selectedOverlay.x ?? 1700} onChange={(e) => updateOverlay(selectedOverlay.id, { x: parseInt(e.target.value) || 0 })} /></div>
                                            <div className="editor-field"><label>Y</label><input type="number" value={selectedOverlay.y ?? 50} onChange={(e) => updateOverlay(selectedOverlay.id, { y: parseInt(e.target.value) || 0 })} /></div>
                                            <div className="editor-field"><label>W</label><input type="number" value={selectedOverlay.width ?? 150} onChange={(e) => updateOverlay(selectedOverlay.id, { width: parseInt(e.target.value) || 0 })} /></div>
                                            <div className="editor-field"><label>H</label><input type="number" value={selectedOverlay.height ?? 150} onChange={(e) => updateOverlay(selectedOverlay.id, { height: parseInt(e.target.value) || 0 })} /></div>
                                        </div>
                                    </div>
                                )}

                                {selectedOverlay.type === 'ticker' && (
                                    <div className="ticker-controls">
                                        <div className="editor-field" style={{ marginTop: '12px' }}>
                                            <label>Scroll Speed</label>
                                            <input type="range" className="seeker-bar" min="1" max="20" value={selectedOverlay.speed || 3} onChange={(e) => updateOverlay(selectedOverlay.id, { speed: parseInt(e.target.value) })} />
                                        </div>
                                        <div className="editor-grid" style={{ marginTop: '12px' }}>
                                            <div className="editor-field"><label>Text Color</label><input type="color" value={selectedOverlay.style?.color || '#ffffff'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 24, color: '#ffffff', backgroundColor: '#0f172a' }), color: e.target.value } })} /></div>
                                            <div className="editor-field"><label>Background</label><input type="color" value={selectedOverlay.style?.backgroundColor || '#0f172a'} onChange={(e) => updateOverlay(selectedOverlay.id, { style: { ...(selectedOverlay.style || { fontSize: 24, color: '#ffffff', backgroundColor: '#0f172a' }), backgroundColor: e.target.value } })} /></div>
                                        </div>
                                    </div>
                                )}

                                <div className="menu-divider" style={{ margin: '16px 0' }}></div>
                                <button className="btn-ghost w-full" onClick={() => setSelectedOverlayId(null)}>Deselect Overlay</button>
                        </>
                    ) : (
                        <div className="empty-state">
                            <MousePointer2 size={32} />
                            <p>Select an item to edit properties</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
      </main>

      {/* ─── Status Bar ─────────────────────────────────────────────────────── */}
      <div className="status-bar">
        <div className="status-bar-left">
          <div className={`status-dot-main ${isStreaming && isRecording ? 'both' : isStreaming ? 'live' : isRecording ? 'recording' : ''}`} />
          <span className="status-hint">
            {statusBarHint
              ? statusBarHint
              : isStreaming && isRecording
                ? 'Live streaming and recording simultaneously — avoid interruptions'
                : isStreaming
                  ? 'Live stream active — your output is going to viewers'
                  : isRecording
                    ? `Recording in progress${isRecordingPaused ? ' (paused)' : ''} — saved to Videos folder when stopped`
                    : 'Ready — hover over any element to see what it does'}
          </span>
        </div>
        <div className="status-bar-right">
          {isStreaming && (
            <div className="status-indicator live">
              <span className="dot" />
              LIVE {formatTime(streamElapsed)}
            </div>
          )}
          {isRecording && (
            <div className={`status-indicator ${isRecordingPaused ? 'paused' : 'recording'}`}>
              <span className="dot" />
              {isRecordingPaused ? 'PAUSED' : 'REC'} {formatTime(recordElapsed)}
            </div>
          )}
          {!isStreaming && !isRecording && (
            <span className="status-version">STRIMA v1.0</span>
          )}
        </div>
      </div>

      {/* ─── Source Edit Modals ─────────────────────────────────────────────── */}

      {sourceEditModal && sourceEditModal.mode !== 'camera' && sourceEditModal.mode !== 'audio' && sourceEditModal.mode !== 'video' && sourceEditModal.mode !== 'image' && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-head">
              <h2>Change Source</h2>
              <div className="tab-row">
                <button className={selectorTab === 'screens' ? 'active' : ''} onClick={() => setSelectorTab('screens')} style={{ color: selectorTab === 'screens' ? 'var(--accent)' : 'var(--tx-1)' }}>Screens</button>
                <button className={selectorTab === 'windows' ? 'active' : ''} onClick={() => setSelectorTab('windows')} style={{ color: selectorTab === 'windows' ? 'var(--accent)' : 'var(--tx-1)' }}>Windows</button>
              </div>
              <button onClick={() => setSourceEditModal(null)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-grid">
              {(selectorTab === 'screens'
                ? availableScreens.filter(s => s.id.startsWith('screen'))
                : availableScreens.filter(s => s.id.startsWith('window'))
              ).map(screen => (
                <div key={screen.id} className="grid-item" onClick={() => applyScreenEdit(screen)}>
                  <img src={screen.thumbnail.toDataURL()} alt="" />
                  <span>{screen.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {sourceEditModal?.mode === 'camera' && (
        <div className="modal-overlay">
          <div className="modal-box settings">
            <div className="modal-head">
              <h2>Change Camera Source</h2>
              <button onClick={() => setSourceEditModal(null)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form">
              <div className="form-group" style={{ padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--tx-1)', marginBottom: '4px' }}>
                  <Camera size={16} style={{ color: 'var(--accent)' }} /> Video Device (Camera)
                </label>
                <select
                  value={editCameraId}
                  onChange={(e) => setEditCameraId(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--tx-1)', outline: 'none' }}
                >
                  <option value="">-- Choose a Camera --</option>
                  {availableCameras.map(cam => (
                    <option key={cam.deviceId} value={cam.deviceId}>
                      {cam.label || `Camera (${cam.deviceId.slice(0, 5)})`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ padding: '16px', background: 'var(--bg-1)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--tx-1)', marginBottom: '4px' }}>
                  <Mic size={16} style={{ color: 'var(--accent)' }} /> Audio Source (Microphone)
                </label>
                <select
                  value={editMicId}
                  onChange={(e) => setEditMicId(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--tx-1)', outline: 'none' }}
                >
                  <option value="default">Default Microphone</option>
                  <option value="none">No Audio (Video Only)</option>
                  {availableMics.map(mic => (
                    <option key={mic.deviceId} value={mic.deviceId}>
                      {mic.label || `Microphone (${mic.deviceId.slice(0, 5)})`}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn-mini secondary flex-1"
                  onClick={() => {
                    // Refresh: just re-apply same device IDs to force stream recreation
                    if (!sourceEditModal) return;
                    replaceSourceData(sourceEditModal.sourceId, { audioDeviceId: editMicId + '_refresh_' + Date.now() });
                    setTimeout(() => replaceSourceData(sourceEditModal.sourceId, { audioDeviceId: editMicId }), 100);
                    setSourceEditModal(null);
                    showStatus('Camera refreshed', 'success');
                  }}
                  style={{ padding: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}
                >
                  <RotateCcw size={16} /> Refresh Camera
                </button>
                <button
                  className="btn-mini primary flex-1"
                  disabled={!editCameraId}
                  onClick={applyCameraEdit}
                  style={{ padding: '12px', display: 'flex', justifyContent: 'center', gap: '8px' }}
                >
                  <Check size={16} /> Apply Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sourceEditModal?.mode === 'audio' && (
        <div className="modal-overlay">
          <div className="modal-box settings" style={{ maxWidth: '420px' }}>
            <div className="modal-head">
              <h2>Change Audio File</h2>
              <button onClick={() => setSourceEditModal(null)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form" style={{ alignItems: 'center', textAlign: 'center', gap: '24px', padding: '32px 24px' }}>
              <Volume2 size={48} style={{ color: 'var(--accent)', opacity: 0.8 }} />
              <div>
                <p style={{ fontSize: '14px', color: 'var(--tx-1)', marginBottom: '8px', fontWeight: 600 }}>Select a new audio file</p>
                <p style={{ fontSize: '12px', color: 'var(--tx-2)' }}>Supported: MP3, WAV, OGG, M4A, AAC</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button className="btn-ghost flex-1" onClick={() => setSourceEditModal(null)}>Cancel</button>
                <button className="btn-mini primary flex-1" onClick={() => applyFileEdit('audio')} style={{ padding: '12px', justifyContent: 'center' }}>
                  <Volume2 size={16} /> Browse Audio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sourceEditModal?.mode === 'video' && (
        <div className="modal-overlay">
          <div className="modal-box settings" style={{ maxWidth: '420px' }}>
            <div className="modal-head">
              <h2>Change Video File</h2>
              <button onClick={() => setSourceEditModal(null)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form" style={{ alignItems: 'center', textAlign: 'center', gap: '24px', padding: '32px 24px' }}>
              <Film size={48} style={{ color: 'var(--accent)', opacity: 0.8 }} />
              <div>
                <p style={{ fontSize: '14px', color: 'var(--tx-1)', marginBottom: '8px', fontWeight: 600 }}>Select a new video file</p>
                <p style={{ fontSize: '12px', color: 'var(--tx-2)' }}>Supported: MP4, WebM, MKV, AVI, MOV, FLV, WMV, TS</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button className="btn-ghost flex-1" onClick={() => setSourceEditModal(null)}>Cancel</button>
                <button className="btn-mini primary flex-1" onClick={() => applyFileEdit('video')} style={{ padding: '12px', justifyContent: 'center' }}>
                  <Film size={16} /> Browse Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {sourceEditModal?.mode === 'image' && (
        <div className="modal-overlay">
          <div className="modal-box settings" style={{ maxWidth: '420px' }}>
            <div className="modal-head">
              <h2>Change Image</h2>
              <button onClick={() => setSourceEditModal(null)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form" style={{ alignItems: 'center', textAlign: 'center', gap: '24px', padding: '32px 24px' }}>
              <ImageIcon size={48} style={{ color: 'var(--accent)', opacity: 0.8 }} />
              <div>
                <p style={{ fontSize: '14px', color: 'var(--tx-1)', marginBottom: '8px', fontWeight: 600 }}>Select a new image</p>
                <p style={{ fontSize: '12px', color: 'var(--tx-2)' }}>Supported: JPG, PNG, JPEG, WebP</p>
              </div>
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <button className="btn-ghost flex-1" onClick={() => setSourceEditModal(null)}>Cancel</button>
                <button className="btn-mini primary flex-1" onClick={() => applyFileEdit('image')} style={{ padding: '12px', justifyContent: 'center' }}>
                  <ImageIcon size={16} /> Browse Image
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isSelectorOpen && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-head">
                <h2>Add Input</h2>
                <div className="tab-row">
                    <button className={selectorTab === 'screens' ? 'active' : ''} onClick={() => setSelectorTab('screens')} style={{ color: selectorTab === 'screens' ? 'var(--accent)' : 'var(--tx-1)' }}>Screens</button>
                    <button className={selectorTab === 'windows' ? 'active' : ''} onClick={() => setSelectorTab('windows')} style={{ color: selectorTab === 'windows' ? 'var(--accent)' : 'var(--tx-1)' }}>Windows</button>
                    <button className={selectorTab === 'cameras' ? 'active' : ''} onClick={() => setSelectorTab('cameras')} style={{ color: selectorTab === 'cameras' ? 'var(--accent)' : 'var(--tx-1)' }}>Cameras</button>
                </div>
                <button onClick={() => setIsSelectorOpen(false)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-grid">
                {selectorTab === 'screens' ? availableScreens.filter(s => s.id.startsWith('screen')).map(source => (
                    <div key={source.id} className="grid-item" onClick={() => addSource(source)}>
                        <img src={source.thumbnail.toDataURL()} alt="" />
                        <span>{source.name}</span>
                    </div>
                )) : selectorTab === 'windows' ? availableScreens.filter(s => s.id.startsWith('window')).map(source => (
                    <div key={source.id} className="grid-item" onClick={() => addSource(source)}>
                        <img src={source.thumbnail.toDataURL()} alt="" />
                        <span>{source.name}</span>
                    </div>
                )) : (
                    <div className="camera-selector-panel" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '500px', margin: '0 auto', padding: '20px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--tx-1)' }}>
                                <Video size={16} style={{ color: 'var(--accent)' }} /> Select Video Device (Camera)
                            </label>
                            <select 
                                value={selectedCameraId} 
                                onChange={(e) => setSelectedCameraId(e.target.value)}
                                style={{ width: '100%', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--tx-1)', outline: 'none' }}
                            >
                                <option value="">-- Choose a Camera --</option>
                                {availableCameras.map(cam => (
                                    <option key={cam.deviceId} value={cam.deviceId}>
                                        {cam.label || `Camera (${cam.deviceId.slice(0, 5)})`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--tx-1)' }}>
                                <Mic size={16} style={{ color: 'var(--accent)' }} /> Select Audio Source (Microphone)
                            </label>
                            <select 
                                value={selectedMicId} 
                                onChange={(e) => setSelectedMicId(e.target.value)}
                                style={{ width: '100%', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--tx-1)', outline: 'none' }}
                            >
                                <option value="default">Default Microphone</option>
                                <option value="none">No Audio (Video Only)</option>
                                {availableMics.map(mic => (
                                    <option key={mic.deviceId} value={mic.deviceId}>
                                        {mic.label || `Microphone (${mic.deviceId.slice(0, 5)})`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button 
                            className="btn-mini primary"
                            disabled={!selectedCameraId}
                            onClick={() => {
                                const camDevice = availableCameras.find(c => c.deviceId === selectedCameraId);
                                if (camDevice) {
                                    addCameraSource(camDevice, selectedMicId);
                                }
                            }}
                            style={{ padding: '12px', marginTop: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', fontWeight: 'bold', fontSize: '14px', borderRadius: '6px' }}
                        >
                            <Plus size={16} /> Add Camera Source
                        </button>
                    </div>
                )}
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div className="modal-overlay">
          <div className="modal-box settings">
            <div className="modal-head">
                <h2>Broadcasting</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form">
                <div className="form-group">
                    <label>Workspace Management</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px', background: 'var(--bg-1)', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--tx-1)' }}>Auto-save Changes</div>
                            <div style={{ fontSize: '12px', opacity: 0.6, color: 'var(--tx-2)' }}>Automatically persist workspace modifications and layout state</div>
                        </div>
                        <button 
                            className={`toggle-btn ${isAutoSaveEnabled ? 'active' : ''}`} 
                            onClick={() => setIsAutoSaveEnabled(!isAutoSaveEnabled)}
                            style={{ padding: '8px', margin: 0, width: '100%' }}
                        >
                            {isAutoSaveEnabled ? 'Auto-save Enabled' : 'Auto-save Disabled'}
                        </button>
                    </div>
                </div>
                <div className="menu-divider" style={{ margin: '16px 0' }}></div>
                <div className="editor-grid" style={{ gap: '16px' }}>
                    <div className="form-group"><label>RTMP URL</label><input type="text" value={streamingConfig.rtmpUrl} onChange={(e) => setStreamingConfig({ ...streamingConfig, rtmpUrl: e.target.value })} /></div>
                    <div className="form-group">
                        <label>Bitrate (kbps)</label>
                        <select 
                            value={streamingConfig.bitrate} 
                            onChange={(e) => setStreamingConfig({ ...streamingConfig, bitrate: parseInt(e.target.value) })}
                            style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', color: 'var(--tx-1)', padding: '10px', borderRadius: '6px', outline: 'none' }}
                        >
                            <option value={1000}>1000 (480p)</option>
                            <option value={2500}>2500 (720p)</option>
                            <option value={4000}>4000 (720p 60fps)</option>
                            <option value={6000}>6000 (1080p)</option>
                            <option value={9000}>9000 (1080p 60fps)</option>
                            <option value={12000}>12000 (High / 4K)</option>
                        </select>
                    </div>
                </div>
                <div className="form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ margin: 0 }}>Stream Key</label>
                        <button className="icon-btn xs" onClick={() => setShowStreamKey(!showStreamKey)} title={showStreamKey ? 'Hide Key' : 'Show Key'}>
                            {showStreamKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>
                    <div className="input-with-icon" style={{ position: 'relative' }}>
                        <input 
                            type={showStreamKey ? 'text' : 'password'} 
                            value={streamingConfig.streamKey} 
                            onChange={(e) => setStreamingConfig({ ...streamingConfig, streamKey: e.target.value })} 
                            style={{ width: '100%' }}
                        />
                    </div>
                    <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', padding: '10px', background: 'var(--bg-3)', borderRadius: '6px' }}>
                        <span style={{ color: 'var(--tx-2)', fontWeight: '600', width: '100%', marginBottom: '4px' }}>Quick Presets (Click to set URL):</span>
                        <button className="btn-mini secondary" style={{ fontSize: '10px', padding: '4px 8px' }} onClick={() => setStreamingConfig({ ...streamingConfig, rtmpUrl: 'rtmps://a.rtmp.youtube.com/live2' })}>YouTube</button>
                        <button className="btn-mini secondary" style={{ fontSize: '10px', padding: '4px 8px' }} onClick={() => setStreamingConfig({ ...streamingConfig, rtmpUrl: 'rtmps://live.twitch.tv/app/' })}>Twitch</button>
                        <button className="btn-mini secondary" style={{ fontSize: '10px', padding: '4px 8px' }} onClick={() => setStreamingConfig({ ...streamingConfig, rtmpUrl: 'rtmps://rtmp-api.facebook.com:443/rtmp/' })}>Facebook</button>
                    </div>
                    <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px', padding: '8px', opacity: 0.7 }}>
                        <span style={{ color: 'var(--tx-2)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Globe size={12} /> Get Keys:
                        </span>
                        <a href="#" onClick={(e) => { e.preventDefault(); window.electron.openExternal('https://www.youtube.com/live_dashboard'); }} style={{ color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            YouTube <ExternalLink size={10} />
                        </a>
                        <a href="#" onClick={(e) => { e.preventDefault(); window.electron.openExternal('https://dashboard.twitch.tv/settings/stream'); }} style={{ color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Twitch <ExternalLink size={10} />
                        </a>
                        <a href="#" onClick={(e) => { e.preventDefault(); window.electron.openExternal('https://www.facebook.com/live/producer'); }} style={{ color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            Facebook <ExternalLink size={10} />
                        </a>
                    </div>
                </div>
            </div>
            <div className="modal-foot">
                <button className="btn-primary" onClick={() => setIsSettingsOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {isHelpOpen && (
        <div className="modal-overlay">
          <div className="modal-box settings">
            <div className="modal-head">
                <h2>Help & Shortcuts</h2>
                <button onClick={() => setIsHelpOpen(false)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form" style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                <div className="form-group">
                    <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Keyboard Shortcuts</h3>
                    <div style={{ display: 'grid', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Switch to Scene 1-9</span><kbd style={{ background: 'var(--bg-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>1-9</kbd></div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Execute Transition</span><kbd style={{ background: 'var(--bg-2)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>Enter</kbd></div>
                    </div>
                </div>
                <div className="menu-divider" style={{ margin: '16px 0' }}></div>
                <div className="form-group">
                    <h3 style={{ marginTop: 0, marginBottom: '12px' }}>Quick Start Guide</h3>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: '1.5' }}>1. Add sources from the Assets panel on the left.</p>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: '1.5' }}>2. Arrange sources in the Preview window.</p>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: '1.5' }}>3. Create scenes to quickly switch layouts.</p>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: '1.5' }}>4. Click Cut or Fade (or press Enter) to send to Program.</p>
                    <p style={{ margin: '0 0 8px 0', fontSize: '14px', lineHeight: '1.5' }}>5. Use Go Live or Record to start broadcasting.</p>
                </div>
            </div>
          </div>
        </div>
      )}

      {isHowToUseOpen && (
        <div className="modal-overlay">
          <div className="modal-box settings" style={{ width: '600px', maxWidth: '90vw' }}>
            <div className="modal-head">
                <h2>How to Use Strima</h2>
                <button onClick={() => setIsHowToUseOpen(false)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form" style={{ padding: '0 20px 20px 20px', maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="guide-section">
                    <h3 style={{ color: 'var(--accent)', marginTop: '20px' }}>1. Working with Scenes & Assets</h3>
                    <p style={{ color: 'var(--tx-1)', fontSize: '14px', lineHeight: '1.6' }}>
                        Start by creating **Scenes** on the bottom left. Each scene is a unique layout. Use the **Assets** sidebar to add 
                        Screens, Cameras, Videos, or Images. Once added, click a source to see its **Properties** where you can 
                        adjust its position, volume, and style.
                    </p>
                </div>
                
                <div className="guide-section">
                    <h3 style={{ color: 'var(--accent)', marginTop: '20px' }}>2. Graphics & Overlays</h3>
                    <p style={{ color: 'var(--tx-1)', fontSize: '14px', lineHeight: '1.6' }}>
                        Strima features pro-grade overlays. Add **Lower Thirds** for speaker info, **Headlines** for main topics, 
                        and **Tickers** for scrolling news. Use the Properties panel to choose between **Classic**, **Modern**, 
                        and **Minimal** styles, and set professional **Entry Animations** like Fade or Slide.
                    </p>
                </div>

                <div className="guide-section">
                    <h3 style={{ color: 'var(--accent)', marginTop: '20px' }}>3. The Staging Workflow</h3>
                    <p style={{ color: 'var(--tx-1)', fontSize: '14px', lineHeight: '1.6' }}>
                        Strima uses a professional **Dual-Monitor** workflow. The **PREVIEW** monitor on the left shows what 
                        you are currently editing. Use the **CUT** or **FADE** buttons (or press **Enter**) to push your changes 
                        to the **PROGRAM** monitor on the right. Only content in the PROGRAM monitor is sent to your stream or recording.
                    </p>
                </div>

                <div className="guide-section">
                    <h3 style={{ color: 'var(--accent)', marginTop: '20px' }}>4. Broadcasting & Recording</h3>
                    <p style={{ color: 'var(--tx-1)', fontSize: '14px', lineHeight: '1.6' }}>
                        Go to **Settings** to enter your RTMP URL and Stream Key. You can select your preferred bitrate 
                        depending on your internet speed. Once ready, click **Go Live** to start streaming or **Record** 
                        to save your production to a high-quality video file on your computer.
                    </p>
                </div>

                <div className="guide-section">
                  <h3 style={{ color: 'var(--accent)', marginTop: '20px' }}>5. Expert Tips</h3>
                  <ul style={{ color: 'var(--tx-2)', fontSize: '13px', lineHeight: '1.8', paddingLeft: '20px' }}>
                    <li>Use <strong>Framing Guidelines</strong> (Grid & Safe Areas) to align your shots perfectly.</li>
                    <li>The <strong>9:16 Social Zone</strong> helps you ensure content is visible for mobile viewers.</li>
                    <li>Toggle the <strong>Microphone</strong> in the header to add live commentary.</li>
                    <li>Enable <strong>Auto-save</strong> in Settings to never lose your scene layouts.</li>
                  </ul>
                </div>
            </div>
            <div className="modal-foot">
                <button className="btn-primary" onClick={() => setIsHowToUseOpen(false)}>Got it!</button>
            </div>
          </div>
        </div>
      )}

      {isAboutOpen && (
        <div className="modal-overlay">
          <div className="modal-box settings" style={{ maxWidth: '400px' }}>
            <div className="modal-head">
                <h2>About STRIMA STUDIO PRO</h2>
                <button onClick={() => setIsAboutOpen(false)} className="icon-btn"><X size={20} /></button>
            </div>
            <div className="modal-form" style={{ padding: '20px', textAlign: 'center' }}>
                <Layers size={48} className="brand-icon" style={{ margin: '0 auto 16px', color: 'var(--accent)', display: 'block' }} />
                <h3 style={{ margin: '0 0 8px 0' }}>STRIMA STUDIO PRO</h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '14px', opacity: 0.7 }}>Version 1.0.0</p>
                <p style={{ margin: '0 0 24px 0', fontSize: '14px', lineHeight: '1.5' }}>
                  A professional, highly customizable live video production engine.
                </p>
                <p style={{ margin: '0', fontSize: '12px', opacity: 0.5 }}>© 2026 Alexander Ore. All rights reserved.</p>
            </div>
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
