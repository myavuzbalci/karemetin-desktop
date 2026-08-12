import { CornerUpLeft, Play, Plus, Scissors, Search, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CaptionVariant, SubtitleChunk, TranscriptWord } from '../types'

type CaptionListProps = {
  chunks: SubtitleChunk[]
  variants: CaptionVariant[]
  selectedChunkId?: string
  selectedWordIds: string[]
  onSelectChunk: (chunkId: string) => void
  onSelectWord: (chunkId: string, word: TranscriptWord, additive: boolean) => void
  onUpdateChunk: (chunkId: string, patch: Partial<SubtitleChunk>) => void
  onPlayChunk: (chunkId: string) => void
  onSplitChunk: (chunkId: string) => void
  onMergePrevious: (chunkId: string) => void
  onDeleteChunk: (chunkId: string) => void
  onAddChunk: () => void
}

export function CaptionList({
  chunks,
  variants,
  selectedChunkId,
  selectedWordIds,
  onSelectChunk,
  onSelectWord,
  onUpdateChunk,
  onPlayChunk,
  onSplitChunk,
  onMergePrevious,
  onDeleteChunk,
  onAddChunk,
}: CaptionListProps) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const filtered = chunks.filter((chunk) => chunk.text.toLocaleLowerCase().includes(query.toLocaleLowerCase()))

  useEffect(() => {
    if (!selectedChunkId || query) return
    listRef.current?.querySelector<HTMLElement>(`[data-chunk-id="${CSS.escape(selectedChunkId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [query, selectedChunkId])

  return (
    <aside className="caption-list-panel">
      <header>
        <div><h2>Altyazi metni</h2><span>{chunks.length} segment</span></div>
        <button type="button" onClick={onAddChunk} aria-label="Yeni altyazi ekle" title="Yeni altyazi ekle"><Plus size={16} /></button>
      </header>
      <label className="caption-search">
        <Search size={15} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Altyazilarda ara" />
      </label>
      <div ref={listRef} className="caption-list-scroll">
        {filtered.map((chunk, index) => (
          <article
            key={chunk.id}
            data-chunk-id={chunk.id}
            className={selectedChunkId === chunk.id ? 'caption-row selected' : 'caption-row'}
            onClick={() => onSelectChunk(chunk.id)}
          >
            <div className="caption-row-head">
              <b>{String(chunks.indexOf(chunk) + 1).padStart(2, '0')}</b>
              <div className="caption-times">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={round(chunk.start)}
                  onChange={(event) => onUpdateChunk(chunk.id, { start: Number(event.target.value) })}
                  aria-label={`${index + 1}. segment baslangici`}
                />
                <span>-</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={round(chunk.end)}
                  onChange={(event) => onUpdateChunk(chunk.id, { end: Number(event.target.value) })}
                  aria-label={`${index + 1}. segment bitisi`}
                />
              </div>
              <div className="caption-row-tools">
                <button type="button" onClick={(event) => { event.stopPropagation(); onPlayChunk(chunk.id) }} aria-label="Segmenti oynat" title="Segmenti oynat"><Play size={13} /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onSplitChunk(chunk.id) }} aria-label="Segmenti bol" title="Segmenti bol"><Scissors size={13} /></button>
                <button type="button" disabled={index === 0} onClick={(event) => { event.stopPropagation(); onMergePrevious(chunk.id) }} aria-label="Oncekiyle birlestir" title="Oncekiyle birlestir"><CornerUpLeft size={13} /></button>
                <button type="button" onClick={(event) => { event.stopPropagation(); onDeleteChunk(chunk.id) }} aria-label="Segmenti sil" title="Segmenti sil"><Trash2 size={13} /></button>
              </div>
            </div>
            <textarea
              value={chunk.text}
              onChange={(event) => onUpdateChunk(chunk.id, { text: event.target.value })}
              onFocus={() => onSelectChunk(chunk.id)}
              aria-label={`${index + 1}. segment metni`}
            />
            <div className="word-chip-row">
              {chunk.words.map((word) => (
                <button
                  type="button"
                  key={word.id}
                  className={selectedWordIds.includes(word.id) ? 'selected' : word.style ? 'styled' : ''}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectWord(chunk.id, word, event.ctrlKey || event.metaKey || event.shiftKey)
                  }}
                  title={`${word.start.toFixed(2)} - ${word.end.toFixed(2)}`}
                >
                  {word.text}
                </button>
              ))}
            </div>
            <label className="caption-variant-select">
              Stil
              <select
                value={chunk.variantId ?? 'main'}
                onChange={(event) => onUpdateChunk(chunk.id, { variantId: event.target.value })}
                onClick={(event) => event.stopPropagation()}
              >
                {variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.name}</option>)}
              </select>
            </label>
          </article>
        ))}
        {!filtered.length ? <div className="empty-list">Eslesen altyazi yok.</div> : null}
      </div>
    </aside>
  )
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
