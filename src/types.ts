export type ModelKey = 'large' | 'base'

export type WorkflowStatus =
  | 'idle'
  | 'decoding'
  | 'loading-model'
  | 'transcribing'
  | 'saving'
  | 'exporting'
  | 'error'

export type TextAlign = 'left' | 'center' | 'right'
export type TextTransform = 'none' | 'uppercase' | 'lowercase'
export type CaptionTransition = 'none' | 'fade' | 'zoom' | 'stomp'
export type WordTransition = 'none' | 'fade' | 'zoom' | 'pop'
export type BackgroundMode = 'none' | 'caption' | 'lines'

export type WordStyleOverride = {
  slotId?: string
  textColor?: string
  backgroundColor?: string
  backgroundOpacity?: number
  strokeColor?: string
  strokeWidth?: number
  shadow?: boolean
  fontScale?: number
  fontWeight?: number
  italic?: boolean
  underline?: boolean
}

export type TranscriptWord = {
  id: string
  text: string
  start: number
  end: number
  style?: WordStyleOverride
}

export type SubtitleChunk = {
  id: string
  text: string
  start: number
  end: number
  words: TranscriptWord[]
  variantId?: string
  positionX?: number
  positionY?: number
  maxWidth?: number
  align?: TextAlign
}

export type SubtitleStyle = {
  presetName: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  textColor: string
  activeColor: string
  strokeColor: string
  strokeWidth: number
  shadow: boolean
  shadowColor: string
  shadowBlur: number
  shadowOffsetX: number
  shadowOffsetY: number
  backgroundMode: BackgroundMode
  backgroundColor: string
  backgroundOpacity: number
  boxPadding: number
  borderRadius: number
  positionX: number
  positionY: number
  maxWidth: number
  align: TextAlign
  verticalAlign: 'top' | 'middle' | 'bottom'
  letterSpacing: number
  wordSpacing: number
  lineHeight: number
  maxLines: number
  baselineOffset: number
  textTransform: TextTransform
  removePunctuation: boolean
  hiddenPunctuation: string
  avoidDanglingWords: boolean
  highlightActiveWord: boolean
  activeWordBackground: boolean
  activeWordBackgroundColor: string
  activeWordStroke: boolean
  activeWordShadow: boolean
  transitionIn: CaptionTransition
  transitionOut: Exclude<CaptionTransition, 'stomp'>
  wordTransition: WordTransition
}

export type TranscriptionSettings = {
  language: string
  modelKey: ModelKey
  autoTranscribe: boolean
  chunkLengthSeconds: number
  strideSeconds: number
  maxWordsPerCaption: number
  maxCaptionDuration: number
}

export type CaptionVariant = {
  id: string
  name: string
  style: SubtitleStyle
}

export type AspectRatio = 'source' | '1:1' | '9:16' | '16:9' | '4:3' | '3:4'
export type SafeZonePlatform = 'none' | 'tiktok' | 'instagram' | 'youtube'

export type CanvasSettings = {
  aspectRatio: AspectRatio
  scaleMode: 'contain' | 'cover'
  backgroundColor: string
  showSafeZone: boolean
  safeZonePlatform: SafeZonePlatform
  showWaveform: boolean
}

export type ExportMode = 'burned' | 'transparent' | 'green-screen' | 'mask-pair'
export type ExportContainer = 'source' | 'mp4' | 'mov' | 'mkv' | 'webm'
export type ExportResolution = 'source' | '480p' | '720p' | '1080p' | '1440p' | '2160p' | 'custom'
export type ExportFrameRate = 'source' | '24' | '25' | '30' | '50' | '60' | 'custom'
export type ExportCodec = 'auto' | 'h264' | 'h265' | 'vp9'
export type AudioEncoding = 'copy' | 'high' | 'standard' | 'mute'

export type ExportSettings = {
  mode: ExportMode
  container: ExportContainer
  resolution: ExportResolution
  frameRate: ExportFrameRate
  customWidth: number
  customHeight: number
  customFps: number
  codec: ExportCodec
  compression: number
  quality: number
  speed: 'fast' | 'balanced' | 'quality'
  audio: AudioEncoding
  audioVolume: number
  audioNormalize: boolean
  audioFadeIn: number
  audioFadeOut: number
}

export type SettingsPreset = {
  id: string
  name: string
  createdAt: number
  style: SubtitleStyle
  variants: CaptionVariant[]
  settings: TranscriptionSettings
  canvas: CanvasSettings
  exportSettings: ExportSettings
}

export type MediaMetadata = {
  width: number
  height: number
  fps: number
  duration: number
  format: string
  videoCodec: string
  audioCodec: string
  hasAudio: boolean
}

export type AudioTrack = {
  id: string
  name: string
  path?: string
  url?: string
  start: number
  volume: number
  fadeIn: number
  fadeOut: number
  muted: boolean
}

export type CaptionProject = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  savedAt?: number
  mediaName: string
  mediaType: string
  mediaSize: number
  mediaDuration: number
  mediaPath?: string
  mediaBlob?: Blob
  mediaUrl?: string
  metadata?: MediaMetadata
  waveform?: number[]
  audioTracks: AudioTrack[]
  transcriptText: string
  chunks: SubtitleChunk[]
  style: SubtitleStyle
  variants: CaptionVariant[]
  settings: TranscriptionSettings
  canvas: CanvasSettings
  exportSettings: ExportSettings
}

export type ProjectSummary = {
  id: string
  title: string
  updatedAt: number
  mediaName: string
  mediaDuration: number
  chunkCount: number
  mediaPath?: string
}

export type DesktopMediaFile = {
  path: string
  url: string
  name: string
  type: string
  size: number
  metadata: MediaMetadata
}

export type NativeExportRequest = {
  jobId: string
  inputPath: string
  outputPath: string
  title: string
  duration: number
  sourceWidth: number
  sourceHeight: number
  sourceFps: number
  sourceExtension: string
  chunks: SubtitleChunk[]
  style: SubtitleStyle
  variants: CaptionVariant[]
  canvas: CanvasSettings
  settings: ExportSettings
  sourceHasAudio: boolean
  audioTracks: AudioTrack[]
}

export type NativeExportProgress = {
  jobId: string
  progress: number
  stage: string
}

export type NativeExportResult = {
  outputPaths: string[]
  elapsedMs: number
}

export type NativeProjectPackageRequest = {
  zipPath: string
  title: string
  sourcePath?: string
  sourceName: string
  renderedPaths: string[]
  srt: string
  text: string
  ass: string
  projectJson: string
  audioTracks: AudioTrack[]
}

export type WorkerProgress = {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

export type TranscriptionWorkerRequest =
  | {
      type: 'transcribe'
      audio: Float32Array
      modelKey: ModelKey
      language: string
      chunkLengthSeconds: number
      strideSeconds: number
      bundledModelBaseUrl?: string
    }
  | { type: 'dispose' }

export type TranscriptionWorkerResponse =
  | { type: 'progress'; payload: WorkerProgress }
  | { type: 'ready'; payload: { modelKey: ModelKey; device: string } }
  | { type: 'result'; payload: unknown }
  | { type: 'error'; error: string }
