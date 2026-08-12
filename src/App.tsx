import { Check, FolderOpen, Loader2, Upload, Video, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { CaptionList } from './components/CaptionList'
import { Inspector } from './components/Inspector'
import { MediaStage } from './components/MediaStage'
import { Timeline } from './components/Timeline'
import { TitleBar } from './components/TitleBar'
import { ToolRail, type EditorTool } from './components/ToolRail'
import { deleteProject, getProject, listProjects, saveProject } from './lib/db'
import { buildAssDocument } from './lib/ass'
import { decodeMediaToMono16k, getMediaDuration } from './lib/media'
import {
  cloneDefaultVariants,
  DEFAULT_CANVAS,
  DEFAULT_EXPORT_SETTINGS,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE,
} from './lib/models'
import { mediaUrlFromPath, normalizeProject } from './lib/project'
import {
  applySettingsPreset,
  createSettingsPreset,
  loadAutoTranscribePreference,
  loadSettingsPresets,
  persistAutoTranscribePreference,
  persistSettingsPresets,
} from './lib/settingsPresets'
import { chunksToSrt, cryptoId, downloadTextFile, parseSrt } from './lib/srt'
import { getActiveChunk, groupWords, normalizeTranscription, resolveChunkStyle } from './lib/transcription'
import type {
  AudioTrack,
  CaptionProject,
  DesktopMediaFile,
  NativeExportRequest,
  ProjectSummary,
  SettingsPreset,
  SubtitleChunk,
  SubtitleStyle,
  TranscriptWord,
  TranscriptionSettings,
  TranscriptionWorkerResponse,
  WordStyleOverride,
  WorkerProgress,
  WorkflowStatus,
} from './types'

const idleProgress: WorkerProgress = { status: 'idle', progress: 0 }
const TRANSCRIPTION_CANCELLED = 'TRANSCRIPTION_CANCELLED'

function App() {
  const [project, setProject] = useState<CaptionProject | null>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [activeTool, setActiveTool] = useState<EditorTool>('library')
  const [selectedChunkId, setSelectedChunkId] = useState<string>()
  const [selectedWordIds, setSelectedWordIds] = useState<string[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState('main')
  const [positionScope, setPositionScope] = useState<'current' | 'all'>('current')
  const [currentTime, setCurrentTime] = useState(0)
  const [status, setStatus] = useState<WorkflowStatus>('idle')
  const [progress, setProgress] = useState<WorkerProgress>(idleProgress)
  const [exportProgress, setExportProgress] = useState(0)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(true)
  const [autoSave, setAutoSave] = useState(false)
  const [batchMessage, setBatchMessage] = useState('')
  const [systemFonts, setSystemFonts] = useState<string[]>([])
  const [customPresets, setCustomPresets] = useState<SubtitleStyle[]>(loadCustomPresets)
  const [settingsPresets, setSettingsPresets] = useState<SettingsPreset[]>(loadSettingsPresets)
  const initialSettingsPresetsRef = useRef(settingsPresets)
  const [presetDialogOpen, setPresetDialogOpen] = useState(false)
  const [pendingAutoTranscribeId, setPendingAutoTranscribeId] = useState<string>()
  const [notice, setNotice] = useState('')
  const [ffmpegVersion, setFfmpegVersion] = useState('')
  const [lastExportPaths, setLastExportPaths] = useState<string[]>([])
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const subtitleInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const playRangeEndRef = useRef<number | undefined>(undefined)
  const currentJobIdRef = useRef<string | undefined>(undefined)
  const projectRef = useRef<CaptionProject | null>(null)
  const transcriptionRunIdRef = useRef(0)
  const transcriptionActiveRef = useRef(false)
  const workerRejectRef = useRef<((reason: Error) => void) | null>(null)
  const saveInFlightRef = useRef<Promise<void> | null>(null)
  const queuedProjectSaveRef = useRef<CaptionProject | null>(null)

  useEffect(() => {
    projectRef.current = project
  }, [project])

  useEffect(() => {
    void refreshProjects()
    if (window.captionStudio) {
      void window.captionStudio.loadSettingsPresets().then((nativePresets) => {
        if (nativePresets.length) {
          setSettingsPresets(nativePresets)
          persistSettingsPresets(nativePresets)
        } else if (initialSettingsPresetsRef.current.length) {
          void window.captionStudio?.saveSettingsPresets(initialSettingsPresetsRef.current)
        }
      })
      void window.captionStudio.ffmpegVersion().then(setFfmpegVersion).catch(() => setFfmpegVersion('FFmpeg bulunamadi'))
      const unsubscribe = window.captionStudio.onExportProgress((event) => {
        if (!currentJobIdRef.current || event.jobId === currentJobIdRef.current) setExportProgress(event.progress)
      })
      return () => unsubscribe()
    }
    return undefined
  }, [])

  useEffect(() => {
    if (!window.queryLocalFonts) return
    void window
      .queryLocalFonts()
      .then((fonts) => setSystemFonts(Array.from(new Set(fonts.map((font) => font.family).filter(Boolean))).sort()))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      const current = projectRef.current
      if (current?.mediaUrl?.startsWith('blob:')) URL.revokeObjectURL(current.mediaUrl)
    }
  }, [])

  useEffect(() => {
    if (!project || !autoSave || saved || status !== 'idle') return
    const timer = window.setTimeout(() => void persistProject(project, false), 900)
    return () => window.clearTimeout(timer)
  }, [autoSave, project, saved, status])

  useEffect(() => {
    if (!pendingAutoTranscribeId || project?.id !== pendingAutoTranscribeId || status !== 'idle') return
    const targetId = pendingAutoTranscribeId
    const timer = window.setTimeout(() => {
      setPendingAutoTranscribeId((current) => (current === targetId ? undefined : current))
      void transcribe(targetId)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [pendingAutoTranscribeId, project?.id, status])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2600)
    return () => window.clearTimeout(timer)
  }, [notice])

  const selectedChunk = useMemo(
    () => project?.chunks.find((chunk) => chunk.id === selectedChunkId),
    [project?.chunks, selectedChunkId],
  )
  const activeChunk = useMemo(() => {
    if (selectedChunk && currentTime >= selectedChunk.start && currentTime < selectedChunk.end) return selectedChunk
    return getActiveChunk(project?.chunks ?? [], currentTime)
  }, [currentTime, project?.chunks, selectedChunk])
  const editingChunk = activeChunk ?? selectedChunk
  const previewStyle = project
    ? resolveChunkStyle(project.style, project.variants, editingChunk)
    : DEFAULT_STYLE
  const activeVariantStyle = project
    ? selectedVariantId === 'main'
      ? project.style
      : project.variants.find((variant) => variant.id === selectedVariantId)?.style ?? project.style
    : null
  const busy = status !== 'idle' && status !== 'error'

  async function refreshProjects() {
    try {
      setProjects(await listProjects())
    } catch {
      setProjects([])
    }
  }

  async function handleOpenMedia() {
    setError('')
    if (transcriptionActiveRef.current) cancelTranscription()
    if (window.captionStudio) {
      const mediaFiles = await window.captionStudio.openMediaFiles()
      if (!mediaFiles.length) return
      const created = mediaFiles.map(createProjectFromDesktopMedia)
      await Promise.all(created.map((item) => saveProject(item)))
      activateProject(created[0], created.length === 1)
      if (created.length > 1) setActiveTool('library')
      setBatchMessage(`${created.length} dosya proje olarak kaydedildi.`)
      await refreshProjects()
      return
    }
    mediaInputRef.current?.click()
  }

  async function handleWebMedia(files: File[]) {
    if (!files.length) return
    const created: CaptionProject[] = []
    for (const file of files) {
      const duration = await getMediaDuration(file)
      created.push(
        normalizeProject({
          ...baseProject(file.name, file.type || 'application/octet-stream', file.size, duration),
          mediaBlob: file,
          mediaUrl: URL.createObjectURL(file),
        }),
      )
    }
    await Promise.all(created.map((item) => saveProject(item)))
    activateProject(created[0], created.length === 1)
    if (created.length > 1) setActiveTool('library')
    setBatchMessage(`${created.length} dosya proje olarak kaydedildi.`)
    await refreshProjects()
  }

  function createProjectFromDesktopMedia(file: DesktopMediaFile) {
    return normalizeProject({
      ...baseProject(file.name, file.type, file.size, file.metadata.duration),
      mediaPath: file.path,
      mediaUrl: file.url,
      metadata: file.metadata,
    })
  }

  function baseProject(name: string, type: string, size: number, duration: number): CaptionProject {
    const now = Date.now()
    return {
      id: cryptoId('project'),
      title: name.replace(/\.[^.]+$/, ''),
      createdAt: now,
      updatedAt: now,
      mediaName: name,
      mediaType: type,
      mediaSize: size,
      mediaDuration: duration,
      transcriptText: '',
      chunks: [],
      audioTracks: [],
      style: { ...DEFAULT_STYLE },
      variants: cloneDefaultVariants(),
      settings: { ...DEFAULT_SETTINGS, autoTranscribe: loadAutoTranscribePreference() },
      canvas: { ...DEFAULT_CANVAS },
      exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
    }
  }

  function activateProject(nextProject: CaptionProject, autoTranscribe = false) {
    if (transcriptionActiveRef.current) cancelTranscription()
    const normalized = normalizeProject({
      ...nextProject,
      mediaUrl: nextProject.mediaPath
        ? mediaUrlFromPath(nextProject.mediaPath)
        : nextProject.mediaUrl,
    })
    if (project?.mediaUrl?.startsWith('blob:') && project.mediaUrl !== normalized.mediaUrl) {
      URL.revokeObjectURL(project.mediaUrl)
    }
    projectRef.current = normalized
    setProject(normalized)
    setSelectedChunkId(normalized.chunks[0]?.id)
    setSelectedVariantId(normalized.chunks[0]?.variantId ?? 'main')
    setSelectedWordIds([])
    setCurrentTime(0)
    setSaved(true)
    setAutoSave(true)
    setActiveTool('media')
    setLastExportPaths([])
    setPendingAutoTranscribeId(
      autoTranscribe && normalized.settings.autoTranscribe && normalized.chunks.length === 0
        ? normalized.id
        : undefined,
    )
    if (normalized.mediaPath && !normalized.waveform && window.captionStudio) {
      void window.captionStudio.extractWaveform(normalized.mediaPath).then((waveform) => {
        setProject((current) => (current?.id === normalized.id ? { ...current, waveform } : current))
      })
    }
  }

  async function openSavedProject(id: string) {
    const stored = await getProject(id)
    if (!stored) return
    activateProject(stored)
  }

  async function openProjectFile() {
    if (!window.captionStudio) return
    const file = await window.captionStudio.openProjectFile()
    if (!file) return
    try {
      const parsed = JSON.parse(file.contents) as Partial<CaptionProject>
      if (!parsed.id || !parsed.title || !parsed.mediaName) throw new Error('Gecerli bir Caption Studio proje dosyasi degil.')
      const imported = normalizeProject(parsed as CaptionProject)
      await saveProject(imported)
      activateProject(imported)
      setNotice('Proje dosyasi acildi.')
      await refreshProjects()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  async function addAudioTracks() {
    if (!project || !window.captionStudio) {
      setError('Ses parcasi eklemek icin masaustu uygulamasini kullan.')
      return
    }
    const files = await window.captionStudio.openMediaFiles()
    const tracks: AudioTrack[] = files
      .filter((file) => file.type.startsWith('audio/'))
      .map((file) => ({
        id: cryptoId('audio'), name: file.name, path: file.path, url: file.url,
        start: 0, volume: 100, fadeIn: 0, fadeOut: 0, muted: false,
      }))
    if (!tracks.length) {
      setNotice('Ses parcasi bulunamadi. Ses dosyasi sec.')
      return
    }
    updateProject({ audioTracks: [...project.audioTracks, ...tracks] })
    setNotice(`${tracks.length} ses parcasi timeline'a eklendi.`)
  }

  function updateAudioTrack(id: string, patch: Partial<AudioTrack>) {
    if (!project) return
    updateProject({ audioTracks: project.audioTracks.map((track) => track.id === id ? { ...track, ...patch } : track) })
  }

  function removeAudioTrack(id: string) {
    if (!project) return
    updateProject({ audioTracks: project.audioTracks.filter((track) => track.id !== id) })
  }

  function addDroppedAudioTracks(files: File[], start: number) {
    if (!project) return
    const audioFiles = files.filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|flac|ogg|opus|aiff?)$/i.test(file.name))
    if (!audioFiles.length) {
      setNotice("Timeline'a su anda sadece ses dosyasi birakilabilir.")
      return
    }
    const tracks: AudioTrack[] = audioFiles.map((file) => {
      const desktopPath = (file as File & { path?: string }).path
      return {
        id: cryptoId('audio'), name: file.name, path: desktopPath, url: URL.createObjectURL(file),
        start, volume: 100, fadeIn: 0, fadeOut: 0, muted: false,
      }
    })
    updateProject({ audioTracks: [...project.audioTracks, ...tracks] })
    setNotice(`${tracks.length} ses parcasi ${start.toFixed(1)} sn konumuna eklendi.`)
  }

  async function removeSavedProject(id: string) {
    await deleteProject(id)
    if (project?.id === id) {
      setProject(null)
      setActiveTool('library')
    }
    await refreshProjects()
  }

  async function persistProject(target = projectRef.current, explicit = true) {
    if (!target) return
    if (explicit) setStatus('saving')
    queueLatestProjectSave(target)
    let failed = false
    try {
      if (!saveInFlightRef.current) {
        const operation = flushProjectSaves()
        saveInFlightRef.current = operation
        try {
          await operation
        } finally {
          if (saveInFlightRef.current === operation) saveInFlightRef.current = null
        }
      } else {
        await saveInFlightRef.current
      }
    } catch (caught) {
      failed = true
      setError(errorMessage(caught))
      setStatus('error')
    }
    if (explicit && !failed) setStatus('idle')
  }

  function queueLatestProjectSave(target: CaptionProject) {
    const queued = queuedProjectSaveRef.current
    if (!queued || queued.id !== target.id || target.updatedAt >= queued.updatedAt) {
      queuedProjectSaveRef.current = target
    }
  }

  async function flushProjectSaves() {
    let wroteProject = false
    while (queuedProjectSaveRef.current) {
      const candidate = queuedProjectSaveRef.current
      queuedProjectSaveRef.current = null
      const savedAt = Date.now()
      const stamped = { ...candidate, savedAt }
      await saveProject(stamped)
      wroteProject = true

      const latest = projectRef.current
      if (latest?.id === candidate.id && latest.updatedAt > candidate.updatedAt) {
        queueLatestProjectSave(latest)
        continue
      }
      if (latest?.id === candidate.id) {
        const next = { ...latest, savedAt }
        projectRef.current = next
        setProject(next)
        setSaved(true)
      }
    }
    if (wroteProject) await refreshProjects()
  }

  function updateProject(patch: Partial<CaptionProject>) {
    setSaved(false)
    setProject((current) => {
      if (!current) return current
      const next = { ...current, ...patch, updatedAt: Math.max(Date.now(), current.updatedAt + 1) }
      projectRef.current = next
      if (saveInFlightRef.current) queueLatestProjectSave(next)
      return next
    })
  }

  function updateCanvas(patch: Partial<CaptionProject['canvas']>) {
    if (!project) return
    updateProject({ canvas: { ...project.canvas, ...patch } })
  }

  function updateSettings(patch: Partial<TranscriptionSettings>) {
    if (!project) return
    if (patch.autoTranscribe !== undefined) persistAutoTranscribePreference(patch.autoTranscribe)
    if (patch.modelKey && patch.modelKey !== project.settings.modelKey && !transcriptionActiveRef.current) {
      releaseTranscriptionWorker()
    }
    const settings = { ...project.settings, ...patch }
    const shouldRegroup =
      project.chunks.length > 0 &&
      (patch.maxWordsPerCaption !== undefined || patch.maxCaptionDuration !== undefined)
    const chunks = shouldRegroup
      ? groupWords(
          project.chunks.flatMap((chunk) => chunk.words).sort((a, b) => a.start - b.start),
          settings.maxWordsPerCaption,
          settings.maxCaptionDuration,
        )
      : project.chunks
    updateProject({ settings, chunks, transcriptText: chunks.map((chunk) => chunk.text).join(' ') })
    if (shouldRegroup) setSelectedChunkId(chunks[0]?.id)
  }

  function updateExportSettings(patch: Partial<CaptionProject['exportSettings']>) {
    if (!project) return
    updateProject({ exportSettings: { ...project.exportSettings, ...patch } })
  }

  function updateSelectedStyle(patch: Partial<SubtitleStyle>) {
    if (!project) return
    if (selectedVariantId === 'main') {
      const style = { ...project.style, ...patch }
      updateProject({
        style,
        variants: project.variants.map((variant) =>
          variant.id === 'main' ? { ...variant, style: { ...style } } : variant,
        ),
      })
      return
    }
    updateProject({
      variants: project.variants.map((variant) =>
        variant.id === selectedVariantId ? { ...variant, style: { ...variant.style, ...patch } } : variant,
      ),
    })
  }

  function applyPreset(preset: SubtitleStyle) {
    updateSelectedStyle({ ...preset })
  }

  function addVariant() {
    if (!project) return
    const id = cryptoId('variant')
    const name = `Stil ${project.variants.length + 1}`
    updateProject({
      variants: [...project.variants, { id, name, style: { ...(activeVariantStyle ?? project.style), presetName: name } }],
    })
    setSelectedVariantId(id)
  }

  function deleteVariant(variantId: string) {
    if (!project || variantId === 'main') return
    updateProject({
      variants: project.variants.filter((variant) => variant.id !== variantId),
      chunks: project.chunks.map((chunk) => (chunk.variantId === variantId ? { ...chunk, variantId: 'main' } : chunk)),
    })
    setSelectedVariantId('main')
  }

  function applyVariantToAll(variantId: string) {
    if (!project) return
    updateProject({ chunks: project.chunks.map((chunk) => ({ ...chunk, variantId })) })
  }

  function saveCustomPreset() {
    if (!activeVariantStyle) return
    const preset = { ...activeVariantStyle, presetName: `Custom ${customPresets.length + 1}` }
    const next = [...customPresets, preset]
    setCustomPresets(next)
    localStorage.setItem('caption-studio-custom-presets', JSON.stringify(next))
  }

  function deleteCustomPreset(presetName: string) {
    const next = customPresets.filter((preset) => preset.presetName !== presetName)
    setCustomPresets(next)
    localStorage.setItem('caption-studio-custom-presets', JSON.stringify(next))
  }

  function openSettingsPresetDialog() {
    if (!projectRef.current) return
    setPresetDialogOpen(true)
  }

  function saveSettingsPreset(name: string) {
    const current = projectRef.current
    const trimmedName = name.trim()
    if (!current || !trimmedName) return
    const snapshot = createSettingsPreset(current, trimmedName)
    const existing = settingsPresets.find((preset) => preset.name.toLocaleLowerCase('tr') === trimmedName.toLocaleLowerCase('tr'))
    const savedPreset = existing ? { ...snapshot, id: existing.id, createdAt: existing.createdAt } : snapshot
    const next = existing
      ? settingsPresets.map((preset) => (preset.id === existing.id ? savedPreset : preset))
      : [...settingsPresets, savedPreset]
    setSettingsPresets(next)
    persistSettingsPresets(next)
    void window.captionStudio?.saveSettingsPresets(next)
    setPresetDialogOpen(false)
    setActiveTool('styles')
    setNotice(`${savedPreset.name} preseti kaydedildi`)
  }

  function applySavedSettingsPreset(presetId: string) {
    const current = projectRef.current
    const preset = settingsPresets.find((item) => item.id === presetId)
    if (!current || !preset) return
    const next = applySettingsPreset(current, preset)
    projectRef.current = next
    setProject(next)
    setSaved(false)
    setSelectedVariantId('main')
    setSelectedWordIds([])
    persistAutoTranscribePreference(next.settings.autoTranscribe)
    setNotice(`${preset.name} uygulandi`)
    void persistProject(next, false)
  }

  function deleteSavedSettingsPreset(presetId: string) {
    const removed = settingsPresets.find((preset) => preset.id === presetId)
    const next = settingsPresets.filter((preset) => preset.id !== presetId)
    setSettingsPresets(next)
    persistSettingsPresets(next)
    void window.captionStudio?.saveSettingsPresets(next)
    if (removed) setNotice(`${removed.name} silindi`)
  }

  function handleGeometryChange(patch: Partial<Pick<SubtitleStyle, 'positionX' | 'positionY' | 'maxWidth' | 'align'>>) {
    if (!project || !editingChunk) return
    if (positionScope === 'current') {
      updateChunk(editingChunk.id, patch)
      return
    }
    const variantId = editingChunk.variantId ?? 'main'
    setSelectedVariantId(variantId)
    const base = variantId === 'main' ? project.style : project.variants.find((variant) => variant.id === variantId)?.style
    if (!base) return
    const nextStyle = { ...base, ...patch }
    updateProject({
      style: variantId === 'main' ? nextStyle : project.style,
      variants: project.variants.map((variant) =>
        variant.id === variantId ? { ...variant, style: { ...variant.style, ...patch } } : variant,
      ),
      chunks: project.chunks.map((chunk) =>
        (chunk.variantId ?? 'main') === variantId
          ? { ...chunk, positionX: undefined, positionY: undefined, maxWidth: undefined, align: undefined }
          : chunk,
      ),
    })
  }

  function selectChunk(chunkId: string) {
    if (!project) return
    const chunk = project.chunks.find((item) => item.id === chunkId)
    if (!chunk) return
    setSelectedChunkId(chunkId)
    setSelectedVariantId(chunk.variantId ?? 'main')
    setSelectedWordIds([])
    if (currentTime < chunk.start || currentTime > chunk.end) seek(chunk.start)
  }

  function selectWord(chunkId: string, word: TranscriptWord, additive: boolean) {
    setSelectedChunkId(chunkId)
    const chunk = project?.chunks.find((item) => item.id === chunkId)
    setSelectedVariantId(chunk?.variantId ?? 'main')
    if (chunk && (currentTime < chunk.start || currentTime >= chunk.end)) seek(chunk.start)
    setSelectedWordIds((current) => {
      if (!additive) return [word.id]
      return current.includes(word.id) ? current.filter((id) => id !== word.id) : [...current, word.id]
    })
  }

  function applyWordStyle(style?: WordStyleOverride) {
    if (!project || !selectedWordIds.length) return
    updateProject({
      chunks: project.chunks.map((chunk) => ({
        ...chunk,
        words: chunk.words.map((word) =>
          selectedWordIds.includes(word.id) ? { ...word, style: style ? { ...style } : undefined } : word,
        ),
      })),
    })
  }

  function updateChunk(id: string, patch: Partial<SubtitleChunk>) {
    if (!project) return
    updateProject({
      chunks: project.chunks.map((chunk) => {
        if (chunk.id !== id) return chunk
        const start = patch.start ?? chunk.start
        const end = patch.end ?? chunk.end
        let words = patch.text !== undefined ? rebuildWords(chunk, patch.text, start, end) : chunk.words
        if (patch.start !== undefined && words[0]) words = words.map((word, index) => (index === 0 ? { ...word, start } : word))
        if (patch.end !== undefined && words[words.length - 1]) {
          words = words.map((word, index) => (index === words.length - 1 ? { ...word, end } : word))
        }
        return { ...chunk, ...patch, start, end, words }
      }),
    })
  }

  function updateWord(chunkId: string, wordId: string, patch: Partial<TranscriptWord>) {
    if (!project) return
    updateProject({
      chunks: project.chunks.map((chunk) => {
        if (chunk.id !== chunkId) return chunk
        const words = chunk.words.map((word) => (word.id === wordId ? { ...word, ...patch } : word))
        return {
          ...chunk,
          start: Math.min(chunk.start, words[0]?.start ?? chunk.start),
          end: Math.max(chunk.end, words[words.length - 1]?.end ?? chunk.end),
          words,
          text: words.map((word) => word.text).join(' '),
        }
      }),
    })
  }

  function addChunk() {
    if (!project) return
    const last = project.chunks[project.chunks.length - 1]
    const start = last ? Math.min(project.mediaDuration, last.end + 0.08) : currentTime
    const end = Math.min(project.mediaDuration || start + 2, start + 2)
    const text = 'Yeni altyazi'
    const chunk: SubtitleChunk = {
      id: cryptoId('caption'),
      text,
      start,
      end,
      words: rebuildWords({ start, end, words: [] } as unknown as SubtitleChunk, text, start, end),
      variantId: 'main',
    }
    updateProject({ chunks: [...project.chunks, chunk] })
    setSelectedChunkId(chunk.id)
  }

  function splitChunk(chunkId: string) {
    if (!project) return
    const index = project.chunks.findIndex((chunk) => chunk.id === chunkId)
    const chunk = project.chunks[index]
    if (!chunk) return
    const selectedIndex = chunk.words.findIndex((word) => selectedWordIds.includes(word.id))
    const splitIndex = selectedIndex > 0 ? selectedIndex : Math.max(1, Math.floor(chunk.words.length / 2))
    if (chunk.words.length < 2 || splitIndex >= chunk.words.length) return
    const leftWords = chunk.words.slice(0, splitIndex)
    const rightWords = chunk.words.slice(splitIndex)
    const left = { ...chunk, text: leftWords.map((word) => word.text).join(' '), end: leftWords[leftWords.length - 1].end, words: leftWords }
    const right: SubtitleChunk = {
      ...chunk,
      id: cryptoId('caption'),
      text: rightWords.map((word) => word.text).join(' '),
      start: rightWords[0].start,
      words: rightWords,
    }
    const chunks = [...project.chunks]
    chunks.splice(index, 1, left, right)
    updateProject({ chunks })
    setSelectedChunkId(right.id)
  }

  function mergePrevious(chunkId: string) {
    if (!project) return
    const index = project.chunks.findIndex((chunk) => chunk.id === chunkId)
    if (index <= 0) return
    const previous = project.chunks[index - 1]
    const current = project.chunks[index]
    const merged: SubtitleChunk = {
      ...previous,
      text: `${previous.text} ${current.text}`.trim(),
      end: current.end,
      words: [...previous.words, ...current.words],
    }
    const chunks = [...project.chunks]
    chunks.splice(index - 1, 2, merged)
    updateProject({ chunks })
    setSelectedChunkId(merged.id)
  }

  function deleteChunk(chunkId: string) {
    if (!project) return
    const deletedIndex = project.chunks.findIndex((chunk) => chunk.id === chunkId)
    const chunks = project.chunks.filter((chunk) => chunk.id !== chunkId)
    updateProject({ chunks })
    setSelectedChunkId(chunks[Math.min(Math.max(0, deletedIndex), chunks.length - 1)]?.id)
    setSelectedWordIds([])
  }

  function seek(time: number) {
    const safe = Math.max(0, Math.min(project?.mediaDuration ?? time, time))
    if (mediaRef.current) mediaRef.current.currentTime = safe
    setCurrentTime(safe)
  }

  function handleTimeUpdate(time: number) {
    setCurrentTime(time)
    const end = playRangeEndRef.current
    if (end !== undefined && time >= end) {
      mediaRef.current?.pause()
      playRangeEndRef.current = undefined
    }
  }

  function playChunk(chunkId: string) {
    const chunk = project?.chunks.find((item) => item.id === chunkId)
    if (!chunk || !mediaRef.current) return
    selectChunk(chunkId)
    mediaRef.current.currentTime = chunk.start
    playRangeEndRef.current = chunk.end
    void mediaRef.current.play()
  }

  function playSelectedChunk() {
    if (selectedChunkId) playChunk(selectedChunkId)
  }

  async function transcribe(requestedProjectId = projectRef.current?.id) {
    const target = projectRef.current
    if (!target || target.id !== requestedProjectId || (!target.mediaPath && !target.mediaBlob)) return
    if (transcriptionActiveRef.current) {
      setNotice('Bir transkripsiyon zaten devam ediyor')
      return
    }
    transcriptionActiveRef.current = true
    const runId = ++transcriptionRunIdRef.current
    setError('')
    setStatus('decoding')
    setProgress({ status: 'Ses hazirlaniyor', progress: 0 })
    try {
      const audio = await decodeProjectAudio(target)
      assertTranscriptionRun(runId, target.id)
      setStatus('loading-model')
      const result = await runWorkerTranscription(audio, target.settings)
      assertTranscriptionRun(runId, target.id)
      const normalized = normalizeTranscription(
        result,
        target.mediaDuration,
        target.settings.maxWordsPerCaption,
        target.settings.maxCaptionDuration,
      )
      const current = projectRef.current
      if (!current || current.id !== target.id) throw transcriptionCancelledError()
      const next = {
        ...current,
        transcriptText: normalized.text,
        chunks: normalized.chunks.map((chunk) => ({ ...chunk, variantId: 'main' })),
        updatedAt: Date.now(),
      }
      projectRef.current = next
      setProject(next)
      setSaved(false)
      setSelectedChunkId(normalized.chunks[0]?.id)
      setSelectedWordIds([])
      await saveProject(next)
      if (projectRef.current?.id === next.id) setSaved(true)
      await refreshProjects()
      setStatus('idle')
      setProgress({ status: 'Tamamlandi', progress: 1 })
      setNotice('Otomatik altyazi tamamlandi')
    } catch (caught) {
      if (isTranscriptionCancelled(caught)) return
      releaseTranscriptionWorker()
      setStatus('error')
      setError(errorMessage(caught))
    } finally {
      if (transcriptionRunIdRef.current === runId) {
        transcriptionActiveRef.current = false
      }
    }
  }

  function assertTranscriptionRun(runId: number, projectId: string) {
    if (transcriptionRunIdRef.current !== runId || projectRef.current?.id !== projectId) {
      throw transcriptionCancelledError()
    }
  }

  async function decodeProjectAudio(target: CaptionProject) {
    if (target.mediaPath && window.captionStudio) {
      const bytes = await window.captionStudio.extractAudio(target.mediaPath)
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      return new Float32Array(copy)
    }
    if (!target.mediaBlob) throw new Error('Medya dosyasi bulunamadi.')
    return decodeMediaToMono16k(target.mediaBlob as File)
  }

  function getWorker() {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./workers/whisperWorker.ts', import.meta.url), { type: 'module' })
    }
    return workerRef.current
  }

  function runWorkerTranscription(audio: Float32Array, settings: TranscriptionSettings) {
    const worker = getWorker()
    return new Promise<unknown>((resolve, reject) => {
      if (workerRejectRef.current) {
        reject(new Error('Bir transkripsiyon zaten devam ediyor.'))
        return
      }
      const cleanup = () => {
        worker.onmessage = null
        worker.onerror = null
        workerRejectRef.current = null
      }
      const fail = (reason: Error) => {
        cleanup()
        reject(reason)
      }
      workerRejectRef.current = fail
      worker.onmessage = (event: MessageEvent<TranscriptionWorkerResponse>) => {
        const message = event.data
        if (message.type === 'progress') {
          setProgress(message.payload)
          setStatus('loading-model')
        }
        if (message.type === 'ready') {
          setProgress({ status: `${message.payload.device} hazir`, progress: 1 })
          setStatus('transcribing')
        }
        if (message.type === 'result') {
          cleanup()
          resolve(message.payload)
        }
        if (message.type === 'error') fail(new Error(message.error))
      }
      worker.onerror = (event) => fail(new Error(event.message))
      worker.postMessage(
        {
          type: 'transcribe',
          audio,
          modelKey: settings.modelKey,
          language: settings.language,
          chunkLengthSeconds: settings.chunkLengthSeconds,
          strideSeconds: settings.strideSeconds,
          bundledModelBaseUrl: window.captionStudio?.bundledModelBaseUrl,
        },
        [audio.buffer],
      )
    })
  }

  function releaseTranscriptionWorker(reason?: Error) {
    const reject = workerRejectRef.current
    workerRejectRef.current = null
    const worker = workerRef.current
    workerRef.current = null
    worker?.terminate()
    if (reason && reject) reject(reason)
  }

  function cancelTranscription() {
    if (!transcriptionActiveRef.current && !workerRef.current) return
    transcriptionRunIdRef.current += 1
    transcriptionActiveRef.current = false
    releaseTranscriptionWorker(transcriptionCancelledError())
    setPendingAutoTranscribeId(undefined)
    setStatus('idle')
    setProgress(idleProgress)
    setNotice('Transkripsiyon iptal edildi')
  }

  async function importSrt() {
    if (window.captionStudio) {
      const file = await window.captionStudio.openSubtitleFile()
      if (file) applySrt(file.text)
      return
    }
    subtitleInputRef.current?.click()
  }

  function applySrt(contents: string) {
    try {
      const chunks = parseSrt(contents).map((chunk) => ({ ...chunk, variantId: 'main' }))
      updateProject({ chunks, transcriptText: chunks.map((chunk) => chunk.text).join(' ') })
      setSelectedChunkId(chunks[0]?.id)
      setSelectedWordIds([])
    } catch (caught) {
      setError(errorMessage(caught))
      setStatus('error')
    }
  }

  async function exportSrt() {
    if (!project) return
    const contents = chunksToSrt(project.chunks)
    if (window.captionStudio) {
      await window.captionStudio.saveTextFile({
        title: 'SRT kaydet',
        defaultName: `${safeFilename(project.title)}.srt`,
        contents,
        extensions: ['srt'],
      })
    } else {
      downloadTextFile(`${safeFilename(project.title)}.srt`, contents)
    }
  }

  async function exportText() {
    if (!project) return
    const contents = project.chunks.map((chunk) => chunk.text).join('\n')
    if (window.captionStudio) {
      await window.captionStudio.saveTextFile({
        title: 'Transcript kaydet',
        defaultName: `${safeFilename(project.title)}.txt`,
        contents,
        extensions: ['txt'],
      })
    } else {
      downloadTextFile(`${safeFilename(project.title)}.txt`, contents)
    }
  }

  async function exportVideo() {
    if (!project?.mediaPath || !window.captionStudio || !project.chunks.length) {
      setError('Native video export icin masaustu uygulamasi ve altyazi gerekli.')
      setStatus('error')
      return
    }
    const extension = outputExtension(project)
    const defaultName = `${safeFilename(project.title)}-captioned.${extension}`
    const outputPath = await window.captionStudio.chooseExportPath({
      defaultName,
      extension,
      mode: project.exportSettings.mode,
    })
    if (!outputPath) return
    const jobId = cryptoId('export')
    currentJobIdRef.current = jobId
    setStatus('exporting')
    setExportProgress(0)
    setError('')
    try {
      const result = await window.captionStudio.exportVideo(makeExportRequest(project, outputPath, jobId))
      setLastExportPaths(result.outputPaths)
      setExportProgress(1)
      setStatus('idle')
    } catch (caught) {
      setStatus('error')
      setError(errorMessage(caught))
    } finally {
      currentJobIdRef.current = undefined
    }
  }

  async function exportProjectPackage() {
    if (!project?.mediaPath || !window.captionStudio) {
      setError('ZIP proje paketi masaustu uygulamasinda olusturulur.')
      return
    }
    if (!lastExportPaths.length) {
      setNotice('Once video ciktisi al; ZIP paketi son render dosyasini da icerir.')
      return
    }
    const zipPath = await window.captionStudio.choosePackagePath(`${safeFilename(project.title)}-project.zip`)
    if (!zipPath) return
    const metadata = project.metadata
    const width = metadata?.width || 1920
    const height = metadata?.height || 1080
    const { mediaBlob: _mediaBlob, mediaUrl: _mediaUrl, ...portableProject } = project
    setStatus('saving')
    try {
      const outputPath = await window.captionStudio.exportProjectPackage({
        zipPath,
        title: project.title,
        sourcePath: project.mediaPath,
        sourceName: project.mediaName,
        renderedPaths: lastExportPaths,
        srt: chunksToSrt(project.chunks),
        text: project.chunks.map((chunk) => chunk.text).join('\n'),
        ass: buildAssDocument({ chunks: project.chunks, style: project.style, variants: project.variants, width, height }),
        projectJson: JSON.stringify(portableProject, null, 2),
        audioTracks: project.audioTracks,
      })
      setNotice('ZIP proje paketi olusturuldu.')
      setLastExportPaths((current) => [...current, outputPath])
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setStatus('idle')
    }
  }

  async function cancelExport() {
    if (!currentJobIdRef.current || !window.captionStudio) return
    await window.captionStudio.cancelExport(currentJobIdRef.current)
    currentJobIdRef.current = undefined
    setStatus('idle')
    setExportProgress(0)
  }

  async function batchTranscribe(projectIds: string[] = []) {
    if (transcriptionActiveRef.current) {
      setBatchMessage('Bir transkripsiyon zaten devam ediyor.')
      return
    }
    const selected = new Set(projectIds.slice(0, 5))
    const emptyProjects = (await listProjects()).filter((item) => selected.has(item.id) && item.chunkCount === 0)
    if (!emptyProjects.length) {
      setBatchMessage('Transcribe edilecek bos proje yok.')
      return
    }
    transcriptionActiveRef.current = true
    const runId = ++transcriptionRunIdRef.current
    let cancelled = false
    setError('')
    try {
      for (let index = 0; index < emptyProjects.length; index += 1) {
        if (transcriptionRunIdRef.current !== runId) throw transcriptionCancelledError()
        const stored = await getProject(emptyProjects[index].id)
        if (!stored) continue
        const target = normalizeProject(stored)
        setBatchMessage(`Transcribe ${index + 1}/${emptyProjects.length}: ${target.title}`)
        const audio = await decodeProjectAudio(target)
        if (transcriptionRunIdRef.current !== runId) throw transcriptionCancelledError()
        const raw = await runWorkerTranscription(audio, target.settings)
        const normalized = normalizeTranscription(raw, target.mediaDuration, target.settings.maxWordsPerCaption, target.settings.maxCaptionDuration)
        await saveProject({
          ...target,
          transcriptText: normalized.text,
          chunks: normalized.chunks.map((chunk) => ({ ...chunk, variantId: 'main' })),
          updatedAt: Date.now(),
        })
      }
    } catch (caught) {
      cancelled = isTranscriptionCancelled(caught)
      if (!cancelled) {
        releaseTranscriptionWorker()
        setError(errorMessage(caught))
      }
    } finally {
      if (transcriptionRunIdRef.current === runId) transcriptionActiveRef.current = false
    }
    setStatus('idle')
    setBatchMessage(cancelled ? 'Toplu transcribe iptal edildi.' : 'Toplu transcribe tamamlandi.')
    await refreshProjects()
  }

  async function batchExport(projectIds: string[] = []) {
    if (!window.captionStudio) {
      setBatchMessage('Toplu export masaustu uygulamasinda kullanilir.')
      return
    }
    const directory = await window.captionStudio.chooseDirectory()
    if (!directory) return
    const selected = new Set(projectIds.slice(0, 5))
    const savedProjects = (await listProjects()).filter((item) => selected.has(item.id) && item.chunkCount > 0 && item.mediaPath)
    if (!savedProjects.length) {
      setBatchMessage('Export edilecek altyazili proje yok.')
      return
    }
    setStatus('exporting')
    for (let index = 0; index < savedProjects.length; index += 1) {
      const stored = await getProject(savedProjects[index].id)
      if (!stored?.mediaPath) continue
      const target = normalizeProject(stored)
      const extension = outputExtension(target)
      const outputPath = `${directory.replace(/[\\/]+$/, '')}\\${safeFilename(target.title)}-captioned.${extension}`
      const jobId = cryptoId('batch-export')
      currentJobIdRef.current = jobId
      setBatchMessage(`Export ${index + 1}/${savedProjects.length}: ${target.title}`)
      setExportProgress(0)
      try {
        await window.captionStudio.exportVideo(makeExportRequest(target, outputPath, jobId))
      } catch (caught) {
        setError(`${target.title}: ${errorMessage(caught)}`)
      }
    }
    currentJobIdRef.current = undefined
    setStatus('idle')
    setBatchMessage('Toplu export tamamlandi.')
  }

  return (
    <div className="app-shell">
      <TitleBar
        projectTitle={project?.title}
        busy={busy}
        saved={saved}
        onTitleChange={(title) => updateProject({ title })}
        onSave={() => void persistProject()}
        onSavePreset={openSettingsPresetDialog}
        onExport={() => setActiveTool('export')}
      />
      <div className="editor-workspace">
        <ToolRail active={activeTool} hasProject={Boolean(project)} onSelect={setActiveTool} />
        <Inspector
          tool={activeTool}
          project={project}
          projects={projects}
          activeStyle={activeVariantStyle}
          selectedVariantId={selectedVariantId}
          systemFonts={systemFonts}
          customPresets={customPresets}
          settingsPresets={settingsPresets}
          selectedWordCount={selectedWordIds.length}
          status={status}
          exportProgress={exportProgress}
          batchMessage={batchMessage}
          ffmpegVersion={ffmpegVersion}
          lastExportPaths={lastExportPaths}
          onOpenMedia={() => void handleOpenMedia()}
          onUpdateCanvas={updateCanvas}
          onAddAudioTracks={() => void addAudioTracks()}
          onUpdateAudioTrack={updateAudioTrack}
          onRemoveAudioTrack={removeAudioTrack}
          onApplyPreset={applyPreset}
          onSaveCustomPreset={saveCustomPreset}
          onDeleteCustomPreset={deleteCustomPreset}
          onOpenSettingsPresetDialog={openSettingsPresetDialog}
          onApplySettingsPreset={applySavedSettingsPreset}
          onDeleteSettingsPreset={deleteSavedSettingsPreset}
          onSelectVariant={setSelectedVariantId}
          onAddVariant={addVariant}
          onDeleteVariant={deleteVariant}
          onApplyVariantToAll={applyVariantToAll}
          onUpdateStyle={updateSelectedStyle}
          onUpdateSettings={updateSettings}
          onTranscribe={() => void transcribe()}
          onImportSrt={() => void importSrt()}
          onExportSrt={() => void exportSrt()}
          onExportText={() => void exportText()}
          onUpdateExport={updateExportSettings}
          onExportVideo={() => void exportVideo()}
          onExportPackage={() => void exportProjectPackage()}
          onCancelExport={() => void cancelExport()}
          onRevealFile={(path) => void window.captionStudio?.revealFile(path)}
          onApplyWordStyle={applyWordStyle}
          onOpenProject={(id) => void openSavedProject(id)}
          onOpenProjectFile={() => void openProjectFile()}
          onDeleteProject={(id) => void removeSavedProject(id)}
          onBatchTranscribe={(projectIds) => void batchTranscribe(projectIds)}
          onBatchExport={(projectIds) => void batchExport(projectIds)}
        />
        <main className="editor-surface">
          {project ? (
            <>
              <div className="preview-and-captions">
                <MediaStage
                  mediaUrl={project.mediaUrl}
                  mediaType={project.mediaType}
                  sourceWidth={project.metadata?.width}
                  sourceHeight={project.metadata?.height}
                  mediaRef={mediaRef}
                  duration={project.mediaDuration}
                  currentTime={currentTime}
                  chunk={activeChunk}
                  style={previewStyle}
                  canvas={project.canvas}
                  audioSettings={project.exportSettings}
                  audioTracks={project.audioTracks}
                  selectedWordIds={selectedWordIds}
                  positionScope={positionScope}
                  onTimeUpdate={handleTimeUpdate}
                  onSelectWord={(word, additive) => activeChunk && selectWord(activeChunk.id, word, additive)}
                  onPositionScopeChange={setPositionScope}
                  onGeometryChange={handleGeometryChange}
                />
                <CaptionList
                  chunks={project.chunks}
                  variants={project.variants}
                  selectedChunkId={selectedChunkId}
                  selectedWordIds={selectedWordIds}
                  onSelectChunk={selectChunk}
                  onSelectWord={selectWord}
                  onUpdateChunk={updateChunk}
                  onPlayChunk={playChunk}
                  onSplitChunk={splitChunk}
                  onMergePrevious={mergePrevious}
                  onDeleteChunk={deleteChunk}
                  onAddChunk={addChunk}
                />
              </div>
              <Timeline
                duration={project.mediaDuration}
                currentTime={currentTime}
                chunks={project.chunks}
                waveform={project.waveform}
                audioTracks={project.audioTracks}
                showWaveform={project.canvas.showWaveform}
                selectedChunkId={selectedChunkId}
                selectedWordIds={selectedWordIds}
                onSeek={seek}
                onSelectChunk={selectChunk}
                onSelectWord={selectWord}
                onUpdateChunk={updateChunk}
                onUpdateWord={updateWord}
                onPlaySelection={playSelectedChunk}
                onDeleteChunk={deleteChunk}
                onDropFiles={addDroppedAudioTracks}
              />
            </>
          ) : (
            <WelcomeWorkspace projects={projects} onOpenMedia={() => void handleOpenMedia()} onOpenProject={(id) => void openSavedProject(id)} />
          )}
        </main>
      </div>
      <SettingsPresetDialog
        open={presetDialogOpen}
        defaultName={project ? `${project.title} ayarlari` : ''}
        onClose={() => setPresetDialogOpen(false)}
        onSave={saveSettingsPreset}
      />
      <WorkflowToast
        status={status}
        progress={progress}
        exportProgress={exportProgress}
        error={error}
        notice={notice}
        onCancelTranscription={cancelTranscription}
        onClose={() => { setError(''); setNotice(''); setStatus('idle') }}
      />
      <input
        ref={mediaInputRef}
        className="hidden-input"
        type="file"
        accept="video/*,audio/*,.mkv,.mov,.webm,.avi"
        multiple
        onChange={(event) => void handleWebMedia(Array.from(event.target.files ?? []))}
      />
      <input
        ref={subtitleInputRef}
        className="hidden-input"
        type="file"
        accept=".srt,.vtt,text/plain"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void file.text().then(applySrt)
        }}
      />
    </div>
  )
}

