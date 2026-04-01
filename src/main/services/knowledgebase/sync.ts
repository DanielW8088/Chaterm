/**
 * Knowledge base sync: full sync on startup, incremental upload/delete on file events.
 * - On startup: full sync (download from cloud, upload local-only changes, delete cloud orphans).
 * - Runtime: add/change -> upload only; unlink -> delete only.
 * - Uses Cloudflare R2 (S3-compatible) for remote storage when configured.
 * - If R2 is not configured, sync is silently skipped.
 */

import { app } from 'electron'
import path from 'path'
import * as fs from 'fs/promises'
import { createLogger } from '../logging'
import { getKnowledgeBaseRoot, getKbSearchManager } from './index'
import { getR2Config, createR2Client } from './r2Client'
import type { R2Client } from './r2Client'

const logger = createLogger('kb-sync')

const KB_SYNC_EXCLUDED_BASENAME = '.kb-default-seeds-meta.json'
const R2_MANIFEST_KEY = 'manifest.json'
export const KB_SYNC_DEBOUNCE_MS = 5000
export const DELETE_BATCH_SIZE = 20
export const UPLOAD_BATCH_SIZE = 20

export interface KbManifestEntry {
  relPath: string
  mtimeMs: number
  size: number
  hash?: string
}

interface SnapshotData {
  updatedAt: number
  entries: KbManifestEntry[]
  usedBytes?: number
}

interface R2Manifest {
  entries: Record<string, KbManifestEntry>
}

function normalizeRelPath(relPath: string): string {
  const p = relPath.replace(/\\/g, '/')
  return p.startsWith('/') ? p.slice(1) : p
}

export function isKbSyncExcludedRelPath(relPath: string): boolean {
  const normalized = normalizeRelPath(relPath)
  const basename = path.basename(normalized)
  return basename === KB_SYNC_EXCLUDED_BASENAME || normalized === KB_SYNC_EXCLUDED_BASENAME
}

function getKbRoot(): string {
  return getKnowledgeBaseRoot()
}

function resolveKbPath(relPath: string): { rootAbs: string; absPath: string } {
  const rootAbs = path.resolve(getKbRoot())
  if (path.isAbsolute(relPath)) {
    throw new Error('Absolute path not allowed')
  }
  const absPath = path.resolve(rootAbs, relPath)
  if (absPath !== rootAbs && !absPath.startsWith(rootAbs + path.sep)) {
    throw new Error('Path escapes knowledgebase root')
  }
  return { rootAbs, absPath }
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await fs.access(absPath)
    return true
  } catch {
    return false
  }
}

/** Convert absolute filesystem path to kb-relative path; returns null if outside kb root. */
function absToRelPath(absFilePath: string): string | null {
  const root = path.resolve(getKbRoot())
  const rel = path.relative(root, absFilePath)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null
  return normalizeRelPath(rel)
}

export async function listAllKbFilesRecursive(relDir = ''): Promise<KbManifestEntry[]> {
  const { absPath: dirAbs } = resolveKbPath(relDir)
  if (!(await pathExists(dirAbs))) {
    return []
  }
  const entries: KbManifestEntry[] = []
  const dirents = await fs.readdir(dirAbs, { withFileTypes: true })
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue
    const childAbs = path.join(dirAbs, d.name)
    const childRel = path.posix.join(relDir.replace(/\\/g, '/'), d.name)
    if (d.isDirectory()) {
      const sub = await listAllKbFilesRecursive(childRel)
      entries.push(...sub)
    } else if (d.isFile()) {
      if (isKbSyncExcludedRelPath(childRel)) continue
      const stat = await fs.stat(childAbs)
      entries.push({
        relPath: normalizeRelPath(childRel),
        mtimeMs: Math.floor(stat.mtimeMs), // stat.mtimeMs is float; Go int64 requires integer
        size: stat.size
      })
    }
  }
  return entries
}

