export interface TimedSubtitleChunk {
  line1: string;
  line2: string;
  fullText: string;
  startProgress: number; // 0 to 1
  endProgress: number;   // 0 to 1
  wordCount: number;
}

/**
 * Splits narration text into natural, balanced 2-line subtitle chunks
 * without intrusive widgets or loading bars.
 */
export function splitTextIntoTwoLineChunks(text: string): TimedSubtitleChunk[] {
  if (!text || !text.trim()) return [];

  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  // If text is very short (1-4 words), display as a clean 1 or 2 line single chunk
  if (rawWords.length <= 4) {
    if (rawWords.length <= 2) {
      return [{
        line1: rawWords.join(' '),
        line2: '',
        fullText: rawWords.join(' '),
        startProgress: 0,
        endProgress: 1,
        wordCount: rawWords.length,
      }];
    }
    const mid = Math.ceil(rawWords.length / 2);
    const line1 = rawWords.slice(0, mid).join(' ');
    const line2 = rawWords.slice(mid).join(' ');
    return [{
      line1,
      line2,
      fullText: `${line1}\n${line2}`,
      startProgress: 0,
      endProgress: 1,
      wordCount: rawWords.length,
    }];
  }

  // Target 8 to 14 words per 2-line chunk (4 to 7 words per line)
  const maxWordsPerChunk = 12;
  const minWordsPerChunk = 6;

  const chunks: string[][] = [];
  let currentWords: string[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];
    currentWords.push(word);

    const hasPunctuation = /[,;:.!?؟،—]$/.test(word);
    const count = currentWords.length;
    const remaining = rawWords.length - 1 - i;

    const shouldBreak =
      (count >= minWordsPerChunk && hasPunctuation && remaining >= 4) ||
      count >= maxWordsPerChunk ||
      i === rawWords.length - 1;

    if (shouldBreak) {
      if (remaining <= 3 && count + remaining <= maxWordsPerChunk + 2) {
        continue; // Absorb trailing small words to prevent orphaned 1-2 word chunks
      }
      chunks.push([...currentWords]);
      currentWords = [];
    }
  }

  if (currentWords.length > 0) {
    if (chunks.length > 0 && currentWords.length <= 3) {
      chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(currentWords);
    } else {
      chunks.push(currentWords);
    }
  }

  // Format each chunk into balanced line 1 and line 2
  const formatted = chunks.map((wordList) => {
    if (wordList.length === 1) {
      return { line1: wordList[0], line2: '', wordCount: 1 };
    }

    const mid = Math.ceil(wordList.length / 2);
    let splitIdx = mid;

    // Prefer splitting on punctuation near the middle
    if (mid > 1 && /[,;:.!?؟،—]$/.test(wordList[mid - 2])) {
      splitIdx = mid - 1;
    } else if (/[,;:.!?؟،—]$/.test(wordList[mid - 1])) {
      splitIdx = mid;
    }

    const line1 = wordList.slice(0, splitIdx).join(' ');
    const line2 = wordList.slice(splitIdx).join(' ');
    return { line1, line2, wordCount: wordList.length };
  });

  const totalWords = formatted.reduce((acc, c) => acc + c.wordCount, 0);
  let currentStart = 0;

  return formatted.map((item, idx) => {
    const fraction = item.wordCount / (totalWords || 1);
    const start = currentStart;
    const end = idx === formatted.length - 1 ? 1.0 : Math.min(1.0, currentStart + fraction);
    currentStart = end;

    return {
      line1: item.line1,
      line2: item.line2,
      fullText: item.line2 ? `${item.line1}\n${item.line2}` : item.line1,
      startProgress: start,
      endProgress: end,
      wordCount: item.wordCount,
    };
  });
}
