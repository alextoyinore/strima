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
  style?: {
    fontSize: number;
    fontFamily: string;
    color: string;
    bold: boolean;
    italic: boolean;
    textAlign: 'left' | 'center' | 'right';
  };
}

interface Overlay {
  id: string;
  type: 'lower-third' | 'ticker' | 'logo';
  title: string;
  subtitle: string;
  visible: boolean;
  data?: string; // For Logo
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
  onStreamCreated,
  onPlaybackUpdate,
  seekRequest
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElements = useRef<Record<string, HTMLVideoElement>>({});
  const audioElements = useRef<Record<string, HTMLAudioElement>>({});
  const imageElements = useRef<Record<string, HTMLImageElement>>({});
  const streams = useRef<Record<string, MediaStream>>({});
  const animationFrameRef = useRef<number>();
  const tickerX = useRef(1920);

  const audioContext = useRef<AudioContext>();
  const audioDestination = useRef<MediaStreamAudioDestinationNode>();
  const audioNodes = useRef<Record<string, { source: AudioNode, gain: GainNode }>>({});

  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialSourcePos = useRef({ x: 0, y: 0 });

  // Transition state
  const lastCanvasSnapshot = useRef<HTMLCanvasElement | null>(null);
  const transitionProgress = useRef(0);
  const isTransitioning = useRef(false);

  useEffect(() => {
    if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioDestination.current = audioContext.current.createMediaStreamDestination();
    }

    const updateSources = async () => {
      if (canvasRef.current && !isTransitioning.current) {
          const snapshot = document.createElement('canvas');
          snapshot.width = 1920; snapshot.height = 1080;
          const sCtx = snapshot.getContext('2d');
          if (sCtx) { sCtx.drawImage(canvasRef.current, 0, 0); lastCanvasSnapshot.current = snapshot; transitionProgress.current = 1.0; isTransitioning.current = true; }
      }

      // Cleanup
      for (const id in streams.current) {
        if (!sources.find(s => s.id === id) && !overlays.find(o => o.id === id)) {
          streams.current[id].getTracks().forEach(t => t.stop());
          delete streams.current[id];
          delete videoElements.current[id];
          if (audioNodes.current[id]) { 
              audioNodes.current[id].gain?.disconnect(); 
              audioNodes.current[id].source?.disconnect(); 
              delete audioNodes.current[id]; 
          }
        }
      }

      // Initialize
      for (const source of sources) {
        if (!source.visible) continue;
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

        if ((source.type === 'image' || source.type === 'pdf' || source.type === 'slides') && source.data && !imageElements.current[source.id]) {
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
      }

      for (const overlay of overlays) {
        if (overlay.type === 'logo' && overlay.data && !imageElements.current[overlay.id]) {
          const img = new Image(); img.src = overlay.data; img.crossOrigin = 'anonymous';
          imageElements.current[overlay.id] = img;
        }
      }
    };
    updateSources();
  }, [sources, overlays, interactive]);

  useEffect(() => {
      sources.forEach(source => {
          if (source.type === 'video' || source.type === 'audio' || source.type === 'camera') {
              const el = source.type === 'video' ? videoElements.current[source.id] : audioElements.current[source.id];
              if (el) {
                  if (source.playing === false) el.pause();
                  else el.play().catch(() => {});
              }
              const node = audioNodes.current[source.id];
              if (node && node.gain && node.gain.gain) { node.gain.gain.value = source.volume ?? 1.0; }
          }
      });
  }, [sources]);

  useEffect(() => {
    if (seekRequest) {
      const el = videoElements.current[seekRequest.id] || audioElements.current[seekRequest.id];
      if (el) {
          if (el.readyState >= 1) { el.currentTime = seekRequest.time; } 
          else { el.addEventListener('loadedmetadata', () => { el.currentTime = seekRequest.time; }, { once: true }); }
      }
    }
  }, [seekRequest]);