function getSnapshotPath(): string {
  return path.join(app.getPath('userData'), 'kb-sync-snapshot.json')
}

export async function readLocalSnapshot(): Promise<SnapshotData | null> {
  const snapshotPath = getSnapshotPath()
  try {
    const raw = await fs.readFile(snapshotPath, 'utf-8')
    const data = JSON.parse(raw) as SnapshotData
    if (!data || !Array.isArray(data.entries)) return null
    return {
      updatedAt: data.updatedAt ?? 0,
      entries: data.entries,
      usedBytes: data.usedBytes
    }
  } catch {
    return null
  }
}

export async function writeLocalSnapshot(entries: KbManifestEntry[], usedBytes?: number): Promise<void> {
  const snapshotPath = getSnapshotPath()
  const data: SnapshotData = { updatedAt: Date.now(), entries, ...(usedBytes !== undefined && { usedBytes }) }
  await fs.writeFile(snapshotPath, JSON.stringify(data, null, 2), 'utf-8')
}

export function diffManifest(L_now: KbManifestEntry[], L_last: KbManifestEntry[] | null): { toUpload: KbManifestEntry[]; toDelete: string[] } {
  const toUpload: KbManifestEntry[] = []
  const toDelete: string[] = []
  const nowMap = new Map(L_now.map((e) => [e.relPath, e]))
  const lastMap = new Map((L_last ?? []).map((e) => [e.relPath, e]))
  for (const e of L_now) {
    const last = lastMap.get(e.relPath)
    if (!last) {
      toUpload.push(e)
    } else if (last.mtimeMs !== e.mtimeMs || last.size !== e.size) {
      toUpload.push(e)
    }
  }
  for (const relPath of lastMap.keys()) {
    if (!nowMap.has(relPath)) toDelete.push(relPath)
  }
  return { toUpload, toDelete }
}

export type KbUploadOutcomeStatus = 'ok' | 'skipped' | 'failed' | 'unspecified'
export type KbDeleteOutcomeStatus = 'ok' | 'skipped' | 'not_found' | 'failed' | 'unspecified'

// Keep numeric values aligned with previous enum definitions for test compatibility.
export enum UploadItemStatus {
  UploadStatusUnspecified = 0,
  UploadStatusOK = 1,
  UploadStatusSkipped = 2,
  UploadStatusFailed = 3
}

export enum DeleteItemStatus {
  DeleteStatusUnspecified = 0,
  DeleteStatusOK = 1,
  DeleteStatusSkipped = 2,
  DeleteStatusNotFound = 3,
  DeleteStatusFailed = 4
}

export function parseKbUploadStatus(raw: unknown): KbUploadOutcomeStatus {
  if (raw === UploadItemStatus.UploadStatusOK) return 'ok'
  if (raw === UploadItemStatus.UploadStatusSkipped) return 'skipped'
  if (raw === UploadItemStatus.UploadStatusFailed) return 'failed'
  return 'unspecified'
}

export function parseKbDeleteStatus(raw: unknown): KbDeleteOutcomeStatus {
  if (raw === DeleteItemStatus.DeleteStatusOK) return 'ok'
  if (raw === DeleteItemStatus.DeleteStatusSkipped) return 'skipped'
  if (raw === DeleteItemStatus.DeleteStatusNotFound) return 'not_found'
  if (raw === DeleteItemStatus.DeleteStatusFailed) return 'failed'
  return 'unspecified'
}

/** Snapshot after upload: only OK/SKIPPED paths get L_now version; failed updates keep L_last; failed new files omitted. */
export function buildSnapshotEntriesAfterUpload(
  L_now: KbManifestEntry[],
  L_last: KbManifestEntry[] | null,
  toUpload: KbManifestEntry[],
  uploadSuccessRelPaths: Set<string>
): KbManifestEntry[] {
  const toUploadSet = new Set(toUpload.map((e) => e.relPath))
  const lastMap = new Map((L_last ?? []).map((e) => [e.relPath, e]))
  const out: KbManifestEntry[] = []
  for (const e of L_now) {
    if (!toUploadSet.has(e.relPath)) {
      out.push(e)
      continue
    }
    if (uploadSuccessRelPaths.has(e.relPath)) {
      out.push(e)
      continue
    }
    const prev = lastMap.get(e.relPath)
    if (prev) out.push(prev)
  }
  return out
}

