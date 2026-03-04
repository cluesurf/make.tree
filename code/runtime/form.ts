/**
 * Runtime types.
 *
 * The runtime receives compiled output and manages HVM execution.
 * It does not compile, watch files, or know about source syntax.
 */

/** Compiled output received by the runtime. */
export type CompileOutput = {
  /** Generated HVM code. */
  code: string
  /** All source files involved in the compilation. */
  files: string[]
  /** The definition book. */
  book: Map<string, unknown>
}

/** Per-file state tracked by the Runtime. */
export type CardState = {
  /** Absolute file path. */
  file: string
  /** Generated HVM code for this file's definitions. */
  code: string
  /** Definition names contributed by this file. */
  names: string[]
}

/** Result of a hot-swap operation. */
export type SwapResult = {
  /** The file that was swapped. */
  file: string
  /** Definition names that changed. */
  changed: string[]
}
