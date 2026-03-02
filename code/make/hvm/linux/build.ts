// linux/build.ts - Build libhvm.a for Linux.
//
// Output: host/hvm/linux/libhvm.a
//
// Uses default HEAP_CAP_BITS=38 (256GB) and MAX_THREADS=64.
//
// Env:
//   HVM_SRC       - path to fork-HVM4/clang (default: auto-resolved)
//   HEAP_CAP_BITS - heap size exponent (default: "38")
//   MAX_THREADS   - max worker threads (default: "64")
//   CC            - C compiler (default: "clang")

import { exec, buildDir, clean } from '../tool'
import { resolve } from 'path'

const OUT = buildDir({ platform: 'linux' })
const CC = process.env.CC ?? 'clang'
const HEAP_BITS = process.env.HEAP_CAP_BITS ?? '38'
const THREADS = process.env.MAX_THREADS ?? '64'

async function main() {
  const obj = resolve(OUT, 'hvm.o')
  const lib = resolve(OUT, 'libhvm.a')

  await exec({
    cmd: CC,
    args: [
      '-O2', '-c', 'lib.c',
      '-o', obj,
      `-DHEAP_CAP_BITS=${HEAP_BITS}`,
      `-DMAX_THREADS=${THREADS}`,
    ],
  })

  await exec({ cmd: 'ar', args: ['rcs', lib, obj] })

  clean({ path: obj })

  console.log(`\nLinux: ${lib}`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
