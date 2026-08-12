import { describe, expect, it } from 'vitest'
import { chunksToSrt, formatSrtTime, parseSrt, parseSrtTime } from './srt'

describe('srt helpers', () => {
  it('formats and parses timestamps', () => {
    expect(formatSrtTime(65.432)).toBe('00:01:05,432')
    expect(parseSrtTime('00:01:05,432')).toBeCloseTo(65.432)
    expect(parseSrtTime('00:01:05.4')).toBeCloseTo(65.4)
  })

  it('roundtrips captions', () => {
    const parsed = parseSrt(`1
00:00:00,000 --> 00:00:01,500
Merhaba dunya

2
00:00:02,000 --> 00:00:04,000
Ikinci satir`)

    expect(parsed).toHaveLength(2)
    expect(parsed[0].words).toHaveLength(2)
    expect(chunksToSrt(parsed)).toContain('00:00:02,000 --> 00:00:04,000')
  })
})
