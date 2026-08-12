import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BookmarkPlus,
  Bot,
  Check,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Layers3,
  Plus,
  Save,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { LANGUAGE_OPTIONS, MODEL_CONFIGS, STYLE_PRESETS } from '../lib/models'
import type {
  CanvasSettings,
  AudioTrack,
  CaptionProject,
  CaptionVariant,
  ExportSettings,
  ProjectSummary,
  SettingsPreset,
  SubtitleStyle,
  TranscriptionSettings,
  WordStyleOverride,
  WorkflowStatus,
} from '../types'
import type { EditorTool } from './ToolRail'

type InspectorProps = {
  tool: EditorTool
  project: CaptionProject | null
  projects: ProjectSummary[]
  activeStyle: SubtitleStyle | null
  selectedVariantId: string
  systemFonts: string[]
  customPresets: SubtitleStyle[]
  settingsPresets: SettingsPreset[]
  selectedWordCount: number
  status: WorkflowStatus
  exportProgress: number
  batchMessage: string
  ffmpegVersion: string
  lastExportPaths: string[]
  onOpenMedia: () => void
  onUpdateCanvas: (patch: Partial<CanvasSettings>) => void
  onAddAudioTracks: () => void
  onUpdateAudioTrack: (id: string, patch: Partial<AudioTrack>) => void
  onRemoveAudioTrack: (id: string) => void
  onApplyPreset: (preset: SubtitleStyle) => void
  onSaveCustomPreset: () => void
  onDeleteCustomPreset: (presetName: string) => void
  onOpenSettingsPresetDialog: () => void
  onApplySettingsPreset: (presetId: string) => void
  onDeleteSettingsPreset: (presetId: string) => void
  onSelectVariant: (variantId: string) => void
  onAddVariant: () => void
  onDeleteVariant: (variantId: string) => void
  onApplyVariantToAll: (variantId: string) => void
  onUpdateStyle: (patch: Partial<SubtitleStyle>) => void
  onUpdateSettings: (patch: Partial<TranscriptionSettings>) => void
  onTranscribe: () => void
  onImportSrt: () => void
  onExportSrt: () => void
  onExportText: () => void
  onUpdateExport: (patch: Partial<ExportSettings>) => void
  onExportVideo: () => void
  onExportPackage: () => void
  onCancelExport: () => void
  onRevealFile: (path: string) => void
  onApplyWordStyle: (style?: WordStyleOverride) => void
  onOpenProject: (id: string) => void
  onOpenProjectFile: () => void
  onDeleteProject: (id: string) => void
  onBatchTranscribe: (projectIds?: string[]) => void
  onBatchExport: (projectIds?: string[]) => void
}

export function Inspector(props: InspectorProps) {
  return (
    <aside className="inspector">
      {props.tool === 'media' ? <MediaPanel {...props} /> : null}
      {props.tool === 'styles' ? <StylesPanel {...props} /> : null}
      {props.tool === 'customize' ? <CustomizePanel {...props} /> : null}
      {props.tool === 'captions' ? <CaptionToolsPanel {...props} /> : null}
      {props.tool === 'audio' ? <AudioPanel {...props} /> : null}
      {props.tool === 'export' ? <ExportPanel {...props} /> : null}
      {props.tool === 'library' ? <LibraryPanel {...props} /> : null}
    </aside>
  )
}

