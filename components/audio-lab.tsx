'use client';

import React, { useState, useRef } from 'react';
import { Scene } from '@/types/project';
import { VOICE_CATALOG } from '@/lib/voice-catalog';
import { saveAudioToDB } from '@/lib/db';
import {
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Mic,
  Loader2,
  StopCircle,
  ShieldCheck,
  Check,
  Volume2,
} from 'lucide-react';

interface AudioLabProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  voice: string;
  onVoiceChange: (voice: string) => void;
  onScenesUpdated: (updatedScenes: Scene[]) => void;
}

const RYAN_VOICE = 'en-GB-RyanNeural';
const SAFETY_DELAY_MS = 1800; // 1.8 seconds safe delay between requests to avoid 429 rate limit

export function AudioLab({
  scenes,
  onUpdateScene,
  voice = RYAN_VOICE,
  onVoiceChange,
  onScenesUpdated,
}: AudioLabProps) {
  const [speechRate, setSpeechRate] = useState<string>('-20%');
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [activePlayingId, setActivePlayingId] = useState<string | null>(null);
  const [audioErrorMsg, setAudioErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Calculate actual audio duration stats and voice consistency
  const completedScenes = scenes.filter((s) => s.audio_status === 'ready' && s.audio_url);
  const totalAudioDurationSec = scenes.reduce((acc, s) => acc + (s.duration_seconds || 0), 0);

  const ryanScenesCount = scenes.filter(
    (s) => s.audio_status === 'ready' && s.audio_voice === RYAN_VOICE
  ).length;

  const discordantScenes = scenes.filter(
    (s) => s.audio_status === 'ready' && s.audio_voice && s.audio_voice !== RYAN_VOICE
  );

  const unassignedVoiceScenes = scenes.filter(
    (s) => s.audio_status === 'ready' && !s.audio_voice
  );

  const nonRyanCount = discordantScenes.length + unassignedVoiceScenes.length;
  const missingAudioCount = scenes.length - completedScenes.length;

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

  // Generate audio for a single scene with retry and 429 backoff
  const generateSceneAudio = async (
    scene: Scene,
    forcedVoice?: string,
    forcedRate?: string
  ): Promise<boolean> => {
    const targetVoice = forcedVoice || voice || RYAN_VOICE;
    const targetRate = forcedRate || speechRate || '-20%';

    onUpdateScene(scene.scene_id, {
      audio_status: 'generating',
      audio_error: undefined,
    });

    let attempts = 0;
    const maxAttempts = 2;

    while (attempts <= maxAttempts) {
      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scene_id: scene.scene_id,
            text: scene.narration_text,
            voice: targetVoice,
            rate: targetRate,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          const is429 = response.status === 429 || data.error?.includes('429');
          if (is429 && attempts < maxAttempts) {
            attempts++;
            const waitMs = 3000 * attempts;
            setStatusNotice(`الخادم استجاب بـ 429 للمشهد ${scene.scene_id}. جاري الانتظار ${waitMs / 1000} ثانية وإعادة المحاولة...`);
            await new Promise((r) => setTimeout(r, waitMs));
            continue;
          }
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

        // Save to IndexedDB external memory with voice record
        await saveAudioToDB(scene.scene_id, audioBlob, finalDuration, targetVoice);

        onUpdateScene(scene.scene_id, {
          audio_url: data.audioUrl,
          audio_status: 'ready',
          duration_seconds: finalDuration,
          audio_voice: targetVoice,
          audio_error: undefined,
        });

        return true;
      } catch (err: any) {
        attempts++;
        if (attempts > maxAttempts) {
          console.error(`Error generating audio for ${scene.scene_id}:`, err);
          onUpdateScene(scene.scene_id, {
            audio_status: 'error',
            audio_error: err?.message || 'خطأ في توليد الصوت (حظر 429 أو خطأ في الشبكة)',
          });
          return false;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return false;
  };

  // Batch generate scenes with a safe 1.8s delay between scenes
  const handleStartBatch = async (
    targetFilter: 'missing' | 'all' | 'non-ryan',
    forcedVoice: string = RYAN_VOICE,
    forcedRate: string = '-20%'
  ) => {
    // Lock to Ryan voice and -20% speed
    onVoiceChange(forcedVoice);
    setSpeechRate(forcedRate);

    let targets = scenes;
    if (targetFilter === 'missing') {
      targets = scenes.filter((s) => s.audio_status !== 'ready');
    } else if (targetFilter === 'non-ryan') {
      targets = scenes.filter(
        (s) => s.audio_status !== 'ready' || s.audio_voice !== RYAN_VOICE
      );
    }

    if (targets.length === 0) {
      setStatusNotice('كافة المشاهد المستهدفة مكتملة بالفعل وبصوت Ryan البريطاني المعتمد.');
      setTimeout(() => setStatusNotice(null), 4000);
      return;
    }

    setIsBatchGenerating(true);
    setAudioErrorMsg(null);
    setStatusNotice(`جاري التوليد المتسلسل لـ ${targets.length} مشهداً بصوت Ryan البريطاني (-20%) مع تباعد أمان 1.8 ثانية...`);
    setBatchProgress({ current: 0, total: targets.length });

    abortControllerRef.current = new AbortController();

    let completed = 0;
    for (let i = 0; i < targets.length; i++) {
      if (abortControllerRef.current?.signal.aborted) break;

      const targetScene = targets[i];
      await generateSceneAudio(targetScene, forcedVoice, forcedRate);
      completed++;
      setBatchProgress({ current: completed, total: targets.length });

      // 1.8 seconds safe breather between scenes to prevent 429
      if (i < targets.length - 1 && !abortControllerRef.current?.signal.aborted) {
        await new Promise((r) => setTimeout(r, SAFETY_DELAY_MS));
      }
    }

    setIsBatchGenerating(false);
    setStatusNotice('اكتملت عملية التوليد بنجاح! تم توحيد الصوت بصوت Ryan البريطاني لكافة المشاهد.');
    setTimeout(() => setStatusNotice(null), 5000);
  };

  const handleStopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsBatchGenerating(false);
    setStatusNotice('تم إيقاف عملية التوليد الجماعي.');
    setTimeout(() => setStatusNotice(null), 3000);
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
              تثبيت صوت Ryan البريطاني الفخم (<span className="font-mono text-amber-300">en-GB-RyanNeural</span>) بسرعة ماكيافيلية متأنية (<span className="font-mono text-amber-300">-20%</span>) عبر جميع المشاهد.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            {!isBatchGenerating ? (
              <>
                {/* Primary Unification Button */}
                <button
                  onClick={() => handleStartBatch('all', RYAN_VOICE, '-20%')}
                  className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 rounded-lg transition-all shadow-md active:scale-95 border border-amber-300/40"
                  title="إعادة توليد وتوحيد كامل مشاهد المشروع الـ 33 بصوت Ryan البريطاني وسرعة -20%"
                >
                  <ShieldCheck className="h-4 w-4 text-slate-950" />
                  <span>توحيد الكل بصوت Ryan البريطاني ({scenes.length} مشهداً)</span>
                </button>

                {nonRyanCount > 0 && (
                  <button
                    onClick={() => handleStartBatch('non-ryan', RYAN_VOICE, '-20%')}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-amber-300 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 rounded-lg transition-colors"
                    title="إعادة توليد المشاهد التي سجلت بأصوات أخرى فقط"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>توحيد المشاهد المختلفة فقط ({nonRyanCount})</span>
                  </button>
                )}

                {missingAudioCount > 0 && (
                  <button
                    onClick={() => handleStartBatch('missing', RYAN_VOICE, '-20%')}
                    className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    <span>توليد المتبقي ({missingAudioCount})</span>
                  </button>
                )}
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

        {/* Discordance Warning Banner if voices differ */}
        {nonRyanCount > 0 && !isBatchGenerating && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                <strong>تنبيه تباين الأصوات:</strong> يوجد <strong className="font-mono text-white underline">{nonRyanCount}</strong> مشهد مسجل بصوت مختلف أو غير مسجل، بينما المشهد الأول بصوت Ryan البريطاني. اضغط زر &quot;توحid المشاهد المختلفة&quot; لتوحيدها فوراً.
              </span>
            </div>
            <button
              onClick={() => handleStartBatch('non-ryan', RYAN_VOICE, '-20%')}
              className="px-3 py-1.5 bg-amber-400 text-slate-950 font-bold rounded text-[11px] whitespace-nowrap hover:bg-amber-300 transition-colors"
            >
              توحيد الآن بنقرة واحدة
            </button>
          </div>
        )}

        {/* Voice and Speech Rate Selectors */}
        <div className="mt-5 grid grid-cols-1 gap-4 pt-4 border-t border-slate-800/80 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                الصوت المعتمد (Voice Model)
              </label>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                مثبّت: Ryan البريطاني
              </span>
            </div>
            <select
              value={voice}
              onChange={(e) => onVoiceChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
            >
              {VOICE_CATALOG.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} {v.id === RYAN_VOICE ? '★ (الصوت المعتمد للمشروع)' : ''}
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
              <div className="text-[11px] text-slate-400">حالة توحيد صوت Ryan</div>
              <div className="text-sm font-bold text-amber-400 font-mono tabular-nums flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span>{ryanScenesCount} / {scenes.length} مشهداً</span>
              </div>
            </div>
            <div className="text-left">
              <div className="text-[11px] text-slate-400">إجمالي مدة الصوت</div>
              <div className="text-xs font-semibold text-slate-200 font-mono tabular-nums mt-0.5">
                {Math.floor(totalAudioDurationSec / 60)}د و {Math.round(totalAudioDurationSec % 60)}ث
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
                <span>جارِ التوليد المتسلسل بالصوت الموحد Ryan البريطاني (-20%)...</span>
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
            <div className="mt-1 text-[11px] text-slate-400 text-left">
              فاصل أمان 1.8 ثانية بين كل مشهد لمنع حظر 429 من سيرفرات مايكروسوفت
            </div>
          </div>
        )}

        {statusNotice && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-950/60 border border-emerald-800/80 p-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{statusNotice}</span>
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
          <span className="text-[11px] text-slate-500">
            الصوت المعتمد: Ryan (en-GB) · السرعة: -20%
          </span>
        </div>

        <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800 bg-slate-900/40">
          {scenes.map((scene, index) => {
            const isPlaying = activePlayingId === scene.scene_id;
            const isGenerating = scene.audio_status === 'generating';
            const isReady = scene.audio_status === 'ready' && scene.audio_url;
            const wordCount = scene.narration_text.split(/\s+/).length;
            const isRyanVoice = scene.audio_voice === RYAN_VOICE;
            const hasOtherVoice = isReady && scene.audio_voice && scene.audio_voice !== RYAN_VOICE;

            return (
              <div
                key={scene.scene_id}
                className={`p-4 transition-colors hover:bg-slate-800/30 ${
                  isPlaying ? 'bg-amber-500/5' : ''
                } ${hasOtherVoice ? 'border-r-2 border-r-amber-500/60' : ''}`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  {/* Left: Index & Narration Text */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-800 text-xs font-mono font-bold text-slate-300">
                      {String(index + 1).padStart(2, '0')}
                    </div>

                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span className="font-mono text-slate-300 font-semibold">{scene.scene_id}</span>
                        <span>·</span>
                        <span>{scene.image_filename}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{wordCount} كلمة</span>
                        <span>·</span>
                        <span className="text-amber-400/90 font-medium">{scene.motion}</span>

                        {/* Voice match badge */}
                        {isReady && isRyanVoice && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-emerald-400 border border-emerald-500/30">
                            <Check className="h-2.5 w-2.5" />
                            <span>Ryan (en-GB)</span>
                          </span>
                        )}

                        {hasOtherVoice && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-mono font-medium text-amber-300 border border-amber-500/30">
                            <AlertCircle className="h-2.5 w-2.5" />
                            <span>{scene.audio_voice?.replace('Neural', '')} (غير متطابق)</span>
                          </span>
                        )}

                        {isReady && !scene.audio_voice && (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                            صوت محفوظ
                          </span>
                        )}
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

                    {/* Generate / Regenerate with Ryan button */}
                    <button
                      onClick={() => generateSceneAudio(scene, RYAN_VOICE, '-20%')}
                      disabled={isGenerating}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        hasOtherVoice
                          ? 'bg-amber-400 text-slate-950 font-bold hover:bg-amber-300'
                          : isReady
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                          : 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/20 border border-amber-400/30'
                      }`}
                      title={hasOtherVoice ? 'إعادة التوليد وتوحيد الصوت بصوت Ryan' : isReady ? 'إعادة التوليد بصوت Ryan' : 'توليد الصوت بصوت Ryan'}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
                          <span>توليد...</span>
                        </>
                      ) : hasOtherVoice ? (
                        <>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>توحيد لـ Ryan</span>
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
