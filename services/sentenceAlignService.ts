import { LayoutBlock, SentencePair } from '../types';

export interface SentenceSegment {
  text: string;
  start: number;
  end: number;
  index: number;
}

const TRAILING_PUNCTUATION = /[.!?。！？；;]+$/;

const normalizeSentence = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim();

const cleanForCompare = (value: string) =>
  normalizeSentence(value).replace(TRAILING_PUNCTUATION, '').toLowerCase();

export const splitSentences = (text: string): SentenceSegment[] => {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const segments: SentenceSegment[] = [];

  const breakChars = new Set(['.', '!', '?', '。', '！', '？', ';', '；', '\n']);
  let start = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (!breakChars.has(ch)) continue;

    const end = i + 1;
    const slice = normalized.slice(start, end).trim();
    if (slice) {
      const leading = normalized.slice(start, end).search(/\S/);
      const actualStart = leading >= 0 ? start + leading : start;
      const actualEnd = actualStart + slice.length;
      segments.push({
        text: slice,
        start: actualStart,
        end: actualEnd,
        index: segments.length,
      });
    }
    start = end;
  }

  if (start < normalized.length) {
    const tailRaw = normalized.slice(start);
    const tail = tailRaw.trim();
    if (tail) {
      const leading = tailRaw.search(/\S/);
      const actualStart = leading >= 0 ? start + leading : start;
      const actualEnd = actualStart + tail.length;
      segments.push({
        text: tail,
        start: actualStart,
        end: actualEnd,
        index: segments.length,
      });
    }
  }

  if (segments.length === 0 && normalized.trim()) {
    const first = normalized.search(/\S/);
    return [{
      text: normalized.trim(),
      start: first,
      end: first + normalized.trim().length,
      index: 0,
    }];
  }

  return segments;
};

export const buildSentencePairsFromTexts = (
  sourceText: string,
  targetText: string,
): SentencePair[] => {
  const source = splitSentences(sourceText);
  const target = splitSentences(targetText);
  const total = Math.max(source.length, target.length);
  if (total === 0) return [];

  const pairs: SentencePair[] = [];
  for (let i = 0; i < total; i += 1) {
    const srcIndex = source.length <= 1 ? 0 : Math.min(source.length - 1, Math.floor((i * source.length) / total));
    const tgtIndex = target.length <= 1 ? 0 : Math.min(target.length - 1, Math.floor((i * target.length) / total));
    pairs.push({
      source: source[srcIndex]?.text ?? '',
      target: target[tgtIndex]?.text ?? '',
    });
  }
  return pairs;
};

export const ensureSentencePairs = (block: LayoutBlock): SentencePair[] => {
  const sourceText = block.originalContent?.trim() ?? '';
  const targetText = block.content?.trim() ?? '';
  if (!targetText) return [];

  if (Array.isArray(block.sentencePairs) && block.sentencePairs.length > 0) {
    return block.sentencePairs
      .map((item) => ({
        source: typeof item.source === 'string' ? normalizeSentence(item.source) : '',
        target: typeof item.target === 'string' ? normalizeSentence(item.target) : '',
      }))
      .filter((item) => item.source || item.target);
  }

  return buildSentencePairsFromTexts(sourceText, targetText);
};

export const findSentenceIndexByOffset = (sentences: SentenceSegment[], offset: number): number => {
  if (sentences.length === 0) return -1;
  for (const seg of sentences) {
    if (offset >= seg.start && offset <= seg.end) {
      return seg.index;
    }
  }
  return Math.max(0, sentences.length - 1);
};

export const findSentenceIndexByText = (sentences: SentenceSegment[], snippet: string): number => {
  const target = cleanForCompare(snippet);
  if (!target) return -1;

  for (const sentence of sentences) {
    if (cleanForCompare(sentence.text).includes(target)) {
      return sentence.index;
    }
  }

  return -1;
};
