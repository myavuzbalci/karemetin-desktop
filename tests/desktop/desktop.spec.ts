import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

test('desktop app opens local media and exports a real captioned video', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'caption-studio-desktop-e2e-'))
  const outputPath = path.join(tempDirectory, 'desktop-output.webm')
  const videoPath = path.resolve('tests/fixtures/sample.webm')
  const subtitlePath = path.resolve('tests/fixtures/sample.srt')
  const packagedExecutable = process.env.CAPTION_STUDIO_PACKAGED_EXE
  const commonLaunchOptions = {
    env: { ...process.env, CAPTION_STUDIO_TEST_USER_DATA: path.join(tempDirectory, 'user-data') },
  }
  const electronApp = packagedExecutable
    ? await electron.launch({ ...commonLaunchOptions, executablePath: packagedExecutable, args: [] })
    : await electron.launch({ ...commonLaunchOptions, args: ['.'] })

  try {
    await electronApp.evaluate(({ dialog }, paths) => {
      const mutableDialog = dialog as typeof dialog & {
        showOpenDialog: (...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>
        showSaveDialog: (...args: unknown[]) => Promise<{ canceled: boolean; filePath: string }>
      }
      mutableDialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args[args.length - 1] as { filters?: Array<{ extensions?: string[] }> }
        const isSubtitle = options.filters?.some((filter) => filter.extensions?.includes('srt'))
        return { canceled: false, filePaths: [isSubtitle ? paths.subtitlePath : paths.videoPath] }
      }
      mutableDialog.showSaveDialog = async () => ({ canceled: false, filePath: paths.outputPath })
    }, { videoPath, subtitlePath, outputPath })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.evaluate(() => localStorage.setItem('caption-studio-auto-transcribe', 'false'))
    await window.locator('.language-select').selectOption('tr')
    await expect(window.locator('.titlebar-brand')).toContainText('DESKTOP')
    expect(await window.evaluate(() => window.captionStudio?.isDesktop)).toBe(true)
    await expect.poll(async () => window.evaluate(async () => {
      const baseUrl = window.captionStudio?.bundledModelBaseUrl
      if (!baseUrl) return false
      const response = await fetch(`${baseUrl}onnx-community/whisper-large-v3-turbo_timestamped/config.json`)
      return response.ok && (await response.json()).model_type === 'whisper'
    }), {
      message: 'The packaged app must serve the bundled Turbo model without a network request.',
    }).toBe(true)

    await window.getByRole('button', { name: /Video veya ses dosyasi ac/ }).click()
    await expect(window.locator('video')).toBeVisible()
    await expect(window.locator('.media-facts')).toContainText('320 x 180')
    await expect(window.locator('.media-facts')).toContainText('25 FPS')
    await window.getByRole('button', { name: 'Oynat', exact: true }).click()
    await expect.poll(() => window.locator('video').evaluate((video) => video.currentTime), {
      message: 'The portable preview video must advance after pressing play.',
    }).toBeGreaterThan(0.05)
    await window.getByRole('button', { name: 'Duraklat', exact: true }).click()

    await window.locator('.tool-rail').getByRole('button', { name: 'Altyazilar' }).click()
    await window.getByRole('button', { name: /SRT ice aktar/ }).click()
    await expect(window.locator('.caption-row')).toHaveCount(3)
    await expect(window.locator('.word-clip')).toHaveCount(7)

    await window.locator('.tool-rail').getByRole('button', { name: 'Export' }).click()
    await window.getByRole('button', { name: /Video ciktisi al/ }).click()
    await expect(window.locator('.output-path')).toBeVisible({ timeout: 60_000 })
    await window.screenshot({
      path: packagedExecutable ? 'test-results/desktop-packaged.png' : 'test-results/desktop-electron.png',
    })

    expect((await stat(outputPath)).size).toBeGreaterThan(10_000)
  } finally {
    await electronApp.close()
    await rm(tempDirectory, { recursive: true, force: true })
  }
})

