'use client';

import React, { useState, useEffect } from 'react';
import { ProjectData, Scene } from '@/types/project';
import { getStorageEstimate } from '@/lib/db';
import {
  Brain,
  HardDrive,
  Download,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Gauge,
  TrendingUp,
  FileText,
  Loader2,
  Zap,
} from 'lucide-react';

interface AIMemoryPanelProps {
  project: ProjectData;
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  onImportProject: (imported: ProjectData) => void;
}

export function AIMemoryPanel({
  project,
  onUpdateScene,
  onImportProject,
}: AIMemoryPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [storageInfo, setStorageInfo] = useState<string>('جارِ الفحص...');
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Load storage usage info
  useEffect(() => {
    getStorageEstimate().then((info) => {
      setStorageInfo(info.formatted);
    });
  }, [project]);

  // Run AI Analysis via Gemini
  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    setAnalysisError(null);

    try {
      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze_project',
          projectData: project,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'فشل التحليل الذكي');
      }

      setAnalysisResult(data.analysis);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setAnalysisError(err?.message || 'تعذر تشغيل التحليل بالذكاء الاصطناعي');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Export Project JSON
  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${project.project.title.slice(0, 30)}_Mindplicit_Project.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  // Import Project JSON
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        onImportProject(parsed);
      } catch (err) {
        alert('الملف المختار غير صالح');
      }
    };
    reader.readAsText(file);
  };

  const scenes = project.chapters[0]?.scenes || [];
  const totalAudioCount = scenes.filter((s) => s.audio_status === 'ready').length;
  const totalImageCount = scenes.filter((s) => s.image_status === 'ready').length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Brain className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                الذاكرة الذكية والمحلل السيكولوجي (AI Memory & Neural Analytics)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              تحليل سيكولوجي ذكي للبنية الدرامية والإيقاع عبر Gemini 3.8 Flash، وإدارة الذاكرة الخارجية التراكمية.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRunAnalysis}
              disabled={isAnalyzing}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm disabled:opacity-60"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جارِ تحليل السيناريو...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>تحليل السيناريو بالذكاء الاصطناعي</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Memory Stats Grid */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-slate-800">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <HardDrive className="h-3.5 w-3.5 text-amber-400" />
              <span>استهلاك الذاكرة المحلية</span>
            </div>
            <div className="text-sm font-bold text-slate-200 font-mono">{storageInfo}</div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <span>الملفات الصوتية المخزنة</span>
            </div>
            <div className="text-sm font-bold text-emerald-400 font-mono tabular-nums">
              {totalAudioCount} / {scenes.length}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
              <span>الصور المكتملة</span>
            </div>
            <div className="text-sm font-bold text-blue-400 font-mono tabular-nums">
              {totalImageCount} / {scenes.length}
            </div>
          </div>

          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
              <Gauge className="h-3.5 w-3.5 text-purple-400" />
              <span>نموذج التحليل</span>
            </div>
            <div className="text-xs font-semibold text-purple-300 font-mono">Gemini 3.8 Flash</div>
          </div>
        </div>

        {analysisError && (
          <div className="mt-4 p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs text-red-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{analysisError}</span>
          </div>
        )}
      </div>

      {/* AI Analysis Cards */}
      {analysisResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pacing Score Card */}
            <div className="p-5 rounded-xl border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
              <div>
                <span className="text-xs text-slate-400">تقييم الإيقاع والاحتباس (Pacing Score)</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-amber-400 font-mono tabular-nums">
                    {analysisResult.pacing_score}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">/ 10</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-300 leading-relaxed">
                {analysisResult.pacing_critique}
              </p>
            </div>

            {/* Narrative Arc Card */}
            <div className="lg:col-span-2 p-5 rounded-xl border border-slate-800 bg-slate-900/60">
              <span className="text-xs text-slate-400">تحليل القوس الدرامي والسيكولوجي</span>
              <p className="mt-2 text-sm text-slate-200 leading-relaxed font-sans">
                {analysisResult.psychological_arc}
              </p>

              {analysisResult.key_themes && (
                <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400">المحاور السيكولوجية:</span>
                  {analysisResult.key_themes.map((theme: string, i: number) => (
                    <span
                      key={i}
                      className="text-xs font-medium text-amber-300/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Flagged scenes review */}
          {analysisResult.flagged_scenes && analysisResult.flagged_scenes.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>مشاهد مقترحة للتحسين وتخفيف الإطالة ({analysisResult.flagged_scenes.length})</span>
              </div>

              <div className="space-y-2.5">
                {analysisResult.flagged_scenes.map((flag: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-950 rounded-lg border border-slate-800/80 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between text-slate-400 font-mono">
                      <span>{flag.scene_id}</span>
                      <span className="text-amber-400/90">{flag.reason}</span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-slate-400 line-through text-[11px]" dir="ltr">
                        {flag.original}
                      </div>
                      <div className="text-emerald-300 font-medium" dir="ltr">
                        {flag.suggestion}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onUpdateScene(flag.scene_id, { narration_text: flag.suggestion });
                        alert(`تم تحديث نص المشهد ${flag.scene_id} بالصيغة المقترحة`);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition-colors"
                    >
                      تطبيق التعديل المقترح
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* External Memory Backup & Restore Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">النسخ الاحتياطي ونقل الذاكرة الخارجية</h3>
            <p className="text-xs text-slate-400">
              تصدير كافة بيانات السيناريو وحالات الصوت والوسائط كملف JSON مستقل لنقله أو استعادته لاحقاً.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              <span>تصدير ملف المشروع (JSON)</span>
            </button>

            <label className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer transition-colors">
              <Upload className="h-3.5 w-3.5 text-slate-400" />
              <span>استيراد ملف سابق</span>
              <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