export function adjustUsedBytesAfterUploadOk(usedBytes: number, cloudSizes: Map<string, number>, entry: KbManifestEntry): number {
  if (isKbSyncExcludedRelPath(entry.relPath)) return usedBytes
  const prev = cloudSizes.get(entry.relPath) ?? 0
  cloudSizes.set(entry.relPath, entry.size)
  return usedBytes - prev + entry.size
}

/**
 * Decide what to do with a cloud entry during full sync download phase.
 *
 * 'download'              - fetch and write the file locally
 * 'skip'                  - do nothing (local is up to date or delete intent wins)
 * 'download_and_restore'  - fetch, write, and remove from delete intent set (cloud is newer)
 */
export type DownloadDecision = 'download' | 'skip' | 'download_and_restore'

export function decideDownloadAction(
  entry: KbManifestEntry,
  localExists: boolean,
  localMtimeMs: number | null,
  toDeleteSet: ReadonlySet<string>,
  lastSnapshotEntry: KbManifestEntry | undefined
): DownloadDecision {
  if (isKbSyncExcludedRelPath(entry.relPath)) return 'skip'

  if (!localExists) {
    if (toDeleteSet.has(entry.relPath)) {
      // File was locally deleted. Respect delete intent unless cloud has a strictly newer version.
      if (lastSnapshotEntry && entry.mtimeMs <= lastSnapshotEntry.mtimeMs) {
        return 'skip'
      }
      // Cloud has a newer version; restore it and remove from the delete set.
      return 'download_and_restore'
    }
    // New file from cloud that was never local, download it.
    return 'download'
  }

  // File exists locally; download only when cloud is strictly newer.
  if (localMtimeMs !== null && localMtimeMs < entry.mtimeMs) {
    return 'download'
  }
  return 'skip'
}

export interface KbSyncPathOutcome {
  relPath: string
  kind: 'upload' | 'delete'
  status: string
  message: string
}

export interface KbSyncLastRunResults {
  finishedAt: number
  uploads: KbSyncPathOutcome[]
  deletes: KbSyncPathOutcome[]
}

let lastKbSyncResults: KbSyncLastRunResults = { finishedAt: 0, uploads: [], deletes: [] }

export function getKbSyncLastResults(): KbSyncLastRunResults {
  return {
    finishedAt: lastKbSyncResults.finishedAt,
    uploads: [...lastKbSyncResults.uploads],
    deletes: [...lastKbSyncResults.deletes]
  }
}

// --- R2 manifest helpers ---

async function readR2Manifest(r2: R2Client): Promise<R2Manifest | null> {
  try {
    const buf = await r2.getObject(R2_MANIFEST_KEY)
    if (!buf) return null
    return JSON.parse(buf.toString('utf-8')) as R2Manifest
  } catch {
    return null
  }
}

async function writeR2Manifest(r2: R2Client, entries: KbManifestEntry[]): Promise<void> {
  const manifest: R2Manifest = {
    entries: Object.fromEntries(entries.map((e) => [e.relPath, e]))
  }
  const buf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8')
  await r2.putObject(R2_MANIFEST_KEY, buf)
}

// --- Runtime state ---

let fullSyncInProgress = false
let flushInProgress = false
let uploadTimer: ReturnType<typeof setTimeout> | null = null
let deleteTimer: ReturnType<typeof setTimeout> | null = null
const pendingUpload = new Set<string>()
const pendingDelete = new Set<string>()

interface KbSyncWatcher {
  on: (event: string, cb: (filePath?: string) => void) => void
  close: () => void | Promise<void>
}

