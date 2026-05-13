import { spawn, ChildProcess } from 'child_process';
import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

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
      '-i', 'pipe:0', // Read from stdin
      '-vcodec', 'libx264',
      '-preset', 'veryfast',
      '-maxrate', `${bitrate}k`,
      '-bufsize', `${bitrate * 2}k`,
      '-pix_fmt', 'yuv420p',
      '-g', '60', // Keyframe every 2 seconds (at 30fps)
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ar', '44100',
      '-f', options.isStreaming ? 'flv' : 'mp4',
    ];

    if (options.isStreaming && options.streamUrl) {
      args.push(options.streamUrl);
    } else {
      // For MP4 recording, we need to allow overwriting and use a container that supports fragmented output if needed
      // but standard MP4 is fine if we close properly.
      args.push('-y', finalPath);
    }

    console.log('Starting FFmpeg with args:', args.join(' '));
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
