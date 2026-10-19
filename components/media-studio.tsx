/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState, useRef } from 'react';
import { Scene } from '@/types/project';
import { saveImageToDB } from '@/lib/db';
import {
  Image as ImageIcon,
  Upload,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Eye,
  Filter,
  ArrowRight,
  Sparkles,
  Layers,
  HelpCircle,
} from 'lucide-react';

interface MediaStudioProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
  onBulkUpdateScenes?: (updatesMap: Map<string, Partial<Scene>>) => void;
}

interface StagedImageMatch {
  file: File;
  previewUrl: string;
  matchedSceneId: string | null;
  matchReason: string;
  isConfirmed: boolean;
}

export function MediaStudio({ scenes, onUpdateScene, onBulkUpdateScenes }: MediaStudioProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'ready'>('all');
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Staged files confirmation modal
  const [stagedMatches, setStagedMatches] = useState<StagedImageMatch[] | null>(null);
  const [isApplyingMatches, setIsApplyingMatches] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const matchedCount = scenes.filter((s) => s.image_status === 'ready' && s.image_url).length;
  const missingCount = scenes.length - matchedCount;

  // Ultra-smart matching logic
  const matchFileToScene = (file: File): { sceneId: string | null; reason: string } => {
    const rawName = file.name.trim();
    const lowerName = rawName.toLowerCase();
    const nameWithoutExt = lowerName.replace(/\.[^/.]+$/, '');

    // 1. Direct match with image_filename
    const directScene = scenes.find(
      (s) => s.image_filename.toLowerCase() === lowerName || s.image_filename.toLowerCase().replace(/\.[^/.]+$/, '') === nameWithoutExt
    );
    if (directScene) {
      return { sceneId: directScene.scene_id, reason: 'تطابق تام مع اسم الملف' };
    }

    // 2. Direct match with scene_id (e.g. scene_001)
    const idScene = scenes.find((s) => s.scene_id.toLowerCase() === nameWithoutExt);
    if (idScene) {
      return { sceneId: idScene.scene_id, reason: 'تطابق مع معرّف المشهد' };
    }

    // 3. Extract all digits from filename (e.g. "scene_001.png" -> 1, "001.png" -> 1, "imagefx_12.jpg" -> 12)
    const numbers = lowerName.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      // Test the last or primary number in the name
      for (const numStr of numbers) {
        const num = parseInt(numStr, 10);
        if (num >= 1 && num <= scenes.length) {
          // Look for scene with matching padded id or index
          const paddedId = `scene_${String(num).padStart(3, '0')}`;
          const numScene = scenes.find((s) => s.scene_id === paddedId) || scenes[num - 1];
          if (numScene) {
            return { sceneId: numScene.scene_id, reason: `تطابق رقمي (المشهد ${num})` };
          }
        }
      }
    }

    return { sceneId: null, reason: 'لم يتم التعرف التلقائي' };
  };

  // Process incoming files from input or drag-drop
  const handleIncomingFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp|jfif|avif)$/i.test(f.name));
    if (files.length === 0) {
      setUploadFeedback('يرجى اختيار ملفات صور صالحة (PNG أو JPG أو WebP)');
      setTimeout(() => setUploadFeedback(null), 4000);
      return;
    }

    // Sort files naturally by name so 1, 2, ... 33 order is respected
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    const staged: StagedImageMatch[] = files.map((file, idx) => {
      let match = matchFileToScene(file);

      // If no match found by name, and user provided files equal or close to scene count, suggest index order
      if (!match.sceneId && idx < scenes.length) {
        match = {
          sceneId: scenes[idx].scene_id,
          reason: `تطابق حسب الترتيب التسلسلي (${idx + 1})`,
        };
      }

      return {
        file,
        previewUrl: URL.createObjectURL(file),
        matchedSceneId: match.sceneId,
        matchReason: match.reason,
        isConfirmed: true,
      };
    });

    setStagedMatches(staged);
  };

  // Apply confirmed matches into IndexedDB and project state
  const handleConfirmMatches = async () => {
    if (!stagedMatches || stagedMatches.length === 0) return;

    setIsApplyingMatches(true);
    const updatesMap = new Map<string, Partial<Scene>>();
    let count = 0;

    for (const match of stagedMatches) {
      if (!match.matchedSceneId || !match.isConfirmed) continue;

      const targetScene = scenes.find((s) => s.scene_id === match.matchedSceneId);
      if (targetScene) {
        const objectUrl = await saveImageToDB(targetScene.image_filename, match.file);
        updatesMap.set(targetScene.scene_id, {
          image_url: objectUrl,
          image_status: 'ready',
        });
        count++;
      }
    }

    if (onBulkUpdateScenes) {
      onBulkUpdateScenes(updatesMap);
    } else {
      updatesMap.forEach((updates, sceneId) => {
        onUpdateScene(sceneId, updates);
      });
    }

    setIsApplyingMatches(false);
    setStagedMatches(null);
    setUploadFeedback(`تمت مطابقة وتثبيت ${count} صورة بنجاح في الذاكرة الدائمة!`);
    setTimeout(() => setUploadFeedback(null), 5000);
  };

  const copyPrompt = (scene: Scene) => {
    navigator.clipboard.writeText(scene.image_prompt_en);
    setCopiedId(scene.scene_id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const filteredScenes = scenes.filter((s) => {
    if (filterMode === 'missing') return s.image_status !== 'ready';
    if (filterMode === 'ready') return s.image_status === 'ready';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Drag & Drop Area */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-sm space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <ImageIcon className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-bold text-white tracking-tight">
                مكتبة صور المشاهد (Visual Assets & Prompts)
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              ارفع صور المشاهد الـ 33 المولدة خارجياً (ImageFX أو Midjourney)، مع مطابقة ذكية بالرقم والاسم والترتيب ونافذة مراجعة فورية.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shadow-sm active:scale-95"
            >
              <Upload className="h-4 w-4" />
              <span>اختيار ورفع الصور (Browse Files)</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.png,.jpg,.jpeg,.webp,.jfif,.avif"
              onChange={(e) => e.target.files && handleIncomingFiles(e.target.files)}
              className="hidden"
            />
          </div>
        </div>

        {/* Big Interactive Drag & Drop Box */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleIncomingFiles(e.dataTransfer.files);
            }
          }}
          className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
            isDragOver
              ? 'border-amber-400 bg-amber-400/10 scale-[1.01]'
              : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center justify-center space-y-2">
            <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-amber-400">
              <Upload className="h-5 w-5" />
            </div>
            <div className="text-xs font-semibold text-slate-200">
              اسحب وأفلت كل صور المشاهد هنا دفعة واحدة
            </div>
            <div className="text-[11px] text-slate-400 max-w-md">
              يتعرف البرنامج تلقائياً على أرقام المشاهد سواء كانت التسمية <code className="text-amber-300">scene_001.png</code> أو <code className="text-amber-300">001.png</code> أو <code className="text-amber-300">1.png</code> أو حتى الترتيب المباشر.
            </div>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">الصور المتطابقة</span>
            <span className="text-sm font-bold text-emerald-400 font-mono tabular-nums">
              {matchedCount} من {scenes.length}
            </span>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">الصور المتبقية</span>
            <span className="text-sm font-bold text-amber-400 font-mono tabular-nums">
              {missingCount}
            </span>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-400">الأبعاد المعتمدة</span>
            <span className="text-xs font-medium text-slate-300 font-mono">16:9 شاشة عريضة</span>
          </div>
        </div>

        {uploadFeedback && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-950/80 border border-emerald-800 p-3 text-xs text-emerald-200 shadow-md">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{uploadFeedback}</span>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterMode === 'all'
                ? 'bg-slate-800 text-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            جميع المشاهد ({scenes.length})
          </button>
          <button
            onClick={() => setFilterMode('missing')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterMode === 'missing'
                ? 'bg-slate-800 text-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            الصور الناقصة ({missingCount})
          </button>
          <button
            onClick={() => setFilterMode('ready')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filterMode === 'ready'
                ? 'bg-slate-800 text-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            الصور الجاهزة ({matchedCount})
          </button>
        </div>

        <span className="text-xs text-slate-500 font-mono">
          نمط الرسم: Dark Baroque Oil Painting
        </span>
      </div>

      {/* Grid of scenes */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredScenes.map((scene) => {
          const isReady = scene.image_status === 'ready' && scene.image_url;
          const isCopied = copiedId === scene.scene_id;

          return (
            <div
              key={scene.scene_id}
              className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden hover:border-slate-700 transition-all"
            >
              {/* Image Frame (16:9) */}
              <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center border-b border-slate-800/80 overflow-hidden group">
                {isReady ? (
                  <img
                    src={scene.image_url}
                    alt={scene.scene_id}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4 text-center">
                    <div className="h-10 w-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-2">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-mono text-slate-400">{scene.image_filename}</span>
                    <span className="text-[11px] text-amber-500/80 mt-1">بانتظار رفع الصورة</span>
                  </div>
                )}

                {/* Overlays */}
                <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-mono text-slate-300 border border-slate-800">
                  {scene.scene_id}
                </div>

                <div className="absolute top-2 left-2 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-amber-400 border border-slate-800">
                  {scene.motion}
                </div>

                {isReady && (
                  <button
                    onClick={() => setPreviewScene(scene)}
                    className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-1.5 text-xs font-medium"
                  >
                    <Eye className="h-4 w-4" />
                    <span>معاينة مكبرة</span>
                  </button>
                )}
              </div>

              {/* Card Body */}
              <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-400 font-sans line-clamp-2" dir="ltr">
                    &ldquo;{scene.narration_text}&rdquo;
                  </div>
                </div>

                {/* Prompt Preview & Copy Button */}
                <div className="space-y-2 pt-2 border-t border-slate-800/60">
                  <div className="text-[11px] text-slate-400 line-clamp-2 italic font-serif text-slate-300" dir="ltr">
                    {scene.image_prompt_en}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => copyPrompt(scene)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">تم النسخ</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                          <span>نسخ البرومبت</span>
                        </>
                      )}
                    </button>

                    <label className="flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-colors">
                      <span>تغيير</span>
                      <input
                        type="file"
                        accept="image/*,.png,.jpg,.jpeg,.webp"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const url = await saveImageToDB(scene.image_filename, file);
                            onUpdateScene(scene.scene_id, {
                              image_url: url,
                              image_status: 'ready',
                            });
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation & Matching Review Modal */}
      {stagedMatches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="space-y-0.5">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-amber-400" />
                  <span>مراجعة وتأكيد مطابقة الصور المرفوعة ({stagedMatches.length} ملف)</span>
                </h3>
                <p className="text-xs text-slate-400">
                  راجع مطابقة كل ملف بالمشهد المقابل له، ويمكنك إعادة التعيين اليدوي لأي صورة قبل الحفظ في الذاكرة.
                </p>
              </div>

              <button
                onClick={() => setStagedMatches(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-300"
              >
                إلغاء
              </button>
            </div>

            {/* Modal Table Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-2">
              <div className="grid grid-cols-12 text-[11px] font-semibold text-slate-400 px-3 pb-2 border-b border-slate-800">
                <span className="col-span-1">معاينة</span>
                <span className="col-span-4">اسم الملف المرفوع</span>
                <span className="col-span-4">المشهد المرتبط</span>
                <span className="col-span-3 text-left">سبب المطابقة</span>
              </div>

              {stagedMatches.map((item, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-center gap-2 p-2.5 bg-slate-950/70 rounded-lg border border-slate-800/80 hover:border-slate-700 text-xs"
                >
                  {/* Thumbnail */}
                  <div className="col-span-1">
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="h-9 w-12 object-cover rounded bg-black border border-slate-800"
                    />
                  </div>

                  {/* File Name */}
                  <div className="col-span-4 truncate font-mono text-slate-300" title={item.file.name}>
                    {item.file.name}
                  </div>

                  {/* Matched Scene Dropdown */}
                  <div className="col-span-4">
                    <select
                      value={item.matchedSceneId || ''}
                      onChange={(e) => {
                        const newId = e.target.value || null;
                        setStagedMatches((prev) =>
                          prev
                            ? prev.map((m, i) =>
                                i === idx ? { ...m, matchedSceneId: newId, matchReason: 'تم التعيين يدوياً' } : m
                              )
                            : null
                        );
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
                    >
                      <option value="">-- غير مرتبط --</option>
                      {scenes.map((sc, sIdx) => (
                        <option key={sc.scene_id} value={sc.scene_id}>
                          {sc.scene_id} - المشهد {sIdx + 1} ({sc.image_filename})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Match Reason */}
                  <div className="col-span-3 text-left">
                    <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                      {item.matchReason}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                المشاهد الجاهزة للربط:{' '}
                <span className="font-bold text-amber-400 font-mono">
                  {stagedMatches.filter((m) => m.matchedSceneId).length} من {stagedMatches.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStagedMatches(null)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
                >
                  إلغاء
                </button>

                <button
                  onClick={handleConfirmMatches}
                  disabled={isApplyingMatches}
                  className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-md transition-all active:scale-95 disabled:opacity-60"
                >
                  {isApplyingMatches ? (
                    <span>جارِ الحفظ في الذاكرة...</span>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>تأكيد وتثبيت الصور في الذاكرة</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {previewScene && previewScene.image_url && (
        <div
          onClick={() => setPreviewScene(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-4xl w-full rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl"
          >
            <div className="aspect-video w-full bg-black">
              <img
                src={previewScene.image_url}
                alt={previewScene.scene_id}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="p-4 flex items-center justify-between text-xs text-slate-300">
              <span className="font-mono">{previewScene.scene_id} · {previewScene.image_filename}</span>
              <button
                onClick={() => setPreviewScene(null)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
