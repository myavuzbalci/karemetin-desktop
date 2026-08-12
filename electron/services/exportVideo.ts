import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildAssDocument } from '../../src/lib/ass'
import type { AspectRatio, ExportContainer, NativeExportRequest, NativeExportResult } from '../../src/types'
import { ffmpegBinary } from './binaries'

export type ExportCallbacks = {
  onProgress?: (progress: number, stage: string) => void
  onSpawn?: (child: ChildProcessWithoutNullStreams) => void
}

export async function exportNativeVideo(
  request: NativeExportRequest,
  callbacks: ExportCallbacks = {},
): Promise<NativeExportResult> {
  const startedAt = Date.now()
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'caption-studio-'))
  const dimensions = computeOutputDimensions(request)
  const normalAss = buildAssDocument({
    chunks: request.chunks,
    style: request.style,
    variants: request.variants,
    width: dimensions.width,
    height: dimensions.height,
  })
  const maskAss = buildAssDocument({
    chunks: request.chunks,
    style: request.style,
    variants: request.variants,
    width: dimensions.width,
    height: dimensions.height,
    palette: 'mask',
  })
  await Promise.all([
    writeFile(path.join(tempDirectory, 'captions.ass'), normalAss, 'utf8'),
    writeFile(path.join(tempDirectory, 'mask.ass'), maskAss, 'utf8'),
    mkdir(path.dirname(request.outputPath), { recursive: true }),
  ])

  try {
    const outputPaths = await exportByMode(request, dimensions, tempDirectory, callbacks)
    callbacks.onProgress?.(1, 'complete')
    return { outputPaths, elapsedMs: Date.now() - startedAt }
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}

export function computeOutputDimensions(request: NativeExportRequest) {
  const resolution = request.settings.resolution
  if (resolution === 'custom') {
    return {
      width: even(request.settings.customWidth),
      height: even(request.settings.customHeight),
    }
  }

  const ratio = aspectRatioValue(request.canvas.aspectRatio, request.sourceWidth / Math.max(1, request.sourceHeight))
  if (resolution === 'source' && request.canvas.aspectRatio === 'source') {
    return { width: even(request.sourceWidth), height: even(request.sourceHeight) }
  }

  const base =
    resolution === 'source'
      ? ratio >= 1
        ? request.sourceHeight
        : request.sourceWidth
      : Number.parseInt(resolution.replace('p', ''), 10)

  if (ratio >= 1) {
    return { width: even(base * ratio), height: even(base) }
  }
  return { width: even(base), height: even(base / ratio) }
}

export function resolveContainer(request: NativeExportRequest): Exclude<ExportContainer, 'source'> {
  if (request.settings.mode === 'transparent' || request.settings.mode === 'mask-pair') return 'mov'
  if (request.settings.container !== 'source') return request.settings.container
  const extension = request.sourceExtension.toLowerCase().replace('.', '')
  return extension === 'mp4' || extension === 'mov' || extension === 'mkv' || extension === 'webm'
    ? extension
    : 'mp4'
}

async function exportByMode(
  request: NativeExportRequest,
  dimensions: { width: number; height: number },
  cwd: string,
  callbacks: ExportCallbacks,
) {
  if (request.settings.mode === 'transparent') {
    const outputPath = replaceExtension(request.outputPath, '.mov')
    await runFfmpeg(transparentArgs(request, dimensions, outputPath, 'captions.ass'), cwd, request.duration, callbacks)
    return [outputPath]
  }

  if (request.settings.mode === 'mask-pair') {
    const extensionless = request.outputPath.replace(/\.[^.]+$/, '')
    const captionsPath = `${extensionless}-captions.mov`
    const maskPath = `${extensionless}-mask.mov`
    await runFfmpeg(transparentArgs(request, dimensions, captionsPath, 'captions.ass'), cwd, request.duration, {
      ...callbacks,
      onProgress: (progress) => callbacks.onProgress?.(progress * 0.5, 'captions'),
    })
    await runFfmpeg(maskArgs(request, dimensions, maskPath), cwd, request.duration, {
      ...callbacks,
      onProgress: (progress) => callbacks.onProgress?.(0.5 + progress * 0.5, 'mask'),
    })
    return [captionsPath, maskPath]
  }

  const container = resolveContainer(request)
  const outputPath = replaceExtension(request.outputPath, `.${container}`)
  const args =
    request.settings.mode === 'green-screen'
      ? greenScreenArgs(request, dimensions, outputPath, container)
      : burnedVideoArgs(request, dimensions, outputPath, container)
  await runFfmpeg(args, cwd, request.duration, callbacks)
  return [outputPath]
}

