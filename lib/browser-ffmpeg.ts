'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let initPromise: Promise<FFmpeg> | null = null;

export interface FFmpegConvertProgress {
  ratio: number;
  message: string;
}

/**
 * Initializes the in-browser WebAssembly FFmpeg instance using local static assets or fallback.
 */
export async function getBrowserFFmpeg(
  onProgress?: (progress: FFmpegConvertProgress) => void
): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegInstance.loaded) {
    return ffmpegInstance;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on('log', ({ message }) => {
      // Optional: console.log('[FFmpeg WASM]', message);
    });

    onProgress?.({
      ratio: 0.05,
      message: 'تحميل محرك FFmpeg WebAssembly داخل المتصفح...',
    });

    try {
      // Try local assets first from /ffmpeg
      const baseURL = typeof window !== 'undefined' ? `${window.location.origin}/ffmpeg` : '/ffmpeg';
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');

      await ffmpeg.load({
        coreURL,
        wasmURL,
      });

      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (localErr) {
      console.warn('Local FFmpeg core load failed, trying CDN fallback:', localErr);

      // Fallback to official unpkg CDN
      const cdnBase = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
      const coreURL = await toBlobURL(`${cdnBase}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${cdnBase}/ffmpeg-core.wasm`, 'application/wasm');

      await ffmpeg.load({
        coreURL,
        wasmURL,
      });

      ffmpegInstance = ffmpeg;
      return ffmpeg;
    }
  })();

  return initPromise;
}

/**
 * Converts recorded in-browser media chunks to a genuine standard MP4 container
 * with AAC audio and +faststart flag for maximum compatibility with YouTube, Android, WhatsApp, and iOS.
 */
export async function transcodeToMp4InBrowser(
  inputBlob: Blob,
  onProgress?: (progress: FFmpegConvertProgress) => void,
  abortSignal?: AbortSignal
): Promise<Blob> {
  if (abortSignal?.aborted) {
    throw new Error('تم إلغاء عملية الرندر');
  }

  const ffmpeg = await getBrowserFFmpeg(onProgress);

  if (abortSignal?.aborted) {
    throw new Error('تم إلغاء عملية الرندر');
  }

  onProgress?.({
    ratio: 0.15,
    message: 'نقل مسار الفيديو المسجل إلى ذاكرة FFmpeg المحلية...',
  });

  const inputData = await fetchFile(inputBlob);
  const inputFilename = 'input_recorded.webm';
  const outputFilename = 'output_final.mp4';

  await ffmpeg.writeFile(inputFilename, inputData);

  const progressHandler = ({ progress }: { progress: number }) => {
    const clampedProgress = Math.min(1.0, Math.max(0, progress));
    onProgress?.({
      ratio: 0.2 + clampedProgress * 0.75,
      message: `جارِ تحويل وتجميع MP4 عبر FFmpeg (${Math.round(clampedProgress * 100)}%)...`,
    });
  };

  ffmpeg.on('progress', progressHandler);

  onProgress?.({
    ratio: 0.25,
    message: 'تطبيق حاوية MP4 القياسية وترميز AAC وضبط faststart...',
  });

  // Attempt stream copy first (ultra fast remuxing)
  let exitCode = await ffmpeg.exec([
    '-i',
    inputFilename,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outputFilename,
  ]);

  // If stream copy fails (e.g. video codec in webm is VP8/VP9 requiring H.264 transcode), transcode to H.264
  if (exitCode !== 0) {
    if (abortSignal?.aborted) {
      throw new Error('تم إلغاء عملية الرندر');
    }

    onProgress?.({
      ratio: 0.35,
      message: 'ترميز الفيديو السريع H.264 / AAC عبر FFmpeg في المتصفح...',
    });

    exitCode = await ffmpeg.exec([
      '-i',
      inputFilename,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '22',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '192k',
      '-movflags',
      '+faststart',
      outputFilename,
    ]);
  }

  ffmpeg.off('progress', progressHandler);

  if (exitCode !== 0) {
    throw new Error(`تعذر على محرك FFmpeg إتمام المعالجة (رمز الخروج ${exitCode})`);
  }

  onProgress?.({
    ratio: 0.98,
    message: 'استخراج وتجهيز ملف MP4 النهائي للتحميل...',
  });

  const outData = (await ffmpeg.readFile(outputFilename)) as Uint8Array;

  // Cleanup files from virtual fs
  try {
    await ffmpeg.deleteFile(inputFilename);
    await ffmpeg.deleteFile(outputFilename);
  } catch {}

  return new Blob([new Uint8Array(outData) as any], { type: 'video/mp4' });
}
