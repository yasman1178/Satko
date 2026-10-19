/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useState } from 'react';
import { Scene } from '@/types/project';
import { saveImageToDB } from '@/lib/db';
import {
  Image as ImageIcon,
  Upload,
  Copy,
  Check,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Eye,
  Filter,
} from 'lucide-react';

interface MediaStudioProps {
  scenes: Scene[];
  onUpdateScene: (sceneId: string, updates: Partial<Scene>) => void;
}

export function MediaStudio({ scenes, onUpdateScene }: MediaStudioProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'missing' | 'ready'>('all');
  const [previewScene, setPreviewScene] = useState<Scene | null>(null);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  const matchedCount = scenes.filter((s) => s.image_status === 'ready' && s.image_url).length;
  const missingCount = scenes.length - matchedCount;

  // Handle batch image upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let matched = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const normalizedName = file.name.toLowerCase().trim();

      // Find matching scene by filename or scene_id
      const matchedScene = scenes.find((s) => {
        const sceneFile = s.image_filename.toLowerCase().trim();
        const sceneNum = s.scene_id.replace('scene_', '').padStart(3, '0');
        return (
          normalizedName === sceneFile ||
          normalizedName.startsWith(`scene_${sceneNum}`) ||
          normalizedName.startsWith(`scene_${parseInt(sceneNum, 10)}`) ||
          normalizedName === `${s.scene_id}.png` ||
          normalizedName === `${s.scene_id}.jpg`
        );
      });

      if (matchedScene) {
        const objectUrl = await saveImageToDB(matchedScene.image_filename, file);
        onUpdateScene(matchedScene.scene_id, {
          image_url: objectUrl,
          image_status: 'ready',
        });
        matched++;
      }
    }

    setUploadFeedback(`تمت مطابقة وحفظ ${matched} صورة بنجاح في الذاكرة الدائمة`);
    setTimeout(() => setUploadFeedback(null), 4000);
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
      {/* Top Banner & Batch Uploader */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
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
              ارفع صور المشاهد المولدة خارجياً (ImageFX أو Midjourney) مع مطابقة فورية بالأسماء، أو انسخ نصوص التوليد الباروكية.
            </p>
          </div>

          {/* Upload Button Area */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer shadow-sm active:scale-95">
              <Upload className="h-4 w-4" />
              <span>رفع صور جماعية (Folder / Multi-files)</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-800">
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
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-950/60 border border-emerald-800/80 p-2.5 text-xs text-emerald-200">
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
              {/* Image Frame (16:9) with graceful fallback */}
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

                {/* Top overlay pills/tags - rendered cleanly */}
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
                        accept="image/png,image/jpeg,image/webp"
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
