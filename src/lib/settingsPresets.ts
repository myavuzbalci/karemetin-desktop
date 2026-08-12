import type { CaptionProject, SettingsPreset } from '../types'
import { normalizeProject } from './project'
import { cryptoId } from './srt'

export const SETTINGS_PRESETS_KEY = 'caption-studio-settings-presets'
export const AUTO_TRANSCRIBE_KEY = 'caption-studio-auto-transcribe'

export function createSettingsPreset(project: CaptionProject, name: string): SettingsPreset {
  return {
    id: cryptoId('settings-preset'),
    name: name.trim(),
    createdAt: Date.now(),
    style: { ...project.style },
    variants: project.variants.map((variant) => ({ ...variant, style: { ...variant.style } })),
    settings: { ...project.settings },
    canvas: { ...project.canvas },
    exportSettings: { ...project.exportSettings },
  }
}

export function applySettingsPreset(project: CaptionProject, preset: SettingsPreset) {
  const variants = preset.variants.map((variant) => ({ ...variant, style: { ...variant.style } }))
  const variantIds = new Set(variants.map((variant) => variant.id))
  return normalizeProject({
    ...project,
    style: { ...preset.style },
    variants,
    settings: { ...preset.settings },
    canvas: { ...preset.canvas },
    exportSettings: { ...preset.exportSettings },
    chunks: project.chunks.map((chunk) => ({
      ...chunk,
      variantId: variantIds.has(chunk.variantId ?? 'main') ? chunk.variantId ?? 'main' : 'main',
    })),
    updatedAt: Date.now(),
  })
}

export function loadSettingsPresets(storage: Pick<Storage, 'getItem'> = localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(SETTINGS_PRESETS_KEY) ?? '[]') as SettingsPreset[]
    return parsed.filter((preset) => preset?.id && preset.name && preset.style && preset.settings && preset.canvas && preset.exportSettings)
  } catch {
    return []
  }
}

export function persistSettingsPresets(presets: SettingsPreset[], storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(SETTINGS_PRESETS_KEY, JSON.stringify(presets))
}

export function loadAutoTranscribePreference(storage: Pick<Storage, 'getItem'> = localStorage) {
  return storage.getItem(AUTO_TRANSCRIBE_KEY) !== 'false'
}

export function persistAutoTranscribePreference(enabled: boolean, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(AUTO_TRANSCRIBE_KEY, String(enabled))
}