function MediaPanel({ project, onOpenMedia, onUpdateCanvas, onAddAudioTracks, onUpdateAudioTrack, onRemoveAudioTrack }: InspectorProps) {
  if (!project) return <EmptyInspector onOpenMedia={onOpenMedia} />
  const canvas = project.canvas
  const aspects: CanvasSettings['aspectRatio'][] = ['source', '1:1', '9:16', '16:9', '4:3', '3:4']

  return (
    <>
      <PanelHeader title="Video" subtitle={project.mediaName} />
      <div className="inspector-scroll">
        <section className="control-section">
          <button type="button" className="wide-command" onClick={onOpenMedia}>
            <Upload size={16} />
            Kaynak video ekle veya degistir
          </button>
          {project.metadata ? (
            <div className="media-facts">
              <span>{project.metadata.width} x {project.metadata.height}</span>
              <span>{formatFps(project.metadata.fps)} FPS</span>
              <span>{project.metadata.videoCodec || project.metadata.format}</span>
            </div>
          ) : null}
        </section>
        <section className="control-section">
          <SectionTitle>En boy orani</SectionTitle>
          <div className="option-grid aspect-grid">
            {aspects.map((aspect) => (
              <button
                type="button"
                key={aspect}
                className={canvas.aspectRatio === aspect ? 'selected' : ''}
                onClick={() => onUpdateCanvas({ aspectRatio: aspect })}
              >
                {aspect === 'source' ? 'Orijinal' : aspect}
              </button>
            ))}
          </div>
          <Segmented
            value={canvas.scaleMode}
            options={[
              ['contain', 'Sigdir'],
              ['cover', 'Doldur'],
            ]}
            onChange={(value) => onUpdateCanvas({ scaleMode: value as CanvasSettings['scaleMode'] })}
          />
          <ColorField label="Tuval rengi" value={canvas.backgroundColor} onChange={(backgroundColor) => onUpdateCanvas({ backgroundColor })} />
        </section>
        <section className="control-section">
          <SectionTitle>Guvenli alan</SectionTitle>
          <Toggle
            label="Platform arayuzunu goster"
            checked={canvas.showSafeZone}
            onChange={(showSafeZone) => onUpdateCanvas({ showSafeZone })}
          />
          <select
            value={canvas.safeZonePlatform}
            onChange={(event) => onUpdateCanvas({ safeZonePlatform: event.target.value as CanvasSettings['safeZonePlatform'] })}
            disabled={!canvas.showSafeZone}
          >
            <option value="tiktok">TikTok</option>
            <option value="instagram">Instagram Reels</option>
            <option value="youtube">YouTube Shorts</option>
            <option value="none">Yok</option>
          </select>
          <Toggle
            label="Ses dalga formunu goster"
            checked={canvas.showWaveform}
            onChange={(showWaveform) => onUpdateCanvas({ showWaveform })}
          />
        </section>
        <section className="control-section">
          <SectionTitle>Ses parcalari</SectionTitle>
          <button type="button" className="wide-command" onClick={onAddAudioTracks} disabled={!window.captionStudio}>
            <Plus size={16} /> Ses parcasi ekle
          </button>
          {project.audioTracks.length ? project.audioTracks.map((track) => (
            <article key={track.id} className="audio-track-control">
              <div><strong>{track.name}</strong><button type="button" onClick={() => onRemoveAudioTrack(track.id)} aria-label={`${track.name} sesini sil`}><Trash2 size={13} /></button></div>
              <RangeField label="Seviye" value={track.volume} min={0} max={200} suffix="%" onChange={(volume) => onUpdateAudioTrack(track.id, { volume })} />
              <RangeField label="Baslangic" value={track.start} min={0} max={Math.max(1, project.mediaDuration)} step={0.1} suffix=" sn" onChange={(start) => onUpdateAudioTrack(track.id, { start })} />
              <div className="two-column-actions">
                <button type="button" onClick={() => onUpdateAudioTrack(track.id, { fadeIn: track.fadeIn ? 0 : 0.5 })}>Fade in {track.fadeIn ? 'kapat' : 'ac'}</button>
                <button type="button" onClick={() => onUpdateAudioTrack(track.id, { fadeOut: track.fadeOut ? 0 : 0.5 })}>Fade out {track.fadeOut ? 'kapat' : 'ac'}</button>
              </div>
            </article>
          )) : <p className="inline-note">Muzik, anlatim veya efekt ekle. Ciktida kaynak sesle karistirilir.</p>}
        </section>
      </div>
    </>
  )
}

function StylesPanel({
  project,
  customPresets,
  settingsPresets,
  onApplyPreset,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onOpenSettingsPresetDialog,
  onApplySettingsPreset,
  onDeleteSettingsPreset,
}: InspectorProps) {
  if (!project) return null
  const presets = [...STYLE_PRESETS, ...customPresets]
  return (
    <>
      <PanelHeader title="Presetler" subtitle={`${settingsPresets.length} tam · ${presets.length} stil`} />
      <div className="inspector-scroll">
        <div className="preset-actions">
          <button type="button" className="wide-command primary-preset-command" onClick={onOpenSettingsPresetDialog}>
            <BookmarkPlus size={15} />
            Tum ayarlari preset kaydet
          </button>
          <button type="button" className="wide-command" onClick={onSaveCustomPreset}>
            <Save size={15} />
            Yalniz mevcut stili kaydet
          </button>
        </div>
        {settingsPresets.length ? (
          <div className="settings-preset-list">
            {settingsPresets.map((preset) => (
              <article key={preset.id} className="settings-preset-row">
                <button type="button" className="settings-preset-apply" onClick={() => onApplySettingsPreset(preset.id)}>
                  <span
                    className="settings-preset-preview"
                    style={{
                      fontFamily: preset.style.fontFamily,
                      fontWeight: preset.style.fontWeight,
                      color: preset.style.textColor,
                      backgroundColor: preset.style.backgroundMode !== 'none' ? preset.style.backgroundColor : 'transparent',
                      WebkitTextStroke: `1px ${preset.style.strokeColor}`,
                    }}
                  >Aa</span>
                  <span><strong>{preset.name}</strong><small>Tum ayarlar</small></span>
                </button>
                <button type="button" className="preset-delete" onClick={() => onDeleteSettingsPreset(preset.id)} aria-label={`${preset.name} presetini sil`}>
                  <Trash2 size={13} />
                </button>
              </article>
            ))}
          </div>
        ) : null}
        <div className="preset-gallery">
          {presets.map((preset, index) => {
            const custom = index >= STYLE_PRESETS.length
            return (
              <article key={`${preset.presetName}-${index}`} className="preset-card">
                <button type="button" onClick={() => onApplyPreset(preset)}>
                  <span
                    style={{
                      fontFamily: preset.fontFamily,
                      fontWeight: preset.fontWeight,
                      color: preset.textColor,
                      WebkitTextStroke: `1px ${preset.strokeColor}`,
                      paintOrder: 'stroke fill',
                      backgroundColor: preset.backgroundMode === 'caption' ? preset.backgroundColor : 'transparent',
                    }}
                  >
                    YOUR <i style={{ color: preset.activeColor }}>STYLE</i>
                  </span>
                  <small>{preset.presetName}</small>
                </button>
                {custom ? (
                  <button type="button" className="preset-delete" onClick={() => onDeleteCustomPreset(preset.presetName)} aria-label="Preseti sil">
                    <Trash2 size={13} />
                  </button>
                ) : null}
              </article>
            )
          })}
        </div>
      </div>
    </>
  )
}

