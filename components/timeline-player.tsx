'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { Scene, MotionType } from '@/types/project';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Volume2,
  VolumeX,
  Clock,
  Layers,
} from 'lucide-react';

export interface TimedSentence {
  text: string;
  startProgress: number; // 0 to 1
  endProgress: number;   // 0 to 1
  wordCount: number;
}

/**
 * Splits scene narration text into distinct sentences and assigns proportional
 * playback time based on word weight to enable synchronized active sentence subtitles.
 */
export function splitTextIntoTimedSentences(text: string): TimedSentence[] {
  if (!text || !text.trim()) return [];

  // Match sentences ending with ., !, ?, ؟, or newline
  const rawMatches = text.match(/[^.!?؟\n]+(?:[.!?؟\n]+|$)/g);
  const sentences = (rawMatches || [text])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 0) {
    return [{ text: text.trim(), startProgress: 0, endProgress: 1, wordCount: Math.max(1, text.split(/\s+/).length) }];
  }

  const wordCounts = sentences.map((s) => Math.max(1, s.split(/\s+/).filter(Boolean).length));
  const totalWords = wordCounts.reduce((acc, c) => acc + c, 0);

  let currentStart = 0;
  return sentences.map((s, idx) => {
    const fraction = wordCounts[idx] / totalWords;
    const start = currentStart;
    const end = idx === sentences.length - 1 ? 1.0 : Math.min(1.0, currentStart + fraction);
    currentStart = end;
    return {
      text: s,
      startProgress: start,
      endProgress: end,
      wordCount: wordCounts[idx],
    };
  });
}

/**
 * Canvas utility to draw smooth rounded rectangles with compatibility fallback.
 */
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
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

interface TimelinePlayerProps {
  scenes: Scene[];
  activeSceneIndex: number;
  onSceneChange: (index: number) => void;
}

