import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, session, shell } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { access, copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { CaptionProject, NativeExportRequest, NativeProjectPackageRequest, ProjectSummary, SettingsPreset } from '../src/types'
import { parseCliOptions, runCli } from './cli'
import { exportProjectPackage } from './services/exportPackage'
import { exportNativeVideo } from './services/exportVideo'
import { extractMonoAudio, extractWaveform, getFfmpegVersion, inspectMedia } from './services/media'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const activeExports = new Map<string, ChildProcessWithoutNullStreams>()
let mainWindow: BrowserWindow | null = null
let modelServer: Server | null = null
let modelServerBaseUrl = ''
const cliOptions = parseCliOptions(cliArguments())

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'caption-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

app.setName('KareMetin')
if (process.env.CAPTION_STUDIO_TEST_USER_DATA) {
  app.setPath('userData', process.env.CAPTION_STUDIO_TEST_USER_DATA)
}

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  await migrateLegacyUserData()
  if (cliOptions) {
    try {
      const outputs = await runCli(cliOptions, getModelDirectory(), settingsPresetsPath())
      outputs.forEach((output) => console.log(output))
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 1
    } finally {
      app.quit()
    }
    return
  }
  await startModelServer()
  registerMediaProtocol()
  registerPermissions()
  registerIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  modelServer?.close()
  modelServer = null
})

function cliArguments() {
  if (!app.commandLine.hasSwitch('caption-cli')) return process.argv
  const args = ['--caption-cli']
  const inputPath = app.commandLine.getSwitchValue('caption-input')
  const outputDirectory = app.commandLine.getSwitchValue('caption-output-dir')
  const presetPath = app.commandLine.getSwitchValue('caption-preset')
  const presetName = app.commandLine.getSwitchValue('caption-preset-name')
  if (inputPath) args.push(`--caption-input=${inputPath}`)
  if (outputDirectory) args.push(`--caption-output-dir=${outputDirectory}`)
  if (presetPath) args.push(`--caption-preset=${presetPath}`)
  if (presetName) args.push(`--caption-preset-name=${presetName}`)
  if (app.commandLine.hasSwitch('caption-no-video')) args.push('--caption-no-video')
  return args
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    frame: false,
    resizable: true,
    thickFrame: true,
    hasShadow: true,
    backgroundColor: '#0b0c11',
    title: 'KareMetin',
    webPreferences: {
      preload: path.join(currentDirectory, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('maximize', sendWindowState)
  mainWindow.on('unmaximize', sendWindowState)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  if (developmentUrl) {
    await mainWindow.loadURL(developmentUrl)
  } else {
    await mainWindow.loadFile(path.join(currentDirectory, '../dist/index.html'))
  }
}

function registerMediaProtocol() {
  protocol.handle('caption-media', async (request) => {
    const parsed = new URL(request.url)
    const mediaPath = decodeURIComponent(parsed.pathname.slice(1))
    if (!mediaPath) return new Response('Missing media path', { status: 400 })
    return net.fetch(pathToFileURL(mediaPath).toString(), {
      headers: request.headers,
    })
  })

}

function getModelDirectory() {
  return app.isPackaged ? path.join(process.resourcesPath, 'models') : path.join(process.cwd(), 'models')
}

async function startModelServer() {
  const modelDirectory = getModelDirectory()
  modelServer = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    const requestedPath = decodeURIComponent(url.pathname).replace(/^\/models\/?/, '')
    const resolvedPath = path.resolve(modelDirectory, requestedPath)
    const insideModelDirectory = resolvedPath === modelDirectory || resolvedPath.startsWith(`${modelDirectory}${path.sep}`)
    if (!insideModelDirectory || !url.pathname.startsWith('/models/')) {
      response.writeHead(403)
      response.end('Invalid model path')
      return
    }
    try {
      const file = await stat(resolvedPath)
      if (!file.isFile()) throw new Error('Not a file')
      response.setHeader('Access-Control-Allow-Origin', '*')
      response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
      response.setHeader('Content-Length', file.size)
      response.setHeader('Content-Type', mimeTypeForModelFile(resolvedPath))
      if (request.method === 'HEAD') {
        response.end()
        return
      }
      createReadStream(resolvedPath).pipe(response)
    } catch {
      response.writeHead(404)
      response.end('Model file not found')
    }
  })
  await new Promise<void>((resolve, reject) => {
    modelServer?.once('error', reject)
    modelServer?.listen(0, '127.0.0.1', () => resolve())
  })
  const address = modelServer.address() as AddressInfo
  modelServerBaseUrl = `http://127.0.0.1:${address.port}/models/`
}

