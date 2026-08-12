import { AlignCenter, AlignLeft, AlignRight, Maximize2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { cleanCaptionText, resolveWordStyle } from '../lib/transcription'
import type { AudioTrack, CanvasSettings, ExportSettings, SubtitleChunk, SubtitleStyle, TextAlign, TranscriptWord } from '../types'

type MediaStageProps = {
  mediaUrl?: string
  mediaType: string
  sourceWidth?: number
  sourceHeight?: number
  mediaRef: RefObject<HTMLVideoElement | HTMLAudioElement | null>
  duration: number
  currentTime: number
  chunk?: SubtitleChunk
  style: SubtitleStyle
  canvas: CanvasSettings
  audioSettings: ExportSettings
  audioTracks: AudioTrack[]
  selectedWordIds: string[]
  positionScope: 'current' | 'all'
  onTimeUpdate: (time: number) => void
  onSelectWord: (word: TranscriptWord, additive: boolean) => void
  onPositionScopeChange: (scope: 'current' | 'all') => void
  onGeometryChange: (patch: Partial<Pick<SubtitleStyle, 'positionX' | 'positionY' | 'maxWidth' | 'align'>>) => void
}

type DragState = {
  mode: 'move' | 'resize-left' | 'resize-right'
  startX: number
  startY: number
  positionX: number
  positionY: number
  maxWidth: number
  bounds: DOMRect
}

function constrainCaptionGeometry(style: SubtitleStyle) {
  const maxWidth = clamp(style.maxWidth, 18, 96)
  const halfWidth = maxWidth / 2
  return {
    positionX: clamp(style.positionX, halfWidth, 100 - halfWidth),
    positionY: clamp(style.positionY, 2, 98),
    maxWidth,
  }
}

export function MediaStage({
  mediaUrl,
  mediaType,
  sourceWidth = 0,
  sourceHeight = 0,
  mediaRef,
  duration,
  currentTime,
  chunk,
  style,
  canvas,
  audioSettings,
  audioTracks,
  selectedWordIds,
  positionScope,
  onTimeUpdate,
  onSelectWord,
  onPositionScopeChange,
  onGeometryChange,
}: MediaStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const trackAudioRefs = useRef(new Map<string, HTMLAudioElement>())
  const [stageSize, setStageSize] = useState({ width: 960, height: 540 })
  const [intrinsicSize, setIntrinsicSize] = useState({ width: sourceWidth, height: sourceHeight })
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    setIntrinsicSize({ width: sourceWidth, height: sourceHeight })
  }, [mediaUrl, sourceWidth, sourceHeight])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    return () => {
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
    }
  }, [mediaRef, mediaUrl])

  useEffect(() => {
    const media = mediaRef.current
    if (!media) return
    const base = Math.max(0, Math.min(2, audioSettings.audioVolume / 100))
    const fadeIn = audioSettings.audioFadeIn > 0 ? Math.min(1, currentTime / audioSettings.audioFadeIn) : 1
    const remaining = Math.max(0, duration - currentTime)
    const fadeOut = audioSettings.audioFadeOut > 0 ? Math.min(1, remaining / audioSettings.audioFadeOut) : 1
    const value = base * Math.min(fadeIn, fadeOut)
    // Keep the primary preview on Electron's native media path. Creating a
    // MediaElementAudioSource can leave packaged builds waiting on a suspended
    // audio context, which also makes a playback attempt appear stuck.
    media.volume = Math.max(0, Math.min(1, value))
  }, [audioSettings, currentTime, duration, mediaRef])

  useEffect(() => {
    const main = mediaRef.current
    if (!main) return
    for (const track of audioTracks) {
      const audio = trackAudioRefs.current.get(track.id)
      if (!audio) continue
      const localTime = currentTime - track.start
      const shouldPlay = !main.paused && !track.muted && localTime >= 0
      if (!shouldPlay) {
        audio.pause()
        continue
      }
      if (Math.abs(audio.currentTime - localTime) > 0.2) audio.currentTime = Math.max(0, localTime)
      const trackFadeIn = track.fadeIn > 0 ? Math.min(1, localTime / track.fadeIn) : 1
      const trackFadeOut = track.fadeOut > 0 && duration > 0 ? Math.min(1, Math.max(0, duration - currentTime) / track.fadeOut) : 1
      audio.volume = Math.max(0, Math.min(1, (audioSettings.audioVolume / 100) * (track.volume / 100) * Math.min(trackFadeIn, trackFadeOut)))
      void audio.play().catch(() => undefined)
    }
  }, [audioSettings.audioVolume, audioTracks, currentTime, duration, mediaRef, playing])

  const ratio = useMemo(() => {
    const values: Record<Exclude<CanvasSettings['aspectRatio'], 'source'>, number> = {
      '1:1': 1,
      '9:16': 9 / 16,
      '16:9': 16 / 9,
      '4:3': 4 / 3,
      '3:4': 3 / 4,
    }
    if (canvas.aspectRatio !== 'source') return values[canvas.aspectRatio]
    if (intrinsicSize.width > 0 && intrinsicSize.height > 0) {
      return intrinsicSize.width / intrinsicSize.height
    }
    return 16 / 9
  }, [canvas.aspectRatio, intrinsicSize.height, intrinsicSize.width])
  const previewScale = Math.max(0.12, stageSize.height / 1080)
  const displayWords = chunk?.words.length ? chunk.words : []
  const fallbackText = chunk ? cleanCaptionText(chunk.text, style) : ''
  const geometry = constrainCaptionGeometry(style)

  function togglePlayback() {
    const media = mediaRef.current
    if (!media) return
    if (media.paused) {
      void media.play()
    }
    else media.pause()
  }

  function toggleMute() {
    const media = mediaRef.current
    if (!media) return
    media.muted = !media.muted
    setMuted(media.muted)
  }

  function beginDrag(event: ReactPointerEvent, mode: DragState['mode']) {
    if (!chunk || !stageRef.current) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      positionX: geometry.positionX,
      positionY: geometry.positionY,
      maxWidth: geometry.maxWidth,
      bounds: stageRef.current.getBoundingClientRect(),
    }
  }

  function moveDrag(event: ReactPointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    const deltaX = ((event.clientX - drag.startX) / Math.max(1, drag.bounds.width)) * 100
    const deltaY = ((event.clientY - drag.startY) / Math.max(1, drag.bounds.height)) * 100
    if (drag.mode === 'move') {
      const halfWidth = drag.maxWidth / 2
      onGeometryChange({
        positionX: clamp(drag.positionX + deltaX, halfWidth, 100 - halfWidth),
        positionY: clamp(drag.positionY + deltaY, 2, 98),
      })
    } else {
      const direction = drag.mode === 'resize-right' ? 2 : -2
      const maxWidth = Math.min(96, 2 * Math.min(drag.positionX, 100 - drag.positionX))
      onGeometryChange({ maxWidth: clamp(drag.maxWidth + deltaX * direction, 18, maxWidth) })
    }
  }

  function finishDrag(event: ReactPointerEvent) {
    if (dragRef.current) event.currentTarget.releasePointerCapture(event.pointerId)
    dragRef.current = null
  }

  return (
    <section className="stage-shell">
      <div
        ref={stageRef}
        className={`media-stage ${ratio < 1 ? 'portrait-stage' : ''}`}
        data-aspect-ratio={ratio}
        style={{
          aspectRatio: ratio,
          backgroundColor: canvas.backgroundColor,
        }}
      >
        {mediaUrl ? (
          mediaType.startsWith('audio/') ? (
            <div className="audio-stage">
              <div className="audio-pulse" />
              <audio
                ref={mediaRef as RefObject<HTMLAudioElement>}
                src={mediaUrl}
                onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
                onLoadedMetadata={(event) => onTimeUpdate(event.currentTarget.currentTime)}
              />
            </div>
          ) : (
            <video
              ref={mediaRef as RefObject<HTMLVideoElement>}
              src={mediaUrl}
              playsInline
              preload="metadata"
              style={{ objectFit: canvas.scaleMode === 'cover' ? 'cover' : 'contain' }}
              onTimeUpdate={(event) => onTimeUpdate(event.currentTarget.currentTime)}
              onLoadedMetadata={(event) => {
                const video = event.currentTarget
                if (video.videoWidth > 0 && video.videoHeight > 0) {
                  setIntrinsicSize({ width: video.videoWidth, height: video.videoHeight })
                }
                onTimeUpdate(video.currentTime)
              }}
              onClick={togglePlayback}
            />
          )
        ) : (
          <div className="stage-empty">Bir video sec</div>
        )}
        {audioTracks.map((track) => (
          <audio
            key={track.id}
            ref={(element) => {
              if (element) trackAudioRefs.current.set(track.id, element)
              else trackAudioRefs.current.delete(track.id)
            }}
            src={track.url}
            preload="auto"
          />
        ))}

        {canvas.showSafeZone ? <SafeZone platform={canvas.safeZonePlatform} /> : null}

        {chunk ? (
          <div
            className="caption-selection"
            style={{
              left: `${geometry.positionX}%`,
              top: `${geometry.positionY}%`,
              width: `${geometry.maxWidth}%`,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(event) => beginDrag(event, 'move')}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
          >
            <button
              type="button"
              className="resize-handle left"
              aria-label="Altyazi kutusunu soldan boyutlandir"
              onPointerDown={(event) => beginDrag(event, 'resize-left')}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
            />
            <CaptionText
              key={chunk.id}
              words={displayWords}
              fallbackText={fallbackText}
              currentTime={currentTime}
              style={style}
              previewScale={previewScale}
              selectedWordIds={selectedWordIds}
              onSelectWord={onSelectWord}
            />
            <button
              type="button"
              className="resize-handle right"
              aria-label="Altyazi kutusunu sagdan boyutlandir"
              onPointerDown={(event) => beginDrag(event, 'resize-right')}
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
            />
            {!playing ? <div className="caption-floatbar no-drag" onPointerDown={(event) => event.stopPropagation()}>
              <div className="align-tools">
                <AlignButton align="left" current={style.align} onChange={(align) => onGeometryChange({ align })} />
                <AlignButton align="center" current={style.align} onChange={(align) => onGeometryChange({ align })} />
                <AlignButton align="right" current={style.align} onChange={(align) => onGeometryChange({ align })} />
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={positionScope === 'current'}
                  onChange={(event) => onPositionScopeChange(event.target.checked ? 'current' : 'all')}
                />
                Yalniz mevcut segment
              </label>
            </div> : null}
          </div>
        ) : null}
      </div>

      <div className="transport-bar">
        <button type="button" className="transport-icon" onClick={togglePlayback} aria-label={playing ? 'Duraklat' : 'Oynat'}>
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <span className="timecode">{formatTime(currentTime)} / {formatTime(duration)}</span>
        <input
          type="range"
          min="0"
          max={Math.max(duration, 0.01)}
          step="0.01"
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => {
            const time = Number(event.target.value)
            if (mediaRef.current) mediaRef.current.currentTime = time
            onTimeUpdate(time)
          }}
          aria-label="Video konumu"
        />
        <button type="button" className="transport-icon" onClick={toggleMute} aria-label={muted ? 'Sesi ac' : 'Sesi kapat'}>
          {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
        </button>
        <button type="button" className="transport-icon" onClick={() => void stageRef.current?.requestFullscreen()} aria-label="Tam ekran">
          <Maximize2 size={16} />
        </button>
      </div>
    </section>
  )
}

