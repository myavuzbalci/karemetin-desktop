import { env, pipeline } from '@huggingface/transformers'
import type {
  ModelKey,
  TranscriptionWorkerRequest,
  TranscriptionWorkerResponse,
  WorkerProgress,
} from '../types'
import { MODEL_CONFIGS } from '../lib/models'

type Transcriber = Awaited<ReturnType<typeof pipeline<'automatic-speech-recognition'>>>

env.allowLocalModels = false
env.allowRemoteModels = true

const transcribers = new Map<ModelKey, Promise<Transcriber>>()

self.onmessage = async (event: MessageEvent<TranscriptionWorkerRequest>) => {
  const message = event.data

  if (message.type === 'dispose') {
    transcribers.clear()
    return
  }

  try {
    let device = await getPreferredDevice()
    let transcriber: Transcriber
    try {
      transcriber = await getTranscriber(message.modelKey, device, message.bundledModelBaseUrl)
    } catch (error) {
      if (device !== 'webgpu') throw error
      // An adapter can exist while still failing model initialization because
      // of driver, memory, or operator support. Retry the bundled q4 CPU path.
      transcribers.delete(message.modelKey)
      device = 'wasm'
      transcriber = await getTranscriber(message.modelKey, device, message.bundledModelBaseUrl)
    }
    post({ type: 'ready', payload: { modelKey: message.modelKey, device } })

    const result = await transcriber(message.audio, {
      return_timestamps: 'word',
      chunk_length_s: message.chunkLengthSeconds,
      stride_length_s: message.strideSeconds,
      task: 'transcribe',
      ...(message.language !== 'auto' ? { language: message.language } : {}),
    })

    post({ type: 'result', payload: result })
  } catch (error) {
    post({ type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

function getTranscriber(modelKey: ModelKey, device: 'webgpu' | 'wasm', bundledModelBaseUrl?: string) {
  const cached = transcribers.get(modelKey)
  if (cached) return cached

  const config = MODEL_CONFIGS[modelKey]
  if (bundledModelBaseUrl) {
    env.allowLocalModels = true
    env.localModelPath = bundledModelBaseUrl
    env.allowRemoteModels = false
  } else {
    env.allowLocalModels = false
    env.allowRemoteModels = true
  }
  const promise = pipeline('automatic-speech-recognition', config.modelId, {
    device,
    dtype: getDtype(modelKey, device),
    local_files_only: Boolean(bundledModelBaseUrl),
    progress_callback: (progress: WorkerProgress) => post({ type: 'progress', payload: progress }),
  })

  transcribers.set(modelKey, promise)
  return promise
}

async function getPreferredDevice(): Promise<'webgpu' | 'wasm'> {
  const maybeNavigator = navigator as Navigator & {
    gpu?: {
      requestAdapter: () => Promise<unknown>
    }
  }
  if (!maybeNavigator.gpu) return 'wasm'

  try {
    const adapter = await maybeNavigator.gpu.requestAdapter()
    return adapter ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

function getDtype(modelKey: ModelKey, device: 'webgpu' | 'wasm') {
  // q4 is supported by both WebGPU and WASM. Shipping one local model variant
  // keeps the offline portable build compact while retaining GPU acceleration.
  void modelKey
  void device
  return 'q4' as const
}

function post(message: TranscriptionWorkerResponse) {
  self.postMessage(message)
}
