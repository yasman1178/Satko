import { z } from 'zod';

export const MotionEnum = z.enum(['static', 'zoom_in', 'zoom_out', 'pan_left', 'pan_right']);
export const TransitionEnum = z.enum(['fade', 'dissolve', 'cut']);

export const SceneSchema = z.object({
  scene_id: z.string().min(1, 'معرّف المشهد مطلوب'),
  narration_text: z.string().min(3, 'نص الإلقاء يجب أن يحتوي على 3 أحرف على الأقل'),
  image_filename: z.string().min(3, 'اسم ملف الصورة مطلوب مثل scene_001.png'),
  image_prompt_en: z.string().min(5, 'برومبت الصورة مطلوب باللغة الإنجليزية'),
  motion: MotionEnum.default('static'),
  transition: TransitionEnum.default('dissolve'),
  duration_seconds: z.number().optional(),
  audio_url: z.string().optional(),
  audio_status: z.enum(['idle', 'generating', 'ready', 'error']).optional(),
  image_url: z.string().optional(),
  image_status: z.enum(['missing', 'ready']).optional(),
});

export const ChapterSchema = z.object({
  chapter_id: z.number().or(z.string().transform((v) => parseInt(v, 10) || 1)),
  title: z.string().min(1, 'عنوان الفصل مطلوب'),
  scenes: z.array(SceneSchema).min(1, 'يجب أن يحتوي الفصل على مشهد واحد على الأقل'),
});

export const PublishSchema = z.object({
  title_options: z.array(z.string()).default([]),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  thumbnail_prompt_en: z.string().default(''),
  pinned_comment: z.string().default(''),
}).optional();

export const ProjectConfigSchema = z.object({
  title: z.string().min(1, 'عنوان المشروع مطلوب'),
  language: z.string().default('en'),
  voice: z.string().default('en-GB-RyanNeural'),
  target_minutes: z.number().default(28),
});

export const ProjectSchema = z.object({
  id: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  project: ProjectConfigSchema,
  chapters: z.array(ChapterSchema).min(1, 'يجب أن يحتوي المشروع على فصل واحد على الأقل'),
  publish: PublishSchema,
});

export type ValidatedProject = z.infer<typeof ProjectSchema>;
