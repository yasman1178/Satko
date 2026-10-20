'use client';

import { Scene, MotionType } from '@/types/project';
import { patchVideoDuration } from '@/lib/video-duration-patcher';

export type VideoQuality = '1080p' | '720p' | '480p';
export type RenderEngine = 'server_ffmpeg' | 'browser_canvas';

export interface QualityConfig {
  id: VideoQuality;
  label: string;
  badge: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  description: string;
}

export const QUALITY_PRESETS: Record<VideoQuality, QualityConfig> = {
  '1080p': {
    id: '1080p',
    label: '1080p Full HD (عالية)',
    badge: 'موصى به لليوتيوب وريلز',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 8_500_000,
    description: 'دقة فائقة ونقاء كريستالي مع تفاصيل بارزة وترجمة سينمائية (1920x1080)',
  },
  '720p': {
    id: '720p',
    label: '720p HD (قياسية)',
    badge: 'توازن وسرعة',
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: 4_500_000,
    description: 'توازن مثالي بين حجم الملف وجودة الصورة وسرعة الرندر (1280x720)',
  },
  '480p': {
    id: '480p',
    label: '480p SD (مسودة سريعة)',
    badge: 'فائق السرعة',
    width: 854,
    height: 480,
    fps: 24,
    bitrate: 1_800_000,
    description: 'رندر خفيف وسريع جداً مخصص للمراجعة والتجربة السريعة (854x480)',
  },
};

import {
  calculateWeightedWordTiming,
  type TimedWord,
  type TimedWordChunk,
} from '@/lib/word-timing';

export { calculateWeightedWordTiming, type TimedWord, type TimedWordChunk };

export interface RenderOptions {
  channelName?: string;
  showWatermark?: boolean;
  engine?: RenderEngine;
  timingOffset?: number; // In seconds, e.g. +0.25s delay so subtitles don't rush ahead of audio
  wordsPerChunk?: number;
}

export interface RenderProgress {
  currentSceneIndex: number;
  totalScenes: number;
  percent: number;
  currentTimeSec: number;
  totalTimeSec: number;
  statusText: string;
}

export interface RenderResult {
  blob: Blob;
  url: string;
  filename: string;
  durationSec: number;
  sizeBytes: number;
  mimeType: string;
  engine: RenderEngine;
}

export function splitTextIntoWordChunks(text: string, durationSec: number = 4.0): TimedWordChunk[] {
  return calculateWeightedWordTiming(text, durationSec, 0.25);
}

/**
 * Generates standard SRT subtitle text for the entire project
 * so creators can import it into CapCut, Premiere Pro, or DaVinci Resolve.
 */
