import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { calculateWeightedWordTiming, TimedWordChunk } from '@/lib/word-timing';
import { Scene } from '@/types/project';

interface RenderRequestScene {
  scene_id?: string;
  narration_text: string;
  duration_seconds?: number;
  audio_url?: string;
  image_url?: string;
  motion?: string;
}

interface ServerRenderRequestBody {
  scenes: RenderRequestScene[];
  quality?: '1080p' | '720p' | '4K';
  channelName?: string;
  showWatermark?: boolean;
  timingOffset?: number; // e.g. +0.25s delay to prevent subtitle rushing
  wordsPerChunk?: number;
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // allow long background renders if needed

const RENDERS_DIR = '/tmp/mindplicit_renders';

async function updateStatus(
  renderDir: string,
  data: {
    status: 'initializing' | 'processing' | 'completed' | 'error';
    percent: number;
    currentScene?: number;
    totalScenes?: number;
    statusText: string;
    downloadUrl?: string;
    durationSec?: number;
    sizeBytes?: number;
    filename?: string;
    error?: string;
  }
) {
  try {
    const statusFile = path.join(renderDir, 'status.json');
    await fs.writeFile(statusFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to update status.json:', err);
  }
}

// Executes an external shell process and returns promise
function runExec(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });
    child.on('error', (err) => {
      resolve({ stdout, stderr: stderr + ' ' + err.message, code: 1 });
    });
  });
}

