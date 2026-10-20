'use client';

import { Scene, MotionType } from '@/types/project';
import { splitTextIntoWordChunks, TimedWordChunk } from '@/components/timeline-player';
import { fixWebmDuration } from '@/lib/webm-duration-fixer';

export type VideoQuality = '1080p' | '720p' | '480p';

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
    badge: 'موصى به لليوتيوب',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 8_500_000,
    description: 'دقة فائقة ونقاء كريستالي مع تفاصيل بارزة (1920x1080)',
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
}

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

/**
 * Preloads an image safely with error fallback
 */
async function preloadImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Loads and decodes an audio buffer from a URL or creates a silent buffer
 */
async function loadAudioBuffer(
  audioCtx: AudioContext,
  url?: string,
  fallbackDuration: number = 3.5
): Promise<AudioBuffer> {
  if (url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return await audioCtx.decodeAudioData(arrayBuffer);
    } catch (err) {
      console.warn('Audio decoding fallback to silence:', err);
    }
  }

  // Fallback: create silent audio buffer
  const sampleRate = audioCtx.sampleRate || 44100;
  const frameCount = Math.max(1, Math.round(sampleRate * fallbackDuration));
  return audioCtx.createBuffer(2, frameCount, sampleRate);
}

/**
 * Detects the best supported MediaRecorder MIME type
 */
