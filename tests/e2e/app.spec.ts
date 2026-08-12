import { expect, test } from '@playwright/test'
import path from 'node:path'

const videoFixture = path.resolve('tests/fixtures/sample.webm')
const secondVideoFixture = path.resolve('tests/fixtures/sample-two.webm')
const portraitVideoFixture = path.resolve('tests/fixtures/sample-portrait.webm')
const subtitleFixture = path.resolve('tests/fixtures/sample.srt')

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('caption-studio-auto-transcribe', 'false')
    localStorage.setItem('caption-studio-interface-language', 'tr')
  })
})

test('defaults to English and can switch the interface back to Turkish', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('caption-studio-interface-language', 'en'))
  await page.goto('/')

  await expect(page.locator('.language-select')).toHaveValue('en')
  await expect(page.getByRole('button', { name: 'Open video or audio file' })).toBeVisible()
  await page.locator('.language-select').selectOption('tr')
  await expect(page.getByRole('button', { name: 'Video veya ses dosyasi ac' })).toBeVisible()
})

test('loads the desktop-style editor shell', async ({ page }) => {
  await page.goto('/')

  await expect(page.locator('.titlebar-brand')).toContainText('KareMetin')
  await expect(page.getByRole('button', { name: /Video veya ses dosyasi ac/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Projeler ve toplu islemler' })).toBeVisible()
  await expect(page.locator('.tool-rail')).toBeVisible()
  await expect(page.locator('.welcome-workspace')).toBeVisible()
})

test('edits captions on video, timeline, styles, and word highlights', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="video"]').setInputFiles(videoFixture)
  await expect(page.locator('video')).toBeVisible()
  await page.locator('input[type="file"][accept*=".srt"]').setInputFiles(subtitleFixture)

  await expect(page.locator('.caption-row')).toHaveCount(3)
  await expect(page.locator('.word-clip')).toHaveCount(7)
  await expect(page.locator('.caption-selection')).toBeVisible()

  const playhead = page.locator('.timeline-playhead')
  const playheadBefore = await playhead.getAttribute('style')
  const playheadBox = await playhead.boundingBox()
  if (!playheadBox) throw new Error('Timeline playhead is not measurable')
  await page.mouse.move(playheadBox.x + playheadBox.width / 2, playheadBox.y + 18)
  await page.mouse.down()
  await page.mouse.move(playheadBox.x + 70, playheadBox.y + 18, { steps: 4 })
  await page.mouse.up()
  await expect(playhead).not.toHaveAttribute('style', playheadBefore ?? '')

  const wordTrack = page.locator('.word-track')
  const wordTrackBox = await wordTrack.boundingBox()
  if (!wordTrackBox) throw new Error('Timeline word track is not measurable')
  await page.mouse.move(wordTrackBox.x + 250, wordTrackBox.y + 38)
  await page.mouse.down()
  await page.mouse.move(wordTrackBox.x + 180, wordTrackBox.y + 38, { steps: 3 })
  await expect(page.locator('.word-selection-range')).toBeVisible()
  await page.mouse.up()

  const selection = page.locator('.caption-selection')
  const beforePosition = await selection.getAttribute('style')
  const selectionBox = await selection.boundingBox()
  if (!selectionBox) throw new Error('Caption selection is not measurable')
  await page.mouse.move(selectionBox.x + 14, selectionBox.y + 3)
  await page.mouse.down()
  await page.mouse.move(selectionBox.x + 64, selectionBox.y + 28, { steps: 5 })
  await page.mouse.up()
  await expect(selection).not.toHaveAttribute('style', beforePosition ?? '')

  await page.locator('.tool-rail').getByRole('button', { name: 'Hazir stiller' }).click()
  const grinch = page.locator('.preset-card').filter({ hasText: 'Grinch' })
  await expect(grinch).toHaveCount(1)
  await grinch.locator('button').click()
  await expect(page.locator('.caption-text')).toHaveCSS('font-family', /Impact/i)

  await page.locator('.tool-rail').getByRole('button', { name: 'Ozellestir' }).click()
  const wordChips = page.locator('.word-chip-row button')
  await wordChips.nth(0).click()
  await wordChips.nth(1).click({ modifiers: ['Control'] })
  await page.getByRole('button', { name: 'Vurgu', exact: true }).click()
  await page.getByRole('button', { name: 'Sari vurgu' }).click()
  await expect(page.locator('.caption-text > span').nth(0)).toHaveCSS('color', 'rgb(255, 230, 0)')

  const firstWordClip = page.locator('.word-clip').nth(0)
  const oldWidth = await firstWordClip.evaluate((element) => element.getBoundingClientRect().width)
  const endHandle = firstWordClip.locator('.clip-handle.end')
  const handleBox = await endHandle.boundingBox()
  if (!handleBox) throw new Error('Timeline handle is not measurable')
  await page.mouse.move(handleBox.x + 2, handleBox.y + 5)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + 25, handleBox.y + 5, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => firstWordClip.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(oldWidth)

  await page.getByTitle('Projeyi kaydet').click()
  await page.locator('.tool-rail').getByRole('button', { name: 'Projeler ve toplu islemler' }).click()
  await expect(page.locator('.library-row')).toContainText('sample')
})

test('creates multiple saved projects for batch workflows', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="video"]').setInputFiles([videoFixture, secondVideoFixture])
  await page.locator('.tool-rail').getByRole('button', { name: 'Projeler ve toplu islemler' }).click()

  await expect(page.locator('.library-row')).toHaveCount(2)
  await expect(page.locator('.batch-actions')).toContainText('Toplu transcribe')
  await expect(page.locator('.batch-actions')).toContainText('Toplu export')
})