function burnedVideoArgs(
  request: NativeExportRequest,
  dimensions: { width: number; height: number },
  outputPath: string,
  container: Exclude<ExportContainer, 'source'>,
) {
  const args = ['-y', '-hide_banner', '-i', request.inputPath]
  const usableTracks = (request.audioTracks ?? []).filter((track) => track.path && !track.muted)
  usableTracks.forEach((track) => args.push('-i', track.path as string))
  args.push('-vf', buildVideoFilter(request, dimensions, 'captions.ass'))
  args.push('-map', '0:v:0')
  if (usableTracks.length) {
    args.push('-filter_complex', buildAudioMixFilter(request, usableTracks))
    args.push('-map', '[mixed-audio]')
  } else {
    args.push('-map', '0:a?')
  }
  args.push(...videoEncodingArgs(request, container))
  args.push(...audioFilterArgs(request))
  args.push(...audioEncodingArgs(request, container))
  args.push(...frameRateArgs(request))
  if (container === 'mp4' || container === 'mov') args.push('-movflags', '+faststart')
  args.push('-progress', 'pipe:1', '-nostats', outputPath)
  return args
}

function buildAudioMixFilter(request: NativeExportRequest, tracks: NativeExportRequest['audioTracks']) {
  const inputs: string[] = []
  const filters: string[] = []
  if (request.sourceHasAudio ?? true) {
    filters.push(`[0:a]volume=${decimal(Math.max(0, request.settings.audioVolume) / 100)}[source-audio]`)
    inputs.push('[source-audio]')
  }
  tracks.forEach((track, index) => {
    const input = index + 1
    const stages = [`adelay=${Math.round(track.start * 1000)}|${Math.round(track.start * 1000)}`, `volume=${decimal(Math.max(0, track.volume) / 100)}`]
    if (track.fadeIn > 0) stages.push(`afade=t=in:st=${decimal(track.start)}:d=${decimal(track.fadeIn)}`)
    if (track.fadeOut > 0) stages.push(`afade=t=out:st=${decimal(Math.max(track.start, request.duration - track.fadeOut))}:d=${decimal(track.fadeOut)}`)
    filters.push(`[${input}:a]${stages.join(',')}[track-${index}]`)
    inputs.push(`[track-${index}]`)
  })
  filters.push(`${inputs.join('')}amix=inputs=${inputs.length}:duration=first:dropout_transition=2[mixed-audio]`)
  return filters.join(';')
}

function greenScreenArgs(
  request: NativeExportRequest,
  dimensions: { width: number; height: number },
  outputPath: string,
  container: Exclude<ExportContainer, 'source'>,
) {
  const fps = selectedFps(request)
  return [
    '-y',
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    `color=c=0x00b140:s=${dimensions.width}x${dimensions.height}:r=${fps}`,
    '-t',
    decimal(request.duration),
    '-vf',
    'ass=captions.ass',
    ...videoEncodingArgs(request, container),
    '-an',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath,
  ]
}

function transparentArgs(
  request: NativeExportRequest,
  dimensions: { width: number; height: number },
  outputPath: string,
  assFile: string,
) {
  const fps = selectedFps(request)
  return [
    '-y',
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    `color=c=black@0.0:s=${dimensions.width}x${dimensions.height}:r=${fps},format=rgba`,
    '-t',
    decimal(request.duration),
    '-vf',
    `ass=${assFile},format=rgba`,
    '-c:v',
    'qtrle',
    '-pix_fmt',
    'argb',
    '-an',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath,
  ]
}

function maskArgs(
  request: NativeExportRequest,
  dimensions: { width: number; height: number },
  outputPath: string,
) {
  const fps = selectedFps(request)
  return [
    '-y',
    '-hide_banner',
    '-f',
    'lavfi',
    '-i',
    `color=c=black:s=${dimensions.width}x${dimensions.height}:r=${fps}`,
    '-t',
    decimal(request.duration),
    '-vf',
    'ass=mask.ass,format=gray',
    '-c:v',
    'ffv1',
    '-an',
    '-progress',
    'pipe:1',
    '-nostats',
    outputPath,
  ]
}

function buildVideoFilter(
  request: NativeExportRequest,
  dimensions: { width: number; height: number },
  assFile: string,
) {
  const filters: string[] = []
  const needsCanvas =
    dimensions.width !== request.sourceWidth ||
    dimensions.height !== request.sourceHeight ||
    request.canvas.aspectRatio !== 'source'

  if (needsCanvas) {
    if (request.canvas.scaleMode === 'cover') {
      filters.push(
        `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=increase`,
        `crop=${dimensions.width}:${dimensions.height}`,
      )
    } else {
      filters.push(
        `scale=${dimensions.width}:${dimensions.height}:force_original_aspect_ratio=decrease`,
        `pad=${dimensions.width}:${dimensions.height}:(ow-iw)/2:(oh-ih)/2:color=${ffmpegColor(request.canvas.backgroundColor)}`,
      )
    }
  }
  filters.push(`ass=${assFile}`)
  return filters.join(',')
}

function videoEncodingArgs(request: NativeExportRequest, container: Exclude<ExportContainer, 'source'>) {
  const codec = request.settings.codec === 'auto' ? (container === 'webm' ? 'vp9' : 'h264') : request.settings.codec
  const crf = qualityCrf(request.settings.quality, codec)
  const preset = compressionPreset(request.settings.compression, request.settings.speed)

  if (codec === 'vp9') {
    return ['-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p']
  }
  if (codec === 'h265') {
    return ['-c:v', 'libx265', '-crf', String(crf), '-preset', preset, '-pix_fmt', 'yuv420p']
  }
  return ['-c:v', 'libx264', '-crf', String(crf), '-preset', preset, '-pix_fmt', 'yuv420p']
}

