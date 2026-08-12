import { createWriteStream } from 'node:fs'
import { access, mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { net } from 'electron'

export const MODEL_REPOSITORY = 'onnx-community/whisper-large-v3-turbo_timestamped'

export const REQUIRED_MODEL_FILES = [
  'added_tokens.json',
  'config.json',
  'generation_config.json',
  'merges.txt',
  'normalizer.json',
  'preprocessor_config.json',
  'quantize_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'onnx/encoder_model_q4.onnx',
  'onnx/decoder_model_merged_q4.onnx',
] as const

export type ModelDownloadProgress = {
  file: string
  completedFiles: number
  totalFiles: number
  loadedBytes: number
  totalBytes?: number
}

export async function isModelReady(directory: string) {
  try {
    await Promise.all(REQUIRED_MODEL_FILES.map((file) => access(path.join(directory, file))))
    return true
  } catch {
    return false
  }
}

export async function downloadModel(directory: string, onProgress: (progress: ModelDownloadProgress) => void) {
  const temporaryDirectory = `${directory}.downloading`
  await rm(temporaryDirectory, { recursive: true, force: true })
  await mkdir(temporaryDirectory, { recursive: true })

  try {
    for (const [index, file] of REQUIRED_MODEL_FILES.entries()) {
      await downloadFile(file, path.join(temporaryDirectory, file), (loadedBytes, totalBytes) => {
        onProgress({
          file,
          completedFiles: index,
          totalFiles: REQUIRED_MODEL_FILES.length,
          loadedBytes,
          totalBytes,
        })
      })
      onProgress({
        file,
        completedFiles: index + 1,
        totalFiles: REQUIRED_MODEL_FILES.length,
        loadedBytes: 0,
      })
    }

    await rm(directory, { recursive: true, force: true })
    await rename(temporaryDirectory, directory)
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true })
    throw error
  }
}

async function downloadFile(file: string, destination: string, onProgress: (loadedBytes: number, totalBytes?: number) => void) {
  await mkdir(path.dirname(destination), { recursive: true })
  const source = `https://huggingface.co/${MODEL_REPOSITORY}/resolve/main/${file.split('/').map(encodeURIComponent).join('/')}?download=true`
  const response = await net.fetch(source)
  if (!response.ok || !response.body) throw new Error(`Model file could not be downloaded: ${file} (${response.status})`)

  const expected = Number(response.headers.get('content-length')) || undefined
  const reader = response.body.getReader()
  const output = createWriteStream(destination)
  let loaded = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      loaded += value.byteLength
      if (!output.write(value)) await onceDrain(output)
      onProgress(loaded, expected)
    }
    await closeOutput(output)
  } catch (error) {
    output.destroy()
    throw error
  } finally {
    reader.releaseLock()
  }
}

function onceDrain(stream: ReturnType<typeof createWriteStream>) {
  return new Promise<void>((resolve, reject) => {
    stream.once('drain', resolve)
    stream.once('error', reject)
  })
}

function closeOutput(stream: ReturnType<typeof createWriteStream>) {
  return new Promise<void>((resolve, reject) => {
    stream.once('error', reject)
    stream.end(resolve)
  })
}
