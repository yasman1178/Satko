export type MotionType = 'static' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right';
export type TransitionType = 'fade' | 'dissolve' | 'cut';

export interface Scene {
  scene_id: string;
  narration_text: string;
  image_filename: string;
  image_prompt_en: string;
  motion: MotionType;
  transition: TransitionType;
  // Dynamic runtime state stored in external memory
  duration_seconds?: number;
  audio_url?: string;
  audio_status?: 'idle' | 'generating' | 'ready' | 'error';
  audio_error?: string;
  image_url?: string;
  image_status?: 'missing' | 'ready';
}

export interface Chapter {
  chapter_id: number;
  title: string;
  scenes: Scene[];
}

export interface PublishInfo {
  title_options: string[];
  description: string;
  tags: string[];
  thumbnail_prompt_en: string;
  pinned_comment: string;
}

export interface ProjectConfig {
  title: string;
  language: string;
  voice: string;
  target_minutes: number;
}

export interface ProjectData {
  id?: string;
  created_at?: string;
  updated_at?: string;
  project: ProjectConfig;
  chapters: Chapter[];
  publish?: PublishInfo;
}

export interface MemoryStats {
  totalScenes: number;
  audioGenerated: number;
  imagesMatched: number;
  totalDurationSeconds: number;
  storageUsageEstimate: string;
}
