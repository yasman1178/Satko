import { NextRequest, NextResponse } from 'next/server';
import { synthesizeEdgeTTS } from '@/lib/tts-engine';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice = 'en-GB-RyanNeural', rate = '+0%', pitch = '+0Hz', scene_id } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text is required for TTS synthesis' }, { status: 400 });
    }

    const { audioBuffer, mimeType } = await synthesizeEdgeTTS(text, voice, rate, pitch);

    // Estimate duration based on word count (~140 words per minute)
    const wordCount = text.trim().split(/\s+/).length;
    const estimatedDurationSeconds = Math.max(2.5, +(wordCount / 2.33).toFixed(2));

    const base64Audio = audioBuffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Audio}`;

    return NextResponse.json({
      success: true,
      scene_id,
      engine: 'Edge-TTS',
      voice,
      mimeType,
      audioUrl: dataUrl,
      sizeBytes: audioBuffer.length,
      estimatedDurationSeconds,
    });
  } catch (err: any) {
    console.error('Edge-TTS synthesis error:', err);
    return NextResponse.json(
      { error: err?.message || 'Edge-TTS failed to synthesize speech' },
      { status: 500 }
    );
  }
}
