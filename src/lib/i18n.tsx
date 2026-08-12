import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type InterfaceLanguage = 'en' | 'tr'

type LanguageContextValue = {
  language: InterfaceLanguage
  setLanguage: (language: InterfaceLanguage) => void
}

const LANGUAGE_KEY = 'caption-studio-interface-language'
const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

const labels: Record<string, { en: string; tr: string }> = {
  'Yerel altyazi editoru': { en: 'Offline subtitle editor', tr: 'Yerel altyazi editoru' },
  'Projeyi kaydet': { en: 'Save project', tr: 'Projeyi kaydet' },
  'Preset kaydet': { en: 'Save preset', tr: 'Preset kaydet' },
  'Kucult': { en: 'Minimize', tr: 'Kucult' },
  'Buyut': { en: 'Maximize', tr: 'Buyut' },
  'Geri yukle': { en: 'Restore', tr: 'Geri yukle' },
  'Kapat': { en: 'Close', tr: 'Kapat' },
  'Video': { en: 'Video', tr: 'Video' },
  'Hazir stiller': { en: 'Styles', tr: 'Hazir stiller' },
  'Ozellestir': { en: 'Customize', tr: 'Ozellestir' },
  'Altyazilar': { en: 'Captions', tr: 'Altyazilar' },
  'Ses miksaji': { en: 'Audio mixer', tr: 'Ses miksaji' },
  'Projeler ve toplu islemler': { en: 'Projects and batch jobs', tr: 'Projeler ve toplu islemler' },
  'Altyazi ayarlari': { en: 'Caption settings', tr: 'Altyazi ayarlari' },
  'Native motor etkin': { en: 'Native engine active', tr: 'Native motor etkin' },
  'Tarayici modu': { en: 'Browser mode', tr: 'Tarayici modu' },
  'Kaynak video ekle veya degistir': { en: 'Add or replace source video', tr: 'Kaynak video ekle veya degistir' },
  'En boy orani': { en: 'Aspect ratio', tr: 'En boy orani' },
  'Orijinal': { en: 'Source', tr: 'Orijinal' },
  'Sigdir': { en: 'Fit', tr: 'Sigdir' },
  'Doldur': { en: 'Fill', tr: 'Doldur' },
  'Tuval rengi': { en: 'Canvas color', tr: 'Tuval rengi' },
  'Guvenli alan': { en: 'Safe zone', tr: 'Guvenli alan' },
  'Platform arayuzunu goster': { en: 'Show platform UI', tr: 'Platform arayuzunu goster' },
  'Ses dalga formunu goster': { en: 'Show audio waveform', tr: 'Ses dalga formunu goster' },
  'Yok': { en: 'None', tr: 'Yok' },
  'Ses parcalari': { en: 'Audio clips', tr: 'Ses parcalari' },
  'Ses parcasi ekle': { en: 'Add audio clip', tr: 'Ses parcasi ekle' },
  'Seviye': { en: 'Level', tr: 'Seviye' },
  'Baslangic': { en: 'Start', tr: 'Baslangic' },
  'Fade in kapat': { en: 'Disable fade in', tr: 'Fade in kapat' },
  'Fade in ac': { en: 'Enable fade in', tr: 'Fade in ac' },
  'Fade out kapat': { en: 'Disable fade out', tr: 'Fade out kapat' },
  'Fade out ac': { en: 'Enable fade out', tr: 'Fade out ac' },
  'Muzik, anlatim veya efekt ekle. Ciktida kaynak sesle karistirilir.': { en: 'Add music, narration, or effects. They will be mixed with the source audio in the export.', tr: 'Muzik, anlatim veya efekt ekle. Ciktida kaynak sesle karistirilir.' },
  'Presetler': { en: 'Presets', tr: 'Presetler' },
  'Yalniz mevcut stili kaydet': { en: 'Save current style only', tr: 'Yalniz mevcut stili kaydet' },
  'Uygula': { en: 'Apply', tr: 'Uygula' },
  'Sil': { en: 'Delete', tr: 'Sil' },
  'Stil slotu': { en: 'Style slot', tr: 'Stil slotu' },
  'Tum segmentlere uygula': { en: 'Apply to all segments', tr: 'Tum segmentlere uygula' },
  'Yazi tipi': { en: 'Font family', tr: 'Yazi tipi' },
  'Yazi boyutu': { en: 'Font size', tr: 'Yazi boyutu' },
  'Kalın': { en: 'Bold', tr: 'Kalın' },
  'Italik': { en: 'Italic', tr: 'Italik' },
  'Metin rengi': { en: 'Text color', tr: 'Metin rengi' },
  'Vurgu rengi': { en: 'Highlight color', tr: 'Vurgu rengi' },
  'Kontur': { en: 'Outline', tr: 'Kontur' },
  'Golge': { en: 'Shadow', tr: 'Golge' },
  'Arka plan': { en: 'Background', tr: 'Arka plan' },
  'Hizalama': { en: 'Alignment', tr: 'Hizalama' },
  'Kelime bazli stil': { en: 'Per-word style', tr: 'Kelime bazli stil' },
  'Kelime secilmedi': { en: 'No words selected', tr: 'Kelime secilmedi' },
  'Transkripsiyon': { en: 'Transcription', tr: 'Transkripsiyon' },
  'Video eklenince otomatik baslat': { en: 'Start automatically when video is added', tr: 'Video eklenince otomatik baslat' },
  'Model': { en: 'Model', tr: 'Model' },
  'Dil': { en: 'Language', tr: 'Dil' },
  'Segment basina kelime': { en: 'Words per segment', tr: 'Segment basina kelime' },
  'Maksimum segment': { en: 'Maximum segment', tr: 'Maksimum segment' },
  'Otomatik altyazi olustur': { en: 'Generate subtitles', tr: 'Otomatik altyazi olustur' },
  'SRT ice aktar': { en: 'Import SRT', tr: 'SRT ice aktar' },
  'SRT kaydet': { en: 'Save SRT', tr: 'SRT kaydet' },
  'TXT kaydet': { en: 'Save TXT', tr: 'TXT kaydet' },
  'Yazim ve noktalama duzelt': { en: 'Fix spelling and punctuation', tr: 'Yazim ve noktalama duzelt' },
  'Kisa sosyal medya cumleleri': { en: 'Short social media lines', tr: 'Kisa sosyal medya cumleleri' },
  'Turkceye cevir': { en: 'Translate to Turkish', tr: 'Turkceye cevir' },
  'Marka diline uyarla': { en: 'Adapt to brand voice', tr: 'Marka diline uyarla' },
  'Promptu kopyala': { en: 'Copy prompt', tr: 'Promptu kopyala' },
  'Cikti turu': { en: 'Output type', tr: 'Cikti turu' },
  'Videoya gomulu': { en: 'Burned into video', tr: 'Videoya gomulu' },
  'Seffaf MOV': { en: 'Transparent MOV', tr: 'Seffaf MOV' },
  'Altyazi + maske': { en: 'Captions + mask', tr: 'Altyazi + maske' },
  'Cozunurluk': { en: 'Resolution', tr: 'Cozunurluk' },
  'Ozel': { en: 'Custom', tr: 'Ozel' },
  'Kodlama': { en: 'Encoding', tr: 'Kodlama' },
  'Kalite': { en: 'Quality', tr: 'Kalite' },
  'Uzanti': { en: 'Container', tr: 'Uzanti' },
  'Kaynak uzantiyi koru': { en: 'Keep source container', tr: 'Kaynak uzantiyi koru' },
  'Video codec': { en: 'Video codec', tr: 'Video codec' },
  'Otomatik': { en: 'Automatic', tr: 'Otomatik' },
  'Render hizi': { en: 'Render speed', tr: 'Render hizi' },
  'Hizli': { en: 'Fast', tr: 'Hizli' },
  'Dengeli': { en: 'Balanced', tr: 'Dengeli' },
  'Maksimum sikistirma': { en: 'Maximum compression', tr: 'Maksimum sikistirma' },
  'Exportu iptal et': { en: 'Cancel export', tr: 'Exportu iptal et' },
  'Video ciktisi al': { en: 'Export video', tr: 'Video ciktisi al' },
  'ZIP proje paketi olustur': { en: 'Create ZIP project package', tr: 'ZIP proje paketi olustur' },
  'FFmpeg kontrol ediliyor...': { en: 'Checking FFmpeg...', tr: 'FFmpeg kontrol ediliyor...' },
  'Ses': { en: 'Audio', tr: 'Ses' },
  'Master ses': { en: 'Master audio', tr: 'Master ses' },
  'Cikti sesi': { en: 'Output audio', tr: 'Cikti sesi' },
  'Yuksek kalite': { en: 'High quality', tr: 'Yuksek kalite' },
  'Standart': { en: 'Standard', tr: 'Standart' },
  'Orijinali kopyala': { en: 'Copy source', tr: 'Orijinali kopyala' },
  'Sessiz': { en: 'Mute', tr: 'Sessiz' },
  'Onizleme ve cikti seviyesi': { en: 'Preview and output level', tr: 'Onizleme ve cikti seviyesi' },
  'Sesi normalize et': { en: 'Normalize audio', tr: 'Sesi normalize et' },
  'Audio track\'ler': { en: 'Audio tracks', tr: 'Audio track\'ler' },
  'Sesi kapat': { en: 'Mute track', tr: 'Sesi kapat' },
  'Timeline\'a ses dosyasi surukle veya buradan ekle.': { en: 'Drop an audio file on the timeline or add one here.', tr: 'Timeline\'a ses dosyasi surukle veya buradan ekle.' },
  'Projeler': { en: 'Projects', tr: 'Projeler' },
  'Video veya ses ekle': { en: 'Add video or audio', tr: 'Video veya ses ekle' },
  'Proje dosyasi ac': { en: 'Open project file', tr: 'Proje dosyasi ac' },
  'Toplu transcribe: secilenler': { en: 'Batch transcribe: selected', tr: 'Toplu transcribe: secilenler' },
  'Toplu export: secilenler': { en: 'Batch export: selected', tr: 'Toplu export: secilenler' },
  'Henuz kayitli proje yok.': { en: 'No saved projects yet.', tr: 'Henuz kayitli proje yok.' },
  'Video veya ses dosyasi secerek basla.': { en: 'Start by selecting a video or audio file.', tr: 'Video veya ses dosyasi secerek basla.' },
  'Dosya sec': { en: 'Select file', tr: 'Dosya sec' },
  'Altyazi metni': { en: 'Caption text', tr: 'Altyazi metni' },
  'Yeni altyazi ekle': { en: 'Add caption', tr: 'Yeni altyazi ekle' },
  'Altyazilarda ara': { en: 'Search captions', tr: 'Altyazilarda ara' },
  'Stil': { en: 'Style', tr: 'Stil' },
  'Eslesen altyazi yok.': { en: 'No matching captions.', tr: 'Eslesen altyazi yok.' },
  'Secili parcayi oynat': { en: 'Play selected range', tr: 'Secili parcayi oynat' },
  'Secili segmenti sil': { en: 'Delete selected segment', tr: 'Secili segmenti sil' },
  'Timeline uzaklastir': { en: 'Zoom out timeline', tr: 'Timeline uzaklastir' },
  'Timeline yakinlastir': { en: 'Zoom in timeline', tr: 'Timeline yakinlastir' },
  'Ses dosyasini birak: yeni audio track olustur': { en: 'Drop audio file: create new audio track', tr: 'Ses dosyasini birak: yeni audio track olustur' },
  'Bir video sec': { en: 'Select a video', tr: 'Bir video sec' },
  'Yalniz mevcut segment': { en: 'Current segment only', tr: 'Yalniz mevcut segment' },
  'Oynat': { en: 'Play', tr: 'Oynat' },
  'Duraklat': { en: 'Pause', tr: 'Duraklat' },
  'Sesi ac': { en: 'Unmute', tr: 'Sesi ac' },
  'Tam ekran': { en: 'Fullscreen', tr: 'Tam ekran' },
  'Video konumu': { en: 'Video position', tr: 'Video konumu' },
  'Tum ayarlari preset kaydet': { en: 'Save all settings as preset', tr: 'Tum ayarlari preset kaydet' },
  'Vazgec': { en: 'Cancel', tr: 'Vazgec' },
  'Video veya ses dosyasi ac': { en: 'Open video or audio file', tr: 'Video veya ses dosyasi ac' },
  'Son projeler': { en: 'Recent projects', tr: 'Son projeler' },
  'Dosya ac': { en: 'Open file', tr: 'Dosya ac' },
  'Ilk projen icin yukaridan bir video sec.': { en: 'Select a video above for your first project.', tr: 'Ilk projen icin yukaridan bir video sec.' },
  'Bildirimi kapat': { en: 'Dismiss notification', tr: 'Bildirimi kapat' },
  'Iptal': { en: 'Cancel', tr: 'Iptal' },
  'Tamamlandi': { en: 'Complete', tr: 'Tamamlandi' },
  'Green screen': { en: 'Green screen', tr: 'Green screen' },
  'Compression': { en: 'Compression', tr: 'Compression' },
  'Export': { en: 'Export', tr: 'Disa aktar' },
  'Desktop gerekli': { en: 'Desktop required', tr: 'Desktop gerekli' },
  'Tum ayarlar': { en: 'All settings', tr: 'Tum ayarlar' },
  'Metin': { en: 'Text', tr: 'Metin' },
  'Duzen': { en: 'Layout', tr: 'Duzen' },
  'Aktif': { en: 'Active', tr: 'Aktif' },
  'Animasyon': { en: 'Animation', tr: 'Animasyon' },
  'Vurgu': { en: 'Highlight', tr: 'Vurgu' },
  'Tipografi': { en: 'Typography', tr: 'Tipografi' },
  'Font': { en: 'Font', tr: 'Font' },
  'Font boyutu': { en: 'Font size', tr: 'Font boyutu' },
  'Kalinlik': { en: 'Weight', tr: 'Kalinlik' },
  'Satir araligi': { en: 'Line spacing', tr: 'Satir araligi' },
  'Maksimum satir': { en: 'Maximum lines', tr: 'Maksimum satir' },
  'Baseline': { en: 'Baseline', tr: 'Baseline' },
  'Harf araligi': { en: 'Letter spacing', tr: 'Harf araligi' },
  'Kelime araligi': { en: 'Word spacing', tr: 'Kelime araligi' },
  'Tek kalan kelimeyi engelle': { en: 'Avoid dangling words', tr: 'Tek kalan kelimeyi engelle' },
  'Renk ve efekt': { en: 'Color and effects', tr: 'Renk ve efekt' },
  'Kontur kalinligi': { en: 'Outline width', tr: 'Kontur kalinligi' },
  'Golge rengi': { en: 'Shadow color', tr: 'Golge rengi' },
  'Golge yumusakligi': { en: 'Shadow blur', tr: 'Golge yumusakligi' },
  'Metin donusumu': { en: 'Text transform', tr: 'Metin donusumu' },
  'Noktalama gizle': { en: 'Hide punctuation', tr: 'Noktalama gizle' },
  'Gizlenecek karakterler': { en: 'Characters to hide', tr: 'Gizlenecek karakterler' },
  'Konum ve hizalama': { en: 'Position and alignment', tr: 'Konum ve hizalama' },
  'Ust': { en: 'Top', tr: 'Ust' },
  'Orta': { en: 'Middle', tr: 'Orta' },
  'Alt': { en: 'Bottom', tr: 'Alt' },
  'Yatay konum': { en: 'Horizontal position', tr: 'Yatay konum' },
  'Dikey konum': { en: 'Vertical position', tr: 'Dikey konum' },
  'Maksimum genislik': { en: 'Maximum width', tr: 'Maksimum genislik' },
  'Kutuyu video uzerinde de surukleyebilir, iki kenarindan genisletebilirsin.': { en: 'You can also drag the box on the video and resize it from either side.', tr: 'Kutuyu video uzerinde de surukleyebilir, iki kenarindan genisletebilirsin.' },
  'Tam altyazi arka plani': { en: 'Caption background', tr: 'Tam altyazi arka plani' },
  'Kapali': { en: 'Off', tr: 'Kapali' },
  'Tek kutu': { en: 'Single box', tr: 'Tek kutu' },
  'Satir satir': { en: 'Per line', tr: 'Satir satir' },
  'Opaklik': { en: 'Opacity', tr: 'Opaklik' },
  'Ic bosluk': { en: 'Padding', tr: 'Ic bosluk' },
  'Kose': { en: 'Corner radius', tr: 'Kose' },
  'Aktif kelime': { en: 'Active word', tr: 'Aktif kelime' },
  'Aktif kelimeyi vurgula': { en: 'Highlight active word', tr: 'Aktif kelimeyi vurgula' },
  'Aktif metin': { en: 'Active text', tr: 'Aktif metin' },
  'Aktif kelime arka plani': { en: 'Active word background', tr: 'Aktif kelime arka plani' },
  'Aktif arka plan': { en: 'Active background', tr: 'Aktif arka plan' },
  'Aktif kelime konturu': { en: 'Active word outline', tr: 'Aktif kelime konturu' },
  'Aktif kelime golgesi': { en: 'Active word shadow', tr: 'Aktif kelime golgesi' },
  'Giris animasyonu': { en: 'Entrance animation', tr: 'Giris animasyonu' },
  'Cikis animasyonu': { en: 'Exit animation', tr: 'Cikis animasyonu' },
  'Kelime animasyonu': { en: 'Word animation', tr: 'Kelime animasyonu' },
  'Sirasi gelen kelimeyi renklendir': { en: 'Color the current word', tr: 'Sirasi gelen kelimeyi renklendir' },
  'Animasyon rengi': { en: 'Animation color', tr: 'Animasyon rengi' },
  'Varsayilan': { en: 'Default', tr: 'Varsayilan' },
  'Sari vurgu': { en: 'Yellow highlight', tr: 'Sari vurgu' },
  'Kirmizi vurgu': { en: 'Red highlight', tr: 'Kirmizi vurgu' },
  'Cyan vurgu': { en: 'Cyan highlight', tr: 'Cyan vurgu' },
  'Kutu': { en: 'Box', tr: 'Kutu' },
  'Buyuk': { en: 'Large', tr: 'Buyuk' },
  'Alt cizgi': { en: 'Underline', tr: 'Alt cizgi' },
  'Timeline veya video uzerinden birden fazla kelime secip ayni stili atayabilirsin.': { en: 'Select multiple words from the timeline or video, then apply one style.', tr: 'Timeline veya video uzerinden birden fazla kelime secip ayni stili atayabilirsin.' },
  'AI Processing Helper': { en: 'AI Processing Helper', tr: 'AI Processing Helper' },
  'Ozel genislik': { en: 'Custom width', tr: 'Ozel genislik' },
  'Ozel yukseklik': { en: 'Custom height', tr: 'Ozel yukseklik' },
  'Altyazi kutusunu soldan boyutlandir': { en: 'Resize caption box from the left', tr: 'Altyazi kutusunu soldan boyutlandir' },
  'Altyazi kutusunu sagdan boyutlandir': { en: 'Resize caption box from the right', tr: 'Altyazi kutusunu sagdan boyutlandir' },
  'Segmenti oynat': { en: 'Play segment', tr: 'Segmenti oynat' },
  'Segmenti bol': { en: 'Split segment', tr: 'Segmenti bol' },
  'Oncekiyle birlestir': { en: 'Merge with previous', tr: 'Oncekiyle birlestir' },
  'Segmenti sil': { en: 'Delete segment', tr: 'Segmenti sil' },
}

