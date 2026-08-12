import type { CaptionProject, SubtitleChunk } from '../types'
import {
  cloneDefaultVariants,
  DEFAULT_CANVAS,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
  normalizeStyle,
} from './models'

export function normalizeProject(project: CaptionProject): CaptionProject {
  const variants = project.variants?.length
    ? project.variants.map((variant) => ({ ...variant, style: normalizeStyle(variant.style) }))
    : cloneDefaultVariants()

  return {
    ...project,
    style: normalizeStyle(project.style ?? DEFAULT_STYLE),
    variants,
    chunks: (project.chunks ?? []).map(normalizeChunk),
    audioTracks: project.audioTracks ?? [],
    settings: { ...DEFAULT_SETTINGS, ...project.settings },
    canvas: { ...DEFAULT_CANVAS, ...project.canvas },
    exportSettings: { ...DEFAULT_EXPORT_SETTINGS, ...project.exportSettings },
  }
}

export function normalizeChunk(chunk: SubtitleChunk): SubtitleChunk {
  return {
    ...chunk,
    words: (chunk.words ?? []).map((word) => ({ ...word, style: word.style ? { ...word.style } : undefined })),
  }
}

export function mediaUrlFromPath(mediaPath: string) {
  return `caption-media://local/${encodeURIComponent(mediaPath.replace(/\\/g, '/'))}`
}