  useEffect(() => {
    if (!interactive || !onPlaybackUpdate) return;
    const interval = setInterval(() => {
      if (selectedSourceId) {
        const el = videoElements.current[selectedSourceId] || audioElements.current[selectedSourceId];
        if (el && !isNaN(el.duration)) { onPlaybackUpdate(selectedSourceId, el.currentTime, el.duration); }
      }
    }, 500);
    return () => clearInterval(interval);
  }, [selectedSourceId, interactive, onPlaybackUpdate]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!interactive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    const reversed = [...sources].reverse();
    const hit = reversed.find(s => s.visible && mouseX >= s.x && mouseX <= s.x + s.width && mouseY >= s.y && mouseY <= s.y + s.height);
    if (hit) { onSourceSelect?.(hit.id); isDragging.current = true; dragStartPos.current = { x: mouseX, y: mouseY }; initialSourcePos.current = { x: hit.x, y: hit.y }; } 
    else { onSourceSelect?.(null); }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!interactive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;
    if (isDragging.current && selectedSourceId && onSourceUpdate) {
        const dx = mouseX - dragStartPos.current.x; const dy = mouseY - dragStartPos.current.y;
        onSourceUpdate(selectedSourceId, { x: Math.round(initialSourcePos.current.x + dx), y: Math.round(initialSourcePos.current.y + dy) });
    } else {
        const reversed = [...sources].reverse();
        const hover = reversed.find(s => s.visible && mouseX >= s.x && mouseX <= s.x + s.width && mouseY >= s.y && mouseY <= s.y + s.height);
        canvasRef.current.style.cursor = hover ? 'move' : 'default';
    }
  };

  const drawSource = (source: Source, element: HTMLVideoElement | HTMLImageElement, ctx: CanvasRenderingContext2D) => {
    const fit = source.fit || 'fill'; const targetX = source.x; const targetY = source.y; const targetW = source.width; const targetH = source.height;
    let sW = 0, sH = 0;
    if (element instanceof HTMLVideoElement) { sW = element.videoWidth; sH = element.videoHeight; } else { sW = element.width; sH = element.height; }
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
    if (onStreamCreated) {
        const vS = canvas.captureStream(60); const tracks = [...vS.getVideoTracks()];
        if (audioDestination.current) tracks.push(...audioDestination.current.stream.getAudioTracks());
        onStreamCreated(new MediaStream(tracks));
    }

    const render = () => {
      ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      sources.forEach(source => {
        if (!source.visible) return;
        if (source.type === 'text') {
            const s = source.style || { fontSize: 64, fontFamily: 'Outfit', color: '#ffffff', bold: true, italic: false, textAlign: 'left' };
            ctx.fillStyle = s.color; ctx.textAlign = s.textAlign; ctx.font = `${s.italic ? 'italic ' : ''}${s.bold ? 'bold ' : ''}${s.fontSize}px ${s.fontFamily}, sans-serif`;
            const lines = (source.data || '').split('\n');
            lines.forEach((l, i) => { const tX = s.textAlign === 'center' ? source.x + source.width / 2 : (s.textAlign === 'right' ? source.x + source.width : source.x); ctx.fillText(l, tX, source.y + s.fontSize + (i * s.fontSize * 1.2)); });
        } else if (source.type === 'image' || source.type === 'pdf' || source.type === 'slides') {
          const img = imageElements.current[source.id]; if (img && img.complete) drawSource(source, img, ctx);
        } else if (source.type !== 'audio') {
          const video = videoElements.current[source.id];
          if (video && video.readyState >= 2) drawSource(source, video, ctx);
          else if (video && video.error) { ctx.fillStyle = 'rgba(255, 0, 0, 0.2)'; ctx.fillRect(source.x, source.y, source.width, source.height); ctx.fillStyle = 'white'; ctx.font = '24px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Format Not Supported', source.x + source.width / 2, source.y + source.height / 2); }
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
