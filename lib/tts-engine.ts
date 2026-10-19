import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

// Map of supported Edge neural voices
export const VOICE_CATALOG = [
  { id: 'en-GB-RyanNeural', name: 'Ryan (British - Deep & Stoic)', gender: 'Male', lang: 'en-GB', recommended: true },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (British - Analytical)', gender: 'Female', lang: 'en-GB' },
  { id: 'en-GB-ThomasNeural', name: 'Thomas (British - Classical Narrator)', gender: 'Male', lang: 'en-GB' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher (US - Authoritative & Calm)', gender: 'Male', lang: 'en-US' },
  { id: 'en-US-GuyNeural', name: 'Guy (US - Documentary Narrator)', gender: 'Male', lang: 'en-US' },
  { id: 'en-US-JennyNeural', name: 'Jenny (US - Conversational)', gender: 'Female', lang: 'en-US' },
  { id: 'en-US-EricNeural', name: 'Eric (US - Rational & Crisp)', gender: 'Male', lang: 'en-US' },
];

/**
 * Synthesizes speech using Microsoft Edge-TTS with DRM authentication
 */
export async function synthesizeEdgeTTS(
  text: string,
  voice: string = 'en-GB-RyanNeural',
  rate: string = '-20%',
  pitch: string = '+0Hz'
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  // Normalize rate and pitch for SSML
  const cleanRate = rate.includes('%') ? rate : '-20%';
  const cleanPitch = pitch.includes('Hz') ? pitch : '+0Hz';

  const tts = new MsEdgeTTS({ connectionTimeoutMs: 12000, synthesisTimeoutMs: 20000 });

  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text, {
      rate: cleanRate,
      pitch: cleanPitch,
    });

    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      audioStream.on('end', () => {
        const audioBuffer = Buffer.concat(chunks);
        tts.close();
        if (audioBuffer.length > 0) {
          resolve({
            audioBuffer,
            mimeType: 'audio/mp3',
          });
        } else {
          reject(new Error('Empty audio stream received from Edge-TTS'));
        }
      });

      audioStream.on('error', (err: any) => {
        tts.close();
        reject(err);
      });
    });
  } catch (err: any) {
    try { tts.close(); } catch {}
    throw new Error(`Edge-TTS generation error: ${err.message || 'unknown error'}`);
  }
}