export function exportSrtSubtitles(scenes: Scene[], timingOffsetSec: number = 0.25): string {
  let srt = '';
  let counter = 1;
  let globalElapsed = 0;

  const formatSrtTime = (seconds: number) => {
    const safe = Math.max(0, seconds);
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const s = Math.floor(safe % 60);
    const ms = Math.floor((safe % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  for (const scene of scenes) {
    const duration = scene.duration_seconds || 3.8;
    const chunks = calculateWeightedWordTiming(scene.narration_text || '', duration, timingOffsetSec);

    for (const chunk of chunks) {
      const start = formatSrtTime(globalElapsed + chunk.startSec);
      const end = formatSrtTime(globalElapsed + chunk.endSec);

      srt += `${counter}\n`;
      srt += `${start} --> ${end}\n`;
      srt += `${chunk.text}\n\n`;
      counter++;
    }

    globalElapsed += duration;
  }

  return srt;
}

/**
 * High-Speed Server FFmpeg Video Render Pipeline
 * Immune to browser tab throttling / minimizing.
 * Produces genuine MP4 with crystal clear H.264 / AAC encoding.
 */
export async function renderServerVideo(
  scenes: Scene[],
  quality: VideoQuality = '1080p',
  onProgress: (p: RenderProgress) => void,
  options?: RenderOptions,
  abortSignal?: AbortSignal
): Promise<RenderResult> {
  if (!scenes || scenes.length === 0) {
    throw new Error('لا توجد مشاهد صالحة للرندر');
  }

  const totalEstimatedDuration = scenes.reduce(
    (sum, s) => sum + (s.duration_seconds || 3.8),
    0
  );

  onProgress({
    currentSceneIndex: 0,
    totalScenes: scenes.length,
    percent: 2,
    currentTimeSec: 0,
    totalTimeSec: Math.round(totalEstimatedDuration),
    statusText: 'إرسال مشروع الفيديو إلى محرك السيرفر السحابي (FFmpeg)...',
  });

  // 1. Send render request to server API
  const response = await fetch('/api/render/server', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scenes: scenes.map((s, idx) => ({
        scene_id: s.scene_id || `sc_${idx + 1}`,
        narration_text: s.narration_text || '',
        duration_seconds: s.duration_seconds || 3.8,
        audio_url: s.audio_url || '',
        image_url: s.image_url || '',
        motion: s.motion || 'zoom_in',
      })),
      quality: quality === '480p' ? '720p' : quality, // FFmpeg handles 720p and 1080p fast
      channelName: options?.channelName || 'MachinaMind',
      showWatermark: options?.showWatermark !== false,
      timingOffset: options?.timingOffset ?? 0.25,
      wordsPerChunk: options?.wordsPerChunk || 4,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    throw new Error(errorJson.error || `فشل الاتصال بسيرفر الرندر (${response.status})`);
  }

  const { renderId } = await response.json();
  if (!renderId) {
    throw new Error('لم يتم استلام معرّف الرندر من السيرفر');
  }

  // 2. Poll server status until completion
  // This continues smoothly even if the user switches to other apps or tabs!
  let isDone = false;
  let finalStatusData: any = null;

  while (!isDone) {
    if (abortSignal?.aborted) {
      throw new Error('تم إلغاء عملية الرندر من قبل المستخدم');
    }

    await new Promise((resolve) => setTimeout(resolve, 650));

    try {
      const statusRes = await fetch(`/api/render/status/${renderId}`, {
        cache: 'no-store',
      });
      if (statusRes.ok) {
        const data = await statusRes.json();
        finalStatusData = data;

        onProgress({
          currentSceneIndex: data.currentScene || 0,
          totalScenes: data.totalScenes || scenes.length,
          percent: Math.min(99, Math.max(5, data.percent || 10)),
          currentTimeSec: Math.round(((data.percent || 5) / 100) * totalEstimatedDuration),
          totalTimeSec: Math.round(totalEstimatedDuration),
          statusText: data.statusText || 'جارِ المعالجة بواسطة FFmpeg...',
        });

        if (data.status === 'completed') {
          isDone = true;
          break;
        } else if (data.status === 'error') {
          throw new Error(data.error || 'حدث خطأ أثناء رندر الفيديو على السيرفر');
        }
      }
    } catch (pollErr: any) {
      if (pollErr.name === 'AbortError') throw pollErr;
      console.warn('Status poll retry:', pollErr);
    }
  }

  // 3. Fetch final video blob for direct in-browser playback & download
  const downloadUrl = finalStatusData?.downloadUrl || `/api/render/download/${renderId}`;
  
  onProgress({
    currentSceneIndex: scenes.length,
    totalScenes: scenes.length,
    percent: 100,
    currentTimeSec: Math.round(totalEstimatedDuration),
    totalTimeSec: Math.round(totalEstimatedDuration),
    statusText: 'اكتمل الرندر! جارِ تجهيز ملف MP4 للمعاينة والتحميل...',
  });

  const blobRes = await fetch(downloadUrl);
  const blob = blobRes.ok ? await blobRes.blob() : new Blob([], { type: 'video/mp4' });

  return {
    blob,
    url: downloadUrl,
    filename: finalStatusData?.filename || `Mindplicit_${Date.now()}.mp4`,
    durationSec: finalStatusData?.durationSec || Math.round(totalEstimatedDuration),
    sizeBytes: finalStatusData?.sizeBytes || blob.size,
    mimeType: 'video/mp4',
    engine: 'server_ffmpeg',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE ENGINE (Used as instant preview or optional offline fallback)
// ─────────────────────────────────────────────────────────────────────────────

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y, x + r, y + h);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

export function drawBrandOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scaleRatio: number,
  channelName: string = 'MachinaMind',
  showWatermark: boolean = true
) {
  ctx.save();

  // Top-Left Channel Badge
  const badgeX = Math.round(40 * scaleRatio);
  const badgeY = Math.round(36 * scaleRatio);
  const badgeH = Math.round(48 * scaleRatio);

  ctx.font = `bold ${Math.round(18 * scaleRatio)}px "Cairo", system-ui, sans-serif`;
  const nameWidth = ctx.measureText(channelName).width;
  const badgeW = Math.max(Math.round(190 * scaleRatio), Math.round(nameWidth + 64 * scaleRatio));

  ctx.fillStyle = 'rgba(9, 13, 22, 0.86)';
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
  ctx.lineWidth = Math.max(1.5, 2 * scaleRatio);
  drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12 * scaleRatio);
  ctx.fill();
  ctx.stroke();

  // Diamond Icon
  ctx.fillStyle = '#F59E0B';
  const iconSize = Math.round(16 * scaleRatio);
  const iconCenterX = badgeX + Math.round(22 * scaleRatio);
  const iconCenterY = badgeY + badgeH / 2;
  ctx.beginPath();
  ctx.moveTo(iconCenterX, iconCenterY - iconSize / 2);
  ctx.lineTo(iconCenterX + iconSize / 2, iconCenterY);
  ctx.lineTo(iconCenterX, iconCenterY + iconSize / 2);
  ctx.lineTo(iconCenterX - iconSize / 2, iconCenterY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(channelName, iconCenterX + Math.round(14 * scaleRatio), iconCenterY);

  // Bottom-Right Watermark
  if (showWatermark) {
    const wmPaddingX = Math.round(36 * scaleRatio);
    const wmPaddingY = Math.round(32 * scaleRatio);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.font = `600 ${Math.round(16 * scaleRatio)}px "Cairo", system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = Math.round(6 * scaleRatio);
    ctx.fillText(`⬡ ${channelName.toUpperCase()}`, width - wmPaddingX, height - wmPaddingY);
  }

  ctx.restore();
}

export function drawCinematicSubtitles(
  ctx: CanvasRenderingContext2D,
  chunk: TimedWordChunk,
  sceneElapsedSec: number,
  width: number,
  height: number,
  scaleRatio: number
) {
  if (!chunk || !chunk.text) return;

  ctx.save();

  // Atmospheric scrim
  const scrimH = Math.round(340 * scaleRatio);
  const textScrim = ctx.createLinearGradient(0, height - scrimH, 0, height);
  textScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
  textScrim.addColorStop(0.35, 'rgba(5, 8, 16, 0.45)');
  textScrim.addColorStop(0.7, 'rgba(5, 8, 16, 0.78)');
  textScrim.addColorStop(1, 'rgba(5, 8, 16, 0.94)');
  ctx.fillStyle = textScrim;
  ctx.fillRect(0, height - scrimH, width, scrimH);

  const fontSize = Math.round(56 * scaleRatio);
  ctx.font = `bold ${fontSize}px "Cairo", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';

  const words = chunk.words && chunk.words.length > 0 ? chunk.words : [];
  const textY = height - Math.round(130 * scaleRatio);
  const spaceWidth = ctx.measureText(' ').width;

  const wordMeasurements = words.map((w) => ({
    text: w.text,
    width: ctx.measureText(w.text).width,
    startSec: w.startSec,
    endSec: w.endSec,
  }));

  const totalPhraseWidth =
    wordMeasurements.reduce((acc, m) => acc + m.width, 0) +
    Math.max(0, wordMeasurements.length - 1) * spaceWidth;

  let phraseScale = 1.0;
  const maxAllowedWidth = width * 0.86;
  if (totalPhraseWidth > maxAllowedWidth) {
    phraseScale = maxAllowedWidth / totalPhraseWidth;
  }

  ctx.translate(width / 2, textY);
  if (phraseScale < 1.0) {
    ctx.scale(phraseScale, phraseScale);
  }

  let currentDrawX = -totalPhraseWidth / 2;

  for (let i = 0; i < wordMeasurements.length; i++) {
    const wm = wordMeasurements[i];
    const isSpoken = sceneElapsedSec >= wm.startSec && sceneElapsedSec <= wm.endSec;
    const isPast = sceneElapsedSec > wm.endSec;

    ctx.save();
    if (isSpoken) {
      // Golden yellow highlight for currently spoken word
      ctx.fillStyle = '#F59E0B';
      ctx.shadowColor = 'rgba(245, 158, 11, 0.8)';
      ctx.shadowBlur = Math.round(14 * scaleRatio);
    } else if (isPast) {
      // Solid white for already spoken words
      ctx.fillStyle = '#FFFFFF';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = Math.round(8 * scaleRatio);
    } else {
      // Slightly muted white for upcoming words in the phrase
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = Math.round(6 * scaleRatio);
    }

    ctx.textAlign = 'left';
    ctx.fillText(wm.text, currentDrawX, 0);
    ctx.restore();

    currentDrawX += wm.width + spaceWidth;
  }

  ctx.restore();
}

/**
 * Loads an AudioBuffer from an audio URL or generates a silent buffer
 */
async function loadAudioBuffer(
  audioCtx: AudioContext,
  url: string | undefined,
  defaultDuration: number
): Promise<AudioBuffer> {
  if (url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        return decoded;
      }
    } catch (err) {
      console.warn('Audio fetch failed, generating silence buffer:', err);
    }
  }

  const sampleRate = audioCtx.sampleRate || 44100;
  const frameCount = Math.max(sampleRate, Math.round(sampleRate * (defaultDuration || 3.8)));
  return audioCtx.createBuffer(1, frameCount, sampleRate);
}

function preloadImage(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function getBestSupportedMimeType(): { mimeType: string; extension: string } {
  if (typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: 'webm' };
  }
  const types = [
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t.mime)) {
      return { mimeType: t.mime, extension: t.ext };
    }
  }
  return { mimeType: 'video/webm', extension: 'webm' };
}