function audioEncodingArgs(request: NativeExportRequest, container: Exclude<ExportContainer, 'source'>) {
  if (request.settings.audio === 'mute') return ['-an']
  if (request.settings.audio === 'copy' && !hasAudioFilters(request)) return ['-c:a', 'copy']
  if (container === 'webm') {
    return ['-c:a', 'libopus', '-b:a', request.settings.audio === 'high' ? '256k' : '160k']
  }
  return ['-c:a', 'aac', '-b:a', request.settings.audio === 'high' ? '320k' : '192k']
}

function hasAudioFilters(request: NativeExportRequest) {
  const { audioVolume, audioNormalize, audioFadeIn, audioFadeOut } = request.settings
  return audioVolume !== 100 || audioNormalize || audioFadeIn > 0 || audioFadeOut > 0 || (request.audioTracks ?? []).some((track) => !track.muted && track.path)
}

function audioFilterArgs(request: NativeExportRequest) {
  if (request.settings.audio === 'mute' || !hasAudioFilters(request)) return []
  const hasTracks = (request.audioTracks ?? []).some((track) => !track.muted && track.path)
  const filters = hasTracks ? [] : [`volume=${decimal(Math.max(0, request.settings.audioVolume) / 100)}`]
  if (request.settings.audioNormalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11')
  if (request.settings.audioFadeIn > 0) filters.push(`afade=t=in:st=0:d=${decimal(request.settings.audioFadeIn)}`)
  if (request.settings.audioFadeOut > 0) {
    const start = Math.max(0, request.duration - request.settings.audioFadeOut)
    filters.push(`afade=t=out:st=${decimal(start)}:d=${decimal(request.settings.audioFadeOut)}`)
  }
  if (!filters.length) return []
  return ['-af', filters.join(',')]
}

function frameRateArgs(request: NativeExportRequest) {
  if (request.settings.frameRate === 'source') return []
  return ['-r', decimal(selectedFps(request))]
}

function selectedFps(request: NativeExportRequest) {
  if (request.settings.frameRate === 'source') return request.sourceFps || 30
  if (request.settings.frameRate === 'custom') return request.settings.customFps || 30
  return Number(request.settings.frameRate)
}

function qualityCrf(quality: number, codec: 'h264' | 'h265' | 'vp9') {
  const normalized = Math.min(100, Math.max(1, quality))
  if (codec === 'vp9') return Math.round(48 - normalized * 0.36)
  if (codec === 'h265') return Math.round(36 - normalized * 0.2)
  return Math.round(38 - normalized * 0.24)
}

function compressionPreset(compression: number, speed: NativeExportRequest['settings']['speed']) {
  const adjusted = compression + (speed === 'quality' ? 20 : speed === 'fast' ? -20 : 0)
  if (adjusted >= 85) return 'veryslow'
  if (adjusted >= 65) return 'slow'
  if (adjusted >= 45) return 'medium'
  if (adjusted >= 25) return 'fast'
  return 'veryfast'
}

function runFfmpeg(
  args: string[],
  cwd: string,
  duration: number,
  callbacks: ExportCallbacks,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBinary, args, { cwd, windowsHide: true })
    callbacks.onSpawn?.(child)
    let stderr = ''
    let progressBuffer = ''

    child.stdout.on('data', (chunk: Buffer) => {
      progressBuffer += chunk.toString('utf8')
      const lines = progressBuffer.split(/\r?\n/)
      progressBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const [key, value] = line.split('=', 2)
        if ((key === 'out_time_us' || key === 'out_time_ms') && duration > 0) {
          const seconds = Number(value) / 1_000_000
          callbacks.onProgress?.(Math.min(0.999, Math.max(0, seconds / duration)), 'rendering')
        }
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) resolve()
      else if (signal) reject(new Error('Export iptal edildi.'))
      else reject(new Error(lastError(stderr) || `FFmpeg ${code} koduyla kapandi.`))
    })
  })
}

function aspectRatioValue(aspectRatio: AspectRatio, sourceRatio: number) {
  const ratios: Record<Exclude<AspectRatio, 'source'>, number> = {
    '1:1': 1,
    '9:16': 9 / 16,
    '16:9': 16 / 9,
    '4:3': 4 / 3,
    '3:4': 3 / 4,
  }
  return aspectRatio === 'source' ? sourceRatio || 16 / 9 : ratios[aspectRatio]
}

function replaceExtension(inputPath: string, extension: string) {
  return `${inputPath.replace(/\.[^.]+$/, '')}${extension}`
}

function ffmpegColor(value: string) {
  return `0x${value.replace('#', '').slice(0, 6).padEnd(6, '0')}`
}

function even(value: number) {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

function decimal(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

function lastError(stderr: string) {
  return stderr
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-8)
    .join('\n')
}
