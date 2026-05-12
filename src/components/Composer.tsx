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
  type: 'lower-third' | 'ticker' | 'logo';
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
  seekRequest
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElements = useRef<Record<string, HTMLVideoElement>>({});
  const audioElements = useRef<Record<string, HTMLAudioElement>>({});
  const imageElements = useRef<Record<string, HTMLImageElement>>({});
  const audioPreviewCanvases = useRef<Record<string, HTMLCanvasElement>>({});
  const pdfCanvases = useRef<Record<string, HTMLCanvasElement>>({});
  const streams = useRef<Record<string, MediaStream>>({});
  const animationFrameRef = useRef<number>();
  const tickerX = useRef(1920);

  const audioContext = useRef<AudioContext>();
  const audioDestination = useRef<MediaStreamAudioDestinationNode>();
  const audioNodes = useRef<Record<string, { source: AudioNode, gain: GainNode }>>({});

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

  useEffect(() => {
    if (onStreamCreated && canvasRef.current && audioDestination.current) {
        const videoStream = canvasRef.current.captureStream(30);
        const audioStream = audioDestination.current.stream;
        const combinedStream = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...audioStream.getAudioTracks()
        ]);
        onStreamCreated(combinedStream);
    }
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
      if (canvasRef.current && !isTransitioning.current) {
          const snapshot = document.createElement('canvas');
          snapshot.width = 1920; snapshot.height = 1080;
          const sCtx = snapshot.getContext('2d');
          if (sCtx) { sCtx.drawImage(canvasRef.current, 0, 0); lastCanvasSnapshot.current = snapshot; transitionProgress.current = 1.0; isTransitioning.current = true; }
      }

      for (const source of sources) {
        if (!source.visible) continue;
        
        if ((source.type === 'pdf' || source.type === 'slides') && source.data) {
            loadPdf(source);
        }

        if ((source.type === 'screen' || source.type === 'window' || source.type === 'camera') && !streams.current[source.id]) {
          try {
            let stream: MediaStream;
            if (source.type === 'camera') {
                stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: source.id }, width: 1920, height: 1080 }, audio: true });
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } } as any,
                    audio: { mandatory: { chromeMediaSource: 'desktop' } } as any
                });
            }
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = false; video.volume = 0;
            video.setAttribute('playsinline', 'true');
            video.play().catch(() => {});
            streams.current[source.id] = stream;
            videoElements.current[source.id] = video;

            if (stream.getAudioTracks().length > 0 && audioContext.current && audioDestination.current) {
                const sourceNode = audioContext.current.createMediaStreamSource(stream);
                const gainNode = audioContext.current.createGain();
                gainNode.gain.value = source.volume ?? 1.0;
                sourceNode.connect(gainNode);
                gainNode.connect(audioDestination.current);
                gainNode.connect(audioContext.current.destination);
                audioNodes.current[source.id] = { source: sourceNode, gain: gainNode };
            }
          } catch (e) { console.error('Source error:', e); }
        }

        if (source.type === 'image' && source.data && !imageElements.current[source.id]) {
          const img = new Image(); img.src = source.data; img.crossOrigin = 'anonymous';
          imageElements.current[source.id] = img;
        }

        if (source.type === 'video' && source.data && !videoElements.current[source.id]) {
            const video = document.createElement('video');
            video.src = source.data; video.crossOrigin = 'anonymous'; video.loop = true; video.muted = false; video.volume = 1.0; video.setAttribute('playsinline', 'true');
            if (source.playing !== false) video.play().catch(e => console.error('Video play error:', e));
            videoElements.current[source.id] = video;
            if (audioContext.current && audioDestination.current) {
                const sourceNode = audioContext.current.createMediaElementSource(video);
                const gainNode = audioContext.current.createGain(); gainNode.gain.value = source.volume ?? 1.0;
                sourceNode.connect(gainNode); gainNode.connect(audioDestination.current); gainNode.connect(audioContext.current.destination);
                audioNodes.current[source.id] = { source: sourceNode, gain: gainNode };
            }
        }

        if (source.type === 'audio' && source.data && !audioElements.current[source.id]) {
            const audio = new Audio();
            audio.src = source.data; audio.crossOrigin = 'anonymous'; audio.loop = true; audio.muted = false; audio.volume = 1.0;
            if (source.playing !== false) audio.play().catch(e => console.error('Audio play error:', e));
            audioElements.current[source.id] = audio;
            if (audioContext.current && audioDestination.current) {
                const sourceNode = audioContext.current.createMediaElementSource(audio);
                const gainNode = audioContext.current.createGain(); gainNode.gain.value = source.volume ?? 1.0;
                sourceNode.connect(gainNode); gainNode.connect(audioDestination.current); gainNode.connect(audioContext.current.destination);
                audioNodes.current[source.id] = { source: sourceNode, gain: gainNode };
            }
        }
      }

      // Pre-render audio previews if they don't exist or if properties changed
      sources.filter(s => s.type === 'audio').forEach(source => {
          const cacheKey = `${source.id}-${source.width}-${source.height}-${source.style?.color}-${source.style?.accentColor}-${source.name}`;
          if (!audioPreviewCanvases.current[cacheKey]) {
              const offCanvas = document.createElement('canvas');
              const boxW = source.width || 400;
              const boxH = source.height || 120;
              offCanvas.width = boxW;
              offCanvas.height = boxH;
              const oCtx = offCanvas.getContext('2d');
              if (oCtx) {
                  const primaryColor = source.style?.color || '#6366f1';
                  const accentColor = source.style?.accentColor || '#0f172a';
                  
                  oCtx.fillStyle = accentColor;
                  oCtx.fillRect(0, 0, boxW, boxH);
                  
                  const grad = oCtx.createLinearGradient(0, 0, 0, boxH);
                  grad.addColorStop(0, 'rgba(0,0,0,0)');
                  grad.addColorStop(1, 'rgba(0,0,0,0.4)');
                  oCtx.fillStyle = grad;
                  oCtx.fillRect(0, 0, boxW, boxH);

                  oCtx.strokeStyle = primaryColor;
                  oCtx.lineWidth = 4;
                  oCtx.strokeRect(0, 0, boxW, boxH);
                  
                  oCtx.fillStyle = 'white';
                  const fontSize = Math.min(boxW / 10, boxH / 4, 40);
                  oCtx.font = `bold ${fontSize}px Outfit, sans-serif`;
                  oCtx.textAlign = 'center';
                  oCtx.fillText(source.name.toUpperCase(), boxW / 2, boxH / 2 - fontSize/4);
                  
                  oCtx.font = `${fontSize/2}px Inter, sans-serif`;
                  oCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                  oCtx.fillText('AUDIO BROADCAST SOURCE', boxW / 2, boxH / 2 + fontSize/2 + 5);
                  
                  // Static visualizer bars for the asset
                  const barCount = Math.floor(boxW / 20);
                  const barWidth = (boxW - 40) / barCount - 4;
                  oCtx.fillStyle = primaryColor;
                  for (let i = 0; i < barCount; i++) {
                      const h = (boxH / 4) * (0.4 + Math.sin(i * 0.5) * 0.3 + 0.3);
                      oCtx.fillRect(20 + i * (barWidth + 4), boxH - 10, barWidth, -h);
                  }
              }
              audioPreviewCanvases.current[cacheKey] = offCanvas;
          }
      });

      // Handle pause/play updates
      sources.forEach(source => {
          const media = videoElements.current[source.id] || audioElements.current[source.id];
          if (media) {
              if (source.playing && media.paused) media.play().catch(() => {});
              else if (!source.playing && !media.paused) media.pause();
              
              if (source.volume !== undefined && audioNodes.current[source.id]) {
                  audioNodes.current[source.id].gain.gain.value = source.volume;
              }
          }
      });
    };
    updateSources();
  }, [sources, overlays, interactive]);

  // Handle Seek Requests
  useEffect(() => {
    if (seekRequest) {
        const media = videoElements.current[seekRequest.id] || audioElements.current[seekRequest.id];
        if (media) {
            media.currentTime = seekRequest.time;
        }
    }
  }, [seekRequest]);

  // Report Playback Status
  useEffect(() => {
    const interval = setInterval(() => {
        if (!onPlaybackUpdate || !selectedSourceId) return;
        const media = videoElements.current[selectedSourceId] || audioElements.current[selectedSourceId];
        if (media && !media.paused) {
            onPlaybackUpdate(selectedSourceId, media.currentTime, media.duration || 0);
        }
    }, 500);
    return () => clearInterval(interval);
  }, [selectedSourceId, onPlaybackUpdate]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (audioContext.current?.state === 'suspended') {
        audioContext.current.resume();
    }
    if (!interactive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    let foundId = null;
    for (let i = sources.length - 1; i >= 0; i--) {
        const s = sources[i];
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
      sources.forEach(source => {
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
          const img = imageElements.current[source.id]; if (img && img.complete) drawSource(source, img, ctx);
        } else if (source.type === 'audio') {
            const cacheKey = `${source.id}-${source.width}-${source.height}-${source.style?.color}-${source.style?.accentColor}-${source.name}`;
            const preview = audioPreviewCanvases.current[cacheKey];
            if (preview) {
                ctx.drawImage(preview, source.x, source.y);
                if (source.playing) {
                    // Very simple, low-cost animation overlay if playing
                    ctx.fillStyle = source.style?.color || '#6366f1';
                    ctx.globalAlpha = 0.3 * Math.abs(Math.sin(Date.now() / 500));
                    ctx.fillRect(source.x + 5, source.y + source.height - 15, 10, 10);
                    ctx.globalAlpha = 1.0;
                }
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fillRect(source.x, source.y, source.width, source.height);
            }
        } else {
          const video = videoElements.current[source.id];
          if (video && video.readyState >= 2) drawSource(source, video, ctx);
        }
        if (interactive && source.id === selectedSourceId) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.strokeRect(source.x, source.y, source.width, source.height); ctx.setLineDash([]); }
      });

      overlays.forEach(overlay => {
        if (!overlay.visible) return;
        if (overlay.type === 'lower-third') {
          const s = overlay.style || { fontSize: 44, color: 'white', backgroundColor: 'rgba(99, 102, 241, 0.95)', accentColor: 'rgba(15, 23, 42, 0.9)' };
          ctx.fillStyle = s.backgroundColor; ctx.fillRect(100, 850, 650, 100);
          ctx.fillStyle = s.color; ctx.font = `bold ${s.fontSize}px Outfit, sans-serif`; ctx.textAlign = 'left'; ctx.fillText(overlay.title.toUpperCase(), 140, 915);
          ctx.fillStyle = s.accentColor || 'rgba(15, 23, 42, 0.9)'; ctx.fillRect(100, 950, 450, 50);
          ctx.fillStyle = s.color; ctx.font = `${Math.round(s.fontSize * 0.5)}px Inter, sans-serif`; ctx.fillText(overlay.subtitle.toUpperCase(), 140, 985);
        }
        if (overlay.type === 'ticker') {
          const speed = overlay.speed || 3; const s = overlay.style || { fontSize: 24, color: 'white', backgroundColor: 'rgba(15, 23, 42, 0.95)' };
          ctx.fillStyle = s.backgroundColor; ctx.fillRect(0, 1030, 1920, 50);
          ctx.fillStyle = s.color; ctx.font = `bold ${s.fontSize}px Inter, sans-serif`; ctx.textAlign = 'left';
          tickerX.current -= speed; if (tickerX.current < -ctx.measureText(overlay.title).width - 100) tickerX.current = 1920;
          ctx.fillText(overlay.title, tickerX.current, 1030 + (50 + s.fontSize/2) / 2);
          ctx.fillStyle = s.accentColor || 'rgba(99, 102, 241, 1)'; ctx.fillRect(0, 1025, 1920, 5);
        }
        if (overlay.type === 'logo') {
          const img = imageElements.current[overlay.id];
          if (img && img.complete) ctx.drawImage(img, overlay.x || 1700, overlay.y || 50, overlay.width || 150, overlay.height || 150);
        }
      });

      if (isTransitioning.current && lastCanvasSnapshot.current) {
          ctx.globalAlpha = transitionProgress.current; ctx.drawImage(lastCanvasSnapshot.current, 0, 0); ctx.globalAlpha = 1.0;
          transitionProgress.current -= 0.04; if (transitionProgress.current <= 0) { isTransitioning.current = false; lastCanvasSnapshot.current = null; }
      }
      animationFrameRef.current = requestAnimationFrame(render);
    };
    render();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [sources, overlays, selectedSourceId, interactive]);

  return (
    <canvas ref={canvasRef} width={1920} height={1080} 
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={() => isDragging.current = false} onMouseLeave={() => isDragging.current = false}
      style={{ width: '100%', height: '100%', backgroundColor: 'black' }} />
  );
};

export default Composer;
