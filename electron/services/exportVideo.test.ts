// @vitest-environment node

import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_CANVAS, DEFAULT_EXPORT_SETTINGS, STYLE_PRESETS } from '../../src/lib/models'
import type { NativeExportRequest } from '../../src/types'
import { exportNativeVideo } from './exportVideo'
import { probeMedia } from './media'

let outputDirectory = ''

beforeAll(async () => {
  outputDirectory = await mkdtemp(path.join(tmpdir(), 'caption-studio-export-test-'))
})

afterAll(async () => {
  await rm(outputDirectory, { recursive: true, force: true })
})

describe('native FFmpeg exporter', () => {
  it('preserves source dimensions, framerate, extension, and audio', async () => {
    const outputPath = path.join(outputDirectory, 'captioned.webm')
    const result = await exportNativeVideo(makeRequest(outputPath))
    const metadata = await probeMedia(result.outputPaths[0])

    expect((await stat(result.outputPaths[0])).size).toBeGreaterThan(10_000)
    expect(path.extname(result.outputPaths[0])).toBe('.webm')
    expect(metadata.width).toBe(320)
    expect(metadata.height).toBe(180)
    expect(metadata.fps).toBeCloseTo(25, 1)
    expect(metadata.hasAudio).toBe(true)
  }, 60_000)

  it('exports a transparent MOV subtitle layer', async () => {
    const outputPath = path.join(outputDirectory, 'overlay.mov')
    const request = makeRequest(outputPath)
    request.duration = 1.2
    request.settings = { ...request.settings, mode: 'transparent' }
    request.chunks = request.chunks.map((chunk) => ({ ...chunk, end: 1.2, words: chunk.words.map((word) => ({ ...word, end: Math.min(1.2, word.end) })) }))

    const result = await exportNativeVideo(request)
    const metadata = await probeMedia(result.outputPaths[0])

    expect(path.extname(result.outputPaths[0])).toBe('.mov')
    expect(metadata.videoCodec).toBe('qtrle')
    expect(metadata.hasAudio).toBe(false)
  }, 60_000)

  it('mixes an added audio track into the exported video', async () => {
    const outputPath = path.join(outputDirectory, 'mixed-audio.mp4')
    const request = makeRequest(outputPath)
    request.settings = { ...request.settings, container: 'mp4' }
    request.audioTracks = [{
      id: 'voiceover', name: 'speech.wav', path: path.resolve('tests/fixtures/speech.wav'),
      start: 0, volume: 80, fadeIn: 0.1, fadeOut: 0.1, muted: false,
    }]
    const result = await exportNativeVideo(request)
    const metadata = await probeMedia(result.outputPaths[0])

    expect(metadata.hasAudio).toBe(true)
    expect(path.extname(result.outputPaths[0])).toBe('.mp4')
  }, 60_000)
})

function makeRequest(outputPath: string): NativeExportRequest {
  return {
    jobId: 'integration-export',
    inputPath: path.resolve('tests/fixtures/sample.webm'),
    outputPath,
    title: 'Integration',
    duration: 9.008,
    sourceWidth: 320,
    sourceHeight: 180,
    sourceFps: 25,
    sourceExtension: 'webm',
    sourceHasAudio: true,
    audioTracks: [],
    style: { ...STYLE_PRESETS[0], fontSize: 46, strokeWidth: 4 },
    variants: [],
    canvas: { ...DEFAULT_CANVAS },
    settings: {
      ...DEFAULT_EXPORT_SETTINGS,
      container: 'source',
      resolution: 'source',
      frameRate: 'source',
      quality: 70,
      compression: 10,
      audio: 'standard',
    },
    chunks: [
      {
        id: 'caption',
        text: 'Native export calisiyor',
        start: 0,
        end: 2,
        words: [
          { id: 'w1', text: 'Native', start: 0, end: 0.7 },
          { id: 'w2', text: 'export', start: 0.7, end: 1.3, style: { textColor: '#ffe600' } },
          { id: 'w3', text: 'calisiyor', start: 1.3, end: 2 },
        ],
      },
    ],
  }
}