export function TimelinePlayer({
  scenes,
  activeSceneIndex,
  onSceneChange,
}: TimelinePlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showCaptions, setShowCaptions] = useState(true);
  const [sceneProgress, setSceneProgress] = useState(0); // 0 to 1 inside current scene
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map());

  const currentScene = scenes[activeSceneIndex] || scenes[0];
  const animationFrameRef = useRef<number | null>(null);
  const sceneStartTimeRef = useRef<number>(0);

  // Synchronized active sentence calculations
  const timedSentences = useMemo(
    () => splitTextIntoTimedSentences(currentScene?.narration_text || ''),
    [currentScene?.narration_text]
  );

  const activeSentenceIndex = useMemo(() => {
    if (timedSentences.length === 0) return 0;
    const idx = timedSentences.findIndex(
      (s) => sceneProgress >= s.startProgress && sceneProgress < s.endProgress
    );
    if (idx !== -1) return idx;
    return sceneProgress >= 1 ? timedSentences.length - 1 : 0;
  }, [timedSentences, sceneProgress]);

  const activeSentence = useMemo(() => {
    return (
      timedSentences[activeSentenceIndex] ||
      timedSentences[0] || {
        text: currentScene?.narration_text || '',
        startProgress: 0,
        endProgress: 1,
        wordCount: 1,
      }
    );
  }, [timedSentences, activeSentenceIndex, currentScene?.narration_text]);

  const sentenceSpan = Math.max(0.001, activeSentence.endProgress - activeSentence.startProgress);
  const sentenceInnerProgress = Math.min(
    1,
    Math.max(0, (sceneProgress - activeSentence.startProgress) / sentenceSpan)
  );

  // Calculate total timeline duration
  const totalDurationSec = scenes.reduce((sum, s) => sum + (s.duration_seconds || 4), 0);

  // Calculate elapsed time up to current scene
  const elapsedBeforeCurrent = scenes
    .slice(0, activeSceneIndex)
    .reduce((sum, s) => sum + (s.duration_seconds || 4), 0);

  const currentSceneDuration = currentScene?.duration_seconds || 4;
  const totalElapsedSec = elapsedBeforeCurrent + sceneProgress * currentSceneDuration;

  // Preload images into memory for smooth canvas rendering
  useEffect(() => {
    const map = new Map<string, HTMLImageElement>();
    scenes.forEach((s) => {
      if (s.image_url) {
        const img = new Image();
        img.src = s.image_url;
        img.onload = () => {
          map.set(s.scene_id, img);
          setLoadedImages(new Map(map));
        };
      }
    });
  }, [scenes]);

  // Handle scene change and audio playback
  useEffect(() => {
    if (!currentScene) return;

    sceneStartTimeRef.current = performance.now();

    if (audioRef.current) {
      audioRef.current.pause();
      if (currentScene.audio_url) {
        audioRef.current.src = currentScene.audio_url;
        audioRef.current.playbackRate = playbackSpeed;
        audioRef.current.muted = isMuted;
        if (isPlaying) {
          audioRef.current.play().catch(() => {});
        }
      }
    }
  }, [activeSceneIndex, currentScene, isMuted, isPlaying, playbackSpeed]);

  // Main Canvas render loop with Ken Burns motion, MachinaMind branding & active sentence subtitles
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear background
    ctx.fillStyle = '#090D16';
    ctx.fillRect(0, 0, width, height);

    const img = loadedImages.get(currentScene?.scene_id);
    const progress = sceneProgress; // 0 to 1
    const motion: MotionType = currentScene?.motion || 'static';

    ctx.save();

    if (img && img.complete && img.naturalWidth > 0) {
      // Calculate Ken Burns transformations
      let scale = 1.05;
      let transX = 0;
      let transY = 0;

      if (motion === 'zoom_in') {
        scale = 1.0 + progress * 0.12; // 1.0 -> 1.12
      } else if (motion === 'zoom_out') {
        scale = 1.12 - progress * 0.12; // 1.12 -> 1.0
      } else if (motion === 'pan_left') {
        scale = 1.08;
        transX = (1 - progress) * 30 - 15;
      } else if (motion === 'pan_right') {
        scale = 1.08;
        transX = progress * 30 - 15;
      }

      ctx.translate(width / 2, height / 2);
      ctx.scale(scale, scale);
      ctx.translate(-width / 2 + transX, -height / 2 + transY);

      // Draw image covering 16:9
      const imgAspect = img.naturalWidth / img.naturalHeight;
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

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      // Dark baroque procedural placeholder
      const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        100,
        width / 2,
        height / 2,
        width * 0.7
      );
      grad.addColorStop(0, '#1E293B');
      grad.addColorStop(0.6, '#0F172A');
      grad.addColorStop(1, '#05070D');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Subtle renaissance golden border
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.2)';
      ctx.lineWidth = 4;
      ctx.strokeRect(40, 40, width - 80, height - 80);

      ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`مشهد ${currentScene?.scene_id || '001'}`, width / 2, height / 2 - 20);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      ctx.font = '22px sans-serif';
      ctx.fillText(currentScene?.image_filename || 'scene.png', width / 2, height / 2 + 25);
    }

    ctx.restore();

    // Subtle vignette overlay
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

    // ─────────────────────────────────────────────────────────────
    // MachinaMind Channel Watermark on Video Canvas (Top-Right)
    // ─────────────────────────────────────────────────────────────
    ctx.save();
    const badgeW = 240;
    const badgeH = 52;
    const badgeX = width - badgeW - 48;
    const badgeY = 36;
    const radius = 12;

    // Dark frosted background
    ctx.fillStyle = 'rgba(9, 13, 22, 0.82)';
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, radius);
    ctx.fill();
    ctx.stroke();

    // Gold emblem with letter 'M'
    const emblemSize = 32;
    const emblemX = badgeX + 14;
    const emblemY = badgeY + (badgeH - emblemSize) / 2;
    ctx.fillStyle = '#F59E0B';
    drawRoundRect(ctx, emblemX, emblemY, emblemSize, emblemSize, 6);
    ctx.fill();

    ctx.fillStyle = '#090D16';
    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', emblemX + emblemSize / 2, emblemY + emblemSize / 2);

    // Channel Name text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 8;
    ctx.fillText('MachinaMind', emblemX + emblemSize + 12, badgeY + badgeH / 2);
    ctx.restore();

    // ─────────────────────────────────────────────────────────────
    // Active Sentence Subtitles on Canvas (Sentence-by-sentence)
    // ─────────────────────────────────────────────────────────────
    if (showCaptions && activeSentence?.text) {
      // Bottom cinematic gradient scrim
      const textScrim = ctx.createLinearGradient(0, height - 260, 0, height);
      textScrim.addColorStop(0, 'rgba(0, 0, 0, 0)');
      textScrim.addColorStop(0.35, 'rgba(0, 0, 0, 0.72)');
      textScrim.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = textScrim;
      ctx.fillRect(0, height - 260, width, 260);

      // Subtitle card container
      const subCardW = Math.min(1360, width * 0.78);
      const subCardH = 144;
      const subCardX = (width - subCardW) / 2;
      const subCardY = height - 195;

      ctx.save();
      ctx.fillStyle = 'rgba(9, 13, 22, 0.86)';
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.lineWidth = 1.5;
      drawRoundRect(ctx, subCardX, subCardY, subCardW, subCardH, 16);
      ctx.fill();
      ctx.stroke();

      // Top caption label: MachinaMind · Sentence X/Y
      ctx.fillStyle = '#F59E0B';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(
        `MachinaMind Subtitles · [${activeSentenceIndex + 1}/${timedSentences.length}]`,
        width / 2,
        subCardY + 14
      );

      // Active sentence text (prominent, high contrast with golden glow)
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 32px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
      ctx.shadowBlur = 12;

      const words = activeSentence.text.split(' ');
      let line = '';
      const lines: string[] = [];
      const maxWidth = subCardW - 60;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          lines.push(line);
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);

      const textCenterY = subCardY + 68;
      lines.slice(0, 2).forEach((l, idx) => {
        const offset = lines.length === 1 ? 0 : (idx === 0 ? -16 : 18);
        ctx.fillText(l.trim(), width / 2, textCenterY + offset);
      });

      // Subtle active sentence reading progress bar
      const progBarW = subCardW - 80;
      const progBarH = 4;
      const progBarX = (width - progBarW) / 2;
      const progBarY = subCardY + subCardH - 14;

      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      drawRoundRect(ctx, progBarX, progBarY, progBarW, progBarH, 2);
      ctx.fill();

      ctx.fillStyle = '#F59E0B';
      const filledW = progBarW * sentenceInnerProgress;
      if (filledW > 0) {
        drawRoundRect(ctx, progBarX, progBarY, filledW, progBarH, 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }, [
    currentScene,
    loadedImages,
    sceneProgress,
    showCaptions,
    activeSentence,
    activeSentenceIndex,
    timedSentences.length,
    sentenceInnerProgress,
  ]);

  // Main animation / timing tick
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (isPlaying) {
        const durationSec = (currentScene?.duration_seconds || 4) / playbackSpeed;
        const deltaSec = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        setSceneProgress((prev) => {
          const next = prev + deltaSec / durationSec;
          if (next >= 1) {
            // Move to next scene if available
            if (activeSceneIndex < scenes.length - 1) {
              onSceneChange(activeSceneIndex + 1);
            } else {
              setIsPlaying(false);
            }
            return 0;
          }
          return next;
        });
      } else {
        lastTime = currentTime;
      }

      renderFrame();
      animationFrameRef.current = requestAnimationFrame(loop);
    };

    animationFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, currentScene, playbackSpeed, activeSceneIndex, scenes.length, onSceneChange, renderFrame]);

  // Audio time update sync
  const handleAudioTimeUpdate = () => {
    if (audioRef.current && currentScene?.audio_url) {
      const cur = audioRef.current.currentTime;
      const dur = audioRef.current.duration || currentScene.duration_seconds || 4;
      if (dur > 0) {
        setSceneProgress(Math.min(1, cur / dur));
      }
    }
  };

  const handleAudioEnded = () => {
    if (activeSceneIndex < scenes.length - 1) {
      onSceneChange(activeSceneIndex + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!isPlaying) {
      setIsPlaying(true);
      if (audioRef.current && currentScene?.audio_url) {
        audioRef.current.play().catch(() => {});
      }
    } else {
      setIsPlaying(false);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    }
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Hidden audio element for synchronized playback */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleAudioTimeUpdate}
        onEnded={handleAudioEnded}
      />

      {/* Main Player Box (16:9) */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-2xl"
      >
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="h-full w-full object-contain"
        />

        {/* Top Info Bar inside player */}
        <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/85 via-black/35 to-transparent flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 items-center px-2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-mono font-bold">
              {currentScene?.scene_id} ({activeSceneIndex + 1}/{scenes.length})
            </span>
            <span className="text-xs font-medium text-slate-200">
              حركة: <span className="text-amber-400 font-mono">{currentScene?.motion}</span>
            </span>
          </div>

          {/* MachinaMind Channel Watermark Badge & Clock in Top-Right */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-amber-500/40 text-amber-300 shadow-xl">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-400 text-slate-950 font-bold text-xs shadow-sm">
                M
              </span>
              <span className="font-sans font-bold tracking-wider text-xs text-white">
                MachinaMind
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-slate-300 tabular-nums bg-slate-950/70 px-2.5 py-1.5 rounded-xl border border-slate-800">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span>{formatTime(totalElapsedSec)} / {formatTime(totalDurationSec)}</span>
            </div>
          </div>
        </div>

        {/* Active Sentence Subtitles Overlay Banner (Dynamic Sentence-by-Sentence) */}
        {showCaptions && activeSentence?.text && (
          <div className="absolute bottom-24 inset-x-4 sm:inset-x-12 md:inset-x-24 pointer-events-none flex flex-col items-center justify-center text-center">
            <div className="max-w-3xl w-full rounded-2xl bg-slate-950/90 backdrop-blur-md border border-amber-500/35 p-4 sm:p-5 shadow-2xl relative overflow-hidden transition-all duration-300">
              {/* Header badge with current sentence index */}
              <div className="flex items-center justify-between text-[11px] font-mono text-amber-400/90 mb-2.5">
                <span className="font-bold flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span>MachinaMind Subtitles</span>
                </span>
                <span className="text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                  الجملة {activeSentenceIndex + 1} من {timedSentences.length}
                </span>
              </div>

              {/* Spoken Active Sentence Text */}
              <p
                className="text-base sm:text-xl md:text-2xl font-bold text-white tracking-wide leading-relaxed drop-shadow-md selection:bg-amber-500/30 font-sans"
                dir="ltr"
              >
                {activeSentence.text}
              </p>

              {/* Progress bar inside active sentence */}
              <div className="mt-3.5 w-full h-1 bg-slate-800/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-200 transition-all duration-100"
                  style={{ width: `${sentenceInnerProgress * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Bottom Floating Control Bar */}
        <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-3">
          {/* Timeline scrub track */}
          <div className="relative w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden cursor-pointer group">
            <div
              className="absolute h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-100"
              style={{
                width: `${(totalElapsedSec / (totalDurationSec || 1)) * 100}%`,
              }}
            />
          </div>

          {/* Controls Row */}
          <div className="flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <button
                onClick={() => activeSceneIndex > 0 && onSceneChange(activeSceneIndex - 1)}
                disabled={activeSceneIndex === 0}
                className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
                title="المشهد السابق"
              >
                <SkipBack className="h-4 w-4" />
              </button>

              <button
                onClick={togglePlay}
                className="p-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-bold transition-transform active:scale-95 shadow-md"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>

              <button
                onClick={() => activeSceneIndex < scenes.length - 1 && onSceneChange(activeSceneIndex + 1)}
                disabled={activeSceneIndex === scenes.length - 1}
                className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
                title="المشهد التالي"
              >
                <SkipForward className="h-4 w-4" />
              </button>

              <div className="h-4 w-px bg-slate-700 mx-1" />

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"
              >
                {isMuted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
              </button>

              <button
                onClick={() => setShowCaptions(!showCaptions)}
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg border transition-colors ${
                  showCaptions
                    ? 'border-amber-400 text-amber-400 bg-amber-400/10 shadow-sm'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title={showCaptions ? 'إخفاء الترجمة' : 'إظهار الترجمة'}
              >
                CC
              </button>
            </div>

            <div className="flex items-center gap-3">
              {/* Playback speed selector */}
              <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-700 text-xs">
                {[1, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-2 py-0.5 rounded font-mono ${
                      playbackSpeed === speed
                        ? 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <button
                onClick={toggleFullscreen}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"
                title="شاشة كاملة"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scene Strip Selector */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
          <span className="flex items-center gap-1.5 font-medium">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span>تسلسل المشاهد على التايم لاين</span>
          </span>
          <span className="font-mono tabular-nums">
            المشهد {activeSceneIndex + 1} من {scenes.length}
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {scenes.map((scene, idx) => {
            const isActive = idx === activeSceneIndex;
            const hasAudio = scene.audio_status === 'ready';
            const hasImage = scene.image_status === 'ready';

            return (
              <button
                key={scene.scene_id}
                onClick={() => onSceneChange(idx)}
                className={`flex-shrink-0 flex flex-col items-center p-2 rounded-lg border text-center transition-all ${
                  isActive
                    ? 'border-amber-400 bg-amber-400/10 shadow-sm'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
                style={{ width: '96px' }}
              >
                <span className="text-[10px] font-mono font-bold text-slate-300">
                  {scene.scene_id}
                </span>

                <div className="my-1.5 flex items-center gap-1 text-[9px] font-mono">
                  <span className={hasAudio ? 'text-emerald-400' : 'text-slate-600'}>صوت</span>
                  <span>·</span>
                  <span className={hasImage ? 'text-amber-400' : 'text-slate-600'}>صورة</span>
                </div>

                <span className="text-[10px] font-mono tabular-nums text-slate-400">
                  {scene.duration_seconds || 4}ث
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
