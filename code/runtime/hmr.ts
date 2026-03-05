/**
 * Hot Module Replacement orchestrator.
 *
 * Watches source files for changes, recompiles them, and swaps the
 * new definitions into the Runtime. Emits events for consumers
 * (dev servers, REPLs, editors).
 *
 * Signature firewall: when a file changes, only body changes that
 * don't alter function signatures are local. If a signature changes,
 * all transitive dependents are notified for rechecking.
 *
 * Usage:
 *   const rt = new Runtime()
 *   rt.load({ output: initialOutput })
 *   const hmr = new Hmr({
 *     root: '/project',
 *     runtime: rt,
 *     compile: (input) => compileText(input),
 *   })
 *   hmr.on((event) => console.log(event))
 *   hmr.start()
 *   // ... later
 *   hmr.stop()
 */

import * as fs from 'fs'
import * as path from 'path'
import { Runtime } from '@/runtime'
import type { CompileOutput } from '@/runtime/form'

export type HmrEvent =
  | { kind: 'swap'; file: string; changed: string[]; dependents: string[] }
  | { kind: 'error'; file: string; errors: Array<{ message: string }> }

export type CompileFileResult = {
  code: string
  errors: Array<{ message: string }>
  files: string[]
  book: Map<string, unknown>
}

export type HmrOptions = {
  root: string
  runtime: Runtime
  compile: (input: { file: string; text: string }) => CompileFileResult
  /** Callback invoked when dependents need rechecking. */
  onDependentsInvalidated?: (input: { file: string; dependents: string[] }) => void
}

export class Hmr {
  private runtime: Runtime
  private options: HmrOptions
  private watcher: fs.FSWatcher | null = null
  private listeners: Array<(event: HmrEvent) => void> = []
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(options: HmrOptions) {
    this.runtime = options.runtime
    this.options = options
  }

  /** Register an event listener. */
  on(listener: (event: HmrEvent) => void): void {
    this.listeners.push(listener)
  }

  /** Remove an event listener. */
  off(listener: (event: HmrEvent) => void): void {
    const idx = this.listeners.indexOf(listener)
    if (idx >= 0) this.listeners.splice(idx, 1)
  }

  /** Start watching for .tree file changes. */
  start(): void {
    this.watcher = fs.watch(
      this.options.root,
      { recursive: true },
      (event, filename) => {
        if (filename && filename.endsWith('.tree')) {
          this.debounceChange({ file: filename })
        }
      },
    )
  }

  /** Debounce rapid file changes (e.g., save + format). */
  private debounceChange(input: { file: string }): void {
    const existing = this.debounceTimers.get(input.file)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(
      input.file,
      setTimeout(() => {
        this.debounceTimers.delete(input.file)
        this.handleChange({ file: input.file })
      }, 50),
    )
  }

  /** Handle a single file change: recompile and swap. */
  handleChange(input: { file: string; text?: string }): void {
    let text: string
    if (input.text != null) {
      text = input.text
    } else {
      const fullPath = path.resolve(this.options.root, input.file)
      try {
        text = fs.readFileSync(fullPath, 'utf-8')
      } catch {
        return
      }
    }

    const result = this.options.compile({
      file: input.file,
      text,
    })

    if (result.errors.length > 0) {
      this.emit({
        kind: 'error',
        file: input.file,
        errors: result.errors,
      })
      return
    }

    const output: CompileOutput = {
      code: result.code,
      files: result.files,
      book: result.book,
    }

    const swapResult = this.runtime.swap({
      file: input.file,
      output,
    })

    this.emit({
      kind: 'swap',
      file: input.file,
      changed: swapResult.changed,
      dependents: swapResult.dependents,
    })

    // Notify about dependent invalidation if signatures changed
    if (swapResult.signatureChanged && swapResult.dependents.length > 0) {
      this.options.onDependentsInvalidated?.({
        file: input.file,
        dependents: swapResult.dependents,
      })
    }
  }

  /** Stop watching. */
  stop(): void {
    this.watcher?.close()
    this.watcher = null
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  private emit(event: HmrEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