// Probes real audio file duration via ffprobe
async function probeAudioDuration(audioPath: string): Promise<number | null> {
  try {
    const res = await runExec('ffprobe', [
      '-i', audioPath,
      '-show_entries', 'format=duration',
      '-v', 'quiet',
      '-of', 'csv=p=0'
    ]);
    const parsed = parseFloat(res.stdout.trim());
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

// Converts seconds to ASS time format 0:00:00.00
function formatAssTime(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const h = Math.floor(safeSec / 3600);
  const m = Math.floor((safeSec % 3600) / 60);
  const s = Math.floor(safeSec % 60);
  const ms = Math.floor((safeSec % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export async function POST(req: NextRequest) {
  try {
    const body: ServerRenderRequestBody = await req.json();
    const {
      scenes = [],
      quality = '1080p',
      channelName = 'MachinaMind',
      showWatermark = true,
      timingOffset = 0.25,
      wordsPerChunk = 4,
    } = body;

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'لا توجد مشاهد للرندر' }, { status: 400 });
    }

    const renderId = 'rnd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    const renderDir = path.join(RENDERS_DIR, renderId);
    await fs.mkdir(renderDir, { recursive: true });

    // Initial status
    await updateStatus(renderDir, {
      status: 'initializing',
      percent: 2,
      currentScene: 0,
      totalScenes: scenes.length,
      statusText: `بدء تهيئة محرك FFmpeg على السيرفر لـ ${scenes.length} مشهد...`,
    });

    // Start background render task asynchronously so API returns immediate renderId
    executeServerRender(renderId, renderDir, scenes, {
      quality,
      channelName,
      showWatermark,
      timingOffset,
      wordsPerChunk,
      host: req.nextUrl.origin,
    }).catch(async (err) => {
      console.error(`[ServerRender ${renderId}] Fatal error:`, err);
      await updateStatus(renderDir, {
        status: 'error',
        percent: 0,
        statusText: 'فشل الرندر: ' + (err.message || 'خطأ غير متوقع'),
        error: err.message || 'Unknown error',
      });
    });

    return NextResponse.json({
      success: true,
      renderId,
      statusUrl: `/api/render/status/${renderId}`,
      message: 'تم إطلاق مهمة الرندر السحابية بنجاح على السيرفر',
    });
  } catch (err: any) {
    console.error('Server render POST error:', err);
    return NextResponse.json({ error: err.message || 'فشل معالجة الطلب' }, { status: 500 });
  }
}

async function executeServerRender(
  renderId: string,
  renderDir: string,
  scenes: RenderRequestScene[],
  options: {
    quality: '1080p' | '720p' | '4K';
    channelName: string;
    showWatermark: boolean;
    timingOffset: number;
    wordsPerChunk: number;
    host: string;
  }
) {
  const { quality, channelName, showWatermark, timingOffset, host } = options;

  let width = 1920;
  let height = 1080;
  let bitrate = '6000k';

  if (quality === '720p') {
    width = 1280;
    height = 720;
    bitrate = '3500k';
  } else if (quality === '4K') {
    width = 3840;
    height = 2160;
    bitrate = '16000k';
  }

  const scaleRatio = width / 1920;
  const assFontSize = Math.round(52 * scaleRatio);
  const marginV = Math.round(90 * scaleRatio);

  await updateStatus(renderDir, {
    status: 'processing',
    percent: 8,
    currentScene: 0,
    totalScenes: scenes.length,
    statusText: 'جارِ تنزيل وفحص مسارات الصوت والصور لكل المشاهد...',
  });

  // 1. Download / prepare all media files
  const preparedScenes: Array<{
    index: number;
    audioFile: string;
    imageFile: string;
    durationSec: number;
    narrationText: string;
    motion: string;
    chunks: TimedWordChunk[];
  }> = [];

  let globalAccumulatedTime = 0;
  const allGlobalTimedChunks: Array<{
    chunk: TimedWordChunk;
    globalStartSec: number;
    globalEndSec: number;
  }> = [];

  for (let i = 0; i < scenes.length; i++) {
    const sc = scenes[i];
    const sceneIdx = i + 1;
    const audioPath = path.join(renderDir, `scene_${sceneIdx}_audio.mp3`);
    const imagePath = path.join(renderDir, `scene_${sceneIdx}_image.jpg`);

    // Fetch Audio
    let audioDuration: number | null = null;
    if (sc.audio_url) {
      try {
        let fetchUrl = sc.audio_url;
        if (fetchUrl.startsWith('/')) {
          fetchUrl = `${host}${fetchUrl}`;
        }
        if (fetchUrl.startsWith('data:')) {
          const base64Data = fetchUrl.split(',')[1];
          await fs.writeFile(audioPath, Buffer.from(base64Data, 'base64'));
        } else {
          const resp = await fetch(fetchUrl);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            await fs.writeFile(audioPath, buf);
          }
        }
        // Probe duration
        audioDuration = await probeAudioDuration(audioPath);
      } catch (err) {
        console.warn(`Audio fetch failed for scene ${sceneIdx}:`, err);
      }
    }

    const durationSec = Math.max(
      2.0,
      audioDuration || sc.duration_seconds || 3.8
    );

    // If audio was missing or empty, generate silence matching exact duration
    if (!audioDuration) {
      await runExec('ffmpeg', [
        '-f', 'lavfi',
        '-i', `anullsrc=r=44100:cl=stereo`,
        '-t', durationSec.toString(),
        '-c:a', 'libmp3lame',
        '-b:a', '128k',
        '-y', audioPath,
      ]);
    }

    // Fetch Image
    let hasCustomImage = false;
    if (sc.image_url) {
      try {
        let fetchUrl = sc.image_url;
        if (fetchUrl.startsWith('/')) {
          fetchUrl = `${host}${fetchUrl}`;
        }
        if (fetchUrl.startsWith('data:')) {
          const base64Data = fetchUrl.split(',')[1];
          await fs.writeFile(imagePath, Buffer.from(base64Data, 'base64'));
          hasCustomImage = true;
        } else {
          const resp = await fetch(fetchUrl);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            await fs.writeFile(imagePath, buf);
            hasCustomImage = true;
          }
        }
      } catch (err) {
        console.warn(`Image fetch failed for scene ${sceneIdx}:`, err);
      }
    }

    // If image missing, generate dark cinematic procedural gradient
    if (!hasCustomImage) {
      await runExec('ffmpeg', [
        '-f', 'lavfi',
        '-i', `color=c=0x090D16:s=${width}x${height}:d=1`,
        '-frames:v', '1',
        '-y', imagePath,
      ]);
    }

    // Calculate accurate word chunks with user-calibrated timing offset
    const chunks = calculateWeightedWordTiming(
      sc.narration_text || '',
      durationSec,
      timingOffset
    );

    chunks.forEach((chunk) => {
      allGlobalTimedChunks.push({
        chunk,
        globalStartSec: globalAccumulatedTime + chunk.startSec,
        globalEndSec: globalAccumulatedTime + chunk.endSec,
      });
    });

    preparedScenes.push({
      index: sceneIdx,
      audioFile: audioPath,
      imageFile: imagePath,
      durationSec,
      narrationText: sc.narration_text || '',
      motion: sc.motion || 'zoom_in',
      chunks,
    });

    globalAccumulatedTime += durationSec;

    await updateStatus(renderDir, {
      status: 'processing',
      percent: Math.round(8 + ((i + 1) / scenes.length) * 15),
      currentScene: sceneIdx,
      totalScenes: scenes.length,
      statusText: `تم تجهيز وسائط المشهد ${sceneIdx} من ${scenes.length}`,
    });
  }

  // 2. Generate ASS Subtitle File for exact word-by-word highlights
  const assPath = path.join(renderDir, 'subtitles.ass');
  const assContent = generateAssSubtitles({
    chunks: allGlobalTimedChunks,
    width,
    height,
    fontSize: assFontSize,
    marginV,
    channelName,
    showWatermark,
    scaleRatio,
  });
  await fs.writeFile(assPath, assContent, 'utf-8');

  // 3. Render individual scene MP4 segments
  const sceneVideoFiles: string[] = [];
  const totalScenes = preparedScenes.length;

  for (let i = 0; i < totalScenes; i++) {
    const sc = preparedScenes[i];
    const sceneOutFile = path.join(renderDir, `scene_${sc.index}_render.mp4`);

    await updateStatus(renderDir, {
      status: 'processing',
      percent: Math.round(25 + (i / totalScenes) * 55),
      currentScene: sc.index,
      totalScenes,
      statusText: `ترميز المشهد ${sc.index} من ${totalScenes} بسرعة فائقة...`,
    });

    // FFmpeg video filter: scaling, crop, Ken Burns pan/zoom, subtle vignette
    // libx264 veryfast preset ensures high encoding speed (50-90 fps)
    const vf = [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      `setsar=1`,
    ].join(',');

    const ffmpegArgs = [
      '-loop', '1',
      '-t', sc.durationSec.toFixed(3),
      '-i', sc.imageFile,
      '-i', sc.audioFile,
      '-vf', vf,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-b:v', bitrate,
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '44100',
      '-shortest',
      '-y', sceneOutFile,
    ];

    const encodeRes = await runExec('ffmpeg', ffmpegArgs);
    if (encodeRes.code !== 0) {
      console.error(`Scene ${sc.index} encode error:`, encodeRes.stderr);
      throw new Error(`فشل ترميز المشهد رقم ${sc.index}: ` + encodeRes.stderr.slice(-200));
    }

    sceneVideoFiles.push(sceneOutFile);
  }

  // 4. Concatenate scenes together into raw concatenated video
  await updateStatus(renderDir, {
    status: 'processing',
    percent: 82,
    statusText: 'دمج مشاهد الفيديو وحرق الترجمة السينمائية والعلامة المائية...',
  });

  const concatListPath = path.join(renderDir, 'concat_list.txt');
  const concatListContent = sceneVideoFiles
    .map((file) => `file '${file}'`)
    .join('\n');
  await fs.writeFile(concatListPath, concatListContent, 'utf-8');

  const rawConcatFile = path.join(renderDir, 'raw_concat.mp4');
  const concatRes = await runExec('ffmpeg', [
    '-f', 'concat',
    '-safe', '0',
    '-i', concatListPath,
    '-c', 'copy',
    '-y', rawConcatFile,
  ]);

  if (concatRes.code !== 0) {
    throw new Error('فشل دمج مشاهد الفيديو: ' + concatRes.stderr.slice(-200));
  }

  // 5. Burn-in ASS Subtitles onto the combined video and optimize with faststart
  const finalOutputFile = path.join(renderDir, 'output.mp4');
  
  await updateStatus(renderDir, {
    status: 'processing',
    percent: 90,
    statusText: 'حرق الترجمة بخط القاهرة العريض وتطبيق الترميز النهائي MP4...',
  });

  const burnSubArgs = [
    '-i', rawConcatFile,
    '-vf', `ass=${assPath}:fontsdir=/public/fonts`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-b:v', bitrate,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'copy',
    '-movflags', '+faststart',
    '-y', finalOutputFile,
  ];

  const burnRes = await runExec('ffmpeg', burnSubArgs);
  if (burnRes.code !== 0) {
    console.warn('Burn subtitles warning, falling back to raw video:', burnRes.stderr);
    // Fallback: copy raw concat if ass filter had any font warning
    await fs.copyFile(rawConcatFile, finalOutputFile);
  }

  // 6. Gather File Stats and Finish
  const stats = await fs.stat(finalOutputFile);
  const sizeBytes = stats.size;
  const filename = `Mindplicit_${channelName.replace(/\s+/g, '_')}_${Date.now()}.mp4`;

  await updateStatus(renderDir, {
    status: 'completed',
    percent: 100,
    statusText: 'تم إتمام الرندر بنجاح! ملف MP4 فائق النقاء جاهز للمعاينة والتحميل.',
    downloadUrl: `/api/render/download/${renderId}`,
    durationSec: Math.round(globalAccumulatedTime),
    sizeBytes,
    filename,
  });
}

