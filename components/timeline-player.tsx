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
  Sliders,
} from 'lucide-react';

import {
  calculateWeightedWordTiming,
  drawCinematicSubtitles,
  drawBrandOverlays,
  TimedWordChunk,
} from '@/lib/video-renderer';

export type { TimedWordChunk };

export function splitTextIntoWordChunks(text: string, durationSec: number = 4.0): TimedWordChunk[] {
  return calculateWeightedWordTiming(text, durationSec);
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

  // Subtitle timing calibration offset (default 0ms instantaneous exact audio sync)
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const [isCalibrationOpen, setIsCalibrationOpen] = useState<boolean>(false);

  const currentScene = scenes[activeSceneIndex] || scenes[0];
  const animationFrameRef = useRef<number | null>(null);

  const currentSceneDuration = currentScene?.duration_seconds || 4;
  const currentSceneElapsedSec = Math.max(0, sceneProgress * currentSceneDuration + subtitleOffset);

  // Synchronized active word chunk calculations based on exact scene duration and offset
  const timedChunks = useMemo(
    () => calculateWeightedWordTiming(currentScene?.narration_text || '', currentSceneDuration, subtitleOffset),
    [currentScene?.narration_text, currentSceneDuration, subtitleOffset]
  );

  const activeChunk = useMemo(() => {
    if (timedChunks.length === 0) return null;
    return (
      timedChunks.find((c) => currentSceneElapsedSec >= c.startSec && currentSceneElapsedSec <= c.endSec) ||
      timedChunks.find((c) => currentSceneElapsedSec < c.endSec) ||
      timedChunks[timedChunks.length - 1]
    );
  }, [timedChunks, currentSceneElapsedSec]);

  // Calculate total timeline duration
  const totalDurationSec = scenes.reduce((sum, s) => sum + (s.duration_seconds || 4), 0);

  // Calculate elapsed time up to current scene
  const elapsedBeforeCurrent = scenes
    .slice(0, activeSceneIndex)
    .reduce((sum, s) => sum + (s.duration_seconds || 4), 0);

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

  // Main Canvas render loop with Ken Burns motion, MachinaMind branding & 1/3-size subtitles
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

    const scaleRatio = width / 1920;

    // Dual Branding: Top-Left Channel Badge & Bottom-Right Subtle Watermark
    drawBrandOverlays(ctx, width, height, scaleRatio, 'MachinaMind', true);

    // Active Reels-Style Cinematic Floating Subtitles (Exact 1:1 Audio Sync)
    if (showCaptions && activeChunk && activeChunk.text) {
      drawCinematicSubtitles(ctx, activeChunk, currentSceneElapsedSec, width, height, scaleRatio);
    }
  }, [
    currentScene,
    loadedImages,
    sceneProgress,
    showCaptions,
    activeChunk,
    currentSceneElapsedSec,
  ]);

  // Main animation / timing tick with real-time 60fps audio clock sync
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      if (isPlaying) {
        // High-precision 60fps query of exact audio currentTime to eliminate polling delay
        if (audioRef.current && currentScene?.audio_url && !audioRef.current.paused) {
          const cur = audioRef.current.currentTime;
          const dur = audioRef.current.duration || currentScene.duration_seconds || 4;
          if (dur > 0) {
            setSceneProgress(Math.min(1, cur / dur));
          }
        } else {
          // Fallback to frame delta when no audio is loaded
          const durationSec = (currentScene?.duration_seconds || 4) / playbackSpeed;
          const deltaSec = (currentTime - lastTime) / 1000;
          setSceneProgress((prev) => {
            const next = prev + deltaSec / durationSec;
            if (next >= 1) {
              if (activeSceneIndex < scenes.length - 1) {
                onSceneChange(activeSceneIndex + 1);
              } else {
                setIsPlaying(false);
              }
              return 0;
            }
            return next;
          });
        }
      }
      lastTime = currentTime;

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
        <div className="absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/85 via-black/35 to-transparent flex items-center justify-between pointer-events-none z-10">
          <div className="flex items-center gap-2">
            <span className="flex h-5 sm:h-6 items-center px-1.5 sm:px-2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] sm:text-[11px] font-mono font-bold">
              {currentScene?.scene_id} ({activeSceneIndex + 1}/{scenes.length})
            </span>
            <span className="hidden sm:inline-block text-xs font-medium text-slate-200">
              حركة: <span className="text-amber-400 font-mono">{currentScene?.motion}</span>
            </span>
          </div>

          {/* MachinaMind Channel Watermark Badge & Clock in Top-Right */}
          <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-amber-500/40 text-amber-300 shadow-xl">
              <span className="flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded bg-amber-400 text-slate-950 font-bold text-[10px] sm:text-xs shadow-sm">
                M
              </span>
              <span className="font-sans font-bold tracking-wider text-[11px] sm:text-xs text-white">
                MachinaMind
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] sm:text-xs font-mono text-slate-300 tabular-nums bg-slate-950/70 px-2 sm:px-2.5 py-1 rounded-xl border border-slate-800">
              <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-slate-400" />
              <span>{formatTime(totalElapsedSec)} / {formatTime(totalDurationSec)}</span>
            </div>
          </div>
        </div>

        {/* Bottom Floating Control Bar */}
        <div className="absolute bottom-0 inset-x-0 p-2.5 sm:p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent flex flex-col gap-2 z-20">
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
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => activeSceneIndex > 0 && onSceneChange(activeSceneIndex - 1)}
                disabled={activeSceneIndex === 0}
                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
                title="المشهد السابق"
              >
                <SkipBack className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <button
                onClick={togglePlay}
                className="p-2 sm:p-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl font-bold transition-transform active:scale-95 shadow-md"
              >
                {isPlaying ? <Pause className="h-4 w-4 sm:h-5 sm:w-5" /> : <Play className="h-4 w-4 sm:h-5 sm:w-5 ml-0.5" />}
              </button>

              <button
                onClick={() => activeSceneIndex < scenes.length - 1 && onSceneChange(activeSceneIndex + 1)}
                disabled={activeSceneIndex === scenes.length - 1}
                className="p-2 hover:bg-white/10 rounded-lg disabled:opacity-30 transition-colors"
                title="المشهد التالي"
              >
                <SkipForward className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>

              <div className="h-4 w-px bg-slate-700 mx-0.5 sm:mx-1" />

              <button
                onClick={() => setIsMuted(!isMuted)}
                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"
              >
                {isMuted ? <VolumeX className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-400" /> : <Volume2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </button>

              <button
                onClick={() => setShowCaptions(!showCaptions)}
                className={`px-2 py-0.5 sm:px-2.5 sm:py-1 text-[11px] sm:text-xs font-mono font-bold rounded-lg border transition-colors ${
                  showCaptions
                    ? 'border-amber-400 text-amber-400 bg-amber-400/10 shadow-sm'
                    : 'border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title={showCaptions ? 'إخفاء الترجمة' : 'إظهار الترجمة'}
              >
                CC
              </button>

              {/* Subtitle Sync Calibration Button & Popover */}
              <div className="relative">
                <button
                  onClick={() => setIsCalibrationOpen(!isCalibrationOpen)}
                  className={`flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs font-mono rounded-lg border transition-colors ${
                    isCalibrationOpen || subtitleOffset !== 0
                      ? 'border-amber-400 text-amber-300 bg-amber-500/15'
                      : 'border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                  title="معايرة توقيت الترجمة (مزامنة الصوت)"
                >
                  <Sliders className="h-3 w-3" />
                  <span>{subtitleOffset > 0 ? `+${Math.round(subtitleOffset * 1000)}ms` : subtitleOffset < 0 ? `${Math.round(subtitleOffset * 1000)}ms` : 'تزامن 0ms'}</span>
                </button>

                {/* Calibration Dropdown / Popover */}
                {isCalibrationOpen && (
                  <div className="absolute bottom-10 left-0 sm:left-auto sm:right-0 w-64 sm:w-72 rounded-xl bg-slate-950/95 backdrop-blur-xl border border-slate-700 p-3 shadow-2xl z-50 text-slate-200 text-xs space-y-2.5">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                      <span className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px]">
                        <Sliders className="h-3 w-3" />
                        <span>معايرة تزامن الكلمات</span>
                      </span>
                      <button
                        onClick={() => setSubtitleOffset(0)}
                        className="text-[10px] text-slate-400 hover:text-amber-400 font-mono transition-colors"
                        title="إعادة التعيين إلى 0ms (تزامن لحظي)"
                      >
                        إعادة تعيين (0ms)
                      </button>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1 font-mono">
                        <span className="text-slate-400">إزاحة التوقيت:</span>
                        <span className="text-amber-300 font-bold">
                          {subtitleOffset > 0
                            ? `تقديم +${Math.round(subtitleOffset * 1000)}ms`
                            : subtitleOffset < 0
                            ? `تأخير ${Math.round(subtitleOffset * 1000)}ms`
                            : '0ms (تزامن لحظي دقيق)'}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.4"
                        max="0.4"
                        step="0.05"
                        value={subtitleOffset}
                        onChange={(e) => setSubtitleOffset(parseFloat(e.target.value))}
                        className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                      />
                    </div>

                    {/* Quick Presets */}
                    <div className="grid grid-cols-4 gap-1 text-[10px] font-mono">
                      {[
                        { val: 0.0, label: '0ms★' },
                        { val: 0.1, label: '+100' },
                        { val: 0.2, label: '+200' },
                        { val: -0.1, label: '-100' },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          onClick={() => setSubtitleOffset(preset.val)}
                          className={`py-0.5 rounded border transition-colors ${
                            subtitleOffset === preset.val
                              ? 'bg-amber-400 text-slate-950 font-bold border-amber-400'
                              : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3">
              {/* Playback speed selector */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-900/80 p-0.5 sm:p-1 rounded-lg border border-slate-700 text-[10px] sm:text-xs">
                {[1, 1.25, 1.5].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`px-1.5 sm:px-2 py-0.5 rounded font-mono ${
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
                className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg text-slate-300 transition-colors"
                title="شاشة كاملة"
              >
                <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
