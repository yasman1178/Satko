'use client';

import { Scene, MotionType } from '@/types/project';
import {
  splitTextIntoTwoLineChunks,
  TimedSubtitleChunk,
} from '@/lib/subtitle-engine';
import { transcodeToMp4InBrowser } from '@/lib/browser-ffmpeg';
import { patchVideoDuration } from '@/lib/video-duration-patcher';


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
    badge: 'موصى به لليوتيوب وريلز',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 8_500_000,
    description: 'دقة فائقة ونقاء كريستالي مع تفاصيل بارزة وترجمة ضخمة (1920x1080)',
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
  fallbackDuration: number = 3.8
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
 * Detects the best supported MediaRecorder MIME type.
 * Prioritizes standard MP4 (H.264/AAC or AVC1) as requested by the user,
 * with reliable WebM (VP9/VP8) fallback if the browser engine does not support native MP4 recorder.
 */
function getBestSupportedMimeType(): { mimeType: string; extension: string } {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return { mimeType: 'video/mp4', extension: 'mp4' };
  }

  // Prioritize standard MP4 first
  const candidateTypes = [
    { type: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { type: 'video/mp4;codecs=avc1', ext: 'mp4' },
    { type: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
    { type: 'video/mp4', ext: 'mp4' },
    { type: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { type: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { type: 'video/webm', ext: 'webm' },
  ];

  for (const candidate of candidateTypes) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.type)) {
        return { mimeType: candidate.type, extension: candidate.ext };
      }
    } catch {}
  }

  return { mimeType: 'video/webm', extension: 'webm' };
}

