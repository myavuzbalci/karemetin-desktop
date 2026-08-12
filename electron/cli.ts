import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env, pipeline } from '@huggingface/transformers'
import { buildAssDocument } from '../src/lib/ass'
import {
  cloneDefaultVariants,
  DEFAULT_CANVAS,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
} from '../src/lib/models'
import { chunksToSrt, cryptoId } from '../src/lib/srt'
import { normalizeTranscription } from '../src/lib/transcription'
import type { CaptionProject, SettingsPreset } from '../src/types'
import { exportNativeVideo } from './services/exportVideo'
import { extractMonoAudio, inspectMedia } from './services/media'

type CliOptions = {
  inputPath: string
  outputDirectory: string
  presetPath?: string
  presetName?: string
  renderVideo: boolean
}

export function parseCliOptions(args: string[]): CliOptions | undefined {
  if (!args.includes('--caption-cli')) return undefined
  const inputPath = optionValue(args, '--caption-input')
  if (!inputPath) throw new Error('Kullanim: Caption Studio.exe --caption-cli --caption-input="video.mp4" [--caption-preset="ayar.json" | --caption-preset-name="soru cevap"] [--caption-output-dir="klasor"] [--caption-no-video]')
  const outputDirectory = optionValue(args, '--caption-output-dir')
  return {
    inputPath: path.resolve(inputPath),
    outputDirectory: path.resolve(outputDirectory ?? path.join(path.dirname(inputPath), `${path.basename(inputPath, path.extname(inputPath))}-caption-studio`)),
    presetPath: optionValue(args, '--caption-preset'),
    presetName: optionValue(args, '--caption-preset-name'),
    renderVideo: !args.includes('--caption-no-video'),
  }
}

export async function runCli(options: CliOptions, modelDirectory: string, settingsPresetFile: string) {
  const media = await inspectMedia(options.inputPath)
  if (!media.metadata.hasAudio) throw new Error('Girdi dosyasinda transkripsiyon icin ses bulunamadi.')
  if (options.presetPath && options.presetName) throw new Error('Tek seferde sadece bir preset secilebilir.')
  const preset = options.presetPath
    ? await loadPreset(path.resolve(options.presetPath))
    : options.presetName
      ? await loadSavedPreset(settingsPresetFile, options.presetName)
      : undefined
  const now = Date.now()
  const project = makeProject(media, preset, now)
  const audioBytes = await extractMonoAudio(options.inputPath)
  const audio = new Float32Array(audioBytes.buffer, audioBytes.byteOffset, Math.floor(audioBytes.byteLength / 4))

  env.allowLocalModels = true
  env.allowRemoteModels = false
  env.localModelPath = modelDirectory
  env.useFS = true
  console.log('Yerel Turbo model yukleniyor (internet kullanilmaz)...')
  const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-large-v3-turbo_timestamped', {
    device: 'cpu',
    dtype: 'q4',
    local_files_only: true,
  })
  console.log('Transkripsiyon basladi...')
  const result = await transcriber(audio, {
    return_timestamps: 'word',
    chunk_length_s: project.settings.chunkLengthSeconds,
    stride_length_s: project.settings.strideSeconds,
    task: 'transcribe',
    ...(project.settings.language !== 'auto' ? { language: project.settings.language } : {}),
  })
  const transcript = normalizeTranscription(
    result,
    project.mediaDuration,
    project.settings.maxWordsPerCaption,
    project.settings.maxCaptionDuration,
  )
  project.transcriptText = transcript.text
  project.chunks = transcript.chunks.map((chunk) => ({ ...chunk, variantId: 'main' }))
  project.updatedAt = Date.now()

  await mkdir(options.outputDirectory, { recursive: true })
  const stem = path.basename(options.inputPath, path.extname(options.inputPath))
  const srtPath = path.join(options.outputDirectory, `${stem}.srt`)
  const textPath = path.join(options.outputDirectory, `${stem}.txt`)
  const assPath = path.join(options.outputDirectory, `${stem}.ass`)
  const projectPath = path.join(options.outputDirectory, `${stem}.captionstudio`)
  const ass = buildAssDocument({
    chunks: project.chunks,
    style: project.style,
    variants: project.variants,
    width: project.metadata?.width ?? 1920,
    height: project.metadata?.height ?? 1080,
  })
  await Promise.all([
    writeFile(srtPath, chunksToSrt(project.chunks), 'utf8'),
    writeFile(textPath, project.transcriptText, 'utf8'),
    writeFile(assPath, ass, 'utf8'),
    writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8'),
  ])

  const outputs = [srtPath, textPath, assPath, projectPath]
  if (options.renderVideo) {
    const videoPath = path.join(options.outputDirectory, `${stem}-captioned${path.extname(options.inputPath) || '.mp4'}`)
    console.log('Altyazili video disa aktariliyor...')
    const rendered = await exportNativeVideo({
      jobId: cryptoId('cli-export'),
      inputPath: options.inputPath,
      outputPath: videoPath,
      title: project.title,
      duration: project.mediaDuration,
      sourceWidth: project.metadata?.width ?? 1920,
      sourceHeight: project.metadata?.height ?? 1080,
      sourceFps: project.metadata?.fps ?? 30,
      sourceExtension: path.extname(options.inputPath),
      chunks: project.chunks,
      style: project.style,
      variants: project.variants,
      canvas: project.canvas,
      settings: project.exportSettings,
      sourceHasAudio: project.metadata?.hasAudio ?? true,
      audioTracks: [],
    })
    outputs.push(...rendered.outputPaths)
  }
  return outputs
}

async function loadPreset(presetPath: string): Promise<Partial<SettingsPreset>> {
  return JSON.parse(await readFile(presetPath, 'utf8')) as Partial<SettingsPreset>
}

async function loadSavedPreset(settingsPresetFile: string, presetName: string): Promise<SettingsPreset> {
  const presets = JSON.parse(await readFile(settingsPresetFile, 'utf8')) as SettingsPreset[]
  const preset = presets.find((item) => item.name.localeCompare(presetName, 'tr', { sensitivity: 'accent' }) === 0)
  if (!preset) throw new Error(`Kayitli preset bulunamadi: ${presetName}`)
  return preset
}

function makeProject(media: Awaited<ReturnType<typeof inspectMedia>>, preset: Partial<SettingsPreset> | undefined, now: number): CaptionProject {
  return {
    id: cryptoId('cli-project'),
    title: path.basename(media.name, path.extname(media.name)),
    createdAt: now,
    updatedAt: now,
    mediaName: media.name,
    mediaType: media.type,
    mediaSize: media.size,
    mediaDuration: media.metadata.duration,
    mediaPath: media.path,
    metadata: media.metadata,
    audioTracks: [],
    transcriptText: '',
    chunks: [],
    style: { ...DEFAULT_STYLE, ...preset?.style },
    variants: preset?.variants?.length ? preset.variants.map((variant) => ({ ...variant, style: { ...variant.style } })) : cloneDefaultVariants(),
    settings: { ...DEFAULT_SETTINGS, ...preset?.settings, autoTranscribe: false },
    canvas: { ...DEFAULT_CANVAS, ...preset?.canvas },
    exportSettings: { ...DEFAULT_EXPORT_SETTINGS, ...preset?.exportSettings },
  }
}

function optionValue(args: string[], name: string) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