let watcher: KbSyncWatcher | null = null

async function getR2Client(): Promise<R2Client | null> {
  const cfg = await getR2Config()
  if (!cfg) return null
  return createR2Client(cfg)
}

// --- Full sync (startup / manual) ---

export async function runKbFullSync(): Promise<void> {
  if (fullSyncInProgress) return
  const r2 = await getR2Client()
  if (!r2) {
    logger.info('KB sync skipped: R2 not configured')
    return
  }
  fullSyncInProgress = true
  // Track files downloaded from cloud during this run, so we don't re-upload them.
  const downloadedRelPaths = new Set<string>()
  try {
    await fs.mkdir(getKbRoot(), { recursive: true })

    const r2Manifest = await readR2Manifest(r2)
    const entriesMap: Record<string, KbManifestEntry> = r2Manifest?.entries ?? {}
    const cloudSizes = new Map<string, number>()
    for (const entry of Object.values(entriesMap)) {
      if (entry?.relPath && !isKbSyncExcludedRelPath(entry.relPath)) {
        cloudSizes.set(entry.relPath, entry.size ?? 0)
      }
    }
    let usedBytes = Array.from(cloudSizes.values()).reduce((a, b) => a + b, 0)

    // Compute local delete intent BEFORE download phase to avoid "deleted then re-downloaded" bug.
    const L_last = await readLocalSnapshot()
    const L_now_before = await listAllKbFilesRecursive()
    const { toDelete: initialToDelete } = diffManifest(L_now_before, L_last?.entries ?? null)
    const toDeleteSet = new Set(initialToDelete)
    const lastEntriesMap = new Map((L_last?.entries ?? []).map((e) => [e.relPath, e]))

    // Download phase: use decideDownloadAction to honour delete intents and mtime priority.
    for (const entry of Object.values(entriesMap)) {
      if (isKbSyncExcludedRelPath(entry.relPath)) continue
      const { absPath } = resolveKbPath(entry.relPath)
      const exists = await pathExists(absPath)
      const localMtimeMs = exists ? Math.floor((await fs.stat(absPath)).mtimeMs) : null
      const decision = decideDownloadAction(entry, exists, localMtimeMs, toDeleteSet, lastEntriesMap.get(entry.relPath))

      if (decision === 'skip') continue
      if (decision === 'download_and_restore') {
        toDeleteSet.delete(entry.relPath)
      }

      try {
        const buf = await r2.getObject(entry.relPath)
        if (!buf) continue
        await fs.mkdir(path.dirname(absPath), { recursive: true })
        await fs.writeFile(absPath, buf)
        logger.info('KB sync downloaded', { relPath: entry.relPath })
        downloadedRelPaths.add(entry.relPath)
      } catch (e: any) {
        logger.warn(`KB sync download failed for ${entry.relPath}`, { error: e?.message })
      }
    }

    // Re-scan after downloads to get accurate local state for upload diff.
    const L_now = await listAllKbFilesRecursive()
    const { toUpload: rawToUpload } = diffManifest(L_now, L_last?.entries ?? null)
    const toUpload = rawToUpload.filter((e) => !downloadedRelPaths.has(e.relPath))
    const toDelete = Array.from(toDeleteSet)

    const uploadOutcomes: KbSyncPathOutcome[] = []
    const uploadSuccessRelPaths = new Set<string>()

    // Upload files to R2 one at a time (batched in groups for progress tracking).
    for (let batchStart = 0; batchStart < toUpload.length; batchStart += UPLOAD_BATCH_SIZE) {
      const batch = toUpload.slice(batchStart, batchStart + UPLOAD_BATCH_SIZE)
      for (const e of batch) {
        try {
          const { absPath } = resolveKbPath(e.relPath)
          const content = await fs.readFile(absPath)
          await r2.putObject(e.relPath, content)
          usedBytes = adjustUsedBytesAfterUploadOk(usedBytes, cloudSizes, e)
          uploadSuccessRelPaths.add(e.relPath)
          uploadOutcomes.push({ relPath: e.relPath, kind: 'upload', status: 'ok', message: '' })
          logger.info('KB sync uploaded', { relPath: e.relPath })
        } catch (err: any) {
          const msg = err?.message ?? 'upload failed'
          uploadOutcomes.push({ relPath: e.relPath, kind: 'upload', status: 'failed', message: msg })
          logger.warn(`KB sync upload failed for ${e.relPath}`, { error: msg })
        }
      }
    }

    const deleteOutcomes: KbSyncPathOutcome[] = []
    if (toDelete.length > 0) {
      try {
        await r2.deleteObjects(toDelete)
        for (const relPath of toDelete) {
          const sz = cloudSizes.get(relPath) ?? entriesMap[relPath]?.size ?? lastEntriesMap.get(relPath)?.size ?? 0
          if (!isKbSyncExcludedRelPath(relPath) && sz > 0) {
            usedBytes -= sz
          }
          cloudSizes.delete(relPath)
          deleteOutcomes.push({ relPath, kind: 'delete', status: 'ok', message: '' })
          logger.info('KB sync deleted', { relPath })
        }
      } catch (err: any) {
        const msg = err?.message ?? 'delete request failed'
        for (const relPath of toDelete) {
          deleteOutcomes.push({ relPath, kind: 'delete', status: 'failed', message: msg })
        }
        logger.warn('KB sync delete batch failed', { error: msg })
      }
    }

    lastKbSyncResults = {
      finishedAt: Date.now(),
      uploads: uploadOutcomes,
      deletes: deleteOutcomes
    }

    const snapshotEntries = buildSnapshotEntriesAfterUpload(L_now, L_last?.entries ?? null, toUpload, uploadSuccessRelPaths)
    await writeLocalSnapshot(snapshotEntries, Math.max(0, usedBytes))

    // Update R2 manifest to reflect current state after sync.
    try {
      await writeR2Manifest(r2, snapshotEntries)
    } catch (e: any) {
      logger.warn('KB sync: failed to write R2 manifest', { error: e?.message })
    }
  } catch (e: any) {
    logger.warn('KB sync failed', { error: e?.message })
  } finally {
    // Remove any watcher-triggered upload intents for files we just downloaded.
    for (const p of downloadedRelPaths) pendingUpload.delete(p)
    fullSyncInProgress = false
    // Flush any incremental operations that accumulated while full sync was running.
    if (pendingDelete.size > 0 && !deleteTimer) {
      deleteTimer = setTimeout(() => {
        deleteTimer = null
        flushDeletes().catch(() => {})
      }, 0)
    }
    if (pendingUpload.size > 0 && !uploadTimer) {
      uploadTimer = setTimeout(() => {
        uploadTimer = null
        flushUploads().catch(() => {})
      }, 0)
    }
  }
}

