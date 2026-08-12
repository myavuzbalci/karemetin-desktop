import { Captions, Clapperboard, Layers3, Library, Music2, Settings2, Sparkles, Type, Upload } from 'lucide-react'

export type EditorTool = 'media' | 'styles' | 'customize' | 'captions' | 'audio' | 'export' | 'library'

type ToolRailProps = {
  active: EditorTool
  hasProject: boolean
  onSelect: (tool: EditorTool) => void
}

const projectTools: Array<{ id: EditorTool; label: string; icon: typeof Clapperboard }> = [
  { id: 'media', label: 'Video', icon: Clapperboard },
  { id: 'styles', label: 'Hazir stiller', icon: Sparkles },
  { id: 'customize', label: 'Ozellestir', icon: Type },
  { id: 'captions', label: 'Altyazilar', icon: Captions },
  { id: 'audio', label: 'Ses miksaji', icon: Music2 },
  { id: 'export', label: 'Export', icon: Upload },
]

export function ToolRail({ active, hasProject, onSelect }: ToolRailProps) {
  return (
    <nav className="tool-rail" aria-label="Editor araclari">
      <div className="tool-rail-main">
        {projectTools.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={active === id ? 'tool-button active' : 'tool-button'}
            onClick={() => onSelect(id)}
            disabled={!hasProject}
            title={label}
            aria-label={label}
          >
            <Icon size={20} />
          </button>
        ))}
      </div>
      <div className="tool-rail-bottom">
        <button
          type="button"
          className={active === 'library' ? 'tool-button active' : 'tool-button'}
          onClick={() => onSelect('library')}
          title="Projeler ve toplu islemler"
          aria-label="Projeler ve toplu islemler"
        >
          <Library size={20} />
        </button>
        <button type="button" className={active === 'customize' ? 'tool-button active' : 'tool-button'} onClick={() => onSelect('customize')} title="Altyazi ayarlari" aria-label="Altyazi ayarlari">
          <Settings2 size={20} />
        </button>
        <div className="rail-status" title={window.captionStudio ? 'Native motor etkin' : 'Tarayici modu'}>
          <Layers3 size={14} />
        </div>
      </div>
    </nav>
  )
}