const reverseLabels = new Map(Object.values(labels).map((item) => [item.en, item]))

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<InterfaceLanguage>(() =>
    localStorage.getItem(LANGUAGE_KEY) === 'tr' ? 'tr' : 'en',
  )

  const value = useMemo(() => ({
    language,
    setLanguage: (next: InterfaceLanguage) => {
      localStorage.setItem(LANGUAGE_KEY, next)
      setLanguageState(next)
    },
  }), [language])

  useEffect(() => {
    document.documentElement.lang = language
    const localize = (root: Node) => localizeNode(root, language)
    localize(document.body)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === 'characterData') localize(record.target)
        for (const node of record.addedNodes) localize(node)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// oxlint-disable-next-line react(only-export-components) -- exported hook belongs to this provider module.
export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider')
  return context
}

function localizeNode(node: Node, language: InterfaceLanguage) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement
    if (!parent || shouldSkip(parent)) return
    const original = node.nodeValue ?? ''
    const localized = localizeValue(original, language)
    if (localized !== original) node.nodeValue = localized
    return
  }
  if (!(node instanceof HTMLElement) || shouldSkip(node)) return
  for (const attribute of ['title', 'aria-label', 'placeholder']) {
    const value = node.getAttribute(attribute)
    if (!value) continue
    const localized = localizeValue(value, language)
    if (localized !== value) node.setAttribute(attribute, localized)
  }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let textNode = walker.nextNode()
  while (textNode) {
    localizeNode(textNode, language)
    textNode = walker.nextNode()
  }
}

