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
  Layers,
  ListFilter,
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

  // Channel Branding & Watermark
  const [channelBrandName, setChannelBrandName] = useState<string>('MachinaMind');
  const [showWatermark, setShowWatermark] = useState<boolean>(true);

  // Scene Selection States
  type SceneSelectionMode = 'all' | 'first3' | 'first5' | 'first10' | 'custom_count' | 'range';
  const [sceneSelectionMode, setSceneSelectionMode] = useState<SceneSelectionMode>('first3');
  const [customCount, setCustomCount] = useState<number>(3);
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(5);

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

  const allScenes = project.chapters[0]?.scenes || [];

  // Compute chosen subset of scenes based on mode
  const getSelectedScenes = () => {
    if (allScenes.length === 0) return [];
    switch (sceneSelectionMode) {
      case 'first3':
        return allScenes.slice(0, Math.min(3, allScenes.length));
      case 'first5':
        return allScenes.slice(0, Math.min(5, allScenes.length));
      case 'first10':
        return allScenes.slice(0, Math.min(10, allScenes.length));
      case 'custom_count': {
        const count = Math.max(1, Math.min(customCount || 1, allScenes.length));
        return allScenes.slice(0, count);
      }
      case 'range': {
        const start = Math.max(1, Math.min(rangeStart || 1, allScenes.length)) - 1;
        const end = Math.max(start + 1, Math.min(rangeEnd || allScenes.length, allScenes.length));
        return allScenes.slice(start, end);
      }
      case 'all':
      default:
        return allScenes;
    }
  };

  const selectedScenes = getSelectedScenes();
  const selectedReadyAudioCount = selectedScenes.filter((s) => s.audio_status === 'ready' && s.audio_url).length;
  const selectedTotalDuration = selectedScenes.reduce((sum, s) => sum + (s.duration_seconds || 3.8), 0);

  // Real in-browser video render pipeline
  const handleStartRender = async () => {
    const scenesToRender = getSelectedScenes();
    if (scenesToRender.length === 0) return;

    setIsExportingVideo(true);
    setRenderError(null);
    setRenderProgress({
      currentSceneIndex: 0,
      totalScenes: scenesToRender.length,
      percent: 1,
      currentTimeSec: 0,
      totalTimeSec: Math.round(selectedTotalDuration),
      statusText: `بدء تهيئة محرك الرندر لـ ${scenesToRender.length} مشهد...`,
    });

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const result = await renderProjectVideo(
        scenesToRender,
        selectedQuality,
        (progress) => {
          setRenderProgress(progress);
        },
        abortController.signal,
        {
          channelName: channelBrandName.trim() || 'MachinaMind',
          showWatermark,
        }
      );

      setRenderedResult(result);
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    } catch (err: any) {
      if (err?.message?.includes('إلغاء') || abortController.signal.aborted) {
        setRenderError('تم إيقاف عملية الرندر بناءً على طلبك.');
      } else {
        console.error('Video Render Error:', err);
        const detailedMsg = err?.message || (typeof err === 'string' ? err : 'تحذير أثناء تجميع الفيديو');
        setRenderError(detailedMsg);
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

            {/* Channel Branding & Watermark Configuration */}
            <div className="space-y-3 p-3.5 rounded-lg border border-slate-800 bg-slate-950/90">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5 text-amber-400" />
                  <span>هوية القناة والعلامة المائية (Dual Branding):</span>
                </label>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                  أعلى اليسار + أسفل اليمين
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    اسم القناة في الشارة العلوية (أعلى اليسار):
                  </label>
                  <input
                    type="text"
                    value={channelBrandName}
                    disabled={isExportingVideo}
                    onChange={(e) => setChannelBrandName(e.target.value)}
                    placeholder="MachinaMind"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-medium text-amber-300 placeholder-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-300 font-medium">العلامة المائية (أسفل اليمين)</span>
                    <span className="text-[10px] text-slate-500">حماية شفافة بنسبة 35% لضمان حقوق الفيديو</span>
                  </div>
                  <button
                    type="button"
                    disabled={isExportingVideo}
                    onClick={() => setShowWatermark(!showWatermark)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      showWatermark ? 'bg-amber-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${
                        showWatermark ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Scene Selection Mode */}
            <div className="space-y-3 p-3.5 rounded-lg border border-slate-800 bg-slate-950/90">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-amber-400" />
                  <span>تحديد المشاهد للرندر (Scene Selection):</span>
                </label>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  {selectedScenes.length} من {allScenes.length} مشهد
                </span>
              </div>

              {/* Mode Buttons Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setSceneSelectionMode('all')}
                  className={`text-center py-2 px-2 rounded text-xs font-medium border transition-all ${
                    sceneSelectionMode === 'all'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  الكل ({allScenes.length} مشهد)
                </button>

                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setSceneSelectionMode('first3')}
                  className={`text-center py-2 px-2 rounded text-xs font-medium border transition-all ${
                    sceneSelectionMode === 'first3'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  ⚡ تجربة سريعة (أول 3)
                </button>

                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setSceneSelectionMode('first5')}
                  className={`text-center py-2 px-2 rounded text-xs font-medium border transition-all ${
                    sceneSelectionMode === 'first5'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  أول 5 مشاهد
                </button>

                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setSceneSelectionMode('first10')}
                  className={`text-center py-2 px-2 rounded text-xs font-medium border transition-all ${
                    sceneSelectionMode === 'first10'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  أول 10 مشاهد
                </button>

                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setSceneSelectionMode('custom_count')}
                  className={`text-center py-2 px-2 rounded text-xs font-medium border transition-all ${
                    sceneSelectionMode === 'custom_count'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  🔢 عدد مخصص
                </button>

                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setSceneSelectionMode('range')}
                  className={`text-center py-2 px-2 rounded text-xs font-medium border transition-all ${
                    sceneSelectionMode === 'range'
                      ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  🎯 نطاق مخصص
                </button>
              </div>

              {/* Sub-inputs for custom count or range */}
              {sceneSelectionMode === 'custom_count' && (
                <div className="flex items-center gap-2 p-2 bg-slate-900/90 rounded border border-slate-800 text-xs">
                  <span className="text-slate-300">أول عدد من المشاهد:</span>
                  <input
                    type="number"
                    min={1}
                    max={allScenes.length}
                    value={customCount}
                    disabled={isExportingVideo}
                    onChange={(e) => setCustomCount(Math.max(1, Math.min(Number(e.target.value) || 1, allScenes.length)))}
                    className="w-20 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-amber-400 font-mono font-bold text-center text-xs focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-slate-400 text-[11px]">من إجمالي {allScenes.length}</span>
                </div>
              )}

              {sceneSelectionMode === 'range' && (
                <div className="flex items-center gap-2 p-2 bg-slate-900/90 rounded border border-slate-800 text-xs">
                  <span className="text-slate-300">من مشهد:</span>
                  <input
                    type="number"
                    min={1}
                    max={allScenes.length}
                    value={rangeStart}
                    disabled={isExportingVideo}
                    onChange={(e) => setRangeStart(Math.max(1, Math.min(Number(e.target.value) || 1, allScenes.length)))}
                    className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-amber-400 font-mono font-bold text-center text-xs focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-slate-300">إلى مشهد:</span>
                  <input
                    type="number"
                    min={rangeStart}
                    max={allScenes.length}
                    value={rangeEnd}
                    disabled={isExportingVideo}
                    onChange={(e) => setRangeEnd(Math.max(rangeStart, Math.min(Number(e.target.value) || rangeStart, allScenes.length)))}
                    className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-amber-400 font-mono font-bold text-center text-xs focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-slate-400 text-[11px]">({selectedScenes.length} مشاهد)</span>
                </div>
              )}
            </div>

            {/* Stats summary */}
            <div className="space-y-2 text-xs pt-1">
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>المشاهد المحددة للرندر</span>
                <span className="font-mono tabular-nums font-bold text-amber-400">
                  {selectedScenes.length} مشهد (من أصل {allScenes.length})
                </span>
              </div>
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>المشاهد الصوتية الجاهزة</span>
                <span className="font-mono tabular-nums font-bold text-emerald-400">
                  {selectedReadyAudioCount} / {selectedScenes.length}
                </span>
              </div>
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>المدة المقدرة للرندر</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {Math.floor(selectedTotalDuration / 60)} د و {Math.round(selectedTotalDuration % 60)} ث ({Math.round(selectedTotalDuration)} ثانية)
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
                  <span className="text-emerald-400 font-bold">✓</span> صيغة MP4 القياسية · ترجمة ريلز ضخمة 72px · ترويسة أندرويد وواتساب
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
                      المشهد {renderProgress?.currentSceneIndex || 0} / {renderProgress?.totalScenes || selectedScenes.length}
                    </span>
                    <span>
                      {renderProgress?.currentTimeSec || 0}ث / {renderProgress?.totalTimeSec || Math.round(selectedTotalDuration)}ث
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
                <span>رندر {selectedScenes.length} مشهد ({Math.round(selectedTotalDuration)}ث) بدقة {selectedQuality}</span>
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