// --- Incremental upload (triggered by add/change events) ---

function scheduleUpload(relPath: string): void {
  pendingUpload.add(relPath)
  if (uploadTimer) clearTimeout(uploadTimer)
  uploadTimer = setTimeout(() => {
    uploadTimer = null
    flushUploads().catch(() => {})
  }, KB_SYNC_DEBOUNCE_MS)
}

async function flushUploads(): Promise<void> {
  if (fullSyncInProgress || flushInProgress) {
    // Reschedule so pending items are not lost.
    if (!uploadTimer) {
      uploadTimer = setTimeout(() => {
        uploadTimer = null
        flushUploads().catch(() => {})
      }, KB_SYNC_DEBOUNCE_MS)
    }
    return
  }
  if (pendingUpload.size === 0) return

  const paths = Array.from(pendingUpload)
  pendingUpload.clear()

  const r2 = await getR2Client()
  if (!r2) return

  flushInProgress = true
  try {
    const snapshot = await readLocalSnapshot()
    const snapshotMap = new Map((snapshot?.entries ?? []).map((e) => [e.relPath, e]))
    const cloudSizes = new Map<string, number>(Array.from(snapshotMap.values()).map((e) => [e.relPath, e.size]))
    let usedBytes = snapshot?.usedBytes ?? 0

    const toUpload: KbManifestEntry[] = []
    for (const relPath of paths) {
      if (isKbSyncExcludedRelPath(relPath)) continue
      try {
        const { absPath } = resolveKbPath(relPath)
        const stat = await fs.stat(absPath).catch(() => null)
        if (!stat?.isFile()) continue
        toUpload.push({ relPath, mtimeMs: Math.floor(stat.mtimeMs), size: stat.size })
      } catch {
        // invalid path, skip
      }
    }

    if (toUpload.length === 0) return

    const uploadSuccessRelPaths = new Set<string>()
    for (const e of toUpload) {
      try {
        const { absPath } = resolveKbPath(e.relPath)
        const content = await fs.readFile(absPath)
        await r2.putObject(e.relPath, content)
        usedBytes = adjustUsedBytesAfterUploadOk(usedBytes, cloudSizes, e)
        uploadSuccessRelPaths.add(e.relPath)
        logger.info('KB sync incremental uploaded', { relPath: e.relPath })
      } catch (err: any) {
        logger.warn(`KB sync incremental upload failed for ${e.relPath}`, { error: err?.message })
      }
    }

    // Upsert successfully uploaded entries into the snapshot; keep all others unchanged.
    const existingMap = new Map((snapshot?.entries ?? []).map((e) => [e.relPath, e]))
    for (const e of toUpload) {
      if (uploadSuccessRelPaths.has(e.relPath)) {
        existingMap.set(e.relPath, e)
      }
    }
    const newEntries = Array.from(existingMap.values())
    await writeLocalSnapshot(newEntries, Math.max(0, usedBytes))

    // Update R2 manifest.
    try {
      await writeR2Manifest(r2, newEntries)
    } catch (e: any) {
      logger.warn('KB sync: failed to write R2 manifest after incremental upload', { error: e?.message })
    }
  } finally {
    flushInProgress = false
  }
}

