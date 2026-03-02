// windows/build.ts - Build hvm.lib for Windows (clang-cl or MSVC).
//
// Output:
//   build/windows/hvm.lib  (static library)
//   build/windows/hvm.dll  (shared library, optional)
//
// Env:
//   HVM_SRC       - path to fork-HVM4/clang (default: auto-resolved)
//   HEAP_CAP_BITS - heap size exponent (default: "38")
//   MAX_THREADS   - max worker threads (default: "64")
//   CC            - compiler: "clang-cl" or "cl" (default: "clang-cl")
//   BUILD_DLL     - "1" to also build hvm.dll (default: "0")

import { exec, buildDir, clean } from '../tool'
import { resolve } from 'path'

const OUT = buildDir({ platform: 'windows' })
const CC = process.env.CC ?? 'clang-cl'
const HEAP_BITS = process.env.HEAP_CAP_BITS ?? '38'
const THREADS = process.env.MAX_THREADS ?? '64'
const BUILD_DLL = process.env.BUILD_DLL === '1'

const DEFS = [`-DHEAP_CAP_BITS=${HEAP_BITS}`, `-DMAX_THREADS=${THREADS}`]

async function main() {
  const obj = resolve(OUT, 'hvm.obj')
  const lib = resolve(OUT, 'hvm.lib')

  if (CC === 'cl') {
    await exec({
      cmd: 'cl',
      args: [
        '/O2', '/c', 'lib.c',
        `/Fo${obj}`,
        '/std:c17',
        `/DHEAP_CAP_BITS=${HEAP_BITS}`,
        `/DMAX_THREADS=${THREADS}`,
      ],
    })
    await exec({ cmd: 'lib', args: [`/OUT:${lib}`, obj] })
  } else {
    await exec({
      cmd: 'clang-cl',
      args: [
        '/O2', '/c', 'lib.c',
        `/Fo${obj}`,
        ...DEFS,
      ],
    })
    await exec({ cmd: 'lib', args: [`/OUT:${lib}`, obj] })
  }

  clean({ path: obj })
  console.log(`\nWindows: ${lib}`)

  if (BUILD_DLL) {
    const dll = resolve(OUT, 'hvm.dll')
    if (CC === 'cl') {
      await exec({
        cmd: 'cl',
        args: [
          '/O2', '/LD', 'lib.c',
          `/Fe${dll}`,
          '/std:c17',
          `/DHEAP_CAP_BITS=${HEAP_BITS}`,
          `/DMAX_THREADS=${THREADS}`,
          '/DHVM_BUILD_DLL',
        ],
      })
    } else {
      await exec({
        cmd: 'clang-cl',
        args: [
          '/O2', '/LD', 'lib.c',
          `/Fe${dll}`,
          ...DEFS,
          '-DHVM_BUILD_DLL',
        ],
      })
    }
    console.log(`Windows: ${dll}`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