function CustomizePanel(props: InspectorProps) {
  const { project, activeStyle, selectedVariantId, systemFonts, selectedWordCount } = props
  const [tab, setTab] = useState<'text' | 'layout' | 'background' | 'active' | 'animate' | 'highlights'>('text')
  if (!project || !activeStyle) return null

  return (
    <>
      <PanelHeader title="Ozellestir" subtitle={activeStyle.presetName} />
      <div className="custom-tabs" role="tablist">
        {[
          ['text', 'Metin'],
          ['layout', 'Duzen'],
          ['background', 'Arka plan'],
          ['active', 'Aktif'],
          ['animate', 'Animasyon'],
          ['highlights', 'Vurgu'],
        ].map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id as typeof tab)}>
            {label}
          </button>
        ))}
      </div>
      <div className="inspector-scroll">
        <VariantBar
          variants={project.variants}
          selectedVariantId={selectedVariantId}
          onSelect={props.onSelectVariant}
          onAdd={props.onAddVariant}
          onDelete={props.onDeleteVariant}
          onApplyAll={props.onApplyVariantToAll}
        />
        {tab === 'text' ? (
          <TextControls style={activeStyle} systemFonts={systemFonts} onChange={props.onUpdateStyle} />
        ) : null}
        {tab === 'layout' ? <LayoutControls style={activeStyle} onChange={props.onUpdateStyle} /> : null}
        {tab === 'background' ? <BackgroundControls style={activeStyle} onChange={props.onUpdateStyle} /> : null}
        {tab === 'active' ? <ActiveWordControls style={activeStyle} onChange={props.onUpdateStyle} /> : null}
        {tab === 'animate' ? <AnimationControls style={activeStyle} onChange={props.onUpdateStyle} /> : null}
        {tab === 'highlights' ? (
          <HighlightControls selectedWordCount={selectedWordCount} onApply={props.onApplyWordStyle} />
        ) : null}
      </div>
    </>
  )
}

function TextControls({ style, systemFonts, onChange }: { style: SubtitleStyle; systemFonts: string[]; onChange: (patch: Partial<SubtitleStyle>) => void }) {
  const fontOptions = useMemo(
    () => Array.from(new Set(['Arial Black', 'Arial', 'Segoe UI', 'Impact', 'Georgia', 'Consolas', ...systemFonts])).sort(),
    [systemFonts],
  )
  return (
    <>
      <section className="control-section">
        <SectionTitle>Tipografi</SectionTitle>
        <label className="field-label">
          Font
          <select value={style.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })}>
            {fontOptions.map((font) => <option key={font} value={font}>{font}</option>)}
          </select>
        </label>
        <RangeField label="Font boyutu" value={style.fontSize} min={18} max={140} onChange={(fontSize) => onChange({ fontSize })} />
        <RangeField label="Kalinlik" value={style.fontWeight} min={300} max={900} step={100} onChange={(fontWeight) => onChange({ fontWeight })} />
        <RangeField label="Satir araligi" value={style.lineHeight} min={0.75} max={1.8} step={0.05} onChange={(lineHeight) => onChange({ lineHeight })} />
        <RangeField label="Maksimum satir" value={style.maxLines} min={1} max={5} step={1} onChange={(maxLines) => onChange({ maxLines })} />
        <RangeField label="Baseline" value={style.baselineOffset} min={-0.5} max={0.5} step={0.01} onChange={(baselineOffset) => onChange({ baselineOffset })} />
        <RangeField label="Harf araligi" value={style.letterSpacing} min={-2} max={12} step={0.2} onChange={(letterSpacing) => onChange({ letterSpacing })} />
        <RangeField label="Kelime araligi" value={style.wordSpacing} min={1} max={8} step={1} onChange={(wordSpacing) => onChange({ wordSpacing })} />
        <Toggle label="Italik" checked={style.italic} onChange={(italic) => onChange({ italic })} />
        <Toggle label="Tek kalan kelimeyi engelle" checked={style.avoidDanglingWords} onChange={(avoidDanglingWords) => onChange({ avoidDanglingWords })} />
      </section>
      <section className="control-section">
        <SectionTitle>Renk ve efekt</SectionTitle>
        <ColorField label="Metin" value={style.textColor} onChange={(textColor) => onChange({ textColor })} />
        <ColorField label="Kontur" value={style.strokeColor} onChange={(strokeColor) => onChange({ strokeColor })} />
        <RangeField label="Kontur kalinligi" value={style.strokeWidth} min={0} max={18} onChange={(strokeWidth) => onChange({ strokeWidth })} />
        <Toggle label="Golge" checked={style.shadow} onChange={(shadow) => onChange({ shadow })} />
        {style.shadow ? (
          <>
            <ColorField label="Golge rengi" value={style.shadowColor} onChange={(shadowColor) => onChange({ shadowColor })} />
            <RangeField label="Golge yumusakligi" value={style.shadowBlur} min={0} max={30} onChange={(shadowBlur) => onChange({ shadowBlur })} />
          </>
        ) : null}
      </section>
      <section className="control-section">
        <SectionTitle>Metin donusumu</SectionTitle>
        <Segmented
          value={style.textTransform}
          options={[
            ['none', 'Yok'],
            ['lowercase', 'abc'],
            ['uppercase', 'ABC'],
          ]}
          onChange={(textTransform) => onChange({ textTransform: textTransform as SubtitleStyle['textTransform'] })}
        />
        <Toggle label="Noktalama gizle" checked={style.removePunctuation} onChange={(removePunctuation) => onChange({ removePunctuation })} />
        {style.removePunctuation ? (
          <label className="field-label">
            Gizlenecek karakterler
            <input value={style.hiddenPunctuation} onChange={(event) => onChange({ hiddenPunctuation: event.target.value })} />
          </label>
        ) : null}
      </section>
    </>
  )
}

