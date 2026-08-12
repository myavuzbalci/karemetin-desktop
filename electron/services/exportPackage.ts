import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { NativeProjectPackageRequest } from '../../src/types'

export async function exportProjectPackage(request: NativeProjectPackageRequest) {
  const staging = await mkdtemp(path.join(tmpdir(), 'caption-studio-package-'))
  try {
    const original = path.join(staging, 'original')
    const renders = path.join(staging, 'rendered')
    const subtitles = path.join(staging, 'subtitles')
    const audio = path.join(staging, 'audio-tracks')
    await Promise.all([mkdir(original), mkdir(renders), mkdir(subtitles), mkdir(audio)])

    if (request.sourcePath) await copyIfPresent(request.sourcePath, path.join(original, safeName(request.sourceName)))
    await Promise.all(request.renderedPaths.map((filePath) => copyIfPresent(filePath, path.join(renders, safeName(path.basename(filePath))))))
    await Promise.all(request.audioTracks.filter((track) => track.path).map((track, index) =>
      copyIfPresent(track.path as string, path.join(audio, `${String(index + 2).padStart(2, '0')}-${safeName(track.name)}`)),
    ))
    const stem = safeName(request.title).replace(/\.[^.]+$/, '') || 'caption-project'
    await Promise.all([
      writeFile(path.join(subtitles, `${stem}.srt`), request.srt, 'utf8'),
      writeFile(path.join(subtitles, `${stem}.txt`), request.text, 'utf8'),
      writeFile(path.join(subtitles, `${stem}.ass`), request.ass, 'utf8'),
      writeFile(path.join(staging, 'project.karemetin'), request.projectJson, 'utf8'),
      writeFile(path.join(staging, 'project.json'), request.projectJson, 'utf8'),
      writeFile(path.join(staging, 'README.txt'), readme(request), 'utf8'),
    ])
    await createZip(staging, request.zipPath)
    return request.zipPath
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

async function copyIfPresent(source: string, destination: string) {
  try {
    await copyFile(source, destination)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

function createZip(staging: string, zipPath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('tar.exe', ['-a', '-c', '-f', zipPath, '-C', staging, '.'], { windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr || `ZIP paketi olusturulamadi (${code}).`)))
  })
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'file'
}

function readme(request: NativeProjectPackageRequest) {
  return [
    'KareMetin proje paketi',
    '',
    'original/: kaynak medya',
    'rendered/: son video ciktilari',
    'subtitles/: SRT, TXT ve ASS altyazilari',
    'audio-tracks/: eklenen ses dosyalari',
    'project.karemetin: KareMetin icinde tekrar acilabilen proje dosyasi',
    'project.json: insan tarafindan incelenebilen ayni proje verisi',
    '',
    `Proje: ${request.title}`,
  ].join('\r\n')
}
