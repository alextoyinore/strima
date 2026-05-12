import { spawn, ChildProcess } from 'child_process';
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

export class FFmpegManager {
  private ffmpegProcess: ChildProcess | null = null;

  start(outputPath: string, options: { isStreaming: boolean; streamUrl?: string }) {
    if (this.ffmpegProcess) return;

    const args = [
      '-i', 'pipe:0', // Read from stdin
      '-vcodec', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-f', options.isStreaming ? 'flv' : 'mp4',
    ];

    if (options.isStreaming && options.streamUrl) {
      args.push(options.streamUrl);
    } else {
      args.push(outputPath);
    }

    this.ffmpegProcess = spawn('ffmpeg', args);

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

ipcMain.handle('start-ffmpeg', async (event, { outputPath, isStreaming, streamUrl }) => {
  ffmpegManager.start(outputPath, { isStreaming, streamUrl });
  return true;
});

ipcMain.handle('stop-ffmpeg', async () => {
  ffmpegManager.stop();
  return true;
});

ipcMain.on('ffmpeg-chunk', (event, chunk: Uint8Array) => {
  ffmpegManager.write(Buffer.from(chunk));
});
