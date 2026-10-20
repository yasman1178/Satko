export interface TimedWord {
  text: string;
  startSec: number;
  endSec: number;
}

export interface TimedWordChunk {
  text: string;
  startSec: number;
  endSec: number;
  startProgress: number; // 0 to 1
  endProgress: number;   // 0 to 1
  wordCount: number;
  words: TimedWord[];
}

/**
 * Calculates weighted word timing proportional to Arabic syllable length,
 * long vowels (حروف المد), Shaddah, and punctuation pauses.
 * Resolves the issue where subtitles raced ahead of speech.
 * Pure TypeScript function usable on both Node.js server and client browser.
 */
export function calculateWeightedWordTiming(
  text: string,
  durationSec: number,
  timingOffsetSec: number = 0.25
): TimedWordChunk[] {
  if (!text || !text.trim()) return [];

  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  // Group into balanced 3-4 word chunks based on natural pauses
  const chunkedWordGroups: string[][] = [];
  let currentGroup: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];
    currentGroup.push(word);

    const hasPause = /[,;:.!?،؛؟—\-]$/.test(word);
    const count = currentGroup.length;
    const remaining = rawWords.length - 1 - i;

    const shouldBreak =
      (count >= 3 && hasPause && remaining >= 2) ||
      (count >= 4 && remaining >= 2) ||
      count >= 5 ||
      i === rawWords.length - 1;

    if (shouldBreak) {
      if (remaining === 1 && count < 4) {
        continue;
      }
      chunkedWordGroups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) {
    if (chunkedWordGroups.length > 0 && currentGroup.length < 3) {
      chunkedWordGroups[chunkedWordGroups.length - 1].push(...currentGroup);
    } else {
      chunkedWordGroups.push(currentGroup);
    }
  }

  // Realistic speech onset delay (Edge-TTS and Gemini TTS typically start after 0.25s to 0.4s)
  const speechStartSec = Math.max(0.1, 0.28 + (timingOffsetSec || 0));
  const safeTotalDuration = Math.max(1.5, durationSec);
  // Reserve a natural trailing pause at the end of speech
  const effectiveSpeechDuration = Math.max(0.8, safeTotalDuration - speechStartSec - 0.2);

  // Calculate syllable and phonetic weight for each word in Arabic & English
  const wordWeights: number[] = [];
  rawWords.forEach((w) => {
    // Base character length
    const cleanChars = w.replace(/[^a-zA-Z\u0600-\u06FF0-9]/g, '');
    let weight = Math.max(1, cleanChars.length);

    // Arabic long vowels (حروف المد: ا، و، ي، آ، ى) give extra duration
    const longVowels = (w.match(/[اويآى]/g) || []).length;
    weight += longVowels * 1.5;

    // Shaddah (تضعيف الحرف) takes double the consonant time
    if (w.includes('ّ')) {
      weight += 1.8;
    }

    // Punctuation pause weight
    if (/[,،؛]/.test(w)) {
      weight += 2.5; // comma pause
    } else if (/[.!?؟]/.test(w)) {
      weight += 3.5; // sentence ending pause
    }

    wordWeights.push(weight);
  });

  const totalWeight = wordWeights.reduce((a, b) => a + b, 0) || 1;

  let elapsedSec = speechStartSec;
  let wordGlobalIdx = 0;

  const resultChunks: TimedWordChunk[] = [];

  for (let cIdx = 0; cIdx < chunkedWordGroups.length; cIdx++) {
    const group = chunkedWordGroups[cIdx];
    const chunkWords: TimedWord[] = [];
    const chunkStartSec = elapsedSec;

    for (let wIdx = 0; wIdx < group.length; wIdx++) {
      const wordText = group[wIdx];
      const weight = wordWeights[wordGlobalIdx] || 2;
      wordGlobalIdx++;

      const wordDuration = (weight / totalWeight) * effectiveSpeechDuration;
      const wStart = elapsedSec;
      const wEnd = elapsedSec + wordDuration;
      elapsedSec = wEnd;

      chunkWords.push({
        text: wordText,
        startSec: wStart,
        endSec: wEnd,
      });
    }

    const isLast = cIdx === chunkedWordGroups.length - 1;
    const chunkEndSec = isLast
      ? Math.min(safeTotalDuration - 0.05, Math.max(elapsedSec, safeTotalDuration - 0.25))
      : elapsedSec;

    resultChunks.push({
      text: group.join(' '),
      startSec: chunkStartSec,
      endSec: chunkEndSec,
      startProgress: Math.min(1.0, chunkStartSec / safeTotalDuration),
      endProgress: Math.min(1.0, chunkEndSec / safeTotalDuration),
      wordCount: group.length,
      words: chunkWords,
    });
  }

  return resultChunks;
}
