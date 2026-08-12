import { Minus, Play, Plus, Trash2, Waves } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { AudioTrack, SubtitleChunk, TranscriptWord } from '../types'

type TimelineProps = {
  duration: number
  currentTime: number
  chunks: SubtitleChunk[]
  waveform?: number[]
  audioTracks: AudioTrack[]
  showWaveform: boolean
  selectedChunkId?: string
  selectedWordIds: string[]
  onSeek: (time: number) => void
  onSelectChunk: (chunkId: string) => void
  onSelectWord: (chunkId: string, word: TranscriptWord, additive: boolean) => void
  onUpdateChunk: (chunkId: string, patch: Partial<SubtitleChunk>) => void
  onUpdateWord: (chunkId: string, wordId: string, patch: Partial<TranscriptWord>) => void
  onPlaySelection: () => void
  onDeleteChunk: (chunkId: string) => void
  onDropFiles: (files: File[], time: number) => void
}

type BoundaryDrag = {
  kind: 'word' | 'chunk'
  edge: 'start' | 'end'
  chunkId: string
  wordId?: string
  originX: number
  start: number
  end: number
}

export function Timeline({
  duration,
  currentTime,
  chunks,
  waveform,
  audioTracks,
  showWaveform,
  selectedChunkId,
  selectedWordIds,
  onSeek,
  onSelectChunk,
  onSelectWord,
  onUpdateChunk,
  onUpdateWord,
  onPlaySelection,
  onDeleteChunk,
  onDropFiles,
}: TimelineProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<BoundaryDrag | null>(null)
  const wordRangeRef = useRef<{ start: number; end: number } | null>(null)
  const dragDepthRef = useRef(0)
  const [wordRange, setWordRange] = useState<{ start: number; end: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [viewportWidth, setViewportWidth] = useState(900)
  const [dropActive, setDropActive] = useState(false)
  const pixelsPerSecond = 110 * zoom
  const contentWidth = Math.max(viewportWidth, duration * pixelsPerSecond + 80)
  const sourceAudioRows = showWaveform ? 1 : 0
  const contentHeight = 109 + (sourceAudioRows + audioTracks.length) * 36

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(([entry]) => setViewportWidth(entry.contentRect.width))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport || !duration) return
    const playhead = currentTime * pixelsPerSecond
    if (playhead < viewport.scrollLeft + 80 || playhead > viewport.scrollLeft + viewport.clientWidth - 100) {
      viewport.scrollLeft = Math.max(0, playhead - viewport.clientWidth * 0.35)
    }
  }, [currentTime, duration, pixelsPerSecond])

  useEffect(() => {
    function handleDelete(event: KeyboardEvent) {
      if (!selectedChunkId || (event.key !== 'Delete' && event.key !== 'Backspace')) return
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
      event.preventDefault()
      onDeleteChunk(selectedChunkId)
    }
    window.addEventListener('keydown', handleDelete)
    return () => window.removeEventListener('keydown', handleDelete)
  }, [onDeleteChunk, selectedChunkId])

  const ticks = useMemo(() => {
    const step = pixelsPerSecond > 160 ? 0.5 : pixelsPerSecond < 70 ? 2 : 1
    const result: number[] = []
    for (let time = 0; time <= duration + step; time += step) result.push(time)
    return result
  }, [duration, pixelsPerSecond])

  const visibleWaveform = useMemo(() => downsample(waveform ?? [], 900), [waveform])

  function seekFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    onSeek(clamp((event.clientX - bounds.left + (viewportRef.current?.scrollLeft ?? 0)) / pixelsPerSecond, 0, duration))
  }

  function beginWordRange(event: ReactMouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.word-clip')) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    const timeAt = (clientX: number) => clamp((clientX - bounds.left + (viewportRef.current?.scrollLeft ?? 0)) / pixelsPerSecond, 0, duration)
    const start = timeAt(event.clientX)
    wordRangeRef.current = { start, end: start }
    setWordRange({ start, end: start })
    const move = (moveEvent: MouseEvent) => {
      if (!wordRangeRef.current) return
      wordRangeRef.current = { ...wordRangeRef.current, end: timeAt(moveEvent.clientX) }
      setWordRange(wordRangeRef.current)
    }
    const up = (upEvent: MouseEvent) => {
      const range = wordRangeRef.current
      wordRangeRef.current = null
      setWordRange(null)
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      if (!range) return
      const low = Math.min(range.start, range.end)
      const high = Math.max(range.start, range.end)
      const selected = chunks.flatMap((chunk) => chunk.words.map((word) => ({ chunk, word })))
        .filter(({ word }) => word.end >= low && word.start <= high)
      if (!selected.length) {
        onSeek(timeAt(upEvent.clientX))
        return
      }
      onSelectChunk(selected[0].chunk.id)
      selected.forEach(({ chunk, word }, index) => onSelectWord(chunk.id, word, index > 0))
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  function beginBoundaryDrag(event: ReactPointerEvent, drag: Omit<BoundaryDrag, 'originX'>) {
    event.preventDefault()
    event.stopPropagation()
    dragRef.current = { ...drag, originX: event.clientX }

    const onMove = (moveEvent: PointerEvent) => {
      const active = dragRef.current
      if (!active) return
      const delta = (moveEvent.clientX - active.originX) / pixelsPerSecond
      if (active.kind === 'word' && active.wordId) {
        if (active.edge === 'start') {
          onUpdateWord(active.chunkId, active.wordId, {
            start: clamp(active.start + delta, 0, active.end - 0.04),
          })
        } else {
          onUpdateWord(active.chunkId, active.wordId, {
            end: clamp(active.end + delta, active.start + 0.04, duration),
          })
        }
      } else if (active.edge === 'start') {
        onUpdateChunk(active.chunkId, { start: clamp(active.start + delta, 0, active.end - 0.08) })
      } else {
        onUpdateChunk(active.chunkId, { end: clamp(active.end + delta, active.start + 0.08, duration) })
      }
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepthRef.current = 0
    setDropActive(false)
    const bounds = event.currentTarget.getBoundingClientRect()
    const time = clamp((event.clientX - bounds.left + event.currentTarget.scrollLeft) / pixelsPerSecond, 0, duration)
    onDropFiles(Array.from(event.dataTransfer.files), time)
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepthRef.current += 1
    setDropActive(true)
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDropActive(false)
  }

  return (
    <section className="timeline-shell">
      <div className="timeline-toolbar">
        <div className="timeline-title">
          <Waves size={15} />
          Timeline
        </div>
        <button type="button" className="selected-play" onClick={onPlaySelection} disabled={!selectedChunkId}>
          <Play size={14} />
          Secili parcayi oynat
        </button>
        <button
          type="button"
          className="selected-delete"
          onClick={() => selectedChunkId && onDeleteChunk(selectedChunkId)}
          disabled={!selectedChunkId}
          title="Secili segmenti sil"
        >
          <Trash2 size={14} />
          Sil
        </button>
        <div className="timeline-zoom">
          <button type="button" onClick={() => setZoom((value) => clamp(value - 0.2, 0.45, 2.4))} aria-label="Timeline uzaklastir">
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => clamp(value + 0.2, 0.45, 2.4))} aria-label="Timeline yakinlastir">
            <Plus size={14} />
          </button>
        </div>
      </div>
      <div className="timeline-body">
        <div className="track-labels" style={{ gridTemplateRows: `27px 41px 41px ${Array.from({ length: sourceAudioRows + audioTracks.length }, () => '36px').join(' ')}` }}>
          <span>TIME</span>
          <span>WORDS</span>
          <span>CAPTION</span>
          {showWaveform ? <span>AUDIO 1</span> : null}
          {audioTracks.map((_, index) => <span key={index}>AUDIO {index + 1 + sourceAudioRows}</span>)}
        </div>
        <div
          ref={viewportRef}
          className={`timeline-viewport ${dropActive ? 'drop-active' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {dropActive ? <div className="timeline-drop-target">Ses dosyasini birak: yeni audio track olustur</div> : null}
          <div className="timeline-content" style={{ width: `${contentWidth}px`, height: `${contentHeight}px` }}>
            <div className="timeline-ruler" onPointerDown={seekFromPointer}>
              {ticks.map((time) => (
                <span key={time} className="ruler-tick" style={{ left: `${time * pixelsPerSecond}px` }}>
                  <i />
                  {Number.isInteger(time) ? <b>{formatTime(time)}</b> : null}
                </span>
              ))}
            </div>

            <div className="word-track" onMouseDown={beginWordRange}>
              {wordRange ? <div className="word-selection-range" style={{ left: `${Math.min(wordRange.start, wordRange.end) * pixelsPerSecond}px`, width: `${Math.max(2, Math.abs(wordRange.end - wordRange.start) * pixelsPerSecond)}px` }} /> : null}
              {chunks.flatMap((chunk) =>
                chunk.words.map((word) => (
                  <div
                    key={word.id}
                    className={`word-clip ${selectedWordIds.includes(word.id) ? 'selected' : ''}`}
                    style={{
                      left: `${word.start * pixelsPerSecond}px`,
                      width: `${Math.max(5, (word.end - word.start) * pixelsPerSecond - 2)}px`,
                    }}
                    title={`${word.text} ${word.start.toFixed(2)} - ${word.end.toFixed(2)}`}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      onSelectChunk(chunk.id)
                      onSelectWord(chunk.id, word, event.ctrlKey || event.metaKey || event.shiftKey)
                    }}
                  >
                    <button
                      type="button"
                      className="clip-handle start"
                      aria-label={`${word.text} baslangicini ayarla`}
                      onPointerDown={(event) =>
                        beginBoundaryDrag(event, {
                          kind: 'word',
                          edge: 'start',
                          chunkId: chunk.id,
                          wordId: word.id,
                          start: word.start,
                          end: word.end,
                        })
                      }
                    />
                    <span>{word.text}</span>
                    <button
                      type="button"
                      className="clip-handle end"
                      aria-label={`${word.text} bitisini ayarla`}
                      onPointerDown={(event) =>
                        beginBoundaryDrag(event, {
                          kind: 'word',
                          edge: 'end',
                          chunkId: chunk.id,
                          wordId: word.id,
                          start: word.start,
                          end: word.end,
                        })
                      }
                    />
                  </div>
                )),
              )}
            </div>

            <div className="caption-track" onPointerDown={seekFromPointer}>
              {chunks.map((chunk) => (
                <div
                  key={chunk.id}
                  className={`caption-clip ${selectedChunkId === chunk.id ? 'selected' : ''}`}
                  style={{
                    left: `${chunk.start * pixelsPerSecond}px`,
                    width: `${Math.max(8, (chunk.end - chunk.start) * pixelsPerSecond - 2)}px`,
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onSelectChunk(chunk.id)
                    onSeek(chunk.start)
                  }}
                >
                  <button
                    type="button"
                    className="clip-handle start"
                    aria-label="Segment baslangicini ayarla"
                    onPointerDown={(event) =>
                      beginBoundaryDrag(event, {
                        kind: 'chunk',
                        edge: 'start',
                        chunkId: chunk.id,
                        start: chunk.start,
                        end: chunk.end,
                      })
                    }
                  />
                  <span>{chunk.text}</span>
                  <button
                    type="button"
                    className="clip-handle end"
                    aria-label="Segment bitisini ayarla"
                    onPointerDown={(event) =>
                      beginBoundaryDrag(event, {
                        kind: 'chunk',
                        edge: 'end',
                        chunkId: chunk.id,
                        start: chunk.start,
                        end: chunk.end,
                      })
                    }
                  />
                </div>
              ))}
            </div>

            {showWaveform ? (
              <div className="waveform-track" onPointerDown={seekFromPointer}>
                {visibleWaveform.map((value, index) => (
                  <i
                    key={`${index}-${value}`}
                    style={{
                      left: `${(index / Math.max(1, visibleWaveform.length - 1)) * duration * pixelsPerSecond}px`,
                      height: `${Math.max(2, value * 42)}px`,
                    }}
                  />
                ))}
              </div>
            ) : null}

            {audioTracks.map((track, index) => (
              <div className="audio-clip" key={track.id} style={{ left: `${track.start * pixelsPerSecond}px`, top: `${109 + (sourceAudioRows + index) * 36 + 5}px`, width: `${Math.max(48, (duration - track.start) * pixelsPerSecond)}px` }}>
                <Waves size={12} /><span>{track.name}</span><small>{track.volume}%</small>
              </div>
            ))}

            <div
              className="timeline-playhead"
              style={{ left: `${currentTime * pixelsPerSecond}px` }}
              role="slider"
              aria-label="Timeline oynatma cizgisi"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const viewport = viewportRef.current
                if (!viewport) return
                const move = (moveEvent: PointerEvent) => {
                  const bounds = viewport.getBoundingClientRect()
                  onSeek(clamp((moveEvent.clientX - bounds.left + viewport.scrollLeft) / pixelsPerSecond, 0, duration))
                }
                const up = () => {
                  window.removeEventListener('pointermove', move)
                  window.removeEventListener('pointerup', up)
                }
                window.addEventListener('pointermove', move)
                window.addEventListener('pointerup', up)
              }}
            >
              <i />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function downsample(values: number[], maxPoints: number) {
  if (values.length <= maxPoints) return values
  const result: number[] = []
  const bucket = values.length / maxPoints
  for (let index = 0; index < maxPoints; index += 1) {
    const start = Math.floor(index * bucket)
    const end = Math.max(start + 1, Math.floor((index + 1) * bucket))
    let peak = 0
    for (let cursor = start; cursor < end && cursor < values.length; cursor += 1) peak = Math.max(peak, values[cursor])
    result.push(peak)
  }
  return result
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value * 1000) / 1000))
}