/**
 * Universal video renderer: defaults to high-speed server FFmpeg engine,
 * with graceful fallback to browser canvas if requested.
 */
export async function renderProjectVideo(
  scenes: Scene[],
  quality: VideoQuality = '1080p',
  onProgress: (p: RenderProgress) => void,
  options?: RenderOptions,
  abortSignal?: AbortSignal
): Promise<RenderResult> {
  // Use Server FFmpeg engine by default as chosen by user!
  if (!options?.engine || options.engine === 'server_ffmpeg') {
    try {
      return await renderServerVideo(scenes, quality, onProgress, options, abortSignal);
    } catch (serverErr: any) {
      console.warn('Server FFmpeg render encountered issue, trying browser fallback:', serverErr);
      // If server render was aborted by user, rethrow
      if (abortSignal?.aborted) throw serverErr;
    }
  }

  // Fallback: Browser Canvas Renderer
  return renderBrowserCanvasVideo(scenes, quality, onProgress, options, abortSignal);
}

/**
 * Client-Side Browser Canvas Recorder (Fallback)
 */
async function renderBrowserCanvasVideo(
  scenes: Scene[],
  quality: VideoQuality = '1080p',
  onProgress: (p: RenderProgress) => void,
  options?: RenderOptions,
  abortSignal?: AbortSignal
): Promise<RenderResult> {
  const config = QUALITY_PRESETS[quality] || QUALITY_PRESETS['1080p'];
  const { width, height, fps, bitrate } = config;

  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error('متصفحك لا يدعم Web Audio API المطلوبة للرندر');
  }

  const audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const audioDest = audioCtx.createMediaStreamDestination();

  onProgress({
    currentSceneIndex: 0,
    totalScenes: scenes.length,
    percent: 5,
    currentTimeSec: 0,
    totalTimeSec: 0,
    statusText: 'فك تشفير الوسائط محلياً في الذاكرة...',
  });

  const sceneAssets: Array<{
    scene: Scene;
    audioBuffer: AudioBuffer;
    imageElement: HTMLImageElement | null;
    durationSec: number;
    wordChunks: TimedWordChunk[];
  }> = [];

  let totalDurationSec = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (abortSignal?.aborted) {
      try { audioCtx.close(); } catch {}
      throw new Error('تم إلغاء عملية الرندر من قبل المستخدم');
    }

    const scene = scenes[i];
    const defaultDuration = scene.duration_seconds || 3.8;

    const [audioBuffer, imageElement] = await Promise.all([
      loadAudioBuffer(audioCtx, scene.audio_url, defaultDuration),
      preloadImage(scene.image_url),
    ]);

    const durationSec = Math.max(2.0, audioBuffer.duration || defaultDuration);
    totalDurationSec += durationSec;

    const wordChunks = calculateWeightedWordTiming(
      scene.narration_text || '',
      durationSec,
      options?.timingOffset ?? 0.25
    );

    sceneAssets.push({
      scene,
      audioBuffer,
      imageElement,
      durationSec,
      wordChunks,
    });
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  const canvasStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...audioDest.stream.getAudioTracks(),
  ]);

  const { mimeType, extension } = getBestSupportedMimeType();

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recorderStoppedPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start(250);
  const scaleRatio = width / 1920;
  let accumulatedTime = 0;

  for (let sceneIdx = 0; sceneIdx < sceneAssets.length; sceneIdx++) {
    if (abortSignal?.aborted) {
      try { recorder.stop(); } catch {}
      try { audioCtx.close(); } catch {}
      throw new Error('تم إلغاء عملية الرندر من قبل المستخدم');
    }

    const { scene, audioBuffer, imageElement, durationSec, wordChunks } = sceneAssets[sceneIdx];

    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioDest);
    source.start();

    const sceneStartTime = performance.now();
    const frameIntervalMs = 1000 / fps;
    const totalFrames = Math.ceil(durationSec * fps);

    for (let frame = 0; frame < totalFrames; frame++) {
      if (abortSignal?.aborted) {
        try { source.stop(); } catch {}
        try { recorder.stop(); } catch {}
        try { audioCtx.close(); } catch {}
        throw new Error('تم إلغاء عملية الرندر');
      }

      const frameTargetTime = sceneStartTime + frame * frameIntervalMs;
      const progress = Math.min(1.0, frame / totalFrames);
      const sceneElapsedSec = progress * durationSec;
      const currentGlobalSec = accumulatedTime + sceneElapsedSec;

      ctx.fillStyle = '#090D16';
      ctx.fillRect(0, 0, width, height);

      const motion: MotionType = scene.motion || 'static';

      ctx.save();
      if (imageElement && imageElement.complete && imageElement.naturalWidth > 0) {
        let scale = 1.05;
        let transX = 0;
        let transY = 0;

        if (motion === 'zoom_in') {
          scale = 1.0 + progress * 0.12;
        } else if (motion === 'zoom_out') {
          scale = 1.12 - progress * 0.12;
        } else if (motion === 'pan_left') {
          scale = 1.08;
          transX = (1 - progress) * (40 * scaleRatio) - (20 * scaleRatio);
        } else if (motion === 'pan_right') {
          scale = 1.08;
          transX = progress * (40 * scaleRatio) - (20 * scaleRatio);
        }

        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.translate(-width / 2 + transX, -height / 2 + transY);

        const imgAspect = imageElement.naturalWidth / imageElement.naturalHeight;
        const canvasAspect = width / height;
        let drawW = width;
        let drawH = height;

        if (imgAspect > canvasAspect) {
          drawW = height * imgAspect;
        } else {
          drawH = width / imgAspect;
        }

        const drawX = (width - drawW) / 2;
        const drawY = (height - drawH) / 2;
        ctx.drawImage(imageElement, drawX, drawY, drawW, drawH);
      }
      ctx.restore();

      // Brand Overlays
      drawBrandOverlays(
        ctx,
        width,
        height,
        scaleRatio,
        options?.channelName || 'MachinaMind',
        options?.showWatermark !== false
      );

      // Active Subtitles
      const activeChunk =
        wordChunks.find((c) => sceneElapsedSec >= c.startSec && sceneElapsedSec <= c.endSec) ||
        wordChunks.find((c) => sceneElapsedSec < c.endSec) ||
        wordChunks[wordChunks.length - 1];

      if (activeChunk && activeChunk.text) {
        drawCinematicSubtitles(ctx, activeChunk, sceneElapsedSec, width, height, scaleRatio);
      }

      const now = performance.now();
      const delayNeeded = frameTargetTime - now;
      if (delayNeeded > 1) {
        await new Promise((r) => setTimeout(r, delayNeeded));
      }

      if (frame % 5 === 0 || frame === totalFrames - 1) {
        const overallPercent = Math.min(
          99,
          Math.round(20 + ((accumulatedTime + sceneElapsedSec) / (totalDurationSec || 1)) * 78)
        );
        onProgress({
          currentSceneIndex: sceneIdx + 1,
          totalScenes: sceneAssets.length,
          percent: overallPercent,
          currentTimeSec: Math.round(currentGlobalSec),
          totalTimeSec: Math.round(totalDurationSec),
          statusText: `رندر المشهد ${sceneIdx + 1}/${sceneAssets.length} (${Math.round(currentGlobalSec)}ث / ${Math.round(totalDurationSec)}ث)`,
        });
      }
    }

    accumulatedTime += durationSec;
  }

  await new Promise((r) => setTimeout(r, 200));
  if (recorder.state === 'recording') {
    recorder.requestData();
  }
  await new Promise((r) => setTimeout(r, 100));
  if (recorder.state !== 'inactive') {
    recorder.stop();
  }

  const rawBlob = await recorderStoppedPromise;
  const patchedBlob = await patchVideoDuration(
    rawBlob,
    totalDurationSec,
    extension === 'mp4' ? 'mp4' : 'webm'
  );

  try { audioCtx.close(); } catch {}

  const url = URL.createObjectURL(patchedBlob);
  const filename = `Mindplicit_${options?.channelName || 'MachinaMind'}_${Date.now()}.${extension}`;

  return {
    blob: patchedBlob,
    url,
    filename,
    durationSec: Math.round(totalDurationSec),
    sizeBytes: patchedBlob.size,
    mimeType: patchedBlob.type || mimeType,
    engine: 'browser_canvas',
  };
}
