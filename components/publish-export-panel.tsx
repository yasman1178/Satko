'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface PublishExportPanelProps {
  project: ProjectData;
  onUpdatePublish: (publish: PublishInfo) => void;
}

export function PublishExportPanel({ project, onUpdatePublish }: PublishExportPanelProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isGeneratingPack, setIsGeneratingPack] = useState(false);
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

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

  // Simulated browser video render pipeline
  const handleRenderVideo = () => {
    setIsExportingVideo(true);
    setExportProgress(10);

    const interval = setInterval(() => {
      setExportProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsExportingVideo(false);
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
          return 100;
        }
        return prev + 15;
      });
    }, 400);
  };

  const scenes = project.chapters[0]?.scenes || [];
  const readyAudioCount = scenes.filter((s) => s.audio_status === 'ready').length;
  const totalDuration = scenes.reduce((sum, s) => sum + (s.duration_seconds || 4), 0);

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
              عناوين مدروسة لزيادة نسبة النقر (CTR)، وصف مُحسّن لمحركات البحث، تاجات، وبرومبت الغلاف المصغر.
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

        {/* Right Column: Tags, Thumbnail Prompt, & Video Render */}
        <div className="space-y-5">
          {/* Video Render Card */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Video className="h-4 w-4 text-amber-400" />
              <span>جاهزية التصدير (Video Assembly)</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>المشاهد الصوتية</span>
                <span className="font-mono tabular-nums font-bold text-amber-400">
                  {readyAudioCount} / {scenes.length}
                </span>
              </div>
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>المدة الإجمالية</span>
                <span className="font-mono tabular-nums text-slate-200">
                  {Math.floor(totalDuration / 60)} د و {Math.round(totalDuration % 60)} ث
                </span>
              </div>
              <div className="flex justify-between p-2 bg-slate-950 rounded border border-slate-800 text-slate-300">
                <span>الدقة والنسبة</span>
                <span className="font-mono text-slate-200">1080p (16:9)</span>
              </div>
            </div>

            {isExportingVideo ? (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>جارِ تجميع وتركيب الفيديو...</span>
                  <span className="font-mono font-bold text-amber-400">{exportProgress}%</span>
                </div>
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-300"
                    style={{ width: `${exportProgress}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={handleRenderVideo}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
              >
                <Film className="h-4 w-4" />
                <span>بدء رندر وتصدير الفيديو (Render MP4)</span>
              </button>
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