function SettingsPresetDialog({
  open,
  defaultName,
  onClose,
  onSave,
}: {
  open: boolean
  defaultName: string
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [defaultName, open])

  if (!open) return null
  return (
    <div className="preset-dialog-backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        className="preset-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-dialog-title"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) onSave(name)
        }}
      >
        <header>
          <div><strong id="preset-dialog-title">Tum ayarlari preset kaydet</strong><small>Stil · video · transkripsiyon · export</small></div>
          <button type="button" onClick={onClose} aria-label="Kapat"><X size={16} /></button>
        </header>
        <label>
          Preset adi
          <input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <footer>
          <button type="button" onClick={onClose}>Vazgec</button>
          <button type="submit" className="dialog-save" disabled={!name.trim()}>Preset kaydet</button>
        </footer>
      </form>
    </div>
  )
}

function WelcomeWorkspace({ projects, onOpenMedia, onOpenProject }: { projects: ProjectSummary[]; onOpenMedia: () => void; onOpenProject: (id: string) => void }) {
  return (
    <section className="welcome-workspace">
      <button type="button" className="workspace-drop" onClick={onOpenMedia}>
        <span><Upload size={26} /></span>
        <strong>Video veya ses dosyasi ac</strong>
        <small>MP4, MOV, MKV, WebM, AVI ve tum yaygin ses formatlari</small>
      </button>
      <div className="recent-projects">
        <header><h2>Son projeler</h2><button type="button" onClick={onOpenMedia}><FolderOpen size={15} /> Dosya ac</button></header>
        <div className="recent-grid">
          {projects.slice(0, 8).map((savedProject) => (
            <button type="button" key={savedProject.id} onClick={() => onOpenProject(savedProject.id)}>
              <span><Video size={20} /></span>
              <b>{savedProject.title}</b>
              <small>{formatDuration(savedProject.mediaDuration)} · {savedProject.chunkCount} segment</small>
            </button>
          ))}
          {!projects.length ? <p>Ilk projen icin yukaridan bir video sec.</p> : null}
        </div>
      </div>
    </section>
  )
}

