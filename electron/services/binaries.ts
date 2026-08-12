import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'

const require = createRequire(import.meta.url)

function optionalRequire<T>(id: string): T | undefined {
  try {
    return require(id) as T
  } catch {
    return undefined
  }
}

const staticFfmpeg = optionalRequire<string | null>('ffmpeg-static')
const staticFfprobe = optionalRequire<{ path?: string }>('ffprobe-static')

export const ffmpegBinary = resolveBinary(staticFfmpeg || undefined, 'ffmpeg')
export const ffprobeBinary = resolveBinary(staticFfprobe?.path, 'ffprobe')

function resolveBinary(candidate: string | undefined, fallback: string) {
  if (!candidate) return fallback
  const unpacked = candidate.replace('app.asar', 'app.asar.unpacked')
  if (existsSync(unpacked)) return unpacked
  if (existsSync(candidate)) return candidate
  return fallback
}
