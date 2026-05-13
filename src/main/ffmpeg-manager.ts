import { app, ipcMain } from 'electron';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough } from 'stream';

export class FFmpegManager {
  private command: ffmpeg.FfmpegCommand | null = null;
  private inputStream: PassThrough | null = null;

  start(outputPath: string, options: { isStreaming: boolean; streamUrl?: string; bitrate?: number }) {
    if (this.command) return;

    this.inputStream = new PassThrough();

    let finalPath = outputPath;
    if (!options.isStreaming && !path.isAbsolute(outputPath)) {
      finalPath = path.join(app.getPath('videos'), outputPath);
    }

    const bitrate = options.bitrate || 6000;
    const output = (options.isStreaming && options.streamUrl) ? options.streamUrl : finalPath;

    console.log('Starting FFmpeg for:', options.isStreaming ? 'Streaming' : 'Recording');
    
    this.command = ffmpeg(this.inputStream)
      .inputFormat('webm')
      .videoCodec('libx264')
      .addOptions([
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
        '-flvflags no_duration_filesize',
        '-f flv'
      ]);
    } else {
      this.command.addOutputOptions('-movflags +faststart');
    }

    this.command
      .on('start', (commandLine) => {
        console.log('Spawned FFmpeg with command:', commandLine);
      })
      .on('stderr', (stderrLine) => {
        // Log FFmpeg output for debugging
        if (stderrLine.includes('Error') || stderrLine.includes('failed')) {
          console.error('FFmpeg Log:', stderrLine);
        }
      })
      .on('error', (err, stdout, stderr) => {
        console.error('FFmpeg process error:', err.message);
        console.error('FFmpeg stderr:', stderr);
        this.cleanup();
      })
      .on('end', () => {
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
    if (this.inputStream) {
      this.inputStream.write(chunk);
    }
  }

  stop() {
    if (this.inputStream) {
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
