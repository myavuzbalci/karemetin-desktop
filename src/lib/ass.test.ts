import { describe, expect, it } from 'vitest'
import { buildAssDocument } from './ass'
import { STYLE_PRESETS } from './models'

describe('ASS subtitle renderer', () => {
  it('renders per-fragment geometry and word-level highlights', () => {
    const style = { ...STYLE_PRESETS[0] }
    const ass = buildAssDocument({
      width: 1080,
      height: 1920,
      style,
      chunks: [
        {
          id: 'caption-1',
          text: 'bir guclu kelime',
          start: 0,
          end: 2.4,
          positionX: 42,
          positionY: 34,
          maxWidth: 66,
          words: [
            { id: 'w1', text: 'bir', start: 0, end: 0.7 },
            {
              id: 'w2',
              text: 'guclu',
              start: 0.7,
              end: 1.5,
              style: { textColor: '#ff3158', fontScale: 1.2, underline: true },
            },
            { id: 'w3', text: 'kelime', start: 1.5, end: 2.4 },
          ],
        },
      ],
    })

    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('PlayResY: 1920')
    expect(ass).toContain('\\pos(453.6,652.8)')
    expect(ass).toContain('\\u1')
    expect(ass.match(/Dialogue:/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('scales very long words instead of overflowing the canvas', () => {
    const style = { ...STYLE_PRESETS[0], maxWidth: 40, fontSize: 100 }
    const ass = buildAssDocument({
      width: 720,
      height: 1280,
      style,
      chunks: [
        {
          id: 'long',
          text: 'supercalifragilisticexpialidocious',
          start: 0,
          end: 1,
          words: [{ id: 'word', text: 'supercalifragilisticexpialidocious', start: 0, end: 1 }],
        },
      ],
    })

    const fontSizes = Array.from(ass.matchAll(/\\fs([0-9.]+)/g), (match) => Number(match[1]))
    expect(Math.min(...fontSizes)).toBeLessThan(100 * (1280 / 1080))
  })

  it('keeps dynamic captions continuous and renders one full caption background', () => {
    const blackBar = STYLE_PRESETS.find((preset) => preset.presetName === 'Black Bar')
    if (!blackBar) throw new Error('Black Bar preset is missing')
    const style = { ...blackBar, transitionIn: 'fade' as const, transitionOut: 'fade' as const }
    const ass = buildAssDocument({
      width: 1080,
      height: 1920,
      style,
      chunks: [
        {
          id: 'continuous',
          text: 'Boyle bir durumda',
          start: 0,
          end: 3,
          words: [
            { id: 'w1', text: 'Boyle', start: 0, end: 0.5 },
            { id: 'w2', text: 'bir', start: 0.8, end: 1.2 },
            { id: 'w3', text: 'durumda', start: 1.5, end: 2.4 },
          ],
        },
      ],
    })

    const textEvents = ass.split('\n').filter((line) => line.startsWith('Dialogue: 1,'))
    expect(textEvents.length).toBeGreaterThan(3)
    for (let index = 1; index < textEvents.length; index += 1) {
      expect(textEvents[index - 1].split(',')[2]).toBe(textEvents[index].split(',')[1])
    }
    expect(ass.match(/\\p1/g)).toHaveLength(1)
    expect(ass.match(/\\fad/g)).toHaveLength(2)
    expect(ass.split('\n').filter((line) => line.startsWith('Dialogue: 0,'))).toHaveLength(1)
    const mainStyle = ass.split('\n').find((line) => line.startsWith('Style: Main,'))
    expect(mainStyle?.split(',')[15]).toBe('1')
  })

  it('draws a fitted background for every wrapped line', () => {
    const blackBar = STYLE_PRESETS.find((preset) => preset.presetName === 'Black Bar')
    if (!blackBar) throw new Error('Black Bar preset is missing')
    const ass = buildAssDocument({
      width: 720,
      height: 1280,
      style: { ...blackBar, backgroundMode: 'lines', maxWidth: 28 },
      chunks: [{
        id: 'lines', text: 'bir iki uc dort bes alti', start: 0, end: 2,
        words: ['bir', 'iki', 'uc', 'dort', 'bes', 'alti'].map((text, index) => ({
          id: `w${index}`, text, start: index * 0.3, end: index * 0.3 + 0.3,
        })),
      }],
    })
    const background = ass.split('\n').find((line) => line.startsWith('Dialogue: 0,')) ?? ''
    expect((background.match(/m /g) ?? []).length).toBeGreaterThan(1)
    expect(background).toContain('\\p1')
  })
})