test('fits source portrait video and captions inside the visible canvas', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="video"]').setInputFiles(portraitVideoFixture)
  const video = page.locator('video')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate((element) => element.videoWidth)).toBe(180)
  await expect.poll(() => video.evaluate((element) => element.videoHeight)).toBe(320)

  await page.locator('input[type="file"][accept*=".srt"]').setInputFiles(subtitleFixture)
  const stage = page.locator('.media-stage')
  const selection = page.locator('.caption-selection')
  await expect(stage).toHaveClass(/portrait-stage/)
  await expect(selection).toBeVisible()
  await expect.poll(async () => {
    const box = await stage.boundingBox()
    return box ? box.width / box.height : 0
  }).toBeCloseTo(9 / 16, 2)

  const initialSelection = await selection.boundingBox()
  if (!initialSelection) throw new Error('Portrait caption selection is not measurable')
  await page.mouse.move(initialSelection.x + initialSelection.width / 2, initialSelection.y + 4)
  await page.mouse.down()
  await page.mouse.move(initialSelection.x - 500, initialSelection.y + 4, { steps: 5 })
  await page.mouse.up()

  const [stageBox, selectionBox] = await Promise.all([stage.boundingBox(), selection.boundingBox()])
  if (!stageBox || !selectionBox) throw new Error('Portrait canvas bounds are not measurable')
  expect(selectionBox.x).toBeGreaterThanOrEqual(stageBox.x - 2)
  expect(selectionBox.x + selectionBox.width).toBeLessThanOrEqual(stageBox.x + stageBox.width + 2)
  await page.screenshot({ path: 'test-results/portrait-source-fit.png', fullPage: true })
})

test('hides captions outside their time range and deletes from the timeline', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="video"]').setInputFiles(videoFixture)
  await expect(page.locator('video')).toBeVisible()
  await page.locator('input[type="file"][accept*=".srt"]').setInputFiles(subtitleFixture)
  await expect(page.locator('.caption-selection')).toBeVisible()

  await page.getByLabel('Video konumu').fill('8.8')
  await expect(page.locator('.caption-selection')).toBeHidden()

  await page.locator('.caption-clip').nth(1).click()
  await expect(page.locator('.caption-selection')).toBeVisible()
  await page.getByTitle('Secili segmenti sil').click()
  await expect(page.locator('.caption-row')).toHaveCount(2)
  await expect(page.locator('.caption-list-panel')).not.toContainText('UYGULANMALI VE GOZCU')
})

test('automatically creates captions with the Turbo model after media import', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const testWindow = window as Window & {
      __transcriptionModel?: string
    }
    localStorage.setItem('caption-studio-auto-transcribe', 'true')

    class MockAudioContext {
      async decodeAudioData() {
        return {
          numberOfChannels: 1,
          length: 16_000,
          getChannelData: () => new Float32Array(16_000),
        } as AudioBuffer
      }

      async close() {}
    }

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
                text: 'Otomatik altyazi hazir',
                chunks: [
                  { text: 'Otomatik', timestamp: [0, 0.45] },
                  { text: 'altyazi', timestamp: [0.45, 0.9] },
                  { text: 'hazir', timestamp: [0.9, 1.3] },
                ],
              },
            },
          }))
        })
      }

      terminate() {}
    }

    Object.defineProperty(window, 'AudioContext', { configurable: true, value: MockAudioContext })
    Object.defineProperty(window, 'Worker', { configurable: true, value: MockWorker })
  })

  await page.locator('input[type="file"][accept*="video"]').setInputFiles(videoFixture)
  await expect(page.locator('.caption-row')).toHaveCount(1)
  await expect(page.getByText('Otomatik altyazi tamamlandi')).toBeVisible()
  expect(await page.evaluate(() => (window as Window & { __transcriptionModel?: string }).__transcriptionModel)).toBe('large')
})