function mimeTypeForModelFile(filePath: string) {
  if (filePath.endsWith('.json')) return 'application/json'
  if (filePath.endsWith('.txt')) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}

function registerPermissions() {
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => String(permission) === 'local-fonts')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(String(permission) === 'local-fonts')
  })
}

function registerIpc() {
  ipcMain.on('models:base-url', (event) => {
    event.returnValue = modelServerBaseUrl
  })
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:toggle-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
    return mainWindow?.isMaximized() ?? false
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  ipcMain.handle('media:open', async () => {
    const result = await dialog.showOpenDialog(mainWindow as BrowserWindow, {
      title: 'Video veya ses dosyasi sec',
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Video ve ses',
          extensions: [
            'mp4',
            'mov',
            'mkv',
            'webm',
            'avi',
            'm4v',
            'mpg',
            'mpeg',
            'mts',
            'm2ts',
            'wmv',
            'flv',
            'mp3',
            'wav',
            'm4a',
            'aac',
            'flac',
            'ogg',
          ],
        },
        { name: 'Tum dosyalar', extensions: ['*'] },
      ],
    })
    if (result.canceled) return []
    return Promise.all(result.filePaths.map((filePath) => inspectMedia(filePath)))
  })
  ipcMain.handle('media:inspect', (_event, mediaPath: string) => inspectMedia(mediaPath))
  ipcMain.handle('media:audio', (_event, mediaPath: string) => extractMonoAudio(mediaPath))
  ipcMain.handle('media:waveform', (_event, mediaPath: string, points?: number) =>
    extractWaveform(mediaPath, points),
  )
  ipcMain.handle('media:ffmpeg-version', () => getFfmpegVersion())

  ipcMain.handle('projects:save', async (_event, project: CaptionProject) => {
    const directory = await projectsDirectory()
    const portable = stripRuntimeProject(project)
    await writeFile(projectPath(directory, portable.id), JSON.stringify(portable, null, 2), 'utf8')
  })
  ipcMain.handle('projects:get', async (_event, id: string) => {
    try {
      const directory = await projectsDirectory()
      return JSON.parse(await readFile(projectPath(directory, id), 'utf8')) as CaptionProject
    } catch {
      return undefined
    }
  })
  ipcMain.handle('projects:list', async () => {
    const directory = await projectsDirectory()
    const files = (await readdir(directory)).filter((file) => file.endsWith('.json'))
    const projects = await Promise.all(
      files.map(async (file) => {
        try {
          return JSON.parse(await readFile(path.join(directory, file), 'utf8')) as CaptionProject
        } catch {
          return undefined
        }
      }),
    )
    return projects
      .filter((project): project is CaptionProject => Boolean(project))
      .map(projectSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  })
  ipcMain.handle('projects:delete', async (_event, id: string) => {
    const directory = await projectsDirectory()
    await rm(projectPath(directory, id), { force: true })
  })
  ipcMain.handle('settings-presets:load', async () => {
    try {
      return JSON.parse(await readFile(settingsPresetsPath(), 'utf8')) as SettingsPreset[]
    } catch {
      return []
    }
  })
  ipcMain.handle('settings-presets:save', async (_event, presets: SettingsPreset[]) => {
    await writeFile(settingsPresetsPath(), JSON.stringify(presets, null, 2), 'utf8')
  })

  ipcMain.handle('files:open-srt', async () => {
    const result = await dialog.showOpenDialog(mainWindow as BrowserWindow, {
      title: 'Altyazi dosyasi sec',
      properties: ['openFile'],
      filters: [
        { name: 'Altyazi', extensions: ['srt', 'vtt'] },
        { name: 'Tum dosyalar', extensions: ['*'] },
      ],
    })
    if (result.canceled || !result.filePaths[0]) return undefined
    return {
      name: path.basename(result.filePaths[0]),
      text: await readFile(result.filePaths[0], 'utf8'),
    }
  })
  ipcMain.handle('files:open-project', async () => {
    const result = await dialog.showOpenDialog(mainWindow as BrowserWindow, {
      title: 'KareMetin proje dosyasini ac',
      properties: ['openFile'],
      filters: [{ name: 'KareMetin projesi', extensions: ['captionstudio', 'json'] }],
    })
    if (result.canceled || !result.filePaths[0]) return undefined
    return { path: result.filePaths[0], contents: await readFile(result.filePaths[0], 'utf8') }
  })
  ipcMain.handle(
    'files:save-text',
    async (_event, options: { title: string; defaultName: string; contents: string; extensions: string[] }) => {
      const result = await dialog.showSaveDialog(mainWindow as BrowserWindow, {
        title: options.title,
        defaultPath: options.defaultName,
        filters: [{ name: options.extensions.join(', ').toUpperCase(), extensions: options.extensions }],
      })
      if (result.canceled || !result.filePath) return undefined
      await writeFile(result.filePath, options.contents, 'utf8')
      return result.filePath
    },
  )
  ipcMain.handle('export:choose-package-path', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog(mainWindow as BrowserWindow, {
      title: 'ZIP proje paketini kaydet',
      defaultPath: replaceExtension(defaultName, 'zip'),
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })
    return result.canceled ? undefined : result.filePath
  })
  ipcMain.handle('files:choose-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow as BrowserWindow, {
      title: 'Cikti klasoru sec',
      properties: ['openDirectory', 'createDirectory'],
    })
    return result.canceled ? undefined : result.filePaths[0]
  })
  ipcMain.handle(
    'export:choose-path',
    async (_event, options: { defaultName: string; extension: string; mode: NativeExportRequest['settings']['mode'] }) => {
      const extension = options.mode === 'transparent' || options.mode === 'mask-pair' ? 'mov' : options.extension
      const result = await dialog.showSaveDialog(mainWindow as BrowserWindow, {
        title: options.mode === 'mask-pair' ? 'Altyazi ve maske dosyalari icin konum sec' : 'Video ciktisini kaydet',
        defaultPath: replaceExtension(options.defaultName, extension),
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      })
      return result.canceled ? undefined : result.filePath
    },
  )
  ipcMain.handle('export:start', async (event, request: NativeExportRequest) => {
    return exportNativeVideo(request, {
      onProgress: (progress, stage) => {
        event.sender.send('export:progress', { jobId: request.jobId, progress, stage })
      },
      onSpawn: (child) => {
        activeExports.set(request.jobId, child)
        child.once('close', () => activeExports.delete(request.jobId))
      },
    })
  })
  ipcMain.handle('export:cancel', (_event, jobId: string) => {
    activeExports.get(jobId)?.kill()
    activeExports.delete(jobId)
  })
  ipcMain.handle('export:package', (_event, request: NativeProjectPackageRequest) => exportProjectPackage(request))
  ipcMain.handle('files:reveal', (_event, targetPath: string) => shell.showItemInFolder(targetPath))
}

