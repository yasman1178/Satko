'use client';

import React, { useState } from 'react';
import { ProjectData } from '@/types/project';
import { SAMPLE_CHAPTER_001 } from '@/lib/chapter-sample';
import { ProjectSchema } from '@/lib/schema';
import {
  FileCode,
  Sparkles,
  Upload,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';

interface ProjectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectLoaded: (project: ProjectData) => void;
}

export function ProjectImportModal({
  isOpen,
  onClose,
  onProjectLoaded,
}: ProjectImportModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Load Chapter 001 sample
  const handleLoadSample = () => {
    onProjectLoaded(SAMPLE_CHAPTER_001);
    onClose();
  };

  // Validate and load custom JSON file
  const handleFileProcess = (file: File) => {
    setValidationError(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);

        // Validate with Zod
        const result = ProjectSchema.safeParse(parsed);
        if (!result.success) {
          const firstError = result.error.issues?.[0]?.message || 'هيكل ملف JSON غير متطابق مع مواصفات البرنامج';
          setValidationError(`خطأ في هيكل الملف: ${firstError}`);
          return;
        }

        onProjectLoaded(result.data as ProjectData);
        onClose();
      } catch (err: any) {
        setValidationError('الملف ليس بصيغة JSON صالحة. يرجى التأكد من خلوه من أخطاء الصياغة.');
      }
    };

    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="space-y-1 text-center sm:text-right">
          <div className="flex items-center justify-center sm:justify-start gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FolderOpen className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              استيراد أو بدء مشروع الفصل (Chapter Setup)
            </h2>
          </div>
          <p className="text-xs text-slate-400">
            ابدأ فوراً بتحميل ملف الفصل الأول المرفق (33 مشهداً)، أو ارفع ملف سيناريو JSON مخصص من أبحاثك.
          </p>
        </div>

        {/* Primary Option: 1-Click Load Chapter 001 */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 relative overflow-hidden">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-bold text-amber-300">
                  ملف الشابتر المرفق: The Phantom Alteration (الفصل 1)
                </h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                يحتوي على 33 مشهداً مكتوباً بعناية في سيكولوجيا التشكيك في الذاكرة ومواجهة التلاعب، مع برومبتات باروكية جاهزة ونمط حركة محدد.
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] font-mono text-slate-400">
                <span>33 مشهداً</span>
                <span>·</span>
                <span>الصوت: en-GB-RyanNeural</span>
                <span>·</span>
                <span>نسبة 16:9</span>
              </div>
            </div>

            <button
              onClick={handleLoadSample}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all active:scale-95 shrink-0"
            >
              <span>تحميل والبدء فوراً</span>
              <ArrowRight className="h-4 w-4 rotate-180" />
            </button>
          </div>
        </div>

        {/* Secondary Option: Drag & Drop Custom JSON */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-300">
            أو ارفع ملف JSON فصلي آخر من جهازك:
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
              dragActive
                ? 'border-amber-400 bg-amber-400/5'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
            }`}
          >
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => e.target.files?.[0] && handleFileProcess(e.target.files[0])}
              className="hidden"
              id="json-file-input"
            />
            <label htmlFor="json-file-input" className="cursor-pointer flex flex-col items-center">
              <Upload className="h-7 w-7 text-slate-500 mb-2" />
              <span className="text-xs font-medium text-slate-200">
                اسحب ملف الـ JSON هنا، أو انقر للاختيار من جهازك
              </span>
              <span className="text-[11px] text-slate-500 mt-1 font-mono">
                يدعم بنية: project, chapters, scenes
              </span>
            </label>
          </div>
        </div>

        {validationError && (
          <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
          <span className="text-slate-500 font-mono">Mindplicit Studio Engine v1.0</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-slate-400 hover:text-slate-200 transition-colors"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
