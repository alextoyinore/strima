import React, { useEffect, useRef, useState } from 'react';

interface Source {
  id: string;
  name: string;
  type: 'screen' | 'window' | 'camera' | 'image' | 'video' | 'text' | 'pdf' | 'slides' | 'audio';
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
  isBackground?: boolean;
  bgEffect?: {
    slowZoom?: boolean;
    blur?: boolean;
  };
  refId?: string;
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
  refId?: string;
}

interface ComposerProps {
  sources: Source[];
  overlays: Overlay[];
  interactive?: boolean;
  selectedSourceId?: string | null;
  onSourceUpdate?: (id: string, updates: Partial<Source>) => void;
  onSourceSelect?: (id: string | null) => void;
  onSourceMetadata?: (id: string, metadata: { totalPages?: number }) => void;
  onStreamCreated?: (stream: MediaStream) => void;
  onPlaybackUpdate?: (id: string, currentTime: number, duration: number) => void;
  seekRequest?: { id: string, time: number, timestamp: number } | null;
  showSafeAreas?: boolean;
  showGrid?: boolean;
  micStream?: MediaStream | null;
}

const Composer: React.FC<ComposerProps> = ({ 
  sources, 
  overlays, 
  interactive, 
  selectedSourceId, 
  onSourceUpdate, 
  onSourceSelect,
  onSourceMetadata,
  onStreamCreated,
  onPlaybackUpdate, 
  seekRequest,
  showSafeAreas,
  showGrid,
  micStream
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElements = useRef<Record<string, HTMLVideoElement>>({});
  const audioElements = useRef<Record<string, HTMLAudioElement>>({});
  const imageElements = useRef<Record<string, HTMLImageElement>>({});
  const pdfCanvases = useRef<Record<string, HTMLCanvasElement>>({});
  const streams = useRef<Record<string, MediaStream>>({});
  const cameraAudioDeviceIds = useRef<Record<string, string>>({});
  const animationFrameRef = useRef<number>();
  const tickerX = useRef(1920);
  const overlayProgress = useRef<Record<string, number>>({});
  const bgEffectStartTime = useRef<Record<string, number>>({});

  const audioContext = useRef<AudioContext>();
  const audioDestination = useRef<MediaStreamAudioDestinationNode>();
  const audioNodes = useRef<Record<string, { source: AudioNode, gain: GainNode }>>({});
  const micNode = useRef<{ source: MediaStreamAudioSourceNode, gain: GainNode } | null>(null);

  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialSourcePos = useRef({ x: 0, y: 0 });

  const lastCanvasSnapshot = useRef<HTMLCanvasElement | null>(null);
  const transitionProgress = useRef(0);
  const isTransitioning = useRef(false);

  useEffect(() => {
    if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioDestination.current = audioContext.current.createMediaStreamDestination();
    }
  }, []);

  // Resume AudioContext on any user interaction
  useEffect(() => {
    const resumeAudio = () => {
      if (audioContext.current && audioContext.current.state === 'suspended') {
        audioContext.current.resume()
          .then(() => console.log('AudioContext resumed successfully via user interaction.'))
          .catch(e => console.error('Failed to resume AudioContext:', e));
      }
    };

    window.addEventListener('click', resumeAudio);
    window.addEventListener('keydown', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);

    return () => {
      window.removeEventListener('click', resumeAudio);
      window.removeEventListener('keydown', resumeAudio);
      window.removeEventListener('touchstart', resumeAudio);
    };
  }, []);

  useEffect(() => {
    let combinedStream: MediaStream | null = null;
    if (canvasRef.current && audioDestination.current && onStreamCreated) {
        const canvasStream = canvasRef.current.captureStream(30);
        combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioDestination.current.stream.getAudioTracks()
        ]);
        onStreamCreated(combinedStream);
    }
    return () => {
        if (combinedStream) {
            // Only stop the video tracks captured from the canvas.
            // Preserving the audio destination track prevents permanently disabling the audio mix bus.
            combinedStream.getVideoTracks().forEach(t => t.stop());
        }
    };
  }, [onStreamCreated]);

  useEffect(() => {
    const loadPdf = async (source: Source) => {
        const pageNum = source.page || 1;
        const cacheKey = `${source.id}-${pageNum}`;
        if (!source.data || pdfCanvases.current[cacheKey]) return;
        try {
            if (!(window as any).pdfjsLib) {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
                document.head.appendChild(script);
                await new Promise(resolve => script.onload = resolve);
            }
            const pdfjsLib = (window as any).pdfjsLib;
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            const loadingTask = pdfjsLib.getDocument(source.data);
            const pdf = await loadingTask.promise;
            
            if (source.totalPages !== pdf.numPages) {
                onSourceMetadata?.(source.id, { totalPages: pdf.numPages });
            }

            if (pageNum > pdf.numPages) return;
            
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const context = canvas.getContext('2d');
            await page.render({ canvasContext: context!, viewport }).promise;
            pdfCanvases.current[cacheKey] = canvas;
        } catch (e) { console.error('PDF Load Error:', e); }
    };

    const updateSources = async () => {
      // Cleanup removed sources
      const activeIds = new Set(sources.map(s => s.id));
      Object.keys(streams.current).forEach(id => {
          if (!activeIds.has(id)) {
              streams.current[id].getTracks().forEach(t => t.stop());
              delete streams.current[id];
              delete videoElements.current[id];
              delete cameraAudioDeviceIds.current[id];
              delete bgEffectStartTime.current[id];
          }
      });
      Object.keys(audioNodes.current).forEach(id => {
          if (!activeIds.has(id)) {
              audioNodes.current[id].source.disconnect();
              audioNodes.current[id].gain.disconnect();
              delete audioNodes.current[id];
              delete audioElements.current[id];
          }
      });

      if (canvasRef.current && !isTransitioning.current) {
          const snapshot = document.createElement('canvas');
          snapshot.width = 1920; snapshot.height = 1080;
          const sCtx = snapshot.getContext('2d');
          if (sCtx) { 
              sCtx.drawImage(canvasRef.current, 0, 0); 
              lastCanvasSnapshot.current = snapshot; 
              transitionProgress.current = 1.0; 
              isTransitioning.current = true; 
          }
      }

      for (const source of sources) {
        if (!source.visible) continue;
        
        if ((source.type === 'pdf' || source.type === 'slides') && source.data) {
            loadPdf(source);
        }

        const currentAudioDeviceId = source.audioDeviceId || 'default';
        const isCamera = source.type === 'camera';
        const needRecreate = isCamera && streams.current[source.id] && cameraAudioDeviceIds.current[source.id] !== currentAudioDeviceId;

        if (needRecreate) {
            if (streams.current[source.id]) {
                streams.current[source.id].getTracks().forEach(t => t.stop());
                delete streams.current[source.id];
            }
            if (audioNodes.current[source.id]) {
                audioNodes.current[source.id].source.disconnect();
                audioNodes.current[source.id].gain.disconnect();
                delete audioNodes.current[source.id];
            }
        }

        if ((source.type === 'screen' || source.type === 'window' || source.type === 'camera') && !streams.current[source.id]) {
          try {
            let stream: MediaStream;
            if (source.type === 'camera') {
                const audioConstraints = source.audioDeviceId === 'none'
                    ? false
                    : (source.audioDeviceId && source.audioDeviceId !== 'default'
                        ? { deviceId: { exact: source.audioDeviceId } }
                        : true);
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { deviceId: { exact: source.refId || source.id }, width: 1920, height: 1080 }, 
                    audio: audioConstraints 
                });
            } else {
                const isScreen = source.type === 'screen';
                const audioConstraints = isScreen ? {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: source.refId || source.id
                    }
                } : false;

                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.refId || source.id, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } } as any,
                    audio: audioConstraints as any
                });
            }
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = false; video.volume = 0;
            video.setAttribute('playsinline', 'true');
            video.play().catch(e => console.warn(e));
            streams.current[source.id] = stream;
            videoElements.current[source.id] = video;
            if (isCamera) {
                cameraAudioDeviceIds.current[source.id] = currentAudioDeviceId;
            }

            if (stream.getAudioTracks().length > 0 && audioContext.current && audioDestination.current) {
                const sourceNode = audioContext.current.createMediaStreamSource(stream);
                const gainNode = audioContext.current.createGain();
                gainNode.gain.value = source.volume ?? 1.0;
                sourceNode.connect(gainNode);
                gainNode.connect(audioDestination.current);
                if (source.type !== 'screen' && source.type !== 'window' && source.type !== 'camera') {
                    gainNode.connect(audioContext.current.destination);
                }
                audioNodes.current[source.id] = { source: sourceNode, gain: gainNode };
            }
          } catch (e) { console.error('Source error:', e); }
        }

        if (source.type === 'image' && source.data) {
          const img = imageElements.current[source.id];
          if (!img || img.getAttribute('data-src') !== source.data) {
            const newImg = new Image();
            newImg.src = source.data;
            newImg.crossOrigin = 'anonymous';
            newImg.setAttribute('data-src', source.data);
            imageElements.current[source.id] = newImg;
          }
        }

        if (source.type === 'video' && source.data) {
          const video = videoElements.current[source.id];
          if (!video || video.getAttribute('data-src') !== source.data) {
            if (video) {
              video.pause();
              if (audioNodes.current[source.id]) {
                audioNodes.current[source.id].source.disconnect();
                audioNodes.current[source.id].gain.disconnect();
                delete audioNodes.current[source.id];
              }
            }
            const newVideo = document.createElement('video');
            newVideo.src = source.data;
            newVideo.crossOrigin = 'anonymous';
            newVideo.loop = true;
            newVideo.muted = false;
            newVideo.volume = 1.0;
            newVideo.setAttribute('playsinline', 'true');
            newVideo.setAttribute('data-src', source.data);
            if (source.playing !== false) newVideo.play().catch(e => console.error('Video play error:', e));
            videoElements.current[source.id] = newVideo;
            if (audioContext.current && audioDestination.current) {
                const sourceNode = audioContext.current.createMediaElementSource(newVideo);
                const gainNode = audioContext.current.createGain();
                gainNode.gain.value = source.volume ?? 1.0;
                sourceNode.connect(gainNode);
                gainNode.connect(audioDestination.current);
                gainNode.connect(audioContext.current.destination);
                audioNodes.current[source.id] = { source: sourceNode, gain: gainNode };
            }
          }
        }

        if (source.type === 'audio' && source.data) {
          const audio = audioElements.current[source.id];
          if (!audio || audio.getAttribute('data-src') !== source.data) {
            if (audio) {
              audio.pause();
              if (audioNodes.current[source.id]) {
                audioNodes.current[source.id].source.disconnect();
                audioNodes.current[source.id].gain.disconnect();
                delete audioNodes.current[source.id];
              }
            }
            const newAudio = new Audio(source.data);
            newAudio.loop = true;
            newAudio.crossOrigin = 'anonymous';
            newAudio.setAttribute('data-src', source.data);
            if (source.playing !== false) newAudio.play().catch(e => console.error('Audio play error:', e));
            audioElements.current[source.id] = newAudio;
            if (audioContext.current && audioDestination.current) {
                const sourceNode = audioContext.current.createMediaElementSource(newAudio);
                const gainNode = audioContext.current.createGain();
                gainNode.gain.value = source.volume ?? 1.0;
                sourceNode.connect(gainNode);
                gainNode.connect(audioDestination.current);
                gainNode.connect(audioContext.current.destination);
                audioNodes.current[source.id] = { source: sourceNode, gain: gainNode };
            }
          }
        }

        if (source.type === 'audio' && source.cover) {
          const cover = imageElements.current[source.id + '-cover'];
          if (!cover || cover.getAttribute('data-src') !== source.cover) {
            const newCover = new Image();
            newCover.src = source.cover;
            newCover.crossOrigin = 'anonymous';
            newCover.setAttribute('data-src', source.cover);
            imageElements.current[source.id + '-cover'] = newCover;
          }
        }
      }

      // Load Overlay Assets (Logos)
      for (const overlay of overlays) {
        if (overlay.type === 'logo' && overlay.data && !imageElements.current[overlay.id]) {
            const img = new Image(); img.src = overlay.data; img.crossOrigin = 'anonymous';
            imageElements.current[overlay.id] = img;
        }
      }
    };
    updateSources();
  }, [sources, overlays, interactive]);

  // Sync Playback State (Playing, Volume)
  useEffect(() => {
    sources.forEach(source => {
      const el = videoElements.current[source.id] || audioElements.current[source.id];
      if (!el) return;

      if (source.playing === false && !el.paused) el.pause();
      if (source.playing !== false && el.paused) el.play().catch(e => console.warn(e));

      const node = audioNodes.current[source.id];
      if (node && source.volume !== undefined) {
        node.gain.gain.setTargetAtTime(source.volume, audioContext.current!.currentTime, 0.05);
      }
    });
  }, [sources]);

  // Handle Global Microphone
  useEffect(() => {
    if (micStream && audioContext.current && audioDestination.current) {
        if (micNode.current) {
            micNode.current.source.disconnect();
            micNode.current.gain.disconnect();
        }
        const sourceNode = audioContext.current.createMediaStreamSource(micStream);
        const gainNode = audioContext.current.createGain();
        gainNode.gain.value = 1.0;
        sourceNode.connect(gainNode);
        gainNode.connect(audioDestination.current);
        micNode.current = { source: sourceNode, gain: gainNode };
    } else if (!micStream && micNode.current) {
        micNode.current.source.disconnect();
        micNode.current.gain.disconnect();
        micNode.current = null;
    }
  }, [micStream]);

  // Handle Seek Requests
  useEffect(() => {
    if (seekRequest) {
      const el = videoElements.current[seekRequest.id] || audioElements.current[seekRequest.id];
      if (el) el.currentTime = seekRequest.time;
    }
  }, [seekRequest]);

  // Report Playback Progress
  useEffect(() => {
    if (!onPlaybackUpdate) return;
    const interval = setInterval(() => {
        if (selectedSourceId) {
            const el = videoElements.current[selectedSourceId] || audioElements.current[selectedSourceId];
            if (el && !isNaN(el.duration)) {
                onPlaybackUpdate(selectedSourceId, el.currentTime, el.duration);
            }
        }
    }, 100);
    return () => clearInterval(interval);
  }, [onPlaybackUpdate, selectedSourceId]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!interactive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let foundId = null;
    for (let i = sources.length - 1; i >= 0; i--) {
        const s = sources[i];
        if (s.isBackground) continue;
        if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) {
            foundId = s.id; break;
        }
    }
    
    onSourceSelect?.(foundId);
    if (foundId) {
        const s = sources.find(src => src.id === foundId)!;
        isDragging.current = true;
        dragStartPos.current = { x, y };
        initialSourcePos.current = { x: s.x, y: s.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !selectedSourceId || !onSourceUpdate || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const dx = x - dragStartPos.current.x;
    const dy = y - dragStartPos.current.y;
    onSourceUpdate(selectedSourceId, { x: Math.round(initialSourcePos.current.x + dx), y: Math.round(initialSourcePos.current.y + dy) });
  };

  const drawSource = (source: Source, element: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const fit = source.fit || 'fill'; const targetX = source.x; const targetY = source.y; const targetW = source.width; const targetH = source.height;
    if (element instanceof HTMLImageElement && (!element.complete || element.naturalWidth === 0)) return;
    let sW = 0, sH = 0;
    if (element instanceof HTMLVideoElement) { sW = element.videoWidth; sH = element.videoHeight; } 
    else if (element instanceof HTMLCanvasElement) { sW = element.width; sH = element.height; }
    else { sW = (element as HTMLImageElement).naturalWidth; sH = (element as HTMLImageElement).naturalHeight; }
    
    if (fit === 'fill') { ctx.drawImage(element, targetX, targetY, targetW, targetH); } 
    else if (fit === 'cover') {
        const tA = targetW / targetH; const sA = sW / sH;
        let dW = sW, dH = sH, oX = 0, oY = 0;
        if (sA > tA) { dW = sH * tA; oX = (sW - dW) / 2; } else { dH = sW / tA; oY = (sH - dH) / 2; }
        ctx.drawImage(element, oX, oY, dW, dH, targetX, targetY, targetW, targetH);
    } else if (fit === 'contain') {
        const tA = targetW / targetH; const sA = sW / sH;
        let dW = targetW, dH = targetH, oX = 0, oY = 0;
        if (sA > tA) { dH = targetW / sA; oY = (targetH - dH) / 2; } else { dW = targetH * sA; oX = (targetW - dW) / 2; }
        ctx.drawImage(element, targetX + oX, targetY + oY, dW, dH);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const render = () => {
      ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const sortedSources = [...sources].sort((a, b) => {
        if (a.isBackground && !b.isBackground) return -1;
        if (!a.isBackground && b.isBackground) return 1;
        return 0;
      });
      sortedSources.forEach(source => {
        if (!source.visible) return;
        if (source.type === 'text') {
            const s = source.style || { fontSize: 64, fontFamily: 'Outfit', color: '#ffffff', bold: true, italic: false, textAlign: 'left' };
            ctx.fillStyle = s.color; ctx.textAlign = s.textAlign; ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.fontSize}px ${s.fontFamily}, sans-serif`;
            const lines = (source.data || '').split('\n');
            lines.forEach((l, i) => { const tX = s.textAlign === 'center' ? source.x + source.width / 2 : (s.textAlign === 'right' ? source.x + source.width : source.x); ctx.fillText(l, tX, source.y + s.fontSize + (i * s.fontSize * 1.2)); });
        } else if (source.type === 'pdf' || source.type === 'slides') {
          const pdfCanvas = pdfCanvases.current[`${source.id}-${source.page || 1}`];
          if (pdfCanvas) drawSource(source, pdfCanvas, ctx);
          else { ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; ctx.fillRect(source.x, source.y, source.width, source.height); ctx.fillStyle = 'white'; ctx.font = '24px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Loading Slide...', source.x + source.width / 2, source.y + source.height / 2); }
        } else if (source.type === 'image') {
          const img = imageElements.current[source.id];
          if (img && img.complete) {
            const fx = source.isBackground ? source.bgEffect : null;
            const hasEffect = fx && (fx.slowZoom || fx.blur);
            if (hasEffect) {
              ctx.save();
              if (fx!.blur) ctx.filter = 'blur(14px)';
              if (fx!.slowZoom) {
                if (!bgEffectStartTime.current[source.id]) bgEffectStartTime.current[source.id] = Date.now();
                const elapsed = (Date.now() - bgEffectStartTime.current[source.id]) / 1000;
                const zoom = 1 + 0.15 * ((elapsed % 30) / 30);
                ctx.translate(960, 540);
                ctx.scale(zoom, zoom);
                ctx.translate(-960, -540);
              }
              drawSource(source, img, ctx);
              ctx.restore();
            } else {
              if (bgEffectStartTime.current[source.id]) delete bgEffectStartTime.current[source.id];
              drawSource(source, img, ctx);
            }
          }
        } else if (source.type === 'audio') {
          const cover = imageElements.current[source.id + '-cover'];
          if (cover && cover.complete) {
              drawSource(source, cover, ctx);
          } else {
              ctx.fillStyle = '#0a0a0a'; ctx.fillRect(source.x, source.y, source.width, source.height);
              ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(source.x + 40, source.y + 40, source.width - 80, source.height - 80);
          }
          ctx.fillStyle = 'white'; ctx.textAlign = 'center';
          ctx.font = 'bold 80px Outfit, sans-serif';
          ctx.fillText((source.title || '').toUpperCase(), source.x + source.width / 2, source.y + source.height / 2);
          ctx.font = '40px Inter, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillText(source.subtitle || '', source.x + source.width / 2, source.y + source.height / 2 + 70);
        } else {
          const video = videoElements.current[source.id];
          if (video && video.readyState >= 2) drawSource(source, video, ctx);
        }
        if (interactive && source.id === selectedSourceId) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(source.x, source.y, source.width, source.height); ctx.setLineDash([]); }
      });

      overlays.forEach(overlay => {
        // Animation Logic
        const target = overlay.visible ? 1 : 0;
        if (overlayProgress.current[overlay.id] === undefined) overlayProgress.current[overlay.id] = 0;
        const current = overlayProgress.current[overlay.id];
        if (current < target) overlayProgress.current[overlay.id] = Math.min(target, current + 0.06);
        else if (current > target) overlayProgress.current[overlay.id] = Math.max(target, current - 0.06);
        
        const progress = overlayProgress.current[overlay.id];
        if (progress <= 0) return;

        ctx.save();
        const s = overlay.style || { fontSize: 44, color: 'white', backgroundColor: 'rgba(99, 102, 241, 0.95)', accentColor: 'rgba(15, 23, 42, 0.9)' };
        const opacity = (s.opacity ?? 1) * progress;
        ctx.globalAlpha = opacity;
        
        const anim = overlay.animation || 'fade';
        if (anim === 'slide-left') ctx.translate((1 - progress) * -300, 0);
        else if (anim === 'slide-up') ctx.translate(0, (1 - progress) * 150);

        const mainFont = s.fontFamily || 'Outfit, sans-serif';
        const subFont = s.subtitleFontFamily || 'Inter, sans-serif';

        if (overlay.type === 'lower-third') {
          const variant = overlay.variant || 'classic';
          const align = s.textAlign || 'left';
          
          const oX = overlay.x ?? 100;
          const oY = overlay.y ?? 850;
          const oW = overlay.width ?? 650;
          const oH = overlay.height ?? 100;

          const sX = overlay.subtitleX ?? oX;
          const sY = overlay.subtitleY ?? (oY + oH);
          const sW = overlay.subtitleWidth ?? oW;
          const sH = overlay.subtitleHeight ?? 50;

          if (variant === 'classic') {
            ctx.fillStyle = s.backgroundColor; ctx.fillRect(oX, oY, oW, oH);
            ctx.fillStyle = s.color; ctx.font = `bold ${s.fontSize}px ${mainFont}`; ctx.textAlign = align;
            const textX = align === 'left' ? oX + 40 : (align === 'right' ? oX + oW - 40 : oX + oW / 2);
            ctx.fillText(overlay.title.toUpperCase(), textX, oY + oH * 0.65);
            
            if (s.showAccent !== false) {
              ctx.fillStyle = s.subtitleBackgroundColor || s.accentColor || 'rgba(15, 23, 42, 0.9)'; 
              ctx.fillRect(sX, sY, sW, sH);
              ctx.fillStyle = s.subtitleColor || s.color; ctx.font = `${Math.round(s.fontSize * 0.5)}px ${subFont}`; 
              const subTextX = align === 'left' ? sX + 40 : (align === 'right' ? sX + sW - 40 : sX + sW / 2);
              ctx.fillText(overlay.subtitle.toUpperCase(), subTextX, sY + sH * 0.7);
            }
          } else if (variant === 'modern') {
            const grad = ctx.createLinearGradient(oX, oY, oX + oW, oY);
            if (align === 'right') { grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, s.backgroundColor); }
            else { grad.addColorStop(0, s.backgroundColor); grad.addColorStop(1, 'rgba(0,0,0,0)'); }
            ctx.fillStyle = grad; ctx.fillRect(oX, oY, oW, oH + 20);
            if (s.showAccent !== false) {
              ctx.fillStyle = s.accentColor || '#fff'; ctx.fillRect(align === 'right' ? oX + oW - 6 : oX, oY, 6, oH + 20);
            }
            ctx.fillStyle = s.color; ctx.font = `bold ${s.fontSize}px ${mainFont}`; ctx.textAlign = align;
            const textX = align === 'left' ? oX + 30 : (align === 'right' ? oX + oW - 30 : oX + oW / 2);
            ctx.fillText(overlay.title, textX, oY + (oH + 20) * 0.45);
            ctx.fillStyle = s.subtitleColor || s.color; ctx.globalAlpha = 0.7 * opacity; ctx.font = `${Math.round(s.fontSize * 0.6)}px ${subFont}`; 
            ctx.fillText(overlay.subtitle, textX, oY + (oH + 20) * 0.8);
          } else if (variant === 'minimal') {
            const tw = ctx.measureText(overlay.title).width + 80;
            const mX = align === 'left' ? oX : (align === 'right' ? oX + oW - tw : oX + oW/2 - tw/2);
            ctx.fillStyle = s.backgroundColor; ctx.beginPath(); ctx.roundRect(mX, oY + 30, tw, 80, [0, 40, 40, 0]); ctx.fill();
            ctx.fillStyle = s.color; ctx.font = `500 ${s.fontSize}px ${mainFont}`; ctx.textAlign = align;
            const textX = align === 'left' ? mX + 40 : (align === 'right' ? mX + tw - 40 : mX + tw/2);
            ctx.fillText(overlay.title, textX, oY + 85);
            ctx.fillStyle = s.subtitleColor || s.accentColor || '#fff'; ctx.font = `bold ${Math.round(s.fontSize * 0.4)}px ${subFont}`; ctx.fillText(overlay.subtitle.toUpperCase(), textX, oY + 20);
          }
        }

        if (overlay.type === 'headline') {
            const align = s.textAlign || 'left';
            const oX = overlay.x ?? 0;
            const oY = overlay.y ?? 800;
            const oW = overlay.width ?? 1200;
            const oH = overlay.height ?? 140;

            const mainH = oH * 0.65;
            const subH = oH * 0.35;

            // Main Bar
            ctx.fillStyle = s.backgroundColor;
            ctx.fillRect(oX, oY, oW, mainH);
            
            // Sub Bar
            ctx.fillStyle = s.subtitleBackgroundColor || 'rgba(0,0,0,0.6)';
            ctx.fillRect(oX, oY + mainH, oW, subH);

            // Accent Border
            if (s.showAccent !== false) {
              ctx.fillStyle = s.accentColor || '#6366f1';
              ctx.fillRect(align === 'right' ? oX + oW - 10 : oX, oY, 10, oH);
            }

            ctx.textAlign = align;
            ctx.fillStyle = s.color;
            ctx.font = `700 ${s.fontSize}px ${mainFont}`;
            const textX = align === 'left' ? oX + 60 : (align === 'right' ? oX + oW - 60 : oX + oW / 2);
            ctx.fillText(overlay.title, textX, oY + mainH * 0.7);
            
            ctx.font = `600 ${Math.round(s.fontSize * 0.45)}px ${subFont}`;
            ctx.fillStyle = s.subtitleColor || 'rgba(255,255,255,0.9)';
            ctx.fillText(overlay.subtitle, textX, oY + mainH + subH * 0.75);
        }

        if (overlay.type === 'ticker') {
          const speed = overlay.speed || 3;
          const oX = overlay.x ?? 0;
          const oY = overlay.y ?? 1030;
          const oW = overlay.width ?? 1920;
          const oH = overlay.height ?? 50;

          ctx.fillStyle = s.backgroundColor; ctx.fillRect(oX, oY, oW, oH);
          ctx.fillStyle = s.color; ctx.font = `bold ${s.fontSize}px ${mainFont}`; ctx.textAlign = 'left';

          const textW = ctx.measureText(overlay.title).width;
          // Gap between repetitions — gives a natural "breathing room" before the loop starts
          const gap = Math.max(120, oW * 0.15);
          const cycleLen = textW + gap;

          tickerX.current -= speed;
          // Once the lead copy has scrolled fully off the left edge, reset by one cycle
          // so the trailing copy takes exactly its place — zero visible jump.
          if (tickerX.current < oX - textW) {
            tickerX.current += cycleLen;
          }

          const textY = oY + (oH + s.fontSize / 2) / 2;

          // Clip to the ticker strip so text doesn't bleed outside
          ctx.save();
          ctx.beginPath(); ctx.rect(oX, oY, oW, oH); ctx.clip();

          // Draw lead copy
          ctx.fillText(overlay.title, tickerX.current, textY);
          // Draw trailing copy exactly one cycle behind — this is what fills in
          // while the lead copy is scrolling through, preventing any empty stretch
          ctx.fillText(overlay.title, tickerX.current + cycleLen, textY);

          ctx.restore();

          if (s.showAccent !== false) {
            ctx.fillStyle = s.accentColor || 'rgba(99, 102, 241, 1)';
            ctx.fillRect(oX, oY - 5, oW, 5);
          }
        }

        if (overlay.type === 'logo') {
          const img = imageElements.current[overlay.id];
          if (img && img.complete) {
            ctx.globalAlpha = (s.opacity ?? 1);
            ctx.drawImage(img, overlay.x ?? 1700, overlay.y ?? 50, overlay.width ?? 150, overlay.height ?? 150);
          }
        }

        ctx.restore();
      });

      if (isTransitioning.current && lastCanvasSnapshot.current) {
          ctx.globalAlpha = transitionProgress.current; ctx.drawImage(lastCanvasSnapshot.current, 0, 0); ctx.globalAlpha = 1.0;
          transitionProgress.current -= 0.04; if (transitionProgress.current <= 0) { isTransitioning.current = false; lastCanvasSnapshot.current = null; }
      }

      if (showGrid) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([10, 10]);

        // Vertical Center Line
        ctx.beginPath();
        ctx.moveTo(960, 0); ctx.lineTo(960, 1080);
        ctx.stroke();

        // Rule of Thirds (Vertical)
        ctx.beginPath();
        ctx.moveTo(640, 0); ctx.lineTo(640, 1080);
        ctx.moveTo(1280, 0); ctx.lineTo(1280, 1080);
        ctx.stroke();

        // Rule of Thirds (Horizontal)
        ctx.beginPath();
        ctx.moveTo(0, 360); ctx.lineTo(1920, 360);
        ctx.moveTo(0, 720); ctx.lineTo(1920, 720);
        ctx.stroke();
        
        ctx.restore();
      }

      if (showSafeAreas) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        
        // Action Safe (90%)
        ctx.strokeRect(1920 * 0.05, 1080 * 0.05, 1920 * 0.9, 1080 * 0.9);
        
        // Title Safe (80%)
        ctx.strokeRect(1920 * 0.1, 1080 * 0.1, 1920 * 0.8, 1080 * 0.8);

        // Social Media Safe Area (9:16 center crop)
        const socialW = 1080 * (9/16); 
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.moveTo(960 - socialW/2, 0); ctx.lineTo(960 - socialW/2, 1080);
        ctx.moveTo(960 + socialW/2, 0); ctx.lineTo(960 + socialW/2, 1080);
        ctx.stroke();

        ctx.font = '12px Inter, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'left';
        ctx.fillText('ACTION SAFE', 1920 * 0.05 + 5, 1080 * 0.05 + 15);
        ctx.fillText('TITLE SAFE', 1920 * 0.1 + 5, 1080 * 0.1 + 15);
        ctx.textAlign = 'center';
        ctx.fillText('9:16 SOCIAL ZONE', 960, 20);
        
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };
    render();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [sources, overlays, selectedSourceId, interactive, showSafeAreas, showGrid]);

  return (
    <canvas ref={canvasRef} width={1920} height={1080} 
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => isDragging.current = false} onMouseLeave={() => isDragging.current = false}
      style={{ width: '100%', height: '100%', backgroundColor: 'black' }} />
  );
};

export default Composer;
