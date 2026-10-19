import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';

const EDGE_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}`;

// Map of supported Edge voices and fallback Gemini voices
export const VOICE_CATALOG = [
  { id: 'en-GB-RyanNeural', name: 'Ryan (British - Deep & Stoic)', gender: 'Male', lang: 'en-GB', recommended: true },
  { id: 'en-GB-SoniaNeural', name: 'Sonia (British - Analytical)', gender: 'Female', lang: 'en-GB' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher (US - Authoritative)', gender: 'Male', lang: 'en-US' },
  { id: 'en-US-GuyNeural', name: 'Guy (US - Documentary)', gender: 'Male', lang: 'en-US' },
  { id: 'en-US-JennyNeural', name: 'Jenny (US - Conversational)', gender: 'Female', lang: 'en-US' },
  { id: 'gemini-Fenrir', name: 'Gemini AI - Fenrir (Deep Cinematic)', gender: 'Male', lang: 'en-US' },
  { id: 'gemini-Zephyr', name: 'Gemini AI - Zephyr (Clear Narrative)', gender: 'Female', lang: 'en-US' },
  { id: 'gemini-Puck', name: 'Gemini AI - Puck (Engaging)', gender: 'Male', lang: 'en-US' },
];

/**
 * Synthesizes audio using Microsoft Edge-TTS WebSocket service
 */
export async function synthesizeEdgeTTS(
  text: string,
  voice: string = 'en-GB-RyanNeural',
  rate: string = '+0%',
  pitch: string = '+0Hz'
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  return new Promise((resolve, reject) => {
    // Generate UUIDs
    const connectionId = crypto.randomUUID().replace(/-/g, '');
    const requestId = crypto.randomUUID().replace(/-/g, '');

    const url = `${EDGE_WSS_URL}&ConnectionId=${connectionId}`;
    
    // Node.js 20+ has global WebSocket built-in
    // If not, we can catch and route to Gemini TTS
    if (typeof WebSocket === 'undefined') {
      return reject(new Error('WebSocket is not available in runtime'));
    }

    const ws = new WebSocket(url, {
      headers: {
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      },
    } as any);

    const audioChunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('Edge-TTS request timed out after 12s'));
    }, 12000);

    ws.onopen = () => {
      // 1. Send speech.config
      const configMsg =
        `Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: 'false',
                  wordBoundaryEnabled: 'false',
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        });
      ws.send(configMsg);

      // 2. Escape XML text
      const cleanText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

      // 3. Send SSML request
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>` +
        `<prosody pitch='${pitch}' rate='${rate}' volume='+0%'>` +
        `${cleanText}` +
        `</prosody></voice></speak>`;

      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;

      ws.send(ssmlMsg);
    };

    ws.onmessage = async (event: any) => {
      let data = event.data;
      if (typeof data === 'string') {
        if (data.includes('Path:turn.end')) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          if (audioChunks.length > 0) {
            resolve({
              audioBuffer: Buffer.concat(audioChunks),
              mimeType: 'audio/mp3',
            });
          } else {
            reject(new Error('Empty audio received from Edge-TTS'));
          }
        }
      } else if (data instanceof ArrayBuffer || Buffer.isBuffer(data) || data instanceof Blob) {
        let buffer: Buffer;
        if (data instanceof Blob) {
          const ab = await data.arrayBuffer();
          buffer = Buffer.from(ab);
        } else if (data instanceof ArrayBuffer) {
          buffer = Buffer.from(data);
        } else {
          buffer = data;
        }

        // Binary response in Edge-TTS has a 2-byte header length at start
        if (buffer.length > 2) {
          const headerLen = buffer.readUInt16BE(0);
          if (buffer.length > headerLen + 2) {
            const headerStr = buffer.slice(2, 2 + headerLen).toString('utf-8');
            if (headerStr.includes('Path:audio')) {
              const audioData = buffer.slice(2 + headerLen);
              if (audioData.length > 0) {
                audioChunks.push(audioData);
              }
            }
          }
        }
      }
    };

    ws.onerror = (err: any) => {
      clearTimeout(timeout);
      try { ws.close(); } catch {}
      reject(new Error(`Edge-TTS WebSocket error: ${err.message || 'connection failed'}`));
    };
  });
}

/**
 * Synthesizes audio using Gemini 3.8 Flash-Lite TTS
 */
export async function synthesizeGeminiTTS(
  text: string,
  voiceName: string = 'Fenrir'
): Promise<{ audioBuffer: Buffer; mimeType: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: text,
            speechMetadata: {
              style: 'Deep, dramatic, psychological narrator, renaissance tone',
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: (['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].includes(voiceName) ? voiceName : 'Fenrir') as any,
          },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('No audio returned from Gemini TTS');
  }

  const audioBuffer = Buffer.from(base64Audio, 'base64');
  return {
    audioBuffer,
    mimeType: 'audio/wav',
  };
}