test('saves and restores all editor settings as a named preset', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="video"]').setInputFiles(videoFixture)

  await page.getByRole('button', { name: '9:16', exact: true }).click()
  await page.locator('.tool-rail').getByRole('button', { name: 'Altyazilar' }).click()
  await page.getByLabel('Video eklenince otomatik baslat').check()
  await page.locator('.tool-rail').getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: '2160p' }).click()

  await page.locator('.preset-command').click()
  const dialog = page.getByRole('dialog', { name: 'Tum ayarlari preset kaydet' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Preset adi').fill('Dikey Turbo')
  await dialog.getByRole('button', { name: 'Preset kaydet' }).click()
  await expect(page.locator('.settings-preset-row')).toContainText('Dikey Turbo')

  await page.reload()
  await page.locator('.recent-grid button').filter({ hasText: 'sample' }).click()
  await page.locator('.tool-rail').getByRole('button', { name: 'Hazir stiller' }).click()
  await expect(page.locator('.settings-preset-row')).toContainText('Dikey Turbo')

  await page.locator('.tool-rail').getByRole('button', { name: 'Video' }).click()
  await page.getByRole('button', { name: '16:9', exact: true }).click()
  await page.locator('.tool-rail').getByRole('button', { name: 'Altyazilar' }).click()
  await page.getByLabel('Video eklenince otomatik baslat').uncheck()
  await page.locator('.tool-rail').getByRole('button', { name: 'Export' }).click()
  await page.getByRole('button', { name: '720p' }).click()

  await page.locator('.tool-rail').getByRole('button', { name: 'Hazir stiller' }).click()
  await page.locator('.settings-preset-row').filter({ hasText: 'Dikey Turbo' }).locator('.settings-preset-apply').click()

  await page.locator('.tool-rail').getByRole('button', { name: 'Video' }).click()
  await expect(page.getByRole('button', { name: '9:16', exact: true })).toHaveClass(/selected/)
  await page.locator('.tool-rail').getByRole('button', { name: 'Altyazilar' }).click()
  await expect(page.getByLabel('Video eklenince otomatik baslat')).toBeChecked()
  await page.locator('.tool-rail').getByRole('button', { name: 'Export' }).click()
  await expect(page.getByRole('button', { name: '2160p' })).toHaveClass(/selected/)
})

test('keeps the newest setting during save and remains responsive', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto('/')
  await page.locator('input[type="file"][accept*="video"]').setInputFiles(videoFixture)

  await page.getByRole('button', { name: '1:1', exact: true }).click()
  await page.getByTitle('Projeyi kaydet').click()
  for (const ratio of ['9:16', '16:9', '4:3', '3:4']) {
    await page.getByRole('button', { name: ratio, exact: true }).click()
  }

  await page.locator('.tool-rail').getByRole('button', { name: 'Hazir stiller' }).click()
  const styleButtons = page.locator('.preset-card > button:first-child')
  for (let index = 0; index < Math.min(8, await styleButtons.count()); index += 1) {
    await styleButtons.nth(index).click()
  }

  await page.locator('.tool-rail').getByRole('button', { name: 'Export' }).click()
  for (const resolution of ['480p', '1080p', '2160p', 'Orijinal']) {
    await page.locator('.resolution-grid').getByRole('button', { name: resolution, exact: true }).click()
  }

  await page.waitForTimeout(1200)
  await page.locator('.tool-rail').getByRole('button', { name: 'Projeler ve toplu islemler' }).click()
  await page.locator('.library-open').filter({ hasText: 'sample' }).click()
  await page.locator('.tool-rail').getByRole('button', { name: 'Video' }).click()
  await expect(page.getByRole('button', { name: '3:4', exact: true })).toHaveClass(/selected/)
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => requestAnimationFrame(() => resolve(true))))).toBe(true)
  expect(pageErrors).toEqual([])
})

test('shows source-aware native export controls', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"][accept*="video"]').setInputFiles(videoFixture)
  await expect(page.locator('video')).toBeVisible()
  await page.locator('.tool-rail').getByRole('button', { name: 'Export' }).click()

  await expect(page.getByRole('button', { name: '480p' })).toBeVisible()
  await expect(page.getByRole('button', { name: '2160p' })).toBeVisible()
  await expect(page.getByLabel('Uzanti')).toHaveValue('source')
  await expect(page.getByLabel('Uzanti')).toContainText('Kaynak uzantiyi koru')
  await expect(page.getByLabel('Video codec')).toContainText('H.265 / HEVC')
  await expect(page.getByRole('button', { name: /Video ciktisi al/ })).toBeDisabled()
})
