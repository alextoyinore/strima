import { app, ipcMain } from 'electron';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';
import fs from 'fs';

export class FFmpegManager {
  private command: ffmpeg.FfmpegCommand | null = null;
  private inputStream: PassThrough | null = null;
  private ffmpegPathSet = false;

  private resolveFFmpegPath() {
    if (this.ffmpegPathSet) return;
    
    let ffmpegPath = '';
    const isWin = process.platform === 'win32';
    const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

    const possiblePaths = [
      path.join(app.getAppPath(), 'node_modules', 'ffmpeg-static', exeName),
      path.join(process.cwd(), 'node_modules', 'ffmpeg-static', exeName),
      path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', exeName),
      path.join(process.resourcesPath, exeName),
    ];

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          ffmpegPath = p;
          break;
        }
      } catch (e) {}
    }

    if (ffmpegPath) {
      console.log('Setting FFmpeg path to:', ffmpegPath);
      ffmpeg.setFfmpegPath(ffmpegPath);
    } else {
      console.log('No local FFmpeg found, relying on system/global FFmpeg.');
    }
    
    this.ffmpegPathSet = true;
  }

  start(outputPath: string, options: { isStreaming: boolean; streamUrl?: string; bitrate?: number }) {
    if (this.command) return;

    this.resolveFFmpegPath();

    this.inputStream = new PassThrough();

    let finalPath = outputPath;
    if (!options.isStreaming) {
      if (path.isAbsolute(outputPath)) {
        finalPath = outputPath;
      } else {
        // Build Documents/Strima/Recordings/<timestamp>/recording.mp4
        const strimaDir = path.join(app.getPath('documents'), 'Strima');
        const recordingsDir = path.join(strimaDir, 'Recordings');
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const folderName = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
        const sessionDir = path.join(recordingsDir, folderName);
        try {
          if (!fs.existsSync(strimaDir)) fs.mkdirSync(strimaDir, { recursive: true });
          if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
          fs.mkdirSync(sessionDir, { recursive: true });
        } catch (e) {
          console.error('Failed to create recording folder:', e);
        }
        finalPath = path.join(sessionDir, 'recording.mp4');
      }
    }

    const bitrate = options.bitrate || 6000;
    const output = (options.isStreaming && options.streamUrl) ? options.streamUrl : finalPath;

    const logPath = path.join(app.getPath('userData'), 'ffmpeg.log');
    try {
      fs.writeFileSync(logPath, `--- FFmpeg Log Started at ${new Date().toISOString()} ---\n`);
      fs.appendFileSync(logPath, `Output Target: ${options.isStreaming ? 'Streaming to ' + options.streamUrl?.split('/').slice(0, 4).join('/') + '/[SECRET_KEY]' : finalPath}\n`);
    } catch (e) {
      console.error('Failed to create ffmpeg.log', e);
    }

    console.log('Starting FFmpeg for:', options.isStreaming ? 'Streaming' : 'Recording');
    
    this.command = ffmpeg(this.inputStream)
      .inputFormat('webm')
      .videoCodec('libx264')
      .addOptions([
        '-loglevel verbose',
        '-preset ultrafast',
        '-tune zerolatency',
        `-maxrate ${bitrate}k`,
        `-bufsize ${bitrate * 2}k`,
        '-pix_fmt yuv420p',
        '-g 60',
        '-x264-params keyint=60:min-keyint=60:scenecut=0',
        '-r 30'
      ])
      .audioCodec('aac')
      .audioBitrate('128k')
      .audioFrequency(44100)
      .format(options.isStreaming ? 'flv' : 'mp4');

    if (options.isStreaming) {
      this.command.addOutputOptions([
        '-flvflags no_duration_filesize'
      ]);
    } else {
      this.command.addOutputOptions('-movflags +faststart');
    }

    this.command
      .on('start', (commandLine) => {
        try { fs.appendFileSync(logPath, `Spawned FFmpeg with command: ${commandLine}\n`); } catch (e) { /* ignore */ }
        console.log('Spawned FFmpeg with command:', commandLine);
      })
      .on('stderr', (stderrLine) => {
        try { fs.appendFileSync(logPath, stderrLine + '\n'); } catch (e) { /* ignore */ }
        // Log FFmpeg output for debugging
        if (stderrLine.includes('Error') || stderrLine.includes('failed')) {
          console.error('FFmpeg Log:', stderrLine);
        }
      })
      .on('error', (err, stdout, stderr) => {
        try { fs.appendFileSync(logPath, `FFmpeg process error: ${err.message}\n`); } catch (e) { /* ignore */ }
        console.error('FFmpeg process error:', err.message);
        console.error('FFmpeg stderr:', stderr);
        this.cleanup();
      })
      .on('end', () => {
        try { fs.appendFileSync(logPath, 'FFmpeg process finished cleanly\n'); } catch (e) { /* ignore */ }
        console.log('FFmpeg process finished');
        this.cleanup();
      })
      .save(output);

  }

  private cleanup() {
    this.command = null;
    this.inputStream = null;
  }

  write(chunk: Buffer) {
    if (this.inputStream && this.inputStream.writable && !this.inputStream.writableEnded) {
      try {
        this.inputStream.write(chunk);
      } catch (err) {
        console.error('Error writing chunk to FFmpeg:', err);
      }
    }
  }

  stop() {
    if (this.inputStream && !this.inputStream.writableEnded) {
      this.inputStream.end();
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

