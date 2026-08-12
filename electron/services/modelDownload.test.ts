import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isModelReady, REQUIRED_MODEL_FILES } from './modelDownload'

describe('local model readiness', () => {
  it('requires every q4 model and tokenizer file before it is considered usable', async () => {
    const directory = path.join(tmpdir(), `karemetin-model-test-${Date.now()}`)
    try {
      await mkdir(directory, { recursive: true })
      expect(await isModelReady(directory)).toBe(false)
      await Promise.all(REQUIRED_MODEL_FILES.map(async (file) => {
        const target = path.join(directory, file)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, 'ready')
      }))
      expect(await isModelReady(directory)).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
