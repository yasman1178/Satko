'use client';

import React, { useState, useRef } from 'react';
import { ProjectData, PublishInfo } from '@/types/project';
import {
  Share2,
  Copy,
  Check,
  Sparkles,
  Download,
  Film,
  Video,
  FileText,
  Pin,
  Tag,
  Loader2,
  CheckCircle2,
  AlertCircle,
  StopCircle,
  Play,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  renderProjectVideo,
  VideoQuality,
  QUALITY_PRESETS,
  RenderProgress,
  RenderResult,
} from '@/lib/video-renderer';

interface PublishExportPanelProps {
  project: ProjectData;
  onUpdatePublish: (publish: PublishInfo) => void;
}

export function PublishExportPanel({ project, onUpdatePublish }: PublishExportPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);

  // Video Rendering States
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('1080p');
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [renderedResult, setRenderedResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const publishData: PublishInfo = project.publish || {
    title_options: [
      project.project.title,
      'How Manipulators Plant Doubt in Your Memory to Destroy Self-Trust',
      'The Phantom Alteration: Dark Psychology & Memory Control',
    ],
    description: `Detailed analysis of psychological doubt and memory manipulation tactics.\n\n#DarkPsychology #SelfTrust #Psychology`,
    tags: ['Dark Psychology', 'Gaslighting', 'Machiavellian', 'Self Trust'],
    thumbnail_prompt_en: 'A dark baroque oil painting of an hourglass in a dim stone chamber, crimson velvet, chiaroscuro lighting, 16:9.',
    pinned_comment: 'ما هي أكثر نقطة شعرت أنها تنطبق على تجارب واقعية؟ شاركنا رأيك في التعليقات.',
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  // Generate or refresh publishing package using Gemini
  const handleGenerateAI = async () => {
    setIsGeneratingPack(true);
    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_publish_pack',
          projectData: project,
        }),
      });

      const data = await response.json();
      if (data.success && data.publishPack) {
        onUpdatePublish(data.publishPack);
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
      }
    } catch (err) {
      console.error('Error generating publish pack:', err);
    } finally {
      setIsGeneratingPack(false);
    }
  };

  const scenes = project.chapters[0]?.scenes || [];
  const readyAudioCount = scenes.filter((s) => s.audio_status === 'ready' && s.audio_url).length;
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_seconds || 3.8), 0);

  // Real in-browser video render pipeline
  const handleStartRender = async () => {
    if (scenes.length === 0) return;

    setIsExportingVideo(true);
    setRenderError(null);
    setRenderProgress({
      currentSceneIndex: 0,
      totalScenes: scenes.length,
      percent: 1,
      currentTimeSec: 0,
      totalTimeSec: Math.round(totalDuration),
      statusText: 'بدء تهيئة محرك الرندر والصوتيات...',
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await renderProjectVideo(
        scenes,
        selectedQuality,
        (progress) => {
          setRenderProgress(progress);
        },
        abortController.signal
      );

      setRenderedResult(result);
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    } catch (err: any) {
      if (err?.message?.includes('إلغاء') || abortController.signal.aborted) {
        setRenderError('تم إيقاف عملية الرندر بناءً على طلبك.');
      } else {
        console.error('Video Render Error:', err);
        setRenderError(err?.message || 'حدث خطأ أثناء رندر الفيديو');
      }
    } finally {
      setIsExportingVideo(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbortRender = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsExportingVideo(false);
  };

  const handleManualDownload = () => {
    if (!renderedResult) return;
    const a = document.createElement('a');
    a.href = renderedResult.url;
    a.download = renderedResult.filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 1000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Share2 className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                حزمة النشر والتصدير لليوتيوب (Publishing & Export Suite)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              رندر الفيديو الحقيقي بـ 3 باقات جودة، مع عناوين عالية الـ CTR، ووصف محسن لمحركات البحث، وتاجات جاهزة.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateAI}
              disabled={isGeneratingPack}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm disabled:opacity-60"
            >
              {isGeneratingPack ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جارِ توليد الحزمة الذكية...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>توليد حزمة النشر بـ Gemini</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Publishing Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Titles & Description */}
        <div className="lg:col-span-2 space-y-5">
          {/* Title Options */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span>خيارات العناوين الجذابة (High-CTR Title Options)</span>
              <span className="text-slate-500 font-normal">اختر العنوان الأنسب للمحتوى</span>
            </div>

            <div className="space-y-2">
              {publishData.title_options.map((title, idx) => {
                const isCopied = copiedKey === `title_${idx}`;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800/80 hover:border-slate-700 transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-200 font-sans" dir="ltr">
                      {title}
                    </span>
                    <button
                      onClick={() => copyText(title, `title_${idx}`)}
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-amber-400 transition-colors shrink-0"
                      title="نسخ العنوان"
                    >
                      {isCopied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-amber-400" />
                <span>الوصف مع الفصول الزمنية (YouTube Description & Timestamps)</span>
              </span>
              <button
                onClick={() => copyText(publishData.description, 'description')}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 transition-colors"
              >
                {copiedKey === 'description' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>نسخ الوصف كاملاً</span>
                  </>
                )}
              </button>
            </div>

            <textarea
              readOnly
              value={publishData.description}
              rows={8}
              dir="ltr"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 font-mono focus:outline-none"
            />
          </div>

          {/* Pinned Comment */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Pin className="h-4 w-4 text-amber-400" />
                <span>التعليق المثبت للنقاش وزيادة التفاعل (Pinned Comment)</span>
              </span>
              <button
                onClick={() => copyText(publishData.pinned_comment, 'pinned_comment')}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-amber-400 transition-colors"
              >
                {copiedKey === 'pinned_comment' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>نسخ</span>
              </button>
            </div>

            <p className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 text-xs text-slate-200">
              {publishData.pinned_comment}
            </p>
          </div>
        </div>

        {/* Right Column: Video Render Engine with 3 Quality Options */}
        <div className="space-y-5">
          {/* Video Render Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Video className="h-4 w-4 text-amber-400" />
                <span>محرك رندر وتصدير الفيديو الفعلي</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                تسجيل حي مباشر
              </span>
            </div>

            {/* Quality Preset Selector (3 Qualities) */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                اختر دقة وجودة الفيديو المطلوب (Video Quality):
              </label>

              <div className="grid grid-cols-1 gap-2">
                {(Object.keys(QUALITY_PRESETS) as VideoQuality[]).map((qKey) => {
                  const q = QUALITY_PRESETS[qKey];
                  const isSelected = selectedQuality === qKey;

                  return (
                    <button
                      key={qKey}
                      type="button"
                      disabled={isExportingVideo}
                      onClick={() => setSelectedQuality(qKey)}
                      className={`w-full text-right p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 shadow-sm'
                          : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white flex items-center gap-2">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isSelected ? 'bg-amber-400' : 'bg-slate-600'
                            }`}
                          />
                          {q.label}
                        </span>
                        <span className="text-[10px] font-mono text-amber-400/90 bg-amber-400/10 px-1.5 py-0.5 rounded">
                          {q.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mr-4">
                        {q.description} ({q.fps}fps · {q.bitrate / 1_000_000}Mbps)
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stats summary */}
            <div className="space-y-2 text-xs pt-1">
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>المشاهد الصوتية الجاهزة</span>
                <span className="font-mono tabular-nums font-bold text-amber-400">
                  {readyAudioCount} / {scenes.length}
                </span>
              </div>
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>المدة الزمنية للفيديو</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {Math.floor(totalDuration / 60)} د و {Math.round(totalDuration % 60)} ث
                </span>
              </div>
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>الدقة المختارة</span>
                <span className="font-mono text-amber-400 font-bold">
                  {QUALITY_PRESETS[selectedQuality].width}x{QUALITY_PRESETS[selectedQuality].height} ({selectedQuality})
                </span>
              </div>
              <div className="flex items-center justify-between p-2 bg-slate-950 rounded border border-slate-800 text-[11px] text-slate-400">
                <span>الميزات المطبقة:</span>
                <span className="font-medium text-amber-400 flex items-center gap-1">
                  <span className="text-emerald-400 font-bold">✓</span> ترجمة ريلز ضخمة 72px · ترويسة أندرويد وواتساب
                </span>
              </div>
            </div>

            {/* Render Progress or Buttons */}
            {isExportingVideo ? (
              <div className="space-y-3 pt-2">
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-200">
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{renderProgress?.statusText || 'جارِ الرندر...'}</span>
                    </span>
                    <span className="font-mono font-bold text-amber-400">
                      {renderProgress?.percent || 0}%
                    </span>
                  </div>

                  <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-200"
                      style={{ width: `${renderProgress?.percent || 0}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>
                      المشهد {renderProgress?.currentSceneIndex || 0} / {renderProgress?.totalScenes || scenes.length}
                    </span>
                    <span>
                      {renderProgress?.currentTimeSec || 0}ث / {renderProgress?.totalTimeSec || Math.round(totalDuration)}ث
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleAbortRender}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-600/40 text-xs transition-colors"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  <span>إلغاء عملية الرندر</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartRender}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-slate-950 font-bold text-xs shadow-lg transition-all active:scale-95"
              >
                <Film className="h-4 w-4 text-slate-950" />
                <span>بدء رندر وتحميل الفيديو بدقة ({selectedQuality})</span>
              </button>
            )}

            {/* Error Message */}
            {renderError && (
              <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <span>{renderError}</span>
              </div>
            )}

            {/* Completed Rendered Video Preview & Download */}
            {renderedResult && !isExportingVideo && (
              <div className="space-y-3 pt-3 border-t border-slate-800">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>تم إنتاج وتنزيل الفيديو بنجاح على جهازك!</span>
                </div>

                {/* Embedded Video Preview Player */}
                <div className="rounded-lg overflow-hidden border border-slate-800 bg-black aspect-video relative">
                  <video
                    src={renderedResult.url}
                    controls
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>الحجم: {(renderedResult.sizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
                  <span>المدة: {Math.round(renderedResult.durationSec)} ثانية</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleManualDownload}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span>تحميل الفيديو مرة أخرى</span>
                  </button>

                  <button
                    onClick={handleStartRender}
                    className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    title="إعادة الرندر"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Thumbnail Prompt */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span>برومبت الغلاف المصغر (Thumbnail Prompt)</span>
              <button
                onClick={() => copyText(publishData.thumbnail_prompt_en, 'thumb_prompt')}
                className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
                title="نسخ برومبت الغلاف"
              >
                {copiedKey === 'thumb_prompt' ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>

            <p className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-300 font-serif italic" dir="ltr">
              {publishData.thumbnail_prompt_en}
            </p>
          </div>

          {/* Tags */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Tag className="h-4 w-4 text-amber-400" />
                <span>الكلمات المفتاحية ({publishData.tags.length})</span>
              </span>
              <button
                onClick={() => copyText(publishData.tags.join(', '), 'all_tags')}
                className="text-xs text-slate-400 hover:text-amber-400 transition-colors"
              >
                {copiedKey === 'all_tags' ? (
                  <span className="text-emerald-400 font-bold">تم نسخ التاجات</span>
                ) : (
                  <span>نسخ كـ CSV</span>
                )}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 p-3 bg-slate-950 rounded-lg border border-slate-800 max-h-48 overflow-y-auto">
              {publishData.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-mono text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