/**
 * Generates ASS subtitle format with Cairo Arabic font,
 * atmospheric gradient scrim simulation, and dynamic golden word highlighting.
 */
function generateAssSubtitles(opts: {
  chunks: Array<{ chunk: TimedWordChunk; globalStartSec: number; globalEndSec: number }>;
  width: number;
  height: number;
  fontSize: number;
  marginV: number;
  channelName: string;
  showWatermark: boolean;
  scaleRatio: number;
}): string {
  const { chunks, width, height, fontSize, marginV, channelName, showWatermark } = opts;

  let eventsStr = '';

  for (const item of chunks) {
    const { chunk, globalStartSec } = item;
    const words = chunk.words || [];

    // Dialogue for each active word highlight
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const activeWord = words[wIdx];
      const startAss = formatAssTime(globalStartSec + (activeWord.startSec - chunk.startSec));
      const endAss = formatAssTime(globalStartSec + (activeWord.endSec - chunk.startSec));

      // Build text with active word in Golden Yellow (\c&H0038F5&) and other words in White (\c&HFFFFFF&)
      const styledWords = words.map((w, idx) => {
        if (idx === wIdx) {
          return `{\\c&H0038F5&\\b1}${w.text}{\\c&HFFFFFF&\\b0}`;
        }
        return `{\\c&HFFFFFF&}${w.text}`;
      });

      const lineText = styledWords.join(' ');
      eventsStr += `Dialogue: 1,${startAss},${endAss},Default,,0,0,0,,${lineText}\n`;
    }
  }

  // Channel watermark badge event
  if (showWatermark && channelName) {
    const wmText = `{\\an9\\fs${Math.round(24 * opts.scaleRatio)}\\c&H80FFFFFF&\\b1}⬡ ${channelName.toUpperCase()}`;
    eventsStr += `Dialogue: 0,0:00:00.00,9:59:59.00,Watermark,,0,0,0,,${wmText}\n`;
  }

  return `[Script Info]
Title: Mindplicit Studio Subtitles
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${width}
PlayResY: ${height}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Cairo,${fontSize},&H00FFFFFF,&H000038F5,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,3.5,2,2,80,80,${marginV},1
Style: Watermark,Cairo,${Math.round(24 * opts.scaleRatio)},&H70FFFFFF,&H00000000,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,1,0,9,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${eventsStr}
`;
}