function WorkflowToast({
  status,
  progress,
  exportProgress,
  error,
  notice,
  onCancelTranscription,
  onClose,
}: {
  status: WorkflowStatus
  progress: WorkerProgress
  exportProgress: number
  error: string
  notice: string
  onCancelTranscription: () => void
  onClose: () => void
}) {
  if (status === 'idle' && !error && !notice) return null
  if (status === 'idle' && notice && !error) {
    return (
      <div className="workflow-toast notice" role="status">
        <Check size={17} />
        <div><strong>{notice}</strong></div>
        <button type="button" onClick={onClose} aria-label="Bildirimi kapat"><X size={14} /></button>
      </div>
    )
  }
  const raw = status === 'exporting' ? exportProgress : progress.progress ?? (progress.total && progress.loaded ? progress.loaded / progress.total : 0)
  const value = normalizeProgress(raw)
  const canCancelTranscription = status === 'decoding' || status === 'loading-model' || status === 'transcribing'
  return (
    <div className={`workflow-toast ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {error ? null : <Loader2 size={17} className="spin" />}
      <div><strong>{error || progress.status || status}</strong>{!error ? <progress value={value} max={1} /> : null}</div>
      {!error ? (
        <div className="toast-actions">
          <b>{Math.round(value * 100)}%</b>
          {canCancelTranscription ? <button type="button" onClick={onCancelTranscription}>Iptal</button> : null}
        </div>
      ) : <button type="button" onClick={onClose}>Kapat</button>}
    </div>
  )
}

function rebuildWords(chunk: SubtitleChunk, text: string, start: number, end: number) {
  const parts = text.split(/\s+/).filter(Boolean)
  const duration = Math.max(0.08, end - start)
  const step = duration / Math.max(1, parts.length)
  return parts.map((word, index) => ({
    id: chunk.words[index]?.id ?? cryptoId('word'),
    text: word,
    start: parts.length === chunk.words.length ? chunk.words[index]?.start ?? start + step * index : start + step * index,
    end:
      parts.length === chunk.words.length
        ? chunk.words[index]?.end ?? (index === parts.length - 1 ? end : start + step * (index + 1))
        : index === parts.length - 1
          ? end
          : start + step * (index + 1),
    style: chunk.words[index]?.style,
  }))
}

function makeExportRequest(project: CaptionProject, outputPath: string, jobId: string): NativeExportRequest {
  const metadata = project.metadata ?? {
    width: 1920,
    height: 1080,
    fps: 30,
    duration: project.mediaDuration,
    format: sourceExtension(project.mediaName),
    videoCodec: '',
    audioCodec: '',
    hasAudio: true,
  }
  return {
    jobId,
    inputPath: project.mediaPath as string,
    outputPath,
    title: project.title,
    duration: project.mediaDuration || metadata.duration,
    sourceWidth: metadata.width || 1920,
    sourceHeight: metadata.height || 1080,
    sourceFps: metadata.fps || 30,
    sourceExtension: sourceExtension(project.mediaName),
    chunks: project.chunks,
    style: project.style,
    variants: project.variants,
    canvas: project.canvas,
    settings: project.exportSettings,
    sourceHasAudio: metadata.hasAudio,
    audioTracks: project.audioTracks,
  }
}

function outputExtension(project: CaptionProject) {
  if (project.exportSettings.mode === 'transparent' || project.exportSettings.mode === 'mask-pair') return 'mov'
  if (project.exportSettings.container !== 'source') return project.exportSettings.container
  const source = sourceExtension(project.mediaName)
  return ['mp4', 'mov', 'mkv', 'webm'].includes(source) ? source : 'mp4'
}

function sourceExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() || 'mp4'
}

function safeFilename(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').toLowerCase() || 'caption-export'
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value > 1 ? value / 100 : value))
}

function loadCustomPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem('caption-studio-custom-presets') ?? '[]') as SubtitleStyle[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught)
}

function transcriptionCancelledError() {
  const error = new Error('Transkripsiyon iptal edildi.')
  error.name = TRANSCRIPTION_CANCELLED
  return error
}

function isTranscriptionCancelled(caught: unknown) {
  return caught instanceof Error && caught.name === TRANSCRIPTION_CANCELLED
}

export default App
