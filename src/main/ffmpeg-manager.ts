import { spawn, ChildProcess } from 'child_process';
import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'ffmpeg-static';

export class FFmpegManager {
  private ffmpegProcess: ChildProcess | null = null;

  start(outputPath: string, options: { isStreaming: boolean; streamUrl?: string; bitrate?: number }) {
    if (this.ffmpegProcess) return;

    let finalPath = outputPath;
    if (!options.isStreaming && !path.isAbsolute(outputPath)) {
      finalPath = path.join(app.getPath('videos'), outputPath);
    }

    const bitrate = options.bitrate || 6000;

    const args = [
      '-i', 'pipe:0', 
      '-vcodec', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-maxrate', `${bitrate}k`,
      '-bufsize', `${bitrate * 2}k`,
      '-pix_fmt', 'yuv420p',
      '-g', '60', 
      '-x264-params', 'keyint=60:min-keyint=60:scenecut=0',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', options.isStreaming ? 'flv' : 'mp4',
    ];

    if (!options.isStreaming) {
        args.splice(args.indexOf('-f') - 1, 0, '-movflags', '+faststart');
    }

    if (options.isStreaming && options.streamUrl) {
      args.push(options.streamUrl);
    } else {
      args.push('-y', finalPath);
    }

    const ffmpegPath = ffmpeg?.replace('app.asar', 'app.asar.unpacked') || 'ffmpeg';
    console.log('Starting FFmpeg from:', ffmpegPath, 'with args:', args.join(' '));
    this.ffmpegProcess = spawn(ffmpegPath, args);

    this.ffmpegProcess.on('error', (err) => {
      console.error('FFmpeg process error:', err);
    });

    this.ffmpegProcess.stderr?.on('data', (data) => {
      // console.log('FFmpeg stderr:', data.toString());
    });

    this.ffmpegProcess.on('close', (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      this.ffmpegProcess = null;
    });
  }

  write(chunk: Buffer) {
    if (this.ffmpegProcess && this.ffmpegProcess.stdin) {
      this.ffmpegProcess.stdin.write(chunk);
    }
  }

  stop() {
    if (this.ffmpegProcess && this.ffmpegProcess.stdin) {
      this.ffmpegProcess.stdin.end();
    }
  }
}

const ffmpegManager = new FFmpegManager();

ipcMain.handle('start-ffmpeg', async (event, { outputPath, isStreaming, streamUrl, bitrate }) => {
  ffmpegManager.start(outputPath, { isStreaming, streamUrl, bitrate });
  return true;
});

ipcMain.handle('stop-ffmpeg', async () => {
  ffmpegManager.stop();
  return true;
});

ipcMain.on('ffmpeg-chunk', (event, chunk: Uint8Array) => {
  ffmpegManager.write(Buffer.from(chunk));
});
