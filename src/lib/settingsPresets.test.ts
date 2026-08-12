import { describe, expect, it } from 'vitest'
import type { CaptionProject } from '../types'
import { cloneDefaultVariants, DEFAULT_CANVAS, DEFAULT_EXPORT_SETTINGS, DEFAULT_SETTINGS, DEFAULT_STYLE } from './models'
import {
  applySettingsPreset,
  createSettingsPreset,
  loadAutoTranscribePreference,
  loadSettingsPresets,
  persistAutoTranscribePreference,
  persistSettingsPresets,
} from './settingsPresets'

function projectFixture(): CaptionProject {
  return {
    id: 'project-1',
    title: 'Test',
    createdAt: 1,
    updatedAt: 1,
    mediaName: 'test.mp4',
    mediaType: 'video/mp4',
    mediaSize: 100,
    mediaDuration: 10,
    transcriptText: '',
    chunks: [{ id: 'chunk-1', text: 'Test', start: 0, end: 1, words: [], variantId: 'missing' }],
    audioTracks: [],
    style: { ...DEFAULT_STYLE },
    variants: cloneDefaultVariants(),
    settings: { ...DEFAULT_SETTINGS },
    canvas: { ...DEFAULT_CANVAS },
    exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
  }
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

describe('settings presets', () => {
  it('captures and restores style, canvas, transcription, and export settings', () => {
    const source = projectFixture()
    source.style = { ...source.style, fontFamily: 'Impact', fontSize: 88 }
    source.variants = source.variants.map((variant) => ({ ...variant, style: { ...variant.style, positionY: 64 } }))
    source.settings = { ...source.settings, modelKey: 'large', autoTranscribe: true, maxWordsPerCaption: 4 }
    source.canvas = { ...source.canvas, aspectRatio: '9:16', scaleMode: 'cover', showSafeZone: true }
    source.exportSettings = { ...source.exportSettings, resolution: '2160p', frameRate: '60', codec: 'h265' }

    const preset = createSettingsPreset(source, 'Dikey Turbo')
    const applied = applySettingsPreset(projectFixture(), preset)

    expect(applied.style.fontFamily).toBe('Impact')
    expect(applied.style.fontSize).toBe(88)
    expect(applied.variants[0].style.positionY).toBe(64)
    expect(applied.settings).toMatchObject({ modelKey: 'large', autoTranscribe: true, maxWordsPerCaption: 4 })
    expect(applied.canvas).toMatchObject({ aspectRatio: '9:16', scaleMode: 'cover', showSafeZone: true })
    expect(applied.exportSettings).toMatchObject({ resolution: '2160p', frameRate: '60', codec: 'h265' })
    expect(applied.chunks[0].variantId).toBe('main')
  })

  it('persists presets and the automatic transcription preference', () => {
    const storage = memoryStorage()
    const preset = createSettingsPreset(projectFixture(), 'Tum ayarlar')

    persistSettingsPresets([preset], storage)
    persistAutoTranscribePreference(false, storage)

    expect(loadSettingsPresets(storage)).toEqual([preset])
    expect(loadAutoTranscribePreference(storage)).toBe(false)
  })
})
