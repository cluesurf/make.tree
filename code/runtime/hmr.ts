/**
 * Hot Module Replacement orchestrator.
 *
 * Watches source files for changes, recompiles them, and swaps the
 * new definitions into the Runtime. Emits events for consumers
 * (dev servers, REPLs, editors).
 *
 * The Hmr class ties together the compiler pipeline and the Runtime
 * hot-swap mechanism. It does not own the Runtime. The caller creates
 * a Runtime, loads the initial compilation, then hands it to Hmr for
 * ongoing watch and reload.
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
  | { kind: 'swap'; file: string; changed: string[] }
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
}

export class Hmr {
  private runtime: Runtime
  private options: HmrOptions
  private watcher: fs.FSWatcher | null = null
  private listeners: Array<(event: HmrEvent) => void> = []

  constructor(options: HmrOptions) {
    this.runtime = options.runtime
    this.options = options
  }

  /** Register an event listener. */
  on(listener: (event: HmrEvent) => void): void {
    this.listeners.push(listener)
  }

  /** Start watching for .tree file changes. */
  start(): void {
    this.watcher = fs.watch(
      this.options.root,
      { recursive: true },
      (event, filename) => {
        if (filename && filename.endsWith('.tree')) {
          this.handleChange({ file: filename })
        }
      },
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
    })
  }

  /** Stop watching. */
  stop(): void {
    this.watcher?.close()
    this.watcher = null
  }

  private emit(event: HmrEvent): void {
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