function shouldSkip(element: HTMLElement) {
  return Boolean(element.closest('input, textarea, [contenteditable="true"], [data-user-content], .caption-text, .word-clip, .caption-clip, .word-chip-row, .library-open'))
}

// oxlint-disable-next-line react(only-export-components) -- pure helper is covered by unit tests.
export function translateUiText(value: string, language: InterfaceLanguage) {
  const leading = value.match(/^\s*/)?.[0] ?? ''
  const trailing = value.match(/\s*$/)?.[0] ?? ''
  const raw = value.trim()
  if (!raw) return value
  const item = labels[raw] ?? reverseLabels.get(raw)
  if (item) return `${leading}${item[language]}${trailing}`
  const segment = raw.match(/^(\d+) segment$/)
  if (segment) return `${leading}${language === 'en' ? `${segment[1]} segments` : `${segment[1]} segment`}${trailing}`
  const segments = raw.match(/^(\d+) segments$/)
  if (segments) return `${leading}${language === 'tr' ? `${segments[1]} segment` : raw}${trailing}`
  const selectedWords = raw.match(/^(\d+) kelime secili$/)
  if (selectedWords) return `${leading}${language === 'en' ? `${selectedWords[1]} words selected` : raw}${trailing}`
  const wordsSelected = raw.match(/^(\d+) words selected$/)
  if (wordsSelected) return `${leading}${language === 'tr' ? `${wordsSelected[1]} kelime secili` : raw}${trailing}`
  const audioTracks = raw.match(/^(\d+) ek track$/)
  if (audioTracks) return `${leading}${language === 'en' ? `${audioTracks[1]} added tracks` : raw}${trailing}`
  const addedTracks = raw.match(/^(\d+) added tracks$/)
  if (addedTracks) return `${leading}${language === 'tr' ? `${addedTracks[1]} ek track` : raw}${trailing}`
  return value
}

function localizeValue(value: string, language: InterfaceLanguage) {
  return translateUiText(value, language)
}
