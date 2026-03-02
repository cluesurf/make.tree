// wasm/build.ts - Build HVM as a size-optimized WASM module.
//
// Output:
//   build/wasm/hvm.mjs  (JS glue)
//   build/wasm/hvm.wasm (WASM binary)
//
// Env:
//   HVM_SRC       - path to fork-HVM4/clang (default: auto-resolved)
//   HEAP_CAP_BITS - heap size exponent (default: "26")

import { exec, buildDir } from '../tool'
import { resolve } from 'path'

const OUT = buildDir({ platform: 'wasm' })
const HEAP_BITS = process.env.HEAP_CAP_BITS ?? '26'

const EXPORTED_FUNCTIONS = [
  '_hvm_init',
  '_hvm_free',
  '_hvm_wnf',
  '_hvm_normalize',
  '_hvm_prepare',
  '_hvm_prepare_text',
  '_hvm_term_new_num',
  '_hvm_term_new_ctr',
  '_hvm_term_new_sup',
  '_hvm_term_new_dup',
  '_hvm_term_new_app',
  '_hvm_term_new_lam',
  '_hvm_term_new_lam_at',
  '_hvm_term_new_var',
  '_hvm_term_new_ref',
  '_hvm_term_tag',
  '_hvm_term_ext',
  '_hvm_term_val',
  '_hvm_heap_read',
  '_hvm_heap_set',
  '_hvm_heap_alloc',
  '_hvm_table_find',
  '_hvm_prim_register',
]

async function main() {
  const output = resolve(OUT, 'hvm.mjs')

  await exec({
    cmd: 'emcc',
    args: [
      'lib.c', '-Oz',
      '-s', 'WASM=1',
      '-s', 'MODULARIZE=1',
      '-s', 'MINIMAL_RUNTIME=1',
      '-s', 'FILESYSTEM=0',
      '-s', 'ASSERTIONS=0',
      '-s', 'MALLOC=emmalloc',
      '-s', 'INITIAL_MEMORY=16MB',
      '-s', 'ALLOW_MEMORY_GROWTH=1',
      '-s', 'MAXIMUM_MEMORY=2GB',
      '-s', `EXPORTED_FUNCTIONS=${JSON.stringify(EXPORTED_FUNCTIONS)}`,
      '-s', 'EXPORTED_RUNTIME_METHODS=["ccall","cwrap"]',
      `-DHEAP_CAP_BITS=${HEAP_BITS}`,
      '-DMAX_THREADS=1',
      '-DHVM_NO_PARSER',
      '-DHVM_NO_PRINT',
      '-DHVM_NO_COLLAPSE',
      '--closure', '1',
      '-flto',
      '-o', output,
    ],
  })

  // Post-build optimization with wasm-opt (if available)
  const wasmFile = resolve(OUT, 'hvm.wasm')
  const optFile = resolve(OUT, 'hvm.opt.wasm')

  try {
    await exec({ cmd: 'wasm-opt', args: ['-Oz', wasmFile, '-o', optFile] })
    console.log(`  Optimized: ${optFile}`)
  } catch {
    console.log('  wasm-opt not found, skipping post-build optimization')
  }

  console.log(`\nWASM: ${OUT}/`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