function getBestSupportedMimeType(): { mimeType: string; extension: string } {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/webm', extension: 'webm' };
  }

  const candidateTypes = [
    { type: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { type: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { type: 'video/mp4', ext: 'mp4' },
    { type: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { type: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { type: 'video/webm', ext: 'webm' },
  ];

  for (const candidate of candidateTypes) {
    if (MediaRecorder.isTypeSupported(candidate.type)) {
      return { mimeType: candidate.type, extension: candidate.ext };
    }
  }

  return { mimeType: 'video/webm', extension: 'webm' };
}

/**
 * Renders all project scenes sequentially onto a Canvas with synchronized audio tracks,
 * Ken Burns camera animation, MachinaMind channel badge, and active 3-5 word subtitles.
 */
export async function renderProjectVideo(
  scenes: Scene[],
  quality: VideoQuality,
  onProgress: (progress: RenderProgress) => void,
  abortSignal?: AbortSignal
): Promise<RenderResult> {
  if (!scenes || scenes.length === 0) {
    throw new Error('لا توجد مشاهد متاحة للتصدير');
  }

  const config = QUALITY_PRESETS[quality];
  const { width, height, fps, bitrate } = config;

  onProgress({
    currentSceneIndex: 0,
    totalScenes: scenes.length,
    percent: 1,
    currentTimeSec: 0,
    totalTimeSec: 0,
    statusText: 'تهيئة محرك الصوتيات والكانفاس...',
  });

  // 1. Initialize Audio Context & Stream Destination
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const audioDest = audioCtx.createMediaStreamDestination();

  // 2. Preload and decode all audio buffers and images ahead of time
  onProgress({
    currentSceneIndex: 0,
    totalScenes: scenes.length,
    percent: 5,
    currentTimeSec: 0,
    totalTimeSec: 0,
    statusText: 'جارِ فك تشفير مسارات الصوت والصور في الذاكرة...',
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

    const wordChunks = splitTextIntoWordChunks(scene.narration_text || '');

    sceneAssets.push({
      scene,
      audioBuffer,
      imageElement,
      durationSec,
      wordChunks,
    });

    onProgress({
      currentSceneIndex: i + 1,
      totalScenes: scenes.length,
      percent: Math.round(5 + ((i + 1) / scenes.length) * 15),
      currentTimeSec: 0,
      totalTimeSec: totalDurationSec,
      statusText: `تم تجهيز وسائط المشهد ${i + 1} من ${scenes.length}`,
    });
  }

  // 3. Setup Render Canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;

  // 4. Capture Stream & Combine with Audio
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

  const recorderStoppedPromise = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const finalBlob = new Blob(chunks, { type: mimeType });
      resolve(finalBlob);
    };
    recorder.onerror = (err) => reject(err);
  });

  recorder.start(250); // flush chunks every 250ms

  // Scale ratio helper relative to 1920x1080 baseline
  const scaleRatio = width / 1920;

  // 5. Sequential Scene Rendering Loop
  let accumulatedTime = 0;

  for (let sceneIdx = 0; sceneIdx < sceneAssets.length; sceneIdx++) {
    if (abortSignal?.aborted) {
      try { recorder.stop(); } catch {}
      try { audioCtx.close(); } catch {}
      throw new Error('تم إلغاء عملية الرندر من قبل المستخدم');
    }

    const { scene, audioBuffer, imageElement, durationSec, wordChunks } = sceneAssets[sceneIdx];

    // Play scene audio into destination
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

      // ─── Draw Background (Ken Burns motion) ───
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
      } else {
        // Renaissance dark baroque procedural gradient
        const grad = ctx.createRadialGradient(
          width / 2,
          height / 2,
          100 * scaleRatio,
          width / 2,
          height / 2,
          width * 0.7
        );
        grad.addColorStop(0, '#1E293B');
        grad.addColorStop(0.6, '#0F172A');
        grad.addColorStop(1, '#05070D');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // Golden frame
        ctx.strokeStyle = 'rgba(217, 119, 6, 0.25)';
        ctx.lineWidth = 4 * scaleRatio;
        ctx.strokeRect(40 * scaleRatio, 40 * scaleRatio, width - 80 * scaleRatio, height - 80 * scaleRatio);

        ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.font = `bold ${Math.round(36 * scaleRatio)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`مشهد ${scene.scene_id}`, width / 2, height / 2 - 20 * scaleRatio);
      }
      ctx.restore();

      // ─── Vignette Overlay ───
      const vignette = ctx.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.4,
        width / 2,
        height / 2,
        width * 0.8
      );
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // ─── MachinaMind Channel Watermark (Top-Right) ───
      ctx.save();
      const badgeW = Math.round(240 * scaleRatio);
      const badgeH = Math.round(52 * scaleRatio);
      const badgeX = width - badgeW - Math.round(48 * scaleRatio);
      const badgeY = Math.round(36 * scaleRatio);
      const radius = Math.round(12 * scaleRatio);

      ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = Math.max(1, 2 * scaleRatio);
      drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, radius);
      ctx.fill();
      ctx.stroke();

      // Gold emblem with letter 'M'
      const emblemSize = Math.round(32 * scaleRatio);
      const emblemX = badgeX + Math.round(14 * scaleRatio);
      const emblemY = badgeY + (badgeH - emblemSize) / 2;
      ctx.fillStyle = '#F59E0B';
      drawRoundRect(ctx, emblemX, emblemY, emblemSize, emblemSize, Math.round(6 * scaleRatio));
      ctx.fill();

      ctx.fillStyle = '#090D16';
      ctx.font = `bold ${Math.round(20 * scaleRatio)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('M', emblemX + emblemSize / 2, emblemY + emblemSize / 2);

      // Channel Name text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.round(22 * scaleRatio)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 8 * scaleRatio;
      ctx.fillText('MachinaMind', emblemX + emblemSize + Math.round(12 * scaleRatio), badgeY + badgeH / 2);
      ctx.restore();

      // ─── Active 3-5 Word Subtitle Chunk (Bottom Center) ───
      // Apply offset calibration (-350ms lead time)
      const adjustedTimeSec = Math.max(0, sceneElapsedSec + 0.35);
      const adjustedProgress = Math.min(1.0, adjustedTimeSec / durationSec);

      const activeChunk =
        wordChunks.find((c) => adjustedProgress >= c.startProgress && adjustedProgress <= c.endProgress) ||
        wordChunks[wordChunks.length - 1] ||
        (wordChunks[0] ? wordChunks[0] : null);

      if (activeChunk && activeChunk.text) {
        // Deep Gradient Scrim at bottom for crystal-clear readability
        const scrimH = Math.round(260 * scaleRatio);
        const textScrim = ctx.createLinearGradient(0, height - scrimH, 0, height);
        textScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
        textScrim.addColorStop(0.35, 'rgba(0, 0, 0, 0.7)');
        textScrim.addColorStop(1, 'rgba(0, 0, 0, 0.96)');
        ctx.fillStyle = textScrim;
        ctx.fillRect(0, height - scrimH, width, scrimH);

        // 2X Doubled Subtitle Capsule (Doubled from 48px to 92px height, 42px font)
        const subCardW = Math.round(Math.min(960 * scaleRatio, width * 0.76));
        const subCardH = Math.round(92 * scaleRatio);
        const subCardX = (width - subCardW) / 2;
        const subCardY = height - Math.round(150 * scaleRatio);

        ctx.save();
        ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = Math.max(2, 2.5 * scaleRatio);
        drawRoundRect(ctx, subCardX, subCardY, subCardW, subCardH, subCardH / 2);
        ctx.fill();
        ctx.stroke();

        // Active chunk text (Doubled font: 42px on 1080p, proportional on 720p/480p)
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.round(42 * scaleRatio)}px "Plus Jakarta Sans", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(245, 158, 11, 0.6)';
        ctx.shadowBlur = 16 * scaleRatio;
        ctx.fillText(activeChunk.text.trim(), subCardX + subCardW / 2, subCardY + subCardH / 2);

        // Subtle amber progress underline inside the capsule
        const progBarW = subCardW - Math.round(60 * scaleRatio);
        const progBarH = Math.max(2, Math.round(3.5 * scaleRatio));
        const progBarX = subCardX + Math.round(30 * scaleRatio);
        const progBarY = subCardY + subCardH - Math.round(8 * scaleRatio);

        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(progBarX, progBarY, progBarW, progBarH);

        const chunkSpan = Math.max(0.001, activeChunk.endProgress - activeChunk.startProgress);
        const innerProgress = Math.min(1.0, Math.max(0, (adjustedProgress - activeChunk.startProgress) / chunkSpan));
        if (innerProgress > 0) {
          ctx.fillStyle = '#F59E0B';
          ctx.fillRect(progBarX, progBarY, progBarW * innerProgress, progBarH);
        }

        ctx.restore();
      }

      // Sync with real-time video stream pacing
      const now = performance.now();
      const delayNeeded = frameTargetTime - now;
      if (delayNeeded > 1) {
        await new Promise((r) => setTimeout(r, delayNeeded));
      }

      // Update progress every 5 frames
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

  // 6. Finalize Recording and Inject Accurate Duration Metadata
  onProgress({
    currentSceneIndex: scenes.length,
    totalScenes: scenes.length,
    percent: 99,
    currentTimeSec: Math.round(totalDurationSec),
    totalTimeSec: Math.round(totalDurationSec),
    statusText: 'جارِ إتمام وتجميع ملف الفيديو وحقن بيانات التوقيت للهواتف المحمولة...',
  });

  // Brief flush delay before stopping recorder
  await new Promise((r) => setTimeout(r, 400));
  recorder.stop();

  const finalBlob = await recorderStoppedPromise;

  // Patch WebM Duration metadata so mobile players (Android / iOS / WhatsApp) show accurate duration
  let patchedBlob = finalBlob;
  if (extension === 'webm' || finalBlob.type.includes('webm')) {
    try {
      patchedBlob = await fixWebmDuration(finalBlob, Math.round(totalDurationSec * 1000));
    } catch (err) {
      console.warn('Error patching WebM duration:', err);
    }
  }

  const downloadUrl = URL.createObjectURL(patchedBlob);
  const cleanTitle = (scenes[0]?.narration_text ? 'MachinaMind_Chapter_001' : 'MachinaMind_Video');
  const filename = `${cleanTitle}_${quality}_${Date.now()}.${extension}`;

  try {
    audioCtx.close();
  } catch {}

  onProgress({
    currentSceneIndex: scenes.length,
    totalScenes: scenes.length,
    percent: 100,
    currentTimeSec: Math.round(totalDurationSec),
    totalTimeSec: Math.round(totalDurationSec),
    statusText: 'اكتمل الرندر وتثبيت توقيت الموبايل بنجاح! جاري التنزيل المباشر...',
  });

  // Automatically trigger download
  if (typeof document !== 'undefined') {
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 1000);
  }

  return {
    blob: patchedBlob,
    url: downloadUrl,
    filename,
    durationSec: totalDurationSec,
    sizeBytes: patchedBlob.size,
    mimeType,
  };
}
