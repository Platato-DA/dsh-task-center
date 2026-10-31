/**
 * Artifact discovery: after a run, which files did it actually produce or
 * refresh inside its working folder? The run record links those paths so
 * "succeeded" can be checked against a real file on disk instead of a promise.
 */

import { readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { ArtifactRef } from '../shared/types.ts'

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  '.next',
  '.cache',
  '.venv',
  '__pycache__',
])

export interface ScanOptions {
  /** Only files touched at or after this instant count as produced by the run. */
  sinceMs: number
  /** Guard rails for huge folders. */
  maxDepth?: number
  maxFiles?: number
  /** Folders whose contents are bookkeeping, never deliverables. */
  exclude?: string[]
}

/**
 * Collect files under `root` modified since `sinceMs`.
 * Symlinked directories are skipped so a scan cannot walk out of the folder.
 */
export function scanArtifacts(root: string, options: ScanOptions): ArtifactRef[] {
  const maxDepth = options.maxDepth ?? 3
  const maxFiles = options.maxFiles ?? 500
  const found: ArtifactRef[] = []
  const since = options.sinceMs - 1000
  const excluded = (options.exclude ?? []).map((entry) => resolve(entry))

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || found.length >= maxFiles) return
    let entries: import('node:fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (found.length >= maxFiles) return
      if (entry.isSymbolicLink()) continue
      // Hidden entries are state (`.dsh-task-center`, VCS dirs, editor junk).
      if (entry.name.startsWith('.') || entry.name === 'state.json') continue
      const full = join(dir, entry.name)
      if (excluded.some((prefix) => full === prefix || full.startsWith(`${prefix}${sep}`))) continue
      if (entry.isDirectory()) {
        // Dot directories hold the plugin's own cross-run state, not deliverables.
        if (SKIP_DIRS.has(entry.name)) continue
        walk(full, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      let stat: import('node:fs').Stats
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.mtimeMs < since) continue
      found.push({
        path: full,
        size: stat.size,
        mtime: new Date(stat.mtimeMs).toISOString(),
      })
    }
  }

  walk(root, 0)
  found.sort((left, right) => right.mtime.localeCompare(left.mtime))
  return found
}

/** Human byte size for cards and details. */
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}
