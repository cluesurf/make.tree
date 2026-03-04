/**
 * File-based cache store for incremental compilation.
 *
 * Stores cached artifacts at `.seed/cache/` relative to the project root:
 *   meta.json          - compiler version, creation time
 *   index.json         - file path -> content hash mapping
 *   graph.json         - dependency graph
 *   files/<hash>/      - per-file cached data
 *     card.json        - SurfCard (Phase 0+1)
 *     code.json        - generated code (Phase 5)
 */

import * as fs from 'fs'
import * as path from 'path'

export type CacheMeta = {
  version: string
  created: number
}

export type CacheIndex = {
  files: Record<string, string>
}

export type CacheStore = {
  root: string
  getMeta(): CacheMeta | null
  setMeta(input: { meta: CacheMeta }): void
  getIndex(): CacheIndex
  setIndex(input: { index: CacheIndex }): void
  read(input: { hash: string; phase: string }): unknown | null
  write(input: { hash: string; phase: string; data: unknown }): void
  has(input: { hash: string; phase: string }): boolean
  readRaw(input: { name: string }): string | null
  writeRaw(input: { name: string; data: string }): void
  clear(): void
}

export function createStore(input: { root: string }): CacheStore {
  const cacheDir = path.join(input.root, '.seed', 'cache')
  const filesDir = path.join(cacheDir, 'files')

  function ensureDir(dir: string): void {
    fs.mkdirSync(dir, { recursive: true })
  }

  function filePath(hash: string, phase: string): string {
    return path.join(filesDir, hash, `${phase}.json`)
  }

  return {
    root: cacheDir,

    getMeta() {
      try {
        const raw = fs.readFileSync(path.join(cacheDir, 'meta.json'), 'utf-8')
        return JSON.parse(raw) as CacheMeta
      } catch {
        return null
      }
    },

    setMeta(input) {
      ensureDir(cacheDir)
      fs.writeFileSync(
        path.join(cacheDir, 'meta.json'),
        JSON.stringify(input.meta, null, 2),
      )
    },

    getIndex() {
      try {
        const raw = fs.readFileSync(path.join(cacheDir, 'index.json'), 'utf-8')
        return JSON.parse(raw) as CacheIndex
      } catch {
        return { files: {} }
      }
    },

    setIndex(input) {
      ensureDir(cacheDir)
      fs.writeFileSync(
        path.join(cacheDir, 'index.json'),
        JSON.stringify(input.index, null, 2),
      )
    },

    read(input) {
      try {
        const raw = fs.readFileSync(filePath(input.hash, input.phase), 'utf-8')
        return JSON.parse(raw)
      } catch {
        return null
      }
    },

    write(input) {
      const dir = path.join(filesDir, input.hash)
      ensureDir(dir)
      fs.writeFileSync(
        filePath(input.hash, input.phase),
        JSON.stringify(input.data),
      )
    },

    has(input) {
      return fs.existsSync(filePath(input.hash, input.phase))
    },

    readRaw(input) {
      try {
        return fs.readFileSync(path.join(cacheDir, input.name), 'utf-8')
      } catch {
        return null
      }
    },

    writeRaw(input) {
      ensureDir(cacheDir)
      fs.writeFileSync(path.join(cacheDir, input.name), input.data)
    },

    clear() {
      fs.rmSync(cacheDir, { recursive: true, force: true })
    },
  }
}
