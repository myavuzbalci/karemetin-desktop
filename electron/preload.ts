import { contextBridge, ipcRenderer } from 'electron'
import type {
  CaptionProject,
  DesktopMediaFile,
  NativeExportProgress,
  NativeExportRequest,
  NativeExportResult,
  NativeProjectPackageRequest,
  ProjectSummary,
  SettingsPreset,
} from '../src/types'

contextBridge.exposeInMainWorld('captionStudio', {
  isDesktop: true,
  bundledModelBaseUrl: ipcRenderer.sendSync('models:base-url') as string,
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize') as Promise<boolean>,
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized') as Promise<boolean>,
  onMaximized: (callback: (maximized: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window:maximized', listener)
    return () => ipcRenderer.removeListener('window:maximized', listener)
  },
  openMediaFiles: () => ipcRenderer.invoke('media:open') as Promise<DesktopMediaFile[]>,
  inspectMedia: (mediaPath: string) => ipcRenderer.invoke('media:inspect', mediaPath) as Promise<DesktopMediaFile>,
  extractAudio: (mediaPath: string) => ipcRenderer.invoke('media:audio', mediaPath) as Promise<Uint8Array>,
  extractWaveform: (mediaPath: string, points = 1000) =>
    ipcRenderer.invoke('media:waveform', mediaPath, points) as Promise<number[]>,
  ffmpegVersion: () => ipcRenderer.invoke('media:ffmpeg-version') as Promise<string>,
  saveProject: (project: CaptionProject) => ipcRenderer.invoke('projects:save', project),
  getProject: (id: string) => ipcRenderer.invoke('projects:get', id) as Promise<CaptionProject | undefined>,
  listProjects: () => ipcRenderer.invoke('projects:list') as Promise<ProjectSummary[]>,
  deleteProject: (id: string) => ipcRenderer.invoke('projects:delete', id),
  loadSettingsPresets: () => ipcRenderer.invoke('settings-presets:load') as Promise<SettingsPreset[]>,
  saveSettingsPresets: (presets: SettingsPreset[]) => ipcRenderer.invoke('settings-presets:save', presets),
  openSubtitleFile: () =>
    ipcRenderer.invoke('files:open-srt') as Promise<{ name: string; text: string } | undefined>,
  openProjectFile: () => ipcRenderer.invoke('files:open-project') as Promise<{ path: string; contents: string } | undefined>,
  saveTextFile: (options: { title: string; defaultName: string; contents: string; extensions: string[] }) =>
    ipcRenderer.invoke('files:save-text', options) as Promise<string | undefined>,
  chooseDirectory: () => ipcRenderer.invoke('files:choose-directory') as Promise<string | undefined>,
  chooseExportPath: (options: { defaultName: string; extension: string; mode: NativeExportRequest['settings']['mode'] }) =>
    ipcRenderer.invoke('export:choose-path', options) as Promise<string | undefined>,
  choosePackagePath: (defaultName: string) => ipcRenderer.invoke('export:choose-package-path', defaultName) as Promise<string | undefined>,
  exportVideo: (request: NativeExportRequest) =>
    ipcRenderer.invoke('export:start', request) as Promise<NativeExportResult>,
  exportProjectPackage: (request: NativeProjectPackageRequest) => ipcRenderer.invoke('export:package', request) as Promise<string>,
  cancelExport: (jobId: string) => ipcRenderer.invoke('export:cancel', jobId),
  revealFile: (targetPath: string) => ipcRenderer.invoke('files:reveal', targetPath),
  onExportProgress: (callback: (progress: NativeExportProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: NativeExportProgress) => callback(progress)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
})
