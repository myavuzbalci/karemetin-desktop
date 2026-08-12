import { describe, expect, it } from 'vitest'
import { translateUiText } from './i18n'

describe('translateUiText', () => {
  it('uses English for the default interface mode', () => {
    expect(translateUiText('Altyazilar', 'en')).toBe('Captions')
    expect(translateUiText('3 segment', 'en')).toBe('3 segments')
    expect(translateUiText('2 kelime secili', 'en')).toBe('2 words selected')
  })

  it('returns to Turkish without changing untranslated content', () => {
    expect(translateUiText('Captions', 'tr')).toBe('Altyazilar')
    expect(translateUiText('3 segments', 'tr')).toBe('3 segment')
    expect(translateUiText('Kullanici altyazisi', 'en')).toBe('Kullanici altyazisi')
  })
})
