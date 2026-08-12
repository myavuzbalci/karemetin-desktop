import { describe, expect, it } from 'vitest'
import { STYLE_PRESETS } from './models'
import { fallbackTextToChunks, getActiveChunk, groupWords, normalizeTranscription, resolveChunkStyle } from './transcription'

describe('transcription helpers', () => {
  it('groups word timestamps into readable captions', () => {
    const chunks = groupWords(
      [
        { id: '1', text: 'Bu', start: 0, end: 0.3 },
        { id: '2', text: 'bir', start: 0.3, end: 0.7 },
        { id: '3', text: 'test.', start: 0.7, end: 1.1 },
        { id: '4', text: 'Yeni', start: 1.2, end: 1.6 },
      ],
      6,
      3,
    )

    expect(chunks).toHaveLength(2)
    expect(chunks[0].text).toBe('Bu bir test.')
  })

  it('falls back when model output has no chunks', () => {
    const chunks = fallbackTextToChunks('bir iki uc dort bes alti', 6, 3)
    expect(chunks).toHaveLength(2)
    expect(chunks[1].start).toBeGreaterThan(chunks[0].start)
  })

  it('normalizes whisper word output', () => {
    const normalized = normalizeTranscription(
      {
        text: 'hello world',
        chunks: [
          { text: 'hello', timestamp: [0, 0.4] },
          { text: 'world', timestamp: [0.4, 1] },
        ],
      },
      1,
      4,
      3,
    )

    expect(normalized.text).toBe('hello world')
    expect(normalized.chunks[0].words).toHaveLength(2)
  })

  it('resolves per-caption style variants', () => {
    const baseStyle = { ...STYLE_PRESETS[0] }
    const variantStyle = { ...STYLE_PRESETS[1], textColor: '#123456' }
    const chunk = { id: 'caption-1', text: 'test', start: 0, end: 1, words: [], variantId: 'accent' }

    expect(resolveChunkStyle(baseStyle, [{ id: 'accent', name: 'Accent', style: variantStyle }], chunk)).toBe(
      variantStyle,
    )
    expect(resolveChunkStyle(baseStyle, [], chunk)).toBe(baseStyle)
  })

  it('does not keep a selected caption visible after its end time', () => {
    const chunks = [
      { id: 'first', text: 'bir', start: 0, end: 1, words: [] },
      { id: 'second', text: 'iki', start: 1, end: 2, words: [] },
    ]

    expect(getActiveChunk(chunks, 0.99)?.id).toBe('first')
    expect(getActiveChunk(chunks, 1)?.id).toBe('second')
    expect(getActiveChunk(chunks, 2)).toBeUndefined()
  })
})