function CaptionText({
  words,
  fallbackText,
  currentTime,
  style,
  previewScale,
  selectedWordIds,
  onSelectWord,
}: {
  words: TranscriptWord[]
  fallbackText: string
  currentTime: number
  style: SubtitleStyle
  previewScale: number
  selectedWordIds: string[]
  onSelectWord: (word: TranscriptWord, additive: boolean) => void
}) {
  const baseShadow = style.shadow
    ? `${style.shadowOffsetX * previewScale}px ${style.shadowOffsetY * previewScale}px ${style.shadowBlur * previewScale}px ${style.shadowColor}`
    : 'none'
  const common = {
    fontFamily: style.fontFamily,
    fontSize: `${Math.max(11, style.fontSize * previewScale)}px`,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    textAlign: style.align,
    lineHeight: style.lineHeight,
    letterSpacing: `${style.letterSpacing * previewScale}px`,
    wordSpacing: `${style.wordSpacing * previewScale}px`,
    color: style.textColor,
    textShadow: baseShadow,
    backgroundColor:
      style.backgroundMode !== 'none' ? rgba(style.backgroundColor, style.backgroundOpacity) : 'transparent',
    padding: style.backgroundMode !== 'none' ? `${style.boxPadding * previewScale}px` : 0,
    borderRadius: `${style.borderRadius * previewScale}px`,
  } as const

  return (
    <div className={`caption-text background-${style.backgroundMode} transition-${style.transitionIn}`} style={common}>
      {words.length ? (
        words.map((word, index) => {
          const active = currentTime >= word.start && currentTime <= word.end
          const wordStyle = resolveWordStyle(style, word.style, active)
          return (
            <Fragment key={word.id}>
              <span
                className={`${active ? `active word-${style.wordTransition}` : ''} ${selectedWordIds.includes(word.id) ? 'selected-word' : ''}`}
                style={{
                  color: wordStyle.textColor,
                  WebkitTextStroke: `${Math.max(0, wordStyle.strokeWidth * previewScale)}px ${wordStyle.strokeColor}`,
                  paintOrder: 'stroke fill',
                  textShadow: wordStyle.shadow ? baseShadow : 'none',
                  backgroundColor:
                    wordStyle.backgroundOpacity > 0
                      ? rgba(wordStyle.backgroundColor, wordStyle.backgroundOpacity)
                      : 'transparent',
                  fontSize: `${Math.max(11, style.fontSize * previewScale * wordStyle.fontScale)}px`,
                  fontWeight: wordStyle.fontWeight,
                  fontStyle: wordStyle.italic ? 'italic' : 'normal',
                  textDecoration: wordStyle.underline ? 'underline' : 'none',
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectWord(word, event.ctrlKey || event.metaKey || event.shiftKey)
                }}
              >
                {cleanCaptionText(word.text, style)}
              </span>
              {index < words.length - 1 ? ' ' : null}
            </Fragment>
          )
        })
      ) : (
        <span
          style={{
            WebkitTextStroke: `${Math.max(0, style.strokeWidth * previewScale)}px ${style.strokeColor}`,
            paintOrder: 'stroke fill',
          }}
        >
          {fallbackText}
        </span>
      )}
    </div>
  )
}

function SafeZone({ platform }: { platform: CanvasSettings['safeZonePlatform'] }) {
  if (platform === 'none') return null
  return (
    <div className={`safe-zone safe-${platform}`} aria-hidden="true">
      <div className="safe-top" />
      <div className="safe-right" />
      <div className="safe-bottom" />
      <div className="safe-center" />
    </div>
  )
}

function AlignButton({ align, current, onChange }: { align: TextAlign; current: TextAlign; onChange: (align: TextAlign) => void }) {
  const Icon = align === 'left' ? AlignLeft : align === 'right' ? AlignRight : AlignCenter
  return (
    <button type="button" className={current === align ? 'active' : ''} onClick={() => onChange(align)} aria-label={`${align} hizala`}>
      <Icon size={15} />
    </button>
  )
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  const frames = Math.floor((safe % 1) * 100)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(frames).padStart(2, '0')}`
}

function rgba(hex: string, opacity: number) {
  const normalized = hex.replace('#', '').padEnd(6, '0')
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100))
}
