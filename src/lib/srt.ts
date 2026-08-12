import type { SubtitleChunk } from '../types'

export function formatSrtTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const secs = Math.floor(safe % 60)
  const millis = Math.round((safe - Math.floor(safe)) * 1000)

  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${String(millis).padStart(3, '0')}`
}

export function parseSrtTime(value: string) {
  const match = value
    .trim()
    .replace('.', ',')
    .match(/^(\d{1,2}):(\d{2}):(\d{2}),(\d{1,3})$/)

  if (!match) {
    throw new Error(`Invalid SRT timestamp: ${value}`)
  }

  const [, h, m, s, ms] = match
  return (
    Number(h) * 3600 +
    Number(m) * 60 +
    Number(s) +
    Number(ms.padEnd(3, '0')) / 1000
  )
}

export function parseSrt(input: string): SubtitleChunk[] {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r/g, '').trim()
  if (!normalized) return []

  return normalized
    .split(/\n{2,}/)
    .map((block, index) => {
      const lines = block
        .split('\n')
        .map((line) => line.trimEnd())
        .filter(Boolean)
      const timingLine = lines.find((line) => line.includes('-->'))
      if (!timingLine) {
        throw new Error(`Missing timing line in SRT block ${index + 1}`)
      }
      const timingIndex = lines.indexOf(timingLine)
      const [startRaw, endRaw] = timingLine.split('-->').map((part) => part.trim().split(/\s+/)[0])
      const text = lines.slice(timingIndex + 1).join(' ').trim()
      const start = parseSrtTime(startRaw)
      const end = parseSrtTime(endRaw)

      return {
        id: cryptoId('srt'),
        text,
        start,
        end,
        words: splitTextIntoWords(text, start, end),
      }
    })
    .filter((chunk) => chunk.text)
}

export function chunksToSrt(chunks: SubtitleChunk[]) {
  return chunks
    .filter((chunk) => chunk.text.trim())
    .map((chunk, index) => {
      return `${index + 1}\n${formatSrtTime(chunk.start)} --> ${formatSrtTime(chunk.end)}\n${chunk.text.trim()}`
    })
    .join('\n\n')
}

export function downloadTextFile(filename: string, contents: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([contents], { type })
  downloadBlob(filename, blob)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
}

function splitTextIntoWords(text: string, start: number, end: number) {
  const parts = text.split(/\s+/).filter(Boolean)
  const duration = Math.max(0.2, end - start)
  const step = duration / Math.max(parts.length, 1)

  return parts.map((part, index) => ({
    id: cryptoId('word'),
    text: part,
    start: start + step * index,
    end: index === parts.length - 1 ? end : start + step * (index + 1),
  }))
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function cryptoId(prefix: string) {
  if ('crypto' in globalThis && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
