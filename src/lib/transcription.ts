import type { CaptionVariant, SubtitleChunk, SubtitleStyle, TranscriptWord, WordStyleOverride } from '../types'
import { cryptoId } from './srt'

type WhisperChunk = {
  text?: string
  timestamp?: [number | null, number | null]
}

type WhisperOutput = {
  text?: string
  chunks?: WhisperChunk[]
}

export function normalizeTranscription(
  raw: unknown,
  duration: number,
  maxWordsPerCaption: number,
  maxCaptionDuration: number,
) {
  const output = raw as WhisperOutput
  const words = (output.chunks ?? [])
    .map((chunk): TranscriptWord | null => {
      const [start, end] = chunk.timestamp ?? [null, null]
      if (start === null || end === null || !chunk.text?.trim()) return null
      return {
        id: cryptoId('word'),
        text: chunk.text.trim(),
        start,
        end: Math.max(end, start + 0.08),
      }
    })
    .filter((word): word is TranscriptWord => Boolean(word))

  const chunks = words.length
    ? groupWords(words, maxWordsPerCaption, maxCaptionDuration)
    : fallbackTextToChunks(output.text ?? '', duration, maxWordsPerCaption)

  return {
    text: output.text?.trim() || chunks.map((chunk) => chunk.text).join(' '),
    chunks,
  }
}

export function groupWords(words: TranscriptWord[], maxWords: number, maxDuration: number): SubtitleChunk[] {
  const groups: TranscriptWord[][] = []
  let current: TranscriptWord[] = []

  for (const word of words) {
    const next = [...current, word]
    const duration = next[next.length - 1].end - next[0].start
    const hasSentenceBreak = /[.!?]$/.test(current[current.length - 1]?.text ?? '')
    const shouldFlush =
      current.length > 0 && (next.length > maxWords || duration > maxDuration || hasSentenceBreak)

    if (shouldFlush) {
      groups.push(current)
      current = [word]
    } else {
      current = next
    }
  }

  if (current.length) groups.push(current)

  return groups.map((group) => ({
    id: cryptoId('caption'),
    text: group.map((word) => word.text).join(' '),
    start: group[0].start,
    end: group[group.length - 1].end,
    words: group,
  }))
}

export function fallbackTextToChunks(text: string, duration: number, maxWords: number): SubtitleChunk[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return []

  const chunks: SubtitleChunk[] = []
  const groupCount = Math.ceil(words.length / maxWords)
  const safeDuration = Math.max(duration || groupCount * 2, groupCount)
  const secondsPerGroup = safeDuration / groupCount

  for (let i = 0; i < words.length; i += maxWords) {
    const groupWordsRaw = words.slice(i, i + maxWords)
    const index = Math.floor(i / maxWords)
    const start = index * secondsPerGroup
    const end = Math.min(safeDuration, start + secondsPerGroup)
    const wordStep = (end - start) / Math.max(groupWordsRaw.length, 1)
    const timedWords = groupWordsRaw.map((word, wordIndex) => ({
      id: cryptoId('word'),
      text: word,
      start: start + wordStep * wordIndex,
      end: wordIndex === groupWordsRaw.length - 1 ? end : start + wordStep * (wordIndex + 1),
    }))

    chunks.push({
      id: cryptoId('caption'),
      text: groupWordsRaw.join(' '),
      start,
      end,
      words: timedWords,
    })
  }

  return chunks
}

export function getActiveChunk(chunks: SubtitleChunk[], currentTime: number) {
  return chunks.find((chunk) => currentTime >= chunk.start && currentTime < chunk.end)
}

export function cleanCaptionText(
  text: string,
  options: {
    removePunctuation: boolean
    hiddenPunctuation?: string
    textTransform: 'none' | 'uppercase' | 'lowercase'
  },
) {
  let next = text
  if (options.removePunctuation) {
    const punctuation = options.hiddenPunctuation || '.,!?;:"\'()[]{}'
    const escaped = punctuation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('-', '\\-')
    next = next.replace(new RegExp(`[${escaped}]`, 'g'), '')
  }
  if (options.textTransform === 'uppercase') next = next.toUpperCase()
  if (options.textTransform === 'lowercase') next = next.toLowerCase()
  return next
}

export function resolveChunkStyle(
  baseStyle: SubtitleStyle,
  variants: CaptionVariant[] | undefined,
  chunk: SubtitleChunk | undefined,
) {
  const variant = variants?.find((item) => item.id === chunk?.variantId)
  const selected = variant?.style ?? baseStyle
  if (!chunk) return selected
  if (
    chunk.positionX === undefined &&
    chunk.positionY === undefined &&
    chunk.maxWidth === undefined &&
    chunk.align === undefined
  ) {
    return selected
  }

  return {
    ...selected,
    positionX: chunk.positionX ?? selected.positionX,
    positionY: chunk.positionY ?? selected.positionY,
    maxWidth: chunk.maxWidth ?? selected.maxWidth,
    align: chunk.align ?? selected.align,
  }
}

export function resolveWordStyle(style: SubtitleStyle, override?: WordStyleOverride, active = false) {
  const activeTextColor = active ? style.activeColor : style.textColor
  return {
    textColor: override?.textColor ?? activeTextColor,
    backgroundColor:
      override?.backgroundColor ?? (active && style.activeWordBackground ? style.activeWordBackgroundColor : 'transparent'),
    backgroundOpacity: override?.backgroundOpacity ?? (active && style.activeWordBackground ? 1 : 0),
    strokeColor: override?.strokeColor ?? style.strokeColor,
    strokeWidth: override?.strokeWidth ?? style.strokeWidth,
    shadow: override?.shadow ?? (active ? style.activeWordShadow : style.shadow),
    fontScale: override?.fontScale ?? 1,
    fontWeight: override?.fontWeight ?? style.fontWeight,
    italic: override?.italic ?? style.italic,
    underline: override?.underline ?? false,
  }
}
