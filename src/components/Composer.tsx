import React, { useEffect, useRef, useState } from 'react';

interface Source {
  id: string;
  name: string;
  type: 'screen' | 'window' | 'camera' | 'image' | 'video' | 'text' | 'pdf' | 'slides';
  data?: string;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  playing?: boolean;
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
  type: 'lower-third' | 'ticker';
  title: string;
  subtitle: string;
  visible: boolean;
}

interface ComposerProps {
  sources: Source[];
  overlays: Overlay[];
  interactive?: boolean;
  selectedSourceId?: string | null;
  onSourceUpdate?: (id: string, updates: Partial<Source>) => void;
  onSourceSelect?: (id: string | null) => void;
  onStreamCreated?: (stream: MediaStream) => void;
}

const Composer: React.FC<ComposerProps> = ({ 
  sources, 
  overlays, 
  interactive, 
  selectedSourceId, 
  onSourceUpdate, 
  onSourceSelect,
  onStreamCreated 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoElements = useRef<Record<string, HTMLVideoElement>>({});
  const imageElements = useRef<Record<string, HTMLImageElement>>({});
  const streams = useRef<Record<string, MediaStream>>({});
  const animationFrameRef = useRef<number>();
  const tickerX = useRef(1920);

  const isDragging = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialSourcePos = useRef({ x: 0, y: 0 });

  // Transition state
  const lastCanvasSnapshot = useRef<HTMLCanvasElement | null>(null);
  const transitionProgress = useRef(0);
  const isTransitioning = useRef(false);

  useEffect(() => {
    const updateSources = async () => {
      if (canvasRef.current && !isTransitioning.current) {
          const snapshot = document.createElement('canvas');
          snapshot.width = 1920; snapshot.height = 1080;
          const sCtx = snapshot.getContext('2d');
          if (sCtx) { sCtx.drawImage(canvasRef.current, 0, 0); lastCanvasSnapshot.current = snapshot; transitionProgress.current = 1.0; isTransitioning.current = true; }
      }

      for (const id in streams.current) {
        if (!sources.find(s => s.id === id)) {
          streams.current[id].getTracks().forEach(t => t.stop());
          delete streams.current[id];
          delete videoElements.current[id];
        }
      }

      for (const id in videoElements.current) {
          if (!sources.find(s => s.id === id)) {
              videoElements.current[id].pause();
              delete videoElements.current[id];
          }
      }

      for (const source of sources) {
        if (!source.visible) continue;

        if ((source.type === 'screen' || source.type === 'window' || source.type === 'camera') && !streams.current[source.id]) {
          try {
            let stream: MediaStream;
            if (source.type === 'camera') {
                stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: source.id }, width: 1920, height: 1080 } });
            } else {
                stream = await navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id, minWidth: 1280, maxWidth: 1920, minHeight: 720, maxHeight: 1080 } } as any });
            }
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.play();
            streams.current[source.id] = stream;
            videoElements.current[source.id] = video;
          } catch (e) {}
        }

        if ((source.type === 'image' || source.type === 'pdf' || source.type === 'slides') && source.data && !imageElements.current[source.id]) {
          const img = new Image();
          img.src = source.data;
          imageElements.current[source.id] = img;
        }

        if (source.type === 'video' && source.data && !videoElements.current[source.id]) {
            const video = document.createElement('video');
            video.src = source.data;
            video.loop = true;
            video.muted = true;
            if (source.playing !== false) video.play().catch(e => {});
            videoElements.current[source.id] = video;
        }
      }
    };
    updateSources();
  }, [sources]);

  useEffect(() => {
      sources.forEach(source => {
          if (source.type === 'video') {
              const video = videoElements.current[source.id];
              if (video) {
                  if (source.playing === false) video.pause();
                  else video.play().catch(e => {});
              }
          }
      });
  }, [sources]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!interactive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const reversed = [...sources].reverse();
    const hit = reversed.find(s => s.visible && mouseX >= s.x && mouseX <= s.x + s.width && mouseY >= s.y && mouseY <= s.y + s.height);
    
    if (hit) {
        onSourceSelect?.(hit.id);
        isDragging.current = true;
        dragStartPos.current = { x: mouseX, y: mouseY };
        initialSourcePos.current = { x: hit.x, y: hit.y };
    } else {
        onSourceSelect?.(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!interactive || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1920 / rect.width;
    const scaleY = 1080 / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    if (isDragging.current && selectedSourceId && onSourceUpdate) {
        const dx = mouseX - dragStartPos.current.x;
        const dy = mouseY - dragStartPos.current.y;
        onSourceUpdate(selectedSourceId, {
            x: Math.round(initialSourcePos.current.x + dx),
            y: Math.round(initialSourcePos.current.y + dy)
        });
    } else {
        const reversed = [...sources].reverse();
        const hover = reversed.find(s => s.visible && mouseX >= s.x && mouseX <= s.x + s.width && mouseY >= s.y && mouseY <= s.y + s.height);
        canvasRef.current.style.cursor = hover ? 'move' : 'default';
    }
  };

  const handleMouseUp = () => { isDragging.current = false; };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (onStreamCreated) onStreamCreated(canvas.captureStream(60));

    const render = () => {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      sources.forEach(source => {
        if (!source.visible) return;
        
        if (source.type === 'text') {
            const style = source.style || { fontSize: 64, fontFamily: 'Outfit', color: '#ffffff', bold: true, italic: false, textAlign: 'left' };
            ctx.fillStyle = style.color;
            ctx.textAlign = style.textAlign;
            ctx.font = `${style.italic ? 'italic ' : ''}${style.bold ? 'bold ' : ''}${style.fontSize}px ${style.fontFamily}, sans-serif`;
            
            // Handle multi-line text
            const lines = (source.data || '').split('\n');
            lines.forEach((line, i) => {
                const textX = style.textAlign === 'center' ? source.x + source.width / 2 : (style.textAlign === 'right' ? source.x + source.width : source.x);
                ctx.fillText(line, textX, source.y + style.fontSize + (i * style.fontSize * 1.2));
            });
        } else if (source.type === 'image' || source.type === 'pdf' || source.type === 'slides') {
          const img = imageElements.current[source.id];
          if (img && img.complete) ctx.drawImage(img, source.x, source.y, source.width, source.height);
        } else {
          const video = videoElements.current[source.id];
          if (video && video.readyState >= 2) ctx.drawImage(video, source.x, source.y, source.width, source.height);
        }

        if (interactive && source.id === selectedSourceId) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(source.x, source.y, source.width, source.height);
            ctx.setLineDash([]);
        }
      });

      overlays.forEach(overlay => {
        if (!overlay.visible) return;
        if (overlay.type === 'lower-third') {
          ctx.fillStyle = 'rgba(99, 102, 241, 0.95)';
          ctx.fillRect(100, 850, 650, 100);
          ctx.fillStyle = 'white';
          ctx.font = 'bold 44px Outfit, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(overlay.title.toUpperCase(), 140, 915);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(100, 950, 450, 50);
          ctx.fillStyle = 'white';
          ctx.font = '22px Inter, sans-serif';
          ctx.fillText(overlay.subtitle.toUpperCase(), 140, 985);
        }
        if (overlay.type === 'ticker') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
          ctx.fillRect(0, 1030, 1920, 50);
          ctx.fillStyle = 'white';
          ctx.font = 'bold 24px Inter, sans-serif';
          ctx.textAlign = 'left';
          tickerX.current -= 3;
          if (tickerX.current < -ctx.measureText(overlay.title).width - 100) tickerX.current = 1920;
          ctx.fillText(overlay.title, tickerX.current, 1063);
          ctx.fillStyle = 'rgba(99, 102, 241, 1)';
          ctx.fillRect(0, 1025, 1920, 5);
        }
      });

      if (isTransitioning.current && lastCanvasSnapshot.current) {
          ctx.globalAlpha = transitionProgress.current;
          ctx.drawImage(lastCanvasSnapshot.current, 0, 0);
          ctx.globalAlpha = 1.0;
          transitionProgress.current -= 0.04;
          if (transitionProgress.current <= 0) { isTransitioning.current = false; lastCanvasSnapshot.current = null; }
      }
      animationFrameRef.current = requestAnimationFrame(render);
    };
    render();
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [sources, overlays, selectedSourceId, interactive]);

  return (
    <canvas 
      ref={canvasRef} width={1920} height={1080} 
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      style={{ width: '100%', height: '100%', backgroundColor: 'black' }}
    />
  );
};

export default Composer;