function LayoutControls({ style, onChange }: { style: SubtitleStyle; onChange: (patch: Partial<SubtitleStyle>) => void }) {
  return (
    <section className="control-section">
      <SectionTitle>Konum ve hizalama</SectionTitle>
      <Segmented
        value={style.verticalAlign}
        options={[
          ['top', 'Ust'],
          ['middle', 'Orta'],
          ['bottom', 'Alt'],
        ]}
        onChange={(verticalAlign) => {
          const y = verticalAlign === 'top' ? 18 : verticalAlign === 'middle' ? 50 : 82
          onChange({ verticalAlign: verticalAlign as SubtitleStyle['verticalAlign'], positionY: y })
        }}
      />
      <RangeField label="Yatay konum" value={style.positionX} min={4} max={96} suffix="%" onChange={(positionX) => onChange({ positionX })} />
      <RangeField label="Dikey konum" value={style.positionY} min={4} max={96} suffix="%" onChange={(positionY) => onChange({ positionY })} />
      <RangeField label="Maksimum genislik" value={style.maxWidth} min={18} max={96} suffix="%" onChange={(maxWidth) => onChange({ maxWidth })} />
      <div className="align-segment">
        <button type="button" className={style.align === 'left' ? 'active' : ''} onClick={() => onChange({ align: 'left' })}><AlignLeft size={16} /></button>
        <button type="button" className={style.align === 'center' ? 'active' : ''} onClick={() => onChange({ align: 'center' })}><AlignCenter size={16} /></button>
        <button type="button" className={style.align === 'right' ? 'active' : ''} onClick={() => onChange({ align: 'right' })}><AlignRight size={16} /></button>
      </div>
      <p className="inline-note">Kutuyu video uzerinde de surukleyebilir, iki kenarindan genisletebilirsin.</p>
    </section>
  )
}

function BackgroundControls({ style, onChange }: { style: SubtitleStyle; onChange: (patch: Partial<SubtitleStyle>) => void }) {
  return (
    <section className="control-section">
      <SectionTitle>Tam altyazi arka plani</SectionTitle>
      <Segmented
        value={style.backgroundMode}
        options={[["none", "Kapali"], ["caption", "Tek kutu"], ["lines", "Satir satir"]]}
        onChange={(backgroundMode) => onChange({ backgroundMode: backgroundMode as SubtitleStyle['backgroundMode'] })}
      />
      <ColorField label="Arka plan" value={style.backgroundColor} onChange={(backgroundColor) => onChange({ backgroundColor })} />
      <RangeField label="Opaklik" value={style.backgroundOpacity} min={0} max={1} step={0.05} onChange={(backgroundOpacity) => onChange({ backgroundOpacity })} />
      <RangeField label="Ic bosluk" value={style.boxPadding} min={0} max={48} onChange={(boxPadding) => onChange({ boxPadding })} />
      <RangeField label="Kose" value={style.borderRadius} min={0} max={24} onChange={(borderRadius) => onChange({ borderRadius })} />
    </section>
  )
}

function ActiveWordControls({ style, onChange }: { style: SubtitleStyle; onChange: (patch: Partial<SubtitleStyle>) => void }) {
  return (
    <section className="control-section">
      <SectionTitle>Aktif kelime</SectionTitle>
      <Toggle label="Aktif kelimeyi vurgula" checked={style.highlightActiveWord} onChange={(highlightActiveWord) => onChange({ highlightActiveWord })} />
      <ColorField label="Aktif metin" value={style.activeColor} onChange={(activeColor) => onChange({ activeColor })} />
      <Toggle label="Aktif kelime arka plani" checked={style.activeWordBackground} onChange={(activeWordBackground) => onChange({ activeWordBackground })} />
      {style.activeWordBackground ? <ColorField label="Aktif arka plan" value={style.activeWordBackgroundColor} onChange={(activeWordBackgroundColor) => onChange({ activeWordBackgroundColor })} /> : null}
      <Toggle label="Aktif kelime konturu" checked={style.activeWordStroke} onChange={(activeWordStroke) => onChange({ activeWordStroke })} />
      <Toggle label="Aktif kelime golgesi" checked={style.activeWordShadow} onChange={(activeWordShadow) => onChange({ activeWordShadow })} />
    </section>
  )
}