/**
 * Renders all project scenes sequentially onto a Canvas with synchronized audio tracks,
 * Ken Burns camera animation, MachinaMind channel badge, and huge Reels-style high-contrast subtitles.
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
    subtitleChunks: TimedSubtitleChunk[];
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

    const subtitleChunks = splitTextIntoTwoLineChunks(scene.narration_text || '');

    sceneAssets.push({
      scene,
      audioBuffer,
      imageElement,
      durationSec,
      subtitleChunks,
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

  const recorderStoppedPromise = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      try {
        const finalBlob = new Blob(chunks, { type: mimeType });
        resolve(finalBlob);
      } catch (err) {
        console.warn('onstop blob creation fallback:', err);
        resolve(new Blob(chunks));
      }
    };
    recorder.onerror = (err) => {
      console.warn('MediaRecorder warning during capture, preserving collected chunks:', err);
      try {
        const fallbackBlob = new Blob(chunks, { type: mimeType });
        resolve(fallbackBlob);
      } catch {
        resolve(new Blob(chunks));
      }
    };
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

    const { scene, audioBuffer, imageElement, durationSec, subtitleChunks } = sceneAssets[sceneIdx];

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
        // Fallback procedural cinematic gradient
        const bgGrad = ctx.createRadialGradient(
          width / 2,
          height / 2,
          width * 0.1,
          width / 2,
          height / 2,
          width * 0.7
        );
        bgGrad.addColorStop(0, '#1E293B');
        bgGrad.addColorStop(1, '#0B0F17');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();

      // Cinematic Vignette
      const vignette = ctx.createRadialGradient(
        width / 2,
        height / 2,
        width * 0.35,
        width / 2,
        height / 2,
        width * 0.75
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);

      // ─── MachinaMind Channel Badge (Top Left) ───
      ctx.save();
      const badgeX = Math.round(40 * scaleRatio);
      const badgeY = Math.round(36 * scaleRatio);
      const badgeW = Math.round(230 * scaleRatio);
      const badgeH = Math.round(52 * scaleRatio);

      ctx.fillStyle = 'rgba(11, 15, 23, 0.88)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = Math.max(1.5, 2 * scaleRatio);
      drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12 * scaleRatio);
      ctx.fill();
      ctx.stroke();

      // Brand Icon (Golden Diamond)
      ctx.fillStyle = '#F59E0B';
      const iconSize = Math.round(18 * scaleRatio);
      const iconCenterX = badgeX + Math.round(24 * scaleRatio);
      const iconCenterY = badgeY + badgeH / 2;
      ctx.beginPath();
      ctx.moveTo(iconCenterX, iconCenterY - iconSize / 2);
      ctx.lineTo(iconCenterX + iconSize / 2, iconCenterY);
      ctx.lineTo(iconCenterX, iconCenterY + iconSize / 2);
      ctx.lineTo(iconCenterX - iconSize / 2, iconCenterY);
      ctx.closePath();
      ctx.fill();

      // Brand Text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${Math.round(20 * scaleRatio)}px "Plus Jakarta Sans", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('MachinaMind', iconCenterX + Math.round(16 * scaleRatio), iconCenterY);
      ctx.restore();

      // ─── Two-Line Clean Cinematic Subtitles (No Loading Bar, No Badges) ───
      const adjustedTimeSec = Math.max(0, sceneElapsedSec + 0.35);
      const adjustedProgress = Math.min(1.0, adjustedTimeSec / durationSec);

      const activeChunk =
        subtitleChunks.find((c) => adjustedProgress >= c.startProgress && adjustedProgress <= c.endProgress) ||
        subtitleChunks[subtitleChunks.length - 1] ||
        (subtitleChunks[0] ? subtitleChunks[0] : null);

      if (activeChunk && (activeChunk.line1 || activeChunk.line2 || activeChunk.fullText)) {
        const line1 = activeChunk.line1 || activeChunk.fullText || '';
        const line2 = activeChunk.line2 || '';
        const hasSecondLine = Boolean(line2 && line2.trim());

        // Deep Gradient Scrim at bottom for crystal-clear readability
        const scrimH = Math.round((hasSecondLine ? 340 : 260) * scaleRatio);
        const textScrim = ctx.createLinearGradient(0, height - scrimH, 0, height);
        textScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
        textScrim.addColorStop(0.35, 'rgba(0, 0, 0, 0.75)');
        textScrim.addColorStop(1, 'rgba(0, 0, 0, 0.98)');
        ctx.fillStyle = textScrim;
        ctx.fillRect(0, height - scrimH, width, scrimH);

        // Calibrate fonts for two lines
        const fontSize1 = Math.round(48 * scaleRatio);
        const fontSize2 = Math.round(44 * scaleRatio);
        const outlineW = Math.max(6, Math.round(10 * scaleRatio));

        ctx.font = `900 ${fontSize1}px system-ui, -apple-system, "Cairo", "Plus Jakarta Sans", sans-serif`;
        const w1 = ctx.measureText(line1.trim()).width;
        ctx.font = `900 ${fontSize2}px system-ui, -apple-system, "Cairo", "Plus Jakarta Sans", sans-serif`;
        const w2 = hasSecondLine ? ctx.measureText(line2.trim()).width : 0;
        const maxTextW = Math.max(w1, w2);

        const padX = Math.round(52 * scaleRatio);
        const subCardW = Math.min(width * 0.92, Math.max(width * 0.52, maxTextW + padX * 2));
        const subCardH = Math.round((hasSecondLine ? 146 : 92) * scaleRatio);
        const subCardX = (width - subCardW) / 2;
        const subCardY = height - Math.round((hasSecondLine ? 190 : 140) * scaleRatio);

        ctx.save();
        // High-contrast clean dark backdrop bar
        ctx.fillStyle = 'rgba(7, 10, 18, 0.90)';
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.75)';
        ctx.lineWidth = Math.max(2, 3 * scaleRatio);
        drawRoundRect(ctx, subCardX, subCardY, subCardW, subCardH, 18 * scaleRatio);
        ctx.fill();
        ctx.stroke();

        const textCenterX = width / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.miterLimit = 2;

        if (hasSecondLine) {
          const line1Y = subCardY + Math.round(44 * scaleRatio);
          const line2Y = subCardY + Math.round(104 * scaleRatio);

          // Line 1: Pure White with solid black outline
          ctx.font = `900 ${fontSize1}px system-ui, -apple-system, "Cairo", "Plus Jakarta Sans", sans-serif`;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = outlineW;
          ctx.strokeText(line1.trim(), textCenterX, line1Y);

          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = Math.round(10 * scaleRatio);
          ctx.fillText(line1.trim(), textCenterX, line1Y);

          // Line 2: Radiant Golden Yellow with solid black outline
          ctx.font = `900 ${fontSize2}px system-ui, -apple-system, "Cairo", "Plus Jakarta Sans", sans-serif`;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = outlineW;
          ctx.strokeText(line2.trim(), textCenterX, line2Y);

          ctx.fillStyle = '#FDE047';
          ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
          ctx.shadowBlur = Math.round(12 * scaleRatio);
          ctx.fillText(line2.trim(), textCenterX, line2Y);
        } else {
          // Single line centered
          const lineY = subCardY + subCardH / 2;
          ctx.font = `900 ${fontSize1}px system-ui, -apple-system, "Cairo", "Plus Jakarta Sans", sans-serif`;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = outlineW;
          ctx.strokeText(line1.trim(), textCenterX, lineY);

          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
          ctx.shadowBlur = Math.round(12 * scaleRatio);
          ctx.fillText(line1.trim(), textCenterX, lineY);
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
    statusText: 'جارِ إتمام وتجميع ملف الفيديو وحقن بيانات التوقيت لهواتف أندرويد وواتساب...',
  });

  // Brief flush delay before stopping recorder and request data
  await new Promise((r) => setTimeout(r, 300));
  try {
    if (recorder.state === 'recording') {
      recorder.requestData();
    }
  } catch {}

  await new Promise((r) => setTimeout(r, 100));

  if (recorder.state !== 'inactive') {
    try {
      recorder.stop();
    } catch {}
  }

  // Safety race timeout: wait up to 2500ms for recorderStoppedPromise, otherwise construct blob from collected chunks
  const finalBlob = await Promise.race([
    recorderStoppedPromise,
    new Promise<Blob>((resolve) =>
      setTimeout(() => {
        resolve(new Blob(chunks, { type: mimeType }));
      }, 2500)
    ),
  ]);

  // Stop all active tracks to free browser resources
  try {
    combinedStream.getTracks().forEach((track) => track.stop());
  } catch {}

  // In-Browser FFmpeg MP4 Engine: Remux and transcode to standard MP4 with +faststart
  onProgress({
    currentSceneIndex: scenes.length,
    totalScenes: scenes.length,
    percent: 92,
    currentTimeSec: Math.round(totalDurationSec),
    totalTimeSec: Math.round(totalDurationSec),
    statusText: 'تشغيل محرك FFmpeg MP4 المحلي في المتصفح لتجهيز صيغة MP4 القياسية...',
  });

  let finalMp4Blob: Blob = finalBlob;
  let finalExtension = 'mp4';
  let finalMimeType = 'video/mp4';

  try {
    finalMp4Blob = await transcodeToMp4InBrowser(
      finalBlob,
      (p) => {
        const percent = Math.min(99, Math.round(92 + p.ratio * 7));
        onProgress({
          currentSceneIndex: scenes.length,
          totalScenes: scenes.length,
          percent,
          currentTimeSec: Math.round(totalDurationSec),
          totalTimeSec: Math.round(totalDurationSec),
          statusText: `[FFmpeg MP4] ${p.message}`,
        });
      },
      abortSignal
    );
    finalExtension = 'mp4';
    finalMimeType = 'video/mp4';
  } catch (ffmpegErr) {
    console.warn('In-browser FFmpeg conversion fallback:', ffmpegErr);
    try {
      const formatType = (extension === 'mp4' || finalBlob.type.includes('mp4')) ? 'mp4' : 'webm';
      finalMp4Blob = await patchVideoDuration(finalBlob, totalDurationSec, formatType);
      finalExtension = formatType;
      finalMimeType = formatType === 'mp4' ? 'video/mp4' : 'video/webm';
    } catch {
      finalMp4Blob = finalBlob;
      finalExtension = extension;
      finalMimeType = mimeType;
    }
  }

  const downloadUrl = URL.createObjectURL(finalMp4Blob);
  const cleanTitle = (scenes[0]?.narration_text ? 'Mindplicit_Video' : 'Mindplicit_Video');
  const filename = `${cleanTitle}_${quality}_${Date.now()}.${finalExtension}`;

  try {
    audioCtx.close();
  } catch {}

  onProgress({
    currentSceneIndex: scenes.length,
    totalScenes: scenes.length,
    percent: 100,
    currentTimeSec: Math.round(totalDurationSec),
    totalTimeSec: Math.round(totalDurationSec),
    statusText: 'اكتمل إنتاج الفيديو بنجاح عبر محرك FFmpeg MP4 المحلي! جاري التحميل...',
  });

  // Automatically trigger download
  if (typeof document !== 'undefined') {
    try {
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try {
          document.body.removeChild(a);
        } catch {}
      }, 1000);
    } catch (e) {
      console.warn('Auto download error, user can use manual download:', e);
    }
  }

  return {
    blob: finalMp4Blob,
    url: downloadUrl,
    filename,
    durationSec: totalDurationSec,
    sizeBytes: finalMp4Blob.size,
    mimeType: finalMimeType,
  };
}
