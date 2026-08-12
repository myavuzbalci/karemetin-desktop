import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { exportProjectPackage } from './exportPackage'

const run = promisify(execFile)

describe('project ZIP exporter', () => {
  it('packages source, rendered video, subtitles, settings, and audio tracks', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'caption-studio-package-test-'))
    const zipPath = path.join(directory, 'project.zip')
    try {
      const result = await exportProjectPackage({
        zipPath,
        title: 'Test Proje',
        sourcePath: path.resolve('tests/fixtures/sample.webm'),
        sourceName: 'sample.webm',
        renderedPaths: [path.resolve('tests/fixtures/sample-two.webm')],
        srt: '1\n00:00:00,000 --> 00:00:01,000\nTest',
        text: 'Test',
        ass: '[Script Info]\nTitle: Test',
        projectJson: '{"title":"Test"}',
        audioTracks: [{ id: 'audio-1', name: 'speech.wav', path: path.resolve('tests/fixtures/speech.wav'), start: 0, volume: 100, fadeIn: 0, fadeOut: 0, muted: false }],
      })
      expect(result).toBe(zipPath)
      expect(existsSync(zipPath)).toBe(true)
      const { stdout } = await run('tar.exe', ['-tf', zipPath])
      expect(stdout).toContain('project.karemetin')
      expect(stdout).not.toContain('project.captionstudio')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 30_000)
})
