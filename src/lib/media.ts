export async function decodeMediaToMono16k(file: File) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) {
    throw new Error('Bu tarayicida AudioContext yok. Chrome veya Edge ile deneyin.')
  }

  const buffer = await file.arrayBuffer()
  const audioContext = new AudioContextClass({ sampleRate: 16000 })

  try {
    const decoded = await audioContext.decodeAudioData(buffer.slice(0))
    const channelCount = decoded.numberOfChannels
    const length = decoded.length
    const mono = new Float32Array(length)

    for (let channel = 0; channel < channelCount; channel += 1) {
      const data = decoded.getChannelData(channel)
      for (let i = 0; i < length; i += 1) {
        mono[i] += data[i] / channelCount
      }
    }

    return mono
  } finally {
    await audioContext.close()
  }
}

export function getMediaDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file)
    const media = document.createElement(file.type.startsWith('audio/') ? 'audio' : 'video')
    media.preload = 'metadata'
    media.onloadedmetadata = () => {
      const duration = Number.isFinite(media.duration) ? media.duration : 0
      URL.revokeObjectURL(url)
      resolve(duration)
    }
    media.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    media.src = url
  })
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
