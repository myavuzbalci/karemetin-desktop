import type { CaptionProject, ProjectSummary } from '../types'

const DB_NAME = 'caption-studio'
const DB_VERSION = 1
const PROJECT_STORE = 'projects'

export async function saveProject(project: CaptionProject) {
  if (window.captionStudio) {
    await window.captionStudio.saveProject(stripRuntime(project))
    return
  }
  const db = await openDatabase()
  const stored = stripRuntime(project)

  await transactionPromise(db, PROJECT_STORE, 'readwrite', (store) => {
    store.put(stored)
  })
}

export async function getProject(id: string): Promise<CaptionProject | undefined> {
  if (window.captionStudio) return window.captionStudio.getProject(id)
  const db = await openDatabase()
  return transactionPromise(db, PROJECT_STORE, 'readonly', (store) => store.get(id))
}

export async function listProjects(): Promise<ProjectSummary[]> {
  if (window.captionStudio) return window.captionStudio.listProjects()
  const db = await openDatabase()
  const projects = await transactionPromise<CaptionProject[]>(db, PROJECT_STORE, 'readonly', (store) =>
    store.getAll(),
  )

  return projects
    .map((project) => ({
      id: project.id,
      title: project.title,
      updatedAt: project.updatedAt,
      mediaName: project.mediaName,
      mediaDuration: project.mediaDuration,
      chunkCount: project.chunks.length,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteProject(id: string) {
  if (window.captionStudio) {
    await window.captionStudio.deleteProject(id)
    return
  }
  const db = await openDatabase()
  await transactionPromise(db, PROJECT_STORE, 'readwrite', (store) => {
    store.delete(id)
  })
}

function stripRuntime(project: CaptionProject): CaptionProject {
  const { mediaUrl: _mediaUrl, mediaBlob: _mediaBlob, ...rest } = project
  return rest
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionPromise<T = void>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = run(store)
    let result: T

    if (request) {
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () => reject(request.error)
    }

    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