function AnimationControls({ style, onChange }: { style: SubtitleStyle; onChange: (patch: Partial<SubtitleStyle>) => void }) {
  return (
    <>
      <section className="control-section">
        <SectionTitle>Giris animasyonu</SectionTitle>
        <Segmented
          value={style.transitionIn}
          options={[
            ['none', 'Yok'],
            ['fade', 'Fade'],
            ['zoom', 'Zoom'],
            ['stomp', 'Stomp'],
          ]}
          onChange={(transitionIn) => onChange({ transitionIn: transitionIn as SubtitleStyle['transitionIn'] })}
        />
      </section>
      <section className="control-section">
        <SectionTitle>Cikis animasyonu</SectionTitle>
        <Segmented
          value={style.transitionOut}
          options={[
            ['none', 'Yok'],
            ['fade', 'Fade'],
            ['zoom', 'Zoom'],
          ]}
          onChange={(transitionOut) => onChange({ transitionOut: transitionOut as SubtitleStyle['transitionOut'] })}
        />
      </section>
      <section className="control-section">
        <SectionTitle>Kelime animasyonu</SectionTitle>
        <Segmented
          value={style.wordTransition}
          options={[
            ['none', 'Yok'],
            ['fade', 'Fade'],
            ['zoom', 'Zoom'],
            ['pop', 'Pop'],
          ]}
          onChange={(wordTransition) => onChange({ wordTransition: wordTransition as SubtitleStyle['wordTransition'] })}
        />
        <Toggle label="Sirasi gelen kelimeyi renklendir" checked={style.highlightActiveWord} onChange={(highlightActiveWord) => onChange({ highlightActiveWord })} />
        <ColorField label="Animasyon rengi" value={style.activeColor} onChange={(activeColor) => onChange({ activeColor })} />
      </section>
    </>
  )
}

