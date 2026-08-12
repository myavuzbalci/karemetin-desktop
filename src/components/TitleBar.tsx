import { BookmarkPlus, Download, Minus, Save, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLanguage } from '../lib/i18n'

type TitleBarProps = {
  projectTitle?: string
  busy: boolean
  saved: boolean
  onTitleChange: (title: string) => void
  onSave: () => void
  onSavePreset: () => void
  onExport: () => void
}

export function TitleBar({ projectTitle, busy, saved, onTitleChange, onSave, onSavePreset, onExport }: TitleBarProps) {
  const [maximized, setMaximized] = useState(false)
  const desktop = window.captionStudio
  const { language, setLanguage } = useLanguage()

  useEffect(() => {
    if (!desktop) return
    void desktop.isMaximized().then(setMaximized)
    return desktop.onMaximized(setMaximized)
  }, [desktop])

  return (
    <header
      className="titlebar"
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest('.no-drag')) return
        void desktop?.toggleMaximize().then(setMaximized)
      }}
    >
      <div className="titlebar-brand">
        <span className="brand-mark">KM</span>
        <span>KareMetin</span>
        {desktop ? <small>DESKTOP</small> : <small>WEB PREVIEW</small>}
      </div>
      <div className="titlebar-project">
        {projectTitle !== undefined ? (
          <input
            aria-label="Proje adi"
            value={projectTitle}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        ) : (
          <span>Yerel altyazi editoru</span>
        )}
        {projectTitle ? <i className={saved ? 'save-dot saved' : 'save-dot'} /> : null}
      </div>
      <div className="titlebar-actions no-drag">
        <select
          className="language-select"
          value={language}
          onChange={(event) => setLanguage(event.target.value as 'en' | 'tr')}
          aria-label={language === 'en' ? 'Interface language' : 'Arayuz dili'}
          title={language === 'en' ? 'Interface language' : 'Arayuz dili'}
        >
          <option value="en">EN</option>
          <option value="tr">TR</option>
        </select>
        <button type="button" className="icon-command" onClick={onSave} disabled={!projectTitle || busy} title="Projeyi kaydet">
          <Save size={16} />
        </button>
        <button type="button" className="preset-command" onClick={onSavePreset} disabled={!projectTitle || busy}>
          <BookmarkPlus size={15} />
          Preset kaydet
        </button>
        <button type="button" className="export-command" onClick={onExport} disabled={!projectTitle || busy}>
          <Download size={16} />
          Export
        </button>
        {desktop ? (
          <div className="window-controls">
            <button type="button" onClick={() => void desktop.minimize()} aria-label="Kucult">
              <Minus size={16} />
            </button>
            <button
              type="button"
              onClick={() => void desktop.toggleMaximize().then(setMaximized)}
              aria-label={maximized ? 'Geri yukle' : 'Buyut'}
            >
              <Square size={maximized ? 13 : 15} />
            </button>
            <button type="button" className="window-close" onClick={() => void desktop.close()} aria-label="Kapat">
              <X size={17} />
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