test('desktop app uses portrait source dimensions for the preview canvas', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'caption-studio-portrait-e2e-'))
  const videoPath = path.resolve('tests/fixtures/sample-portrait.webm')
  const subtitlePath = path.resolve('tests/fixtures/sample.srt')
  const packagedExecutable = process.env.CAPTION_STUDIO_PACKAGED_EXE
  const commonLaunchOptions = {
    env: { ...process.env, CAPTION_STUDIO_TEST_USER_DATA: path.join(tempDirectory, 'user-data') },
  }
  const electronApp = packagedExecutable
    ? await electron.launch({ ...commonLaunchOptions, executablePath: packagedExecutable, args: [] })
    : await electron.launch({ ...commonLaunchOptions, args: ['.'] })

  try {
    await electronApp.evaluate(({ dialog }, paths) => {
      const mutableDialog = dialog as typeof dialog & {
        showOpenDialog: (...args: unknown[]) => Promise<{ canceled: boolean; filePaths: string[] }>
      }
      mutableDialog.showOpenDialog = async (...args: unknown[]) => {
        const options = args[args.length - 1] as { filters?: Array<{ extensions?: string[] }> }
        const isSubtitle = options.filters?.some((filter) => filter.extensions?.includes('srt'))
        return { canceled: false, filePaths: [isSubtitle ? paths.subtitlePath : paths.videoPath] }
      }
    }, { videoPath, subtitlePath })

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.evaluate(() => localStorage.setItem('caption-studio-auto-transcribe', 'false'))
    await window.locator('.language-select').selectOption('tr')
    await window.getByRole('button', { name: /Video veya ses dosyasi ac/ }).click()
    await expect(window.locator('.media-facts')).toContainText('180 x 320')

    const stage = window.locator('.media-stage')
    await expect(stage).toHaveClass(/portrait-stage/)
    await expect.poll(async () => {
      const box = await stage.boundingBox()
      return box ? box.width / box.height : 0
    }).toBeCloseTo(9 / 16, 2)

    await window.locator('.tool-rail').getByRole('button', { name: 'Altyazilar' }).click()
    await window.getByRole('button', { name: /SRT ice aktar/ }).click()
    const [stageBox, selectionBox] = await Promise.all([
      stage.boundingBox(),
      window.locator('.caption-selection').boundingBox(),
    ])
    if (!stageBox || !selectionBox) throw new Error('Portrait desktop canvas bounds are not measurable')
    expect(selectionBox.x).toBeGreaterThanOrEqual(stageBox.x - 2)
    expect(selectionBox.x + selectionBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 2)
    await window.screenshot({ path: 'test-results/desktop-portrait.png' })
  } finally {
    await electronApp.close()
    await rm(tempDirectory, { recursive: true, force: true })
  }
})

test('desktop app automatically starts Turbo transcription for new media', async () => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'caption-studio-auto-transcribe-e2e-'))
  const videoPath = path.resolve('tests/fixtures/sample.webm')
  const packagedExecutable = process.env.CAPTION_STUDIO_PACKAGED_EXE
  const commonLaunchOptions = {
    env: { ...process.env, CAPTION_STUDIO_TEST_USER_DATA: path.join(tempDirectory, 'user-data') },
  }
  const electronApp = packagedExecutable
    ? await electron.launch({ ...commonLaunchOptions, executablePath: packagedExecutable, args: [] })
    : await electron.launch({ ...commonLaunchOptions, args: ['.'] })

  try {
    await electronApp.evaluate(({ dialog }, targetPath) => {
      const mutableDialog = dialog as typeof dialog & {
        showOpenDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>
      }
      mutableDialog.showOpenDialog = async () => ({ canceled: false, filePaths: [targetPath] })
    }, videoPath)

    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.locator('.language-select').selectOption('tr')
    await window.evaluate(() => {
      const testWindow = window as Window & {
        __transcriptionModel?: string
      }
      localStorage.setItem('caption-studio-auto-transcribe', 'true')

      class MockWorker {
        onmessage: ((event: MessageEvent) => void) | null = null
        onerror: ((event: ErrorEvent) => void) | null = null

        postMessage(message: unknown) {
          testWindow.__transcriptionModel = (message as { modelKey: string }).modelKey
          queueMicrotask(() => {
            this.onmessage?.(new MessageEvent('message', { data: { type: 'ready', payload: { modelKey: 'large', device: 'webgpu' } } }))
            this.onmessage?.(new MessageEvent('message', {
              data: {
                type: 'result',
                payload: {
                  text: 'Turbo otomatik altyazi',
                  chunks: [
                    { text: 'Turbo', timestamp: [0, 0.4] },
                    { text: 'otomatik', timestamp: [0.4, 0.9] },
                    { text: 'altyazi', timestamp: [0.9, 1.4] },
                  ],
                },
              },
            }))
          })
        }

        terminate() {}
      }

      Object.defineProperty(window, 'Worker', { configurable: true, value: MockWorker })
    })

    await window.getByRole('button', { name: /Video veya ses dosyasi ac/ }).click()
    await expect(window.locator('.caption-row')).toHaveCount(1, { timeout: 30_000 })
    await expect(window.getByText('Otomatik altyazi tamamlandi')).toBeVisible()
    expect(await window.evaluate(() => (window as Window & { __transcriptionModel?: string }).__transcriptionModel)).toBe('large')
  } finally {
    await electronApp.close()
    await rm(tempDirectory, { recursive: true, force: true })
  }
})