function HighlightControls({ selectedWordCount, onApply }: { selectedWordCount: number; onApply: (style?: WordStyleOverride) => void }) {
  const options: Array<{ label: string; preview: string; style?: WordStyleOverride }> = [
    { label: 'Varsayilan', preview: 'Aa' },
    { label: 'Sari vurgu', preview: 'Aa', style: { slotId: 'yellow', textColor: '#ffe600', fontScale: 1.08 } },
    { label: 'Kirmizi vurgu', preview: 'Aa', style: { slotId: 'red', textColor: '#ff3158', fontScale: 1.08 } },
    { label: 'Cyan vurgu', preview: 'Aa', style: { slotId: 'cyan', textColor: '#2efff6', fontScale: 1.1 } },
    { label: 'Kutu', preview: 'Aa', style: { slotId: 'box', textColor: '#111318', backgroundColor: '#ffffff', backgroundOpacity: 1, strokeWidth: 0 } },
    { label: 'Buyuk', preview: 'Aa', style: { slotId: 'big', fontScale: 1.35, fontWeight: 900 } },
    { label: 'Alt cizgi', preview: 'Aa', style: { slotId: 'underline', underline: true } },
  ]
  return (
    <section className="control-section">
      <SectionTitle>Kelime bazli stil</SectionTitle>
      <p className="inline-note">Timeline veya video uzerinden birden fazla kelime secip ayni stili atayabilirsin.</p>
      <div className="highlight-grid">
        {options.map((option) => (
          <button type="button" key={option.label} disabled={!selectedWordCount} onClick={() => onApply(option.style)}>
            <b
              style={{
                color: option.style?.textColor,
                backgroundColor: option.style?.backgroundColor,
                textDecoration: option.style?.underline ? 'underline' : undefined,
                transform: `scale(${option.style?.fontScale ?? 1})`,
              }}
            >
              {option.preview}
            </b>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
      <div className="selection-count">{selectedWordCount ? `${selectedWordCount} kelime secili` : 'Kelime secilmedi'}</div>
    </section>
  )
}

function CaptionToolsPanel({ project, status, onUpdateSettings, onTranscribe, onImportSrt, onExportSrt, onExportText }: InspectorProps) {
  const [helper, setHelper] = useState('cleanup')
  if (!project) return null
  const prompt = helperPrompt(helper, project.transcriptText || project.chunks.map((chunk) => chunk.text).join(' '))
  return (
    <>
      <PanelHeader title="Altyazilar" subtitle={`${project.chunks.length} segment`} />
      <div className="inspector-scroll">
        <section className="control-section">
          <SectionTitle>Transkripsiyon</SectionTitle>
          <Toggle
            label="Video eklenince otomatik baslat"
            checked={project.settings.autoTranscribe}
            onChange={(autoTranscribe) => onUpdateSettings({ autoTranscribe })}
          />
          <label className="field-label">
            Model
            <select value={project.settings.modelKey} disabled={status !== 'idle'} onChange={(event) => onUpdateSettings({ modelKey: event.target.value as TranscriptionSettings['modelKey'] })}>
              {Object.values(MODEL_CONFIGS).map((model) => <option key={model.key} value={model.key}>{model.label} - {model.sizeMb} MB</option>)}
            </select>
          </label>
          <label className="field-label">
            Dil
            <select value={project.settings.language} disabled={status !== 'idle'} onChange={(event) => onUpdateSettings({ language: event.target.value })}>
              {LANGUAGE_OPTIONS.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
            </select>
          </label>
          <RangeField label="Segment basina kelime" value={project.settings.maxWordsPerCaption} min={1} max={15} step={1} disabled={status !== 'idle'} onChange={(maxWordsPerCaption) => onUpdateSettings({ maxWordsPerCaption })} />
          <RangeField label="Maksimum segment" value={project.settings.maxCaptionDuration} min={1} max={10} step={0.25} suffix="sn" disabled={status !== 'idle'} onChange={(maxCaptionDuration) => onUpdateSettings({ maxCaptionDuration })} />
          <button type="button" className="primary-wide" onClick={onTranscribe} disabled={status !== 'idle'}>
            <Wand2 size={16} />
            Otomatik altyazi olustur
          </button>
        </section>
        <section className="control-section two-column-actions">
          <button type="button" onClick={onImportSrt}><Upload size={15} /> SRT ice aktar</button>
          <button type="button" onClick={onExportSrt}><Download size={15} /> SRT kaydet</button>
          <button type="button" onClick={onExportText}><FileText size={15} /> TXT kaydet</button>
        </section>
        <section className="control-section">
          <SectionTitle>AI Processing Helper</SectionTitle>
          <select value={helper} onChange={(event) => setHelper(event.target.value)}>
            <option value="cleanup">Yazim ve noktalama duzelt</option>
            <option value="shorten">Kisa sosyal medya cumleleri</option>
            <option value="translate">Turkceye cevir</option>
            <option value="brand">Marka diline uyarla</option>
          </select>
          <textarea className="prompt-preview" value={prompt} readOnly />
          <button type="button" className="wide-command" onClick={() => void navigator.clipboard.writeText(prompt)}>
            <Copy size={15} />
            Promptu kopyala
          </button>
        </section>
      </div>
    </>
  )
}

function ExportPanel({ project, status, exportProgress, ffmpegVersion, lastExportPaths, onUpdateExport, onExportVideo, onExportPackage, onCancelExport, onRevealFile, onExportSrt, onExportText }: InspectorProps) {
  if (!project) return null
  const settings = project.exportSettings
  const resolutions: ExportSettings['resolution'][] = ['480p', '720p', '1080p', '1440p', '2160p', 'source', 'custom']
  const frameRates: ExportSettings['frameRate'][] = ['24', '25', '30', '50', '60', 'source', 'custom']
  return (
    <>
      <PanelHeader title="Export" subtitle={window.captionStudio ? 'Native FFmpeg' : 'Desktop gerekli'} />
      <div className="inspector-scroll export-inspector">
        <section className="control-section">
          <SectionTitle>Cikti turu</SectionTitle>
          <div className="mode-grid">
            {[
              ['burned', 'Videoya gomulu'],
              ['transparent', 'Seffaf MOV'],
              ['green-screen', 'Green screen'],
              ['mask-pair', 'Altyazi + maske'],
            ].map(([mode, label]) => (
              <button type="button" key={mode} className={settings.mode === mode ? 'selected' : ''} onClick={() => onUpdateExport({ mode: mode as ExportSettings['mode'] })}>
                {settings.mode === mode ? <Check size={14} /> : <Layers3 size={14} />}
                {label}
              </button>
            ))}
          </div>
        </section>
        <section className="control-section">
          <SectionTitle>Cozunurluk</SectionTitle>
          <div className="option-grid resolution-grid">
            {resolutions.map((resolution) => (
              <button type="button" key={resolution} className={settings.resolution === resolution ? 'selected' : ''} onClick={() => onUpdateExport({ resolution })}>
                {resolution === 'source' ? 'Orijinal' : resolution === 'custom' ? 'Ozel' : resolution}
              </button>
            ))}
          </div>
          {settings.resolution === 'custom' ? (
            <div className="inline-fields">
              <input type="number" min="2" value={settings.customWidth} onChange={(event) => onUpdateExport({ customWidth: Number(event.target.value) })} aria-label="Ozel genislik" />
              <span>x</span>
              <input type="number" min="2" value={settings.customHeight} onChange={(event) => onUpdateExport({ customHeight: Number(event.target.value) })} aria-label="Ozel yukseklik" />
            </div>
          ) : null}
        </section>
        <section className="control-section">
          <SectionTitle>FPS</SectionTitle>
          <div className="option-grid framerate-grid">
            {frameRates.map((frameRate) => (
              <button type="button" key={frameRate} className={settings.frameRate === frameRate ? 'selected' : ''} onClick={() => onUpdateExport({ frameRate })}>
                {frameRate === 'source' ? 'Orijinal' : frameRate === 'custom' ? 'Ozel' : `${frameRate} FPS`}
              </button>
            ))}
          </div>
          {settings.frameRate === 'custom' ? <input type="number" min="1" max="240" value={settings.customFps} onChange={(event) => onUpdateExport({ customFps: Number(event.target.value) })} /> : null}
        </section>
        <section className="control-section">
          <SectionTitle>Kodlama</SectionTitle>
          <RangeField label="Compression" value={settings.compression} min={0} max={100} suffix="%" onChange={(compression) => onUpdateExport({ compression })} />
          <RangeField label="Kalite" value={settings.quality} min={1} max={100} suffix="%" onChange={(quality) => onUpdateExport({ quality })} />
          <label className="field-label">Uzanti
            <select value={settings.container} onChange={(event) => onUpdateExport({ container: event.target.value as ExportSettings['container'] })} disabled={settings.mode === 'transparent' || settings.mode === 'mask-pair'}>
              <option value="source">Kaynak uzantiyi koru</option>
              <option value="mp4">MP4</option>
              <option value="mov">MOV</option>
              <option value="mkv">MKV</option>
              <option value="webm">WebM</option>
            </select>
          </label>
          <label className="field-label">Video codec
            <select value={settings.codec} onChange={(event) => onUpdateExport({ codec: event.target.value as ExportSettings['codec'] })}>
              <option value="auto">Otomatik</option>
              <option value="h264">H.264</option>
              <option value="h265">H.265 / HEVC</option>
              <option value="vp9">VP9</option>
            </select>
          </label>
          <label className="field-label">Render hizi
            <select value={settings.speed} onChange={(event) => onUpdateExport({ speed: event.target.value as ExportSettings['speed'] })}>
              <option value="fast">Hizli</option>
              <option value="balanced">Dengeli</option>
              <option value="quality">Maksimum sikistirma</option>
            </select>
          </label>
        </section>
        <section className="control-section export-actions">
          {status === 'exporting' ? (
            <>
              <progress value={exportProgress} max={1} />
              <strong>{Math.round(exportProgress * 100)}%</strong>
              <button type="button" className="danger-wide" onClick={onCancelExport}>Exportu iptal et</button>
            </>
          ) : (
            <>
              <button type="button" className="primary-wide" onClick={onExportVideo} disabled={!window.captionStudio || !project.chunks.length}>
                <Download size={16} />
                Video ciktisi al
              </button>
              <button type="button" className="wide-command" onClick={onExportPackage} disabled={!window.captionStudio || !lastExportPaths.length}>
                <Download size={16} /> ZIP proje paketi olustur
              </button>
            </>
          )}
          <div className="two-column-actions">
            <button type="button" onClick={onExportSrt}>SRT</button>
            <button type="button" onClick={onExportText}>TXT</button>
          </div>
          {lastExportPaths.map((outputPath) => (
            <button type="button" className="output-path" key={outputPath} onClick={() => onRevealFile(outputPath)}>
              <FolderOpen size={14} />
              <span>{outputPath}</span>
            </button>
          ))}
          <small className="engine-status">{ffmpegVersion || 'FFmpeg kontrol ediliyor...'}</small>
        </section>
      </div>
    </>
  )
}

function AudioPanel({ project, onUpdateExport, onAddAudioTracks, onUpdateAudioTrack, onRemoveAudioTrack }: InspectorProps) {
  if (!project) return null
  const settings = project.exportSettings
  return (
    <>
      <PanelHeader title="Ses" subtitle={`${project.audioTracks.length} ek track`} />
      <div className="inspector-scroll">
        <section className="control-section">
          <SectionTitle>Master ses</SectionTitle>
          <label className="field-label">Cikti sesi
            <select value={settings.audio} onChange={(event) => onUpdateExport({ audio: event.target.value as ExportSettings['audio'] })}>
              <option value="high">Yuksek kalite</option><option value="standard">Standart</option><option value="copy">Orijinali kopyala</option><option value="mute">Sessiz</option>
            </select>
          </label>
          <RangeField label="Onizleme ve cikti seviyesi" value={settings.audioVolume} min={0} max={200} suffix="%" onChange={(audioVolume) => onUpdateExport({ audioVolume })} />
          <Toggle label="Sesi normalize et" checked={settings.audioNormalize} onChange={(audioNormalize) => onUpdateExport({ audioNormalize })} />
          <RangeField label="Fade in" value={settings.audioFadeIn} min={0} max={10} step={0.25} suffix=" sn" onChange={(audioFadeIn) => onUpdateExport({ audioFadeIn })} />
          <RangeField label="Fade out" value={settings.audioFadeOut} min={0} max={10} step={0.25} suffix=" sn" onChange={(audioFadeOut) => onUpdateExport({ audioFadeOut })} />
        </section>
        <section className="control-section">
          <SectionTitle>Audio track'ler</SectionTitle>
          <button type="button" className="wide-command" onClick={onAddAudioTracks} disabled={!window.captionStudio}><Plus size={16} /> Ses parcasi ekle</button>
          {project.audioTracks.length ? project.audioTracks.map((track, index) => (
            <article key={track.id} className="audio-track-control">
              <div><strong>AUDIO {index + 2} · {track.name}</strong><button type="button" onClick={() => onRemoveAudioTrack(track.id)} aria-label={`${track.name} sesini sil`}><Trash2 size={13} /></button></div>
              <RangeField label="Seviye" value={track.volume} min={0} max={200} suffix="%" onChange={(volume) => onUpdateAudioTrack(track.id, { volume })} />
              <RangeField label="Baslangic" value={track.start} min={0} max={Math.max(1, project.mediaDuration)} step={0.1} suffix=" sn" onChange={(start) => onUpdateAudioTrack(track.id, { start })} />
              <Toggle label="Sesi kapat" checked={track.muted} onChange={(muted) => onUpdateAudioTrack(track.id, { muted })} />
              <div className="two-column-actions"><button type="button" onClick={() => onUpdateAudioTrack(track.id, { fadeIn: track.fadeIn ? 0 : 0.5 })}>Fade in {track.fadeIn ? 'kapat' : 'ac'}</button><button type="button" onClick={() => onUpdateAudioTrack(track.id, { fadeOut: track.fadeOut ? 0 : 0.5 })}>Fade out {track.fadeOut ? 'kapat' : 'ac'}</button></div>
            </article>
          )) : <p className="inline-note">Timeline'a ses dosyasi surukle veya buradan ekle.</p>}
        </section>
      </div>
    </>
  )
}

function LibraryPanel({ projects, batchMessage, onOpenMedia, onOpenProject, onOpenProjectFile, onDeleteProject, onBatchTranscribe, onBatchExport }: InspectorProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const toggleProject = (id: string) => setSelectedIds((current) =>
    current.includes(id) ? current.filter((item) => item !== id) : current.length < 5 ? [...current, id] : current,
  )
  return (
    <>
      <PanelHeader title="Projeler" subtitle={`${projects.length} kayit`} />
      <div className="inspector-scroll">
        <button type="button" className="primary-wide" onClick={onOpenMedia}>
          <Plus size={16} />
          Video veya ses ekle
        </button>
        <button type="button" className="wide-command" onClick={onOpenProjectFile} disabled={!window.captionStudio}>
          <FolderOpen size={15} /> Proje dosyasi ac
        </button>
        <section className="control-section batch-actions">
          <p>{selectedIds.length}/5 video secili · export sirayla yapilir</p>
          <button type="button" disabled={!selectedIds.length} onClick={() => onBatchTranscribe(selectedIds)}><Bot size={15} /> Toplu transcribe: secilenler</button>
          <button type="button" disabled={!selectedIds.length} onClick={() => onBatchExport(selectedIds)}><Download size={15} /> Toplu export: secilenler</button>
          {batchMessage ? <p>{batchMessage}</p> : null}
        </section>
        <div className="project-library">
          {projects.map((savedProject) => (
            <article key={savedProject.id} className="library-row">
              <input
                type="checkbox"
                checked={selectedIds.includes(savedProject.id)}
                disabled={!selectedIds.includes(savedProject.id) && selectedIds.length >= 5}
                onChange={() => toggleProject(savedProject.id)}
                aria-label={`${savedProject.title} toplu islem secimi`}
              />
              <button type="button" className="library-open" onClick={() => onOpenProject(savedProject.id)}>
                <span>{savedProject.title}</span>
                <small>{formatDuration(savedProject.mediaDuration)} · {savedProject.chunkCount} segment</small>
              </button>
              <button type="button" className="row-delete" onClick={() => onDeleteProject(savedProject.id)} aria-label={`${savedProject.title} projesini sil`}>
                <Trash2 size={14} />
              </button>
            </article>
          ))}
          {!projects.length ? <div className="empty-list">Henuz kayitli proje yok.</div> : null}
        </div>
      </div>
    </>
  )
}

function VariantBar({ variants, selectedVariantId, onSelect, onAdd, onDelete, onApplyAll }: { variants: CaptionVariant[]; selectedVariantId: string; onSelect: (id: string) => void; onAdd: () => void; onDelete: (id: string) => void; onApplyAll: (id: string) => void }) {
  return (
    <section className="variant-bar">
      <div className="variant-heading"><span>Stil slotu</span><button type="button" onClick={onAdd}><Plus size={13} /></button></div>
      <div className="variant-tabs">
        {variants.map((variant) => <button type="button" key={variant.id} className={selectedVariantId === variant.id ? 'active' : ''} onClick={() => onSelect(variant.id)}>{variant.name}</button>)}
      </div>
      <div className="variant-actions">
        <button type="button" onClick={() => onApplyAll(selectedVariantId)}>Tum segmentlere uygula</button>
        <button type="button" onClick={() => onDelete(selectedVariantId)} disabled={selectedVariantId === 'main'}><Trash2 size={13} /> Sil</button>
      </div>
    </section>
  )
}

function EmptyInspector({ onOpenMedia }: { onOpenMedia: () => void }) {
  return (
    <div className="empty-inspector">
      <span className="brand-mark large">CS</span>
      <h2>Caption Studio</h2>
      <p>Video veya ses dosyasi secerek basla.</p>
      <button type="button" className="primary-wide" onClick={onOpenMedia}><Upload size={16} /> Dosya sec</button>
    </div>
  )
}

function PanelHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="panel-header"><div><h2>{title}</h2><p>{subtitle}</p></div></header>
}

function SectionTitle({ children }: { children: string }) {
  return <h3 className="section-title">{children}</h3>
}

function Toggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  )
}

function RangeField({ label, value, min, max, step = 1, suffix = '', disabled = false, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="range-field">
      <span>{label}<b>{Math.round(value * 100) / 100}{suffix}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-field-modern">
      <span>{label}</span>
      <div><input type="color" value={value} onChange={(event) => onChange(event.target.value)} /><input value={value} onChange={(event) => onChange(event.target.value)} /></div>
    </label>
  )
}

function Segmented({ value, options, onChange }: { value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <div className="segmented-control">{options.map(([id, label]) => <button type="button" key={id} className={value === id ? 'active' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>
}

function helperPrompt(type: string, transcript: string) {
  const instructions: Record<string, string> = {
    cleanup: 'Yazim hatalarini ve noktalama isaretlerini duzelt. Anlami ve satir sayisini koru.',
    shorten: 'Her satiri sosyal medya altyazisi icin kisa ve etkili hale getir. Zaman sirasi ve satir sayisi ayni kalsin.',
    translate: 'Metni dogal Turkceye cevir. Her girdi satiri icin tam bir cikti satiri ver.',
    brand: 'Metni guvenli, net ve profesyonel bir marka diline uyarla. Anlami ve satir sayisini koru.',
  }
  return `${instructions[type]}\n\nYalnizca islenmis metni yaz:\n\n${transcript}`
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

function formatFps(value: number) {
  return Number.isInteger(value) ? value : Math.round(value * 100) / 100
}
