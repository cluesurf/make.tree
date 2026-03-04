// load.ts - WASM module loader.
//
// Loads the Emscripten-generated hvm.mjs module and returns
// a typed HvmApi.

import { createApi } from './bind'
import type { HvmApi, HvmModule } from './bind'

export type LoadInput = {
  // Path or URL to the hvm.mjs glue file.
  // In a bundler this might be an import, in Node.js a file path.
  moduleFn: () => Promise<{
    default: (opts?: Record<string, unknown>) => Promise<HvmModule>
  }>

  // Optional Emscripten module overrides (e.g., locateFile for custom
  // .wasm path).
  overrides?: Record<string, unknown>
}

export async function load(input: LoadInput): Promise<HvmApi> {
  const imported = await input.moduleFn()
  const factory = imported.default
  const module = await factory(input.overrides)
  return createApi({ module })
}
