'use client';

import React, { useState, useEffect } from 'react';
import { ProjectData, Scene, PublishInfo } from '@/types/project';
import { SAMPLE_CHAPTER_001 } from '@/lib/chapter-sample';
import {
  saveProjectToDB,
  getProjectFromDB,
  getAllAudioFromDB,
  getAllImagesFromDB,
} from '@/lib/db';
import { TopNav } from '@/components/top-nav';
import { AudioLab } from '@/components/audio-lab';
import { MediaStudio } from '@/components/media-studio';
import { TimelinePlayer } from '@/components/timeline-player';
import { AIMemoryPanel } from '@/components/ai-memory-panel';
import { PublishExportPanel } from '@/components/publish-export-panel';
import { ProjectImportModal } from '@/components/project-import-modal';
import {
  FolderOpen,
  Volume2,
  Film,
  HardDrive,
  Sparkles,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';

export default function Home() {
  const [project, setProject] = useState<ProjectData>(SAMPLE_CHAPTER_001);
  const [activeTab, setActiveTab] = useState<string>('audio');
  const [activeSceneIndex, setActiveSceneIndex] = useState<number>(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Restore project state and cached audio/images from IndexedDB on startup
  useEffect(() => {
    async function loadInitialData() {
      try {
        const savedProject = await getProjectFromDB('default_project');
        const audioMap = await getAllAudioFromDB();
        const imageMap = await getAllImagesFromDB();

        const baseProject = savedProject || SAMPLE_CHAPTER_001;

        // Merge cached audio and images into scenes
        const updatedChapters = baseProject.chapters.map((ch) => ({
          ...ch,
          scenes: ch.scenes.map((sc) => {
            const cachedAudio = audioMap.get(sc.scene_id);
            const cachedImage = imageMap.get(sc.image_filename);
            return {
              ...sc,
              audio_url: cachedAudio?.url || sc.audio_url,
              duration_seconds: cachedAudio?.duration || sc.duration_seconds,
              audio_status: cachedAudio?.url ? 'ready' : sc.audio_status || 'idle',
              audio_voice: cachedAudio?.voice || sc.audio_voice,
              image_url: cachedImage || sc.image_url,
              image_status: cachedImage ? 'ready' : sc.image_status || 'missing',
            };
          }),
        }));

        setProject({
          ...baseProject,
          chapters: updatedChapters,
        });
      } catch (err) {
        console.warn('Could not restore from IndexedDB:', err);
      }
    }

    loadInitialData();
  }, []);

  // Update a single scene
  const handleUpdateScene = (sceneId: string, updates: Partial<Scene>) => {
    setProject((prev) => {
      const updatedChapters = prev.chapters.map((ch) => ({
        ...ch,
        scenes: ch.scenes.map((sc) =>
          sc.scene_id === sceneId ? { ...sc, ...updates } : sc
        ),
      }));
      return { ...prev, chapters: updatedChapters };
    });
  };

  // Update all scenes in the active chapter
  const handleScenesUpdated = (updatedScenes: Scene[]) => {
    setProject((prev) => {
      const updatedChapters = prev.chapters.map((ch, idx) =>
        idx === 0 ? { ...ch, scenes: updatedScenes } : ch
      );
      return { ...prev, chapters: updatedChapters };
    });
  };

  // Change voice model
  const handleVoiceChange = (voice: string) => {
    setProject((prev) => ({
      ...prev,
      project: { ...prev.project, voice },
    }));
  };

  // Update publish metadata
  const handleUpdatePublish = (publish: PublishInfo) => {
    setProject((prev) => ({ ...prev, publish }));
  };

  // Quick save to IndexedDB
  const handleQuickSave = async () => {
    setIsSaving(true);
    try {
      await saveProjectToDB(project);
      setSaveSuccessMsg('تم حفظ تقدم المشروع في الذاكرة الدائمة بنجاح');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk update multiple scenes at once (e.g. from image matching)
  const handleBulkUpdateScenes = (updatesMap: Map<string, Partial<Scene>>) => {
    setProject((prev) => {
      const updatedChapters = prev.chapters.map((ch) => ({
        ...ch,
        scenes: ch.scenes.map((sc) => {
          const updates = updatesMap.get(sc.scene_id);
          return updates ? { ...sc, ...updates } : sc;
        }),
      }));
      return { ...prev, chapters: updatedChapters };
    });
  };

  // Load a new project (e.g. from JSON file or modal)
  const handleProjectLoaded = async (newProject: ProjectData) => {
    try {
      const audioMap = await getAllAudioFromDB();
      const imageMap = await getAllImagesFromDB();

      const mergedChapters = newProject.chapters.map((ch) => ({
        ...ch,
        scenes: ch.scenes.map((sc) => {
          const cachedAudio = audioMap.get(sc.scene_id);
          const cachedImage = imageMap.get(sc.image_filename);
          return {
            ...sc,
            audio_url: cachedAudio?.url || sc.audio_url,
            duration_seconds: cachedAudio?.duration || sc.duration_seconds,
            audio_status: cachedAudio?.url ? 'ready' : sc.audio_status || 'idle',
            audio_voice: cachedAudio?.voice || sc.audio_voice,
            image_url: cachedImage || sc.image_url,
            image_status: cachedImage ? 'ready' : sc.image_status || 'missing',
          };
        }),
      }));

      const mergedProject = { ...newProject, chapters: mergedChapters };
      setProject(mergedProject);
      setActiveSceneIndex(0);
      await saveProjectToDB(mergedProject);
      setSaveSuccessMsg('تم تحميل المشروع ومطابقة الوسائط المحفوظة بنجاح');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch {
      setProject(newProject);
      setActiveSceneIndex(0);
      saveProjectToDB(newProject);
    }
  };

  const scenes = project.chapters[0]?.scenes || [];
  const audioReadyCount = scenes.filter((s) => s.audio_status === 'ready' && s.audio_url).length;
  const imageReadyCount = scenes.filter((s) => s.image_status === 'ready' && s.image_url).length;
  const totalAudioDurationSec = scenes.reduce((acc, s) => acc + (s.duration_seconds || 4), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <TopNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        projectTitle={project.project.title}
        totalScenes={scenes.length}
        audioReadyCount={audioReadyCount}
        onQuickSave={handleQuickSave}
        isSaving={isSaving}
      />

      {/* Main Studio Viewport */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Project Header Bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded">
                الفصل 1: {project.chapters[0]?.title || 'The Phantom Alteration'}
              </span>
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                ({scenes.length} مشهداً)
              </span>
            </div>
            <h1 className="text-base font-bold text-white tracking-tight font-sans">
              {project.project.title}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <FolderOpen className="h-3.5 w-3.5 text-amber-400" />
              <span>استيراد أو تغيير الشابتر</span>
            </button>
          </div>
        </div>

        {/* Global Save Feedback Alert */}
        {saveSuccessMsg && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-950/80 border border-emerald-800 p-3 text-xs text-emerald-200 shadow-md">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Tab 1: Audio Lab (Primary) */}
        {activeTab === 'audio' && (
          <AudioLab
            scenes={scenes}
            onUpdateScene={handleUpdateScene}
            voice={project.project.voice}
            onVoiceChange={handleVoiceChange}
            onScenesUpdated={handleScenesUpdated}
          />
        )}

        {/* Tab 2: Media Studio */}
        {activeTab === 'media' && (
          <MediaStudio
            scenes={scenes}
            onUpdateScene={handleUpdateScene}
            onBulkUpdateScenes={handleBulkUpdateScenes}
          />
        )}

        {/* Tab 3: Timeline & Canvas Player */}
        {activeTab === 'timeline' && (
          <div className="space-y-4">
            <TimelinePlayer
              scenes={scenes}
              activeSceneIndex={activeSceneIndex}
              onSceneChange={setActiveSceneIndex}
            />
          </div>
        )}

        {/* Tab 4: AI Memory & Analysis Hub */}
        {activeTab === 'ai-memory' && (
          <AIMemoryPanel
            project={project}
            onUpdateScene={handleUpdateScene}
            onImportProject={handleProjectLoaded}
          />
        )}

        {/* Tab 5: Publishing & Export Suite */}
        {activeTab === 'publish' && (
          <PublishExportPanel
            project={project}
            onUpdatePublish={handleUpdatePublish}
          />
        )}
      </main>

      {/* Chapter Import & Setup Modal */}
      <ProjectImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onProjectLoaded={handleProjectLoaded}
      />
    </div>
  );
}
