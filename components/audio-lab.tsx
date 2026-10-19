'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Scene } from '@/types/project';
import { VOICE_CATALOG } from '@/lib/voice-catalog';
import { saveAudioToDB, getAudioFromDB } from '@/lib/db';
import {
  Volume2,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Mic,
  Sliders,
  FileAudio,
  Loader2,
  StopCircle,
} from 'lucide-react';

interface AudioLabProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  voice: string;
  onVoiceChange: (voice: string) => void;
  onScenesUpdated: (updatedScenes: Scene[]) => void;
}

export function AudioLab({
  scenes,
  onUpdateScene,
  voice,
  onVoiceChange,
  onScenesUpdated,
}: AudioLabProps) {
  const [speechRate, setSpeechRate] = useState<string>('-20%');
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [audioErrorMsg, setAudioErrorMsg] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Calculate actual audio duration stats
  const completedScenes = scenes.filter((s) => s.audio_status === 'ready' && s.audio_url);
  const totalAudioDurationSec = scenes.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);
  const totalWords = scenes.reduce((acc, s) => acc + s.narration_text.split(/\s+/).length, 0);

  // Play audio for a scene
  const handlePlayAudio = (scene: Scene) => {
    if (!scene.audio_url) return;

    if (activePlayingId === scene.scene_id) {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      setActivePlayingId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }

    const audio = new Audio(scene.audio_url);
    audioPlayerRef.current = audio;
    setActivePlayingId(scene.scene_id);

    audio.onended = () => {
      setActivePlayingId(null);
    };

    audio.onerror = () => {
      setActivePlayingId(null);
      setAudioErrorMsg(`فشل تشغيل الصوت للمشهد ${scene.scene_id}`);
    };

    audio.play().catch((err) => {
      console.warn('Playback error:', err);
      setActivePlayingId(null);
    });
  };

  // Generate audio for a single scene
  const generateSceneAudio = async (scene: Scene): Promise<boolean> => {
    onUpdateScene(scene.scene_id, { audio_status: 'generating', audio_error: undefined });

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene_id: scene.scene_id,
          text: scene.narration_text,
          voice: voice || 'en-GB-RyanNeural',
          rate: speechRate,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'فشل التوليد الصوتي');
      }

      // Convert dataUrl to blob for IndexedDB storage
      const res = await fetch(data.audioUrl);
      const audioBlob = await res.blob();

      // Measure exact audio duration using HTMLAudioElement
      const audioObj = new Audio(data.audioUrl);
      const exactDuration = await new Promise<number>((resolve) => {
        audioObj.onloadedmetadata = () => {
          resolve(audioObj.duration || data.estimatedDurationSeconds || 3.0);
        };
        audioObj.onerror = () => {
          resolve(data.estimatedDurationSeconds || 3.0);
        };
      });

      const finalDuration = +(exactDuration + 0.2).toFixed(2); // Rule: audio + 0.2s padding

      // Save to IndexedDB external memory
      await saveAudioToDB(scene.scene_id, audioBlob, finalDuration, voice);

      onUpdateScene(scene.scene_id, {
        audio_url: data.audioUrl,
        audio_status: 'ready',
        duration_seconds: finalDuration,
      });

      return true;
    } catch (err: any) {
      console.error(`Error generating audio for ${scene.scene_id}:`, err);
      onUpdateScene(scene.scene_id, {
        audio_status: 'error',
        audio_error: err?.message || 'خطأ غير معروف في التوليد',
      });
      return false;
    }
  };

  // Batch generate all missing or all scenes
  const handleStartBatch = async (onlyMissing: boolean = true) => {
    const targets = scenes.filter((s) => !onlyMissing || s.audio_status !== 'ready');
    if (targets.length === 0) return;

    setIsBatchGenerating(true);
    setAudioErrorMsg(null);
    setBatchProgress({ current: 0, total: targets.length });

    abortControllerRef.current = new AbortController();

    let completed = 0;
    for (let i = 0; i < targets.length; i++) {
      if (abortControllerRef.current?.signal.aborted) break;

      const targetScene = targets[i];
      await generateSceneAudio(targetScene);
      completed++;
      setBatchProgress({ current: completed, total: targets.length });

      // Slight breather to respect rate limits
      await new Promise((r) => setTimeout(r, 250));
    }

    setIsBatchGenerating(false);
  };

  const handleStopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsBatchGenerating(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & Metrics Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Mic className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                مركز توليد الصوتيات السيكولوجية (Neural TTS Studio)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              توليد التعليق الصوتي لكل مشهد بالصوت المختار مع قياس دقيق للمدة الزمنية وحفظها في الذاكرة الدائمة.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isBatchGenerating ? (
              <>
                <button
                  onClick={() => handleStartBatch(true)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm active:scale-95"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>توليد الصوتيات المتبقية ({scenes.length - completedScenes.length})</span>
                </button>

                <button
                  onClick={() => handleStartBatch(false)}
                  className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                  <span>إعادة توليد الكل ({scenes.length})</span>
                </button>
              </>
            ) : (
              <button
                onClick={handleStopBatch}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors shadow-sm animate-pulse"
              >
                <StopCircle className="h-4 w-4" />
                <span>إيقاف التوليد المؤقت</span>
              </button>
            )}
          </div>
        </div>

        {/* Voice and Speech Rate Selectors */}
        <div className="mt-5 grid grid-cols-1 gap-4 pt-4 border-t border-slate-800/80 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              الصوت المعتمد (Voice Model)
            </label>
            <select
              value={voice}
              onChange={(e) => onVoiceChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
            >
              {VOICE_CATALOG.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.recommended ? '★ (موصى به)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                سرعة الإلقاء (Pacing Rate)
              </label>
              <span className="text-[11px] font-mono text-amber-400 font-bold">
                {speechRate === '-20%' ? '-20% (ماكيافيلي وقور)' : speechRate}
              </span>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-700">
              {[
                { val: '-30%', label: '-30%' },
                { val: '-20%', label: '-20% ★' },
                { val: '-10%', label: '-10%' },
                { val: '+0%', label: 'طبيعي' },
                { val: '+10%', label: '+10%' },
              ].map(({ val, label }) => (
                <button
                  key={val}
                  onClick={() => setSpeechRate(val)}
                  className={`flex-1 py-1 text-xs font-medium rounded transition-colors ${
                    speechRate === val
                      ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                  title={val === '-20%' ? 'السرعة السيكولوجية الافتراضية (-20%)' : val}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div>
              <div className="text-[11px] text-slate-400">إجمالي مدة الصوت الفعلي</div>
              <div className="text-base font-bold text-amber-400 font-mono tabular-nums">
                {Math.floor(totalAudioDurationSec / 60)} دقيقة و {Math.round(totalAudioDurationSec % 60)} ثانية
              </div>
            </div>
            <div className="text-left">
              <div className="text-[11px] text-slate-400">نسبة الجاهزية</div>
              <div className="text-sm font-semibold text-slate-200 font-mono tabular-nums">
                {Math.round((completedScenes.length / (scenes.length || 1)) * 100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Batch Progress Bar */}
        {isBatchGenerating && (
          <div className="mt-4 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-300 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                <span>جارِ توليد المقاطع الصوتية بالذكاء الاصطناعي...</span>
              </span>
              <span className="font-mono tabular-nums text-amber-400 font-bold">
                {batchProgress.current} / {batchProgress.total}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
                style={{
                  width: `${(batchProgress.current / (batchProgress.total || 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {audioErrorMsg && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-950/60 border border-red-800/80 p-2.5 text-xs text-red-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{audioErrorMsg}</span>
          </div>
        )}
      </div>

      {/* Scenes List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <span>قائمة مشاهد الفصل الأول ({scenes.length} مشهداً)</span>
          <span>ترتيب تسلسلي مع المدة والانتقالات</span>
        </div>

        <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/40">
          {scenes.map((scene, index) => {
            const isPlaying = activePlayingId === scene.scene_id;
            const isGenerating = scene.audio_status === 'generating';
            const isReady = scene.audio_status === 'ready' && scene.audio_url;
            const isError = scene.audio_status === 'error';
            const wordCount = scene.narration_text.split(/\s+/).length;

            return (
              <div
                key={scene.scene_id}
                className={`p-4 transition-colors hover:bg-slate-800/30 ${
                  isPlaying ? 'bg-amber-500/5' : ''
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  {/* Left: Index & Narration Text */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-mono font-bold text-slate-300">
                      {String(index + 1).padStart(2, '0')}
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-mono text-slate-300 font-semibold">{scene.scene_id}</span>
                        <span>·</span>
                        <span>{scene.image_filename}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{wordCount} كلمة</span>
                        <span>·</span>
                        <span className="text-amber-400/90 font-medium">{scene.motion}</span>
                        <span>·</span>
                        <span className="text-slate-400">{scene.transition}</span>
                      </div>

                      <p className="text-sm font-medium text-slate-100 leading-relaxed font-sans" dir="ltr">
                        {scene.narration_text}
                      </p>

                      {scene.audio_error && (
                        <p className="text-xs text-red-400 flex items-center gap-1">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>{scene.audio_error}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Audio Controls & Duration */}
                  <div className="flex items-center gap-3 shrink-0 self-end lg:self-center">
                    {/* Duration badge */}
                    <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      <span className="tabular-nums">
                        {scene.duration_seconds ? `${scene.duration_seconds} ث` : 'لم يقاس'}
                      </span>
                    </div>

                    {/* Audio Status */}
                    {isReady && (
                      <button
                        onClick={() => handlePlayAudio(scene)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          isPlaying
                            ? 'bg-amber-400 text-slate-950 font-bold shadow'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {isPlaying ? (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            <span>إيقاف</span>
                          </>
                        ) : (
                          <>
                            <Play className="h-3.5 w-3.5 text-amber-400" />
                            <span>استماع</span>
                          </>
                        )}
                      </button>
                    )}

                    {/* Generate / Regenerate button */}
                    <button
                      onClick={() => generateSceneAudio(scene)}
                      disabled={isGenerating}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        isReady
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                          : 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 border border-amber-400/30'
                      }`}
                      title={isReady ? 'إعادة التوليد' : 'توليد الصوت'}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                          <span>توليد...</span>
                        </>
                      ) : isReady ? (
                        <>
                          <RotateCcw className="h-3 w-3" />
                          <span>تحديث</span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-3.5 w-3.5 text-amber-400" />
                          <span>توليد الصوت</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
