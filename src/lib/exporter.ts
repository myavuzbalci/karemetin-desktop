import type { CaptionVariant, SubtitleChunk, SubtitleStyle } from '../types'
import { cleanCaptionText, getActiveChunk, resolveChunkStyle } from './transcription'

export async function exportCaptionedWebM({
  mediaBlob,
  chunks,
  style,
  variants,
  includeAudio,
  onProgress,
}: {
  mediaBlob: Blob
  chunks: SubtitleChunk[]
  style: SubtitleStyle
  variants?: CaptionVariant[]
  includeAudio: boolean
  onProgress: (progress: number) => void
}) {
  const url = URL.createObjectURL(mediaBlob)
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas renderer baslatilamadi.')

  video.src = url
  video.muted = !includeAudio
  video.playsInline = true
  video.crossOrigin = 'anonymous'
  video.preload = 'auto'

  await waitForMetadata(video)

  canvas.width = video.videoWidth || 1280
  canvas.height = video.videoHeight || 720

  const stream = canvas.captureStream(30)
  if (includeAudio && 'captureStream' in video) {
    const captured = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream()
    captured.getAudioTracks().forEach((track) => stream.addTrack(track))
  }

  const mimeType = pickRecorderMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const blobs: BlobPart[] = []

  recorder.ondataavailable = (event) => {
    if (event.data.size) blobs.push(event.data)
  }

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onerror = () => reject(new Error('Export sirasinda hata olustu.'))
    recorder.onstop = () => resolve(new Blob(blobs, { type: recorder.mimeType || 'video/webm' }))
  })

  video.currentTime = 0
  await video.play()
  recorder.start(500)

  let raf = 0
  const draw = () => {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const activeChunk = getActiveChunk(chunks, video.currentTime)
    drawSubtitle(
      ctx,
      canvas.width,
      canvas.height,
      activeChunk,
      resolveChunkStyle(style, variants, activeChunk),
      video.currentTime,
    )
    onProgress(video.duration ? video.currentTime / video.duration : 0)

    if (!video.ended) {
      raf = requestAnimationFrame(draw)
    }
  }

  draw()

  await new Promise<void>((resolve) => {
    video.onended = () => resolve()
  })

  cancelAnimationFrame(raf)
  recorder.stop()
  const blob = await done
  URL.revokeObjectURL(url)
  onProgress(1)
  return blob
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  chunk: SubtitleChunk | undefined,
  style: SubtitleStyle,
  currentTime: number,
) {
  if (!chunk) return

  const text = cleanCaptionText(chunk.text, style)
  const fontSize = Math.round((style.fontSize / 1080) * height)
  const maxWidth = (style.maxWidth / 100) * width
  const x = (style.positionX / 100) * width
  const y = (style.positionY / 100) * height

  ctx.save()
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`
  ctx.textAlign = style.align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'

  const lines = wrapText(ctx, text, maxWidth)
  const lineHeight = fontSize * 1.18
  const blockHeight = lines.length * lineHeight
  const startY = y - blockHeight / 2 + lineHeight / 2
  const widest = Math.min(maxWidth, Math.max(...lines.map((line) => ctx.measureText(line).width)))
  const boxX = style.align === 'center' ? x - widest / 2 : style.align === 'right' ? x - widest : x

  if (style.backgroundOpacity > 0) {
    ctx.globalAlpha = style.backgroundOpacity
    ctx.fillStyle = style.backgroundColor
    roundRect(
      ctx,
      boxX - style.boxPadding,
      startY - lineHeight / 2 - style.boxPadding / 2,
      widest + style.boxPadding * 2,
      blockHeight + style.boxPadding,
      14,
    )
    ctx.fill()
    ctx.globalAlpha = 1
  }

  if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 4
  }

  lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight
    if (style.strokeWidth > 0) {
      ctx.strokeStyle = style.strokeColor
      ctx.lineWidth = style.strokeWidth
      ctx.strokeText(line, x, lineY)
    }
    ctx.fillStyle = style.textColor
    ctx.fillText(line, x, lineY)
  })

  if (style.highlightActiveWord && chunk.words.length > 0) {
    drawActiveWord(ctx, chunk, style, lines, x, startY, lineHeight, currentTime)
  }

  ctx.restore()
}

function drawActiveWord(
  ctx: CanvasRenderingContext2D,
  chunk: SubtitleChunk,
  style: SubtitleStyle,
  lines: string[],
  x: number,
  startY: number,
  lineHeight: number,
  currentTime: number,
) {
  const active = chunk.words.find((word) => currentTime >= word.start && currentTime <= word.end)
  if (!active) return

  const transformedActive = cleanCaptionText(active.text, style)
  ctx.fillStyle = style.activeColor

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const wordIndex = line.toLowerCase().indexOf(transformedActive.toLowerCase())
    if (wordIndex < 0) continue

    const before = line.slice(0, wordIndex)
    const target = line.slice(wordIndex, wordIndex + transformedActive.length)
    const lineWidth = ctx.measureText(line).width
    const beforeWidth = ctx.measureText(before).width
    const targetWidth = ctx.measureText(target).width
    const baseX =
      ctx.textAlign === 'center' ? x - lineWidth / 2 : ctx.textAlign === 'right' ? x - lineWidth : x
    const wordX = baseX + beforeWidth + targetWidth / 2
    const lineY = startY + lineIndex * lineHeight

    ctx.save()
    ctx.textAlign = 'center'
    if (style.strokeWidth > 0) {
      ctx.strokeStyle = style.strokeColor
      ctx.lineWidth = style.strokeWidth
      ctx.strokeText(target, wordX, lineY)
    }
    ctx.fillText(target, wordX, lineY)
    ctx.restore()
    return
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = testLine
    }
  }

  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function waitForMetadata(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Video okunamadi.'))
  })
}

function pickRecorderMimeType() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  return types.find((type) => MediaRecorder.isTypeSupported(type))
}
