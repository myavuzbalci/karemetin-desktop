import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { DesktopMediaFile, MediaMetadata } from '../../src/types'
import { ffmpegBinary, ffprobeBinary } from './binaries'

type ProcessResult = {
  stdout: Buffer
  stderr: string
}

export async function inspectMedia(inputPath: string): Promise<DesktopMediaFile> {
  const [metadata, fileStats] = await Promise.all([probeMedia(inputPath), stat(inputPath)])
  return {
    path: inputPath,
    url: mediaUrl(inputPath),
    name: path.basename(inputPath),
    type: mimeFromPath(inputPath),
    size: fileStats.size,
    metadata,
  }
}

export async function probeMedia(inputPath: string): Promise<MediaMetadata> {
  const result = await runProcess(ffprobeBinary, [
    '-v',
    'error',
    '-show_entries',
    'format=duration,format_name:stream=index,codec_type,codec_name,width,height,avg_frame_rate,r_frame_rate',
    '-of',
    'json',
    inputPath,
  ])
  const parsed = JSON.parse(result.stdout.toString('utf8')) as {
    format?: { duration?: string; format_name?: string }
    streams?: Array<{
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      avg_frame_rate?: string
      r_frame_rate?: string
    }>
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video')
  const audio = parsed.streams?.find((stream) => stream.codec_type === 'audio')
  const duration = Number(parsed.format?.duration ?? 0)

  return {
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: parseRate(video?.avg_frame_rate || video?.r_frame_rate),
    duration: Number.isFinite(duration) ? duration : 0,
    format: parsed.format?.format_name ?? path.extname(inputPath).slice(1),
    videoCodec: video?.codec_name ?? '',
    audioCodec: audio?.codec_name ?? '',
    hasAudio: Boolean(audio),
  }
}

export async function extractMonoAudio(inputPath: string) {
  const result = await runProcess(ffmpegBinary, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-f',
    'f32le',
    'pipe:1',
  ])
  return result.stdout
}

export async function extractWaveform(inputPath: string, pointCount = 1000) {
  const result = await runProcess(ffmpegBinary, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '4000',
    '-f',
    'f32le',
    'pipe:1',
  ])
  const sampleCount = Math.floor(result.stdout.byteLength / 4)
  if (!sampleCount) return []
  const samples = new Float32Array(
    result.stdout.buffer,
    result.stdout.byteOffset,
    sampleCount,
  )
  const points = Math.min(pointCount, sampleCount)
  const bucketSize = sampleCount / points
  const waveform = new Array<number>(points)

  for (let point = 0; point < points; point += 1) {
    const start = Math.floor(point * bucketSize)
    const end = Math.max(start + 1, Math.floor((point + 1) * bucketSize))
    let peak = 0
    for (let index = start; index < end && index < sampleCount; index += 1) {
      peak = Math.max(peak, Math.abs(samples[index]))
    }
    waveform[point] = Math.round(Math.min(1, peak) * 1000) / 1000
  }
  return waveform
}

export async function getFfmpegVersion() {
  const result = await runProcess(ffmpegBinary, ['-version'])
  return result.stdout.toString('utf8').split(/\r?\n/)[0] || 'FFmpeg hazir'
}

export function mediaUrl(inputPath: string) {
  return `caption-media://local/${encodeURIComponent(inputPath.replace(/\\/g, '/'))}`
}

export function mimeFromPath(inputPath: string) {
  const extension = path.extname(inputPath).toLowerCase()
  const types: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.m4v': 'video/x-m4v',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
  }
  return types[extension] ?? 'application/octet-stream'
}

function parseRate(value?: string) {
  if (!value) return 0
  const [numerator, denominator = '1'] = value.split('/')
  const rate = Number(numerator) / Math.max(1, Number(denominator))
  return Number.isFinite(rate) ? Math.round(rate * 1000) / 1000 : 0
}

function runProcess(command: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true })
    const stdout: Buffer[] = []
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: Buffer.concat(stdout), stderr })
      } else {
        reject(new Error(stderr.trim() || `${path.basename(command)} ${code} koduyla kapandi.`))
      }
    })
  })
}