// --- Incremental delete (triggered by unlink events) ---

function scheduleDelete(relPaths: string | string[]): void {
  const paths = Array.isArray(relPaths) ? relPaths : [relPaths]
  for (const p of paths) pendingDelete.add(p)
  if (deleteTimer) clearTimeout(deleteTimer)
  deleteTimer = setTimeout(() => {
    deleteTimer = null
    flushDeletes().catch(() => {})
  }, KB_SYNC_DEBOUNCE_MS)
}

async function flushDeletes(): Promise<void> {
  if (fullSyncInProgress || flushInProgress) {
    // Reschedule so pending items are not lost.
    if (!deleteTimer) {
      deleteTimer = setTimeout(() => {
        deleteTimer = null
        flushDeletes().catch(() => {})
      }, KB_SYNC_DEBOUNCE_MS)
    }
    return
  }
  if (pendingDelete.size === 0) return

  const paths = Array.from(pendingDelete)
  pendingDelete.clear()

  const r2 = await getR2Client()
  if (!r2) return

  flushInProgress = true
  try {
    const snapshot = await readLocalSnapshot()
    const snapshotEntries = snapshot?.entries ?? []

    const successDeleted = new Set<string>()
    for (let i = 0; i < paths.length; i += DELETE_BATCH_SIZE) {
      const batch = paths.slice(i, i + DELETE_BATCH_SIZE)
      try {
        await r2.deleteObjects(batch)
        for (const relPath of batch) {
          successDeleted.add(relPath)
          logger.info('KB sync incremental deleted', { relPath })
        }
      } catch (err: any) {
        logger.warn('KB sync incremental delete batch failed', {
          error: err?.message,
          batchStart: i,
          batchSize: batch.length
        })
      }
    }

    const removedSize = snapshotEntries
      .filter((e) => successDeleted.has(e.relPath) && !isKbSyncExcludedRelPath(e.relPath))
      .reduce((acc, e) => acc + e.size, 0)
    const newEntries = snapshotEntries.filter((e) => !successDeleted.has(e.relPath))
    await writeLocalSnapshot(newEntries, Math.max(0, (snapshot?.usedBytes ?? 0) - removedSize))

    // Update R2 manifest.
    try {
      await writeR2Manifest(r2, newEntries)
    } catch (e: any) {
      logger.warn('KB sync: failed to write R2 manifest after incremental delete', { error: e?.message })
    }
  } finally {
    flushInProgress = false
  }
}

