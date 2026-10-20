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
  Server,
  Sliders,
  Clock,
  Laptop,
  Subtitles,
  ExternalLink,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  renderProjectVideo,
  VideoQuality,
  RenderEngine,
  QUALITY_PRESETS,
  RenderProgress,
  RenderResult,
  exportSrtSubtitles,
} from '@/lib/video-renderer';

interface PublishExportPanelProps {
  project: ProjectData;
  onUpdatePublish: (publish: PublishInfo) => void;
}

export function PublishExportPanel({ project, onUpdatePublish }: PublishExportPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);

  // Video Rendering Engine & Quality States
  const [renderEngine, setRenderEngine] = useState<RenderEngine>('server_ffmpeg');
  const [selectedQuality, setSelectedQuality] = useState<VideoQuality>('1080p');
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [renderProgress, setRenderProgress] = useState<RenderProgress | null>(null);
  const [renderedResult, setRenderedResult] = useState<RenderResult | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Subtitle Pacing & Timing Calibration
  // Solves user report: "سرعة الترجمة عن نطق الكلمات"
  const [timingOffset, setTimingOffset] = useState<number>(0.25);
  const [wordsPerChunk, setWordsPerChunk] = useState<number>(4);

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

  // Main Render Starter
  const handleStartRender = async () => {
    const scenesToRender = getSelectedScenes();
    if (scenesToRender.length === 0) return;

    setIsExportingVideo(true);
    setRenderError(null);
    setRenderProgress({
      currentSceneIndex: 0,
      totalScenes: scenesToRender.length,
      percent: 2,
      currentTimeSec: 0,
      totalTimeSec: Math.round(selectedTotalDuration),
      statusText: renderEngine === 'server_ffmpeg'
        ? `بدء تشغيل محرك FFmpeg على السيرفر لـ ${scenesToRender.length} مشهد...`
        : `بدء تهيئة محرك المتصفح المحلي لـ ${scenesToRender.length} مشهد...`,
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
        {
          engine: renderEngine,
          channelName: channelBrandName.trim() || 'MachinaMind',
          showWatermark,
          timingOffset,
          wordsPerChunk,
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

  // Export SRT subtitles file for Premiere/CapCut
  const handleExportSrt = () => {
    const scenesToRender = getSelectedScenes();
    if (scenesToRender.length === 0) return;
    const srtContent = exportSrtSubtitles(scenesToRender, timingOffset);
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mindplicit_${channelBrandName.replace(/\s+/g, '_')}_Subtitles.srt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
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
              <h2 className="text-sm font-bold text-white">
                مركز الإنتاج والتصدير السحابي (Mindplicit Video Station)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              رندر فائق السرعة عبر السيرفر (FFmpeg MP4) مع معالجة دقيقة لتزامن الترجمة العربية ومقاومة كاملة لتوقف المتصفح في الخلفية.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleExportSrt}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
              title="تصدير ملف الترجمة لاستخدامه في Premiere Pro أو CapCut"
            >
              <Subtitles className="h-4 w-4 text-amber-400" />
              <span>تصدير ملف الترجمة (.SRT)</span>
            </button>

            <button
              onClick={handleGenerateAI}
              disabled={isGeneratingPack}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:from-amber-400 hover:to-amber-500 transition-all disabled:opacity-50"
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
        <div className="lg:col-span-1 space-y-5">
          {/* Title Options */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span>خيارات العناوين الجذابة (High-CTR)</span>
              <span className="text-slate-500 font-normal">عناوين سيكولوجية</span>
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
                <span>الوصف مع الفصول الزمنية (Timestamps)</span>
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
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>

            <textarea
              readOnly
              value={publishData.description}
              rows={6}
              dir="ltr"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 font-mono focus:outline-none"
            />
          </div>

          {/* Pinned Comment & Tags */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
              <span className="flex items-center gap-1.5">
                <Pin className="h-4 w-4 text-amber-400" />
                <span>التعليق المثبت (Pinned Comment)</span>
              </span>
              <button
                onClick={() => copyText(publishData.pinned_comment, 'pinned_comment')}
                className="p-1 text-slate-400 hover:text-amber-400 transition-colors"
              >
                {copiedKey === 'pinned_comment' ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <p className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 text-xs text-slate-200">
              {publishData.pinned_comment}
            </p>
          </div>
        </div>

        {/* Right Column (2 spans): Advanced Video Render Engine & Controls */}
        <div className="lg:col-span-2 space-y-5">
          {/* Main Video Render Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Video className="h-4 w-4 text-amber-400" />
                <span>محرك رندر وتصدير الفيديو (Video Engine Studio)</span>
              </div>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded border border-amber-500/20">
                {renderEngine === 'server_ffmpeg' ? 'سيرفر FFmpeg فائق السرعة' : 'المتصفح المحلي'}
              </span>
            </div>

            {/* 1. Engine Choice (Server vs Local) */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                طريقة الرندر والترميز (Render Architecture):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setRenderEngine('server_ffmpeg')}
                  className={`text-right p-3 rounded-lg border transition-all ${
                    renderEngine === 'server_ffmpeg'
                      ? 'border-amber-400 bg-amber-500/10 shadow-sm'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Server className="h-4 w-4 text-amber-400" />
                      محرك السيرفر (FFmpeg MP4)
                    </span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      موصى به
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    أسرع بـ 8x أضعاف، ترميز H.264 حقيقي، لا يتوقف عند تصغير المتصفح أو العمل على برامج أخرى.
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isExportingVideo}
                  onClick={() => setRenderEngine('browser_canvas')}
                  className={`text-right p-3 rounded-lg border transition-all ${
                    renderEngine === 'browser_canvas'
                      ? 'border-amber-400 bg-amber-500/10 shadow-sm'
                      : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Laptop className="h-4 w-4 text-slate-400" />
                      محرك المتصفح المحلي (Canvas)
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                      احتياطي
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    تسجيل محلي بدون اتصال بالسيرفر، يتطلب إبقاء التبويب نشطاً أثناء عملية التسجيل.
                  </p>
                </button>
              </div>
            </div>

            {/* 2. Subtitle Pacing & Timing Calibration Controls */}
            {/* Directly resolves: "سرعة الترجمة عن نطق الكلمات" */}
            <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-amber-400" />
                  <span className="text-xs font-bold text-amber-300">
                    معايرة سرعة الترجمة والوقفات الصوتية (Subtitle Sync Calibration)
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  {timingOffset > 0 ? `+${timingOffset.toFixed(2)}ث تأخير` : `${timingOffset.toFixed(2)}ث`}
                </span>
              </div>

              <p className="text-[11px] text-slate-300 leading-relaxed">
                حل مشكلة تسارع ظهور الترجمة عن الصوت: يمكنك هنا ضبط تأخير انطلاق الترجمة الذهبية وتطابقها مع نطق الكلمات ووقفات الترقيم (`،` و `.`).
              </p>

              {/* Quick Offset Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                {[
                  { label: 'متزن وموصى به', val: 0.25, desc: '+0.25ث' },
                  { label: 'إلقاء بطيء متمهل', val: 0.45, desc: '+0.45ث' },
                  { label: 'إلقاء سريع وحماسي', val: 0.12, desc: '+0.12ث' },
                  { label: 'تزامن لحظي بدون تأخير', val: 0.0, desc: '0.00ث' },
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    disabled={isExportingVideo}
                    onClick={() => setTimingOffset(item.val)}
                    className={`py-1.5 px-2 rounded text-xs text-center border transition-all ${
                      Math.abs(timingOffset - item.val) < 0.01
                        ? 'border-amber-400 bg-amber-400 text-slate-950 font-bold'
                        : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>{item.label}</div>
                    <div className="text-[10px] opacity-80 font-mono">{item.desc}</div>
                  </button>
                ))}
              </div>

              {/* Slider for precision tuning */}
              <div className="pt-2 flex items-center gap-3">
                <span className="text-[11px] text-slate-400 shrink-0">أسرع (-0.2ث)</span>
                <input
                  type="range"
                  min="-0.2"
                  max="0.8"
                  step="0.05"
                  value={timingOffset}
                  disabled={isExportingVideo}
                  onChange={(e) => setTimingOffset(parseFloat(e.target.value))}
                  className="w-full accent-amber-400 cursor-pointer"
                />
                <span className="text-[11px] text-slate-400 shrink-0">أبطأ (+0.8ث)</span>
              </div>
            </div>

            {/* 3. Quality Preset Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-300">
                دقة وجودة الفيديو المطلوب (Video Quality):
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(Object.keys(QUALITY_PRESETS) as VideoQuality[]).map((qKey) => {
                  const q = QUALITY_PRESETS[qKey];
                  const isSelected = selectedQuality === qKey;

                  return (
                    <button
                      key={qKey}
                      type="button"
                      disabled={isExportingVideo}
                      onClick={() => setSelectedQuality(qKey)}
                      className={`text-right p-3 rounded-lg border transition-all ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500/10 shadow-sm'
                          : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isSelected ? 'bg-amber-400' : 'bg-slate-600'
                            }`}
                          />
                          {q.id === '1080p' ? '1080p Full HD' : q.id === '720p' ? '720p HD' : '480p SD'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {q.width}x{q.height} · {q.fps}fps
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Channel Branding & Watermark Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-lg border border-slate-800 bg-slate-950/90">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  اسم القناة في الشارة العلوية (Badge):
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

              <div className="flex items-center justify-between sm:pt-4">
                <div className="flex flex-col">
                  <span className="text-xs text-slate-300 font-medium">العلامة المائية السفلية</span>
                  <span className="text-[10px] text-slate-500">حماية شفافة بنسبة 35%</span>
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

            {/* 5. Scene Selection Mode */}
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'first3', label: '⚡ تجربة سريعة (3 مشاهد)' },
                  { id: 'first5', label: 'أول 5 مشاهد' },
                  { id: 'all', label: `الكل (${allScenes.length} مشهد)` },
                  { id: 'custom_count', label: '🔢 عدد مخصص' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    disabled={isExportingVideo}
                    onClick={() => setSceneSelectionMode(m.id as SceneSelectionMode)}
                    className={`text-center py-2 px-2 rounded text-xs font-medium border transition-all ${
                      sceneSelectionMode === m.id
                        ? 'bg-amber-400 text-slate-950 font-bold border-amber-400 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

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
            </div>

            {/* Background Working Resilience Alert */}
            <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-white">العمل في الخلفية مفعل: </span>
                {renderEngine === 'server_ffmpeg' ? (
                  <span>
                    الرندر ينفذ بالكامل على السيرفر، يمكنك الآن تصغير المتصفح، التبديل بين البرامج، أو تصفح مواقع أخرى دون أي قلق من توقف الرندر أو تشتت مزامنة الصوت!
                  </span>
                ) : (
                  <span>
                    عند استخدام المحرك المحلي، يفضل إبقاء التبويب ظاهراً للحفاظ على استقرار مؤقتات الصوت والصورة.
                  </span>
                )}
              </div>
            </div>

            {/* Stats summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 block">المشاهد المحددة</span>
                <span className="font-mono tabular-nums font-bold text-amber-400 text-sm">
                  {selectedScenes.length} مشهد
                </span>
              </div>
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 block">الصوتيات الجاهزة</span>
                <span className="font-mono tabular-nums font-bold text-emerald-400 text-sm">
                  {selectedReadyAudioCount} / {selectedScenes.length}
                </span>
              </div>
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 block">المدة الإجمالية</span>
                <span className="font-mono tabular-nums text-slate-200 text-sm">
                  {Math.round(selectedTotalDuration)} ثانية
                </span>
              </div>
              <div className="p-2.5 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span className="text-[10px] text-slate-500 block">الدقة والصيغة</span>
                <span className="font-mono text-amber-400 font-bold text-sm">
                  {QUALITY_PRESETS[selectedQuality].width}p · MP4
                </span>
              </div>
            </div>

            {/* Render Progress or Buttons */}
            {isExportingVideo ? (
              <div className="space-y-3 pt-2">
                <div className="space-y-2 p-4 bg-slate-950 rounded-xl border border-amber-500/30">
                  <div className="flex justify-between text-xs text-slate-200">
                    <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>{renderProgress?.statusText || 'جارِ الرندر على السيرفر...'}</span>
                    </span>
                    <span className="font-mono font-bold text-amber-400 text-sm">
                      {renderProgress?.percent || 0}%
                    </span>
                  </div>

                  <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 rounded-full transition-all duration-300"
                      style={{ width: `${renderProgress?.percent || 0}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>
                      المشهد {renderProgress?.currentSceneIndex || 0} من {renderProgress?.totalScenes || selectedScenes.length}
                    </span>
                    <span>
                      {renderProgress?.currentTimeSec || 0}ث / {renderProgress?.totalTimeSec || Math.round(selectedTotalDuration)}ث
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleAbortRender}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-600/40 text-xs font-semibold transition-colors"
                >
                  <StopCircle className="h-4 w-4" />
                  <span>إلغاء عملية الرندر</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartRender}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 hover:from-amber-300 hover:to-amber-200 text-slate-950 font-bold text-sm shadow-xl transition-all active:scale-[0.99]"
              >
                <Film className="h-4 w-4 text-slate-950" />
                <span>
                  بدء رندر {selectedScenes.length} مشهد ({Math.round(selectedTotalDuration)}ث) عبر {renderEngine === 'server_ffmpeg' ? 'سيرفر FFmpeg (MP4)' : 'المتصفح'}
                </span>
              </button>
            )}

            {/* Error Message */}
            {renderError && (
              <div className="p-3.5 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <span>{renderError}</span>
              </div>
            )}

            {/* Completed Rendered Video Preview & Download */}
            {renderedResult && !isExportingVideo && (
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>تم رندر وتصدير الفيديو بنجاح بصيغة MP4 القياسية!</span>
                  </div>
                  <span className="font-mono text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded">
                    جاهز للمعاينة والمشاركة
                  </span>
                </div>

                {/* Embedded Video Preview Player with Full Seek Controls */}
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video relative shadow-2xl">
                  <video
                    src={renderedResult.url}
                    controls
                    playsInline
                    preload="auto"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 font-mono p-2 bg-slate-950 rounded border border-slate-800">
                  <span>حجم الملف: {(renderedResult.sizeBytes / (1024 * 1024)).toFixed(2)} MB</span>
                  <span>المدة: {Math.round(renderedResult.durationSec)} ثانية</span>
                  <span className="text-amber-400">صيغة: {renderedResult.mimeType}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleManualDownload}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-colors shadow-lg"
                  >
                    <Download className="h-4 w-4" />
                    <span>تحميل فيديو MP4 النهائي</span>
                  </button>

                  <button
                    onClick={handleExportSrt}
                    className="flex items-center gap-2 py-3 px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
                    title="تحميل ملف الترجمة .SRT"
                  >
                    <Subtitles className="h-4 w-4 text-amber-400" />
                    <span>تحميل الترجمة SRT</span>
                  </button>

                  <button
                    onClick={handleStartRender}
                    className="p-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    title="إعادة الرندر"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
