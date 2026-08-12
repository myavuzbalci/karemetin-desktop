import type {
  CaptionProject,
  DesktopMediaFile,
  NativeExportProgress,
  NativeExportRequest,
  NativeExportResult,
  NativeProjectPackageRequest,
  ProjectSummary,
  SettingsPreset,
} from './types'

type LocalFontData = {
  family: string
  fullName: string
  postscriptName: string
  style: string
}

export type LocalModelDownloadProgress = {
  file: string
  completedFiles: number
  totalFiles: number
  loadedBytes: number
  totalBytes?: number
}

export type CaptionStudioDesktopApi = {
  isDesktop: true
  bundledModelBaseUrl: string
  modelStatus: () => Promise<{ ready: boolean; downloading: boolean }>
  ensureLocalModel: () => Promise<void>
  onModelDownloadProgress: (callback: (progress: LocalModelDownloadProgress) => void) => () => void
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximized: (callback: (maximized: boolean) => void) => () => void
  openMediaFiles: () => Promise<DesktopMediaFile[]>
  inspectMedia: (mediaPath: string) => Promise<DesktopMediaFile>
  extractAudio: (mediaPath: string) => Promise<Uint8Array>
  extractWaveform: (mediaPath: string, points?: number) => Promise<number[]>
  ffmpegVersion: () => Promise<string>
  saveProject: (project: CaptionProject) => Promise<void>
  getProject: (id: string) => Promise<CaptionProject | undefined>
  listProjects: () => Promise<ProjectSummary[]>
  deleteProject: (id: string) => Promise<void>
  loadSettingsPresets: () => Promise<SettingsPreset[]>
  saveSettingsPresets: (presets: SettingsPreset[]) => Promise<void>
  openSubtitleFile: () => Promise<{ name: string; text: string } | undefined>
  openProjectFile: () => Promise<{ path: string; contents: string } | undefined>
  saveTextFile: (options: {
    title: string
    defaultName: string
    contents: string
    extensions: string[]
  }) => Promise<string | undefined>
  chooseDirectory: () => Promise<string | undefined>
  chooseExportPath: (options: {
    defaultName: string
    extension: string
    mode: NativeExportRequest['settings']['mode']
  }) => Promise<string | undefined>
  choosePackagePath: (defaultName: string) => Promise<string | undefined>
  exportVideo: (request: NativeExportRequest) => Promise<NativeExportResult>
  exportProjectPackage: (request: NativeProjectPackageRequest) => Promise<string>
  cancelExport: (jobId: string) => Promise<void>
  revealFile: (targetPath: string) => Promise<void>
  onExportProgress: (callback: (progress: NativeExportProgress) => void) => () => void
}

declare global {
  interface Window {
    captionStudio?: CaptionStudioDesktopApi
    queryLocalFonts?: () => Promise<LocalFontData[]>
  }
}