// --- Watcher & lifecycle ---

export function startKbSync(): void {
  if (watcher) return
  const root = getKbRoot()
  import('chokidar').then((chokidarMod) => {
    const chokidar = chokidarMod.default
    watcher = chokidar.watch(root, {
      ignored: (p: string) => path.basename(p) === KB_SYNC_EXCLUDED_BASENAME,
      ignoreInitial: true
    })
    // add/change: upload + search index.
    watcher.on('add', (absPath?: string) => {
      if (!absPath) return
      const rel = absToRelPath(absPath)
      if (rel && !isKbSyncExcludedRelPath(rel)) {
        scheduleUpload(rel)
        getKbSearchManager()?.onFileChanged(rel)
      }
    })
    watcher.on('change', (absPath?: string) => {
      if (!absPath) return
      const rel = absToRelPath(absPath)
      if (rel && !isKbSyncExcludedRelPath(rel)) {
        scheduleUpload(rel)
        getKbSearchManager()?.onFileChanged(rel)
      }
    })
    // unlink: delete + search index cleanup.
    watcher.on('unlink', (absPath?: string) => {
      if (!absPath) return
      const rel = absToRelPath(absPath)
      if (rel && !isKbSyncExcludedRelPath(rel)) {
        scheduleDelete(rel)
        getKbSearchManager()?.onFileRemoved(rel)
      }
    })
    logger.info('KB sync watcher started', { root })
  })
  runKbFullSync().catch(() => {})
}

export async function stopKbSync(): Promise<void> {
  if (uploadTimer) {
    clearTimeout(uploadTimer)
    uploadTimer = null
  }
  if (deleteTimer) {
    clearTimeout(deleteTimer)
    deleteTimer = null
  }
  pendingUpload.clear()
  pendingDelete.clear()
  if (watcher) {
    await watcher.close()
    watcher = null
  }
  logger.info('KB sync stopped')
}

export async function runKbSyncOnce(): Promise<void> {
  await runKbFullSync()
}

export function getKbSyncLastSyncTime(): Promise<number | null> {
  return readLocalSnapshot().then((s) => s?.updatedAt ?? null)
}

export function getKbSyncStatus(): { status: 'idle' | 'syncing' } {
  return { status: fullSyncInProgress || flushInProgress ? 'syncing' : 'idle' }
}

export async function getKbCloudUsedBytes(): Promise<number> {
  const snapshot = await readLocalSnapshot()
  return snapshot?.usedBytes ?? 0
}

export const __testOnly = {
  scheduleDelete,
  flushDeletes,
  addPendingDelete: (relPaths: string[]) => {
    for (const p of relPaths) pendingDelete.add(p)
  },
  getPendingDeleteSize: () => pendingDelete.size,
  getFlags: () => ({ fullSyncInProgress, flushInProgress, hasDeleteTimer: deleteTimer !== null }),
  resetState: () => {
    if (uploadTimer) {
      clearTimeout(uploadTimer)
      uploadTimer = null
    }
    if (deleteTimer) {
      clearTimeout(deleteTimer)
      deleteTimer = null
    }
    pendingUpload.clear()
    pendingDelete.clear()
    fullSyncInProgress = false
    flushInProgress = false
  }
}
