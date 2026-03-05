/**
 * Runtime types.
 *
 * The runtime receives compiled output and manages HVM execution.
 * It does not compile, watch files, or know about source syntax.
 */

/** Compiled output received by the runtime. */
export type CompileOutput = {
  /** Generated code (HVM or native). */
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
  /** Generated code for this file's definitions. */
  code: string
  /** Definition names contributed by this file. */
  names: string[]
  /** Files this card imports. */
  deps: string[]
  /** Signature hashes for each definition (for firewall). */
  signatures: Map<string, string>
}

/** Result of a hot-swap operation. */
export type SwapResult = {
  /** The file that was swapped. */
  file: string
  /** Definition names that changed. */
  changed: string[]
  /** Definition names that were removed. */
  removed: string[]
  /** Definition names that were added. */
  added: string[]
  /** Whether any signatures changed (triggers dependent recheck). */
  signatureChanged: boolean
  /** Files that need rechecking due to signature changes. */
  dependents: string[]
}

/** Runtime configuration. */
export type RuntimeConfig = {
  /** Enable HVM WASM bridge for pure definitions. */
  hvm?: boolean
}