function sendWindowState() {
  mainWindow?.webContents.send('window:maximized', mainWindow.isMaximized())
}

async function projectsDirectory() {
  const directory = path.join(app.getPath('userData'), 'projects')
  await mkdir(directory, { recursive: true })
  return directory
}

function settingsPresetsPath() {
  return path.join(app.getPath('userData'), 'settings-presets.json')
}

async function migrateLegacyUserData() {
  if (process.env.CAPTION_STUDIO_TEST_USER_DATA) return

  const current = app.getPath('userData')
  const legacy = path.join(app.getPath('appData'), 'Caption Studio')
  if (path.resolve(current) === path.resolve(legacy)) return

  try {
    await access(legacy)
  } catch {
    return
  }

  await mkdir(current, { recursive: true })
  for (const filename of ['settings-presets.json']) {
    const source = path.join(legacy, filename)
    const target = path.join(current, filename)
    try {
      await access(target)
    } catch {
      try {
        await copyFile(source, target)
      } catch {
        // The old installation may not contain every optional data file.
      }
    }
  }

  const sourceProjects = path.join(legacy, 'projects')
  const targetProjects = path.join(current, 'projects')
  try {
    await access(targetProjects)
  } catch {
    try {
      await cp(sourceProjects, targetProjects, { recursive: true })
    } catch {
      // Projects are optional and migration must not prevent startup.
    }
  }
}

function projectPath(directory: string, id: string) {
  return path.join(directory, `${id.replace(/[^a-z0-9_-]/gi, '_')}.json`)
}

function stripRuntimeProject(project: CaptionProject): CaptionProject {
  const { mediaBlob: _mediaBlob, mediaUrl: _mediaUrl, ...portable } = project
  return portable
}

function projectSummary(project: CaptionProject): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    updatedAt: project.updatedAt,
    mediaName: project.mediaName,
    mediaDuration: project.mediaDuration,
    chunkCount: project.chunks.length,
    mediaPath: project.mediaPath,
  }
}

function replaceExtension(filename: string, extension: string) {
  return `${filename.replace(/\.[^.]+$/, '')}.${extension.replace('.', '')}`
}
