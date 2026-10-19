'use client';

import React from 'react';
import { Sparkles, HardDrive, Download } from 'lucide-react';

interface TopNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  projectTitle: string;
  totalScenes: number;
  audioReadyCount: number;
  onQuickSave: () => void;
  isSaving: boolean;
}

export function TopNav({
  activeTab,
  setActiveTab,
  projectTitle,
  totalScenes,
  audioReadyCount,
  onQuickSave,
  isSaving,
}: TopNavProps) {
  const tabs = [
    { id: 'audio', label: 'مركز الصوتيات (TTS)' },
    { id: 'media', label: 'مكتبة الصور' },
    { id: 'timeline', label: 'المشغل والتايم لاين' },
    { id: 'ai-memory', label: 'الذاكرة الذكية والتحليل' },
    { id: 'publish', label: 'حزمة النشر والتصدير' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
        {/* Zone 1: Single Brand wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              Mindplicit Studio
            </span>
            <span className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-[280px]">
              {projectTitle || 'استوديو الفيديوهات السيكولوجية'}
            </span>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden lg:flex items-center gap-1">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'bg-slate-800 text-amber-400 border border-slate-700 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 Primary Action & Storage Status */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 font-mono">
            <HardDrive className="h-3.5 w-3.5 text-slate-500" />
            <span className="tabular-nums">
              صوت {audioReadyCount}/{totalScenes}
            </span>
          </div>

          <button
            onClick={onQuickSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm active:scale-95 disabled:opacity-60"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isSaving ? 'جارِ الحفظ...' : 'حفظ في الذاكرة'}</span>
          </button>
        </div>
      </div>

      {/* Mobile navigation tab strip */}
      <div className="flex lg:hidden overflow-x-auto border-t border-slate-800/80 px-2 py-1.5 gap-1 bg-slate-900/50 scrollbar-none">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                isActive
                  ? 'bg-slate-800 text-amber-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </header>
  );
}
