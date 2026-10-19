import { NextRequest, NextResponse } from 'next/server';
import { synthesizeEdgeTTS, synthesizeGeminiTTS } from '@/lib/tts-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice = 'en-GB-RyanNeural', rate = '+0%', pitch = '+0Hz', scene_id } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required for TTS synthesis' }, { status: 400 });
    }

    let audioBuffer: Buffer;
    let mimeType: string;
    let engineUsed = 'Edge-TTS';

    if (voice.startsWith('gemini-')) {
      const voiceName = voice.replace('gemini-', '');
      const result = await synthesizeGeminiTTS(text, voiceName);
      audioBuffer = result.audioBuffer;
      mimeType = result.mimeType;
      engineUsed = 'Gemini-TTS';
    } else {
      try {
        const result = await synthesizeEdgeTTS(text, voice, rate, pitch);
        audioBuffer = result.audioBuffer;
        mimeType = result.mimeType;
        engineUsed = 'Edge-TTS';
      } catch (edgeErr: any) {
        console.warn(`Edge-TTS failed (${edgeErr?.message}), falling back to Gemini TTS...`);
        try {
          const fallback = await synthesizeGeminiTTS(text, 'Fenrir');
          audioBuffer = fallback.audioBuffer;
          mimeType = fallback.mimeType;
          engineUsed = 'Gemini-TTS (Fallback)';
        } catch (geminiErr: any) {
          throw new Error(`Both Edge-TTS and Gemini TTS failed: ${edgeErr.message} / ${geminiErr.message}`);
        }
      }
    }

    // Rough duration estimation based on words (avg 140 words/min = 2.33 words/sec)
    const wordCount = text.trim().split(/\s+/).length;
    const estimatedDurationSeconds = Math.max(2.5, +(wordCount / 2.33).toFixed(2));

    const base64Audio = audioBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Audio}`;

    return NextResponse.json({
      success: true,
      scene_id,
      engine: engineUsed,
      mimeType,
      audioUrl: dataUrl,
      sizeBytes: audioBuffer.length,
      estimatedDurationSeconds,
    });
  } catch (err: any) {
    console.error('TTS route error:', err);
    return NextResponse.json(
      { error: err?.message || 'TTS generation failed' },
      { status: 500 }
    );
  }
}
