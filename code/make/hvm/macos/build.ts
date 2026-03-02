// macos/build.ts - Build libhvm.a for macOS (arm64 + x86_64 universal).
//
// Output: build/macos/libhvm.a
//
// Env:
//   HVM_SRC    - path to fork-HVM4/clang (default: auto-resolved)
//   MACOS_ARCH - "arm64", "x86_64", or "universal" (default: "universal")

import { exec, buildDir, clean } from '../tool'
import { resolve } from 'path'

const OUT = buildDir({ platform: 'macos' })
const ARCH = process.env.MACOS_ARCH ?? 'universal'

async function main() {
  if (ARCH === 'universal') {
    const arm64 = resolve(OUT, 'hvm-arm64.o')
    const x86 = resolve(OUT, 'hvm-x86-64.o')
    const uni = resolve(OUT, 'hvm-universal.o')
    const lib = resolve(OUT, 'libhvm.a')

    await exec({ cmd: 'clang', args: ['-O2', '-c', 'lib.c', '-o', arm64, '-arch', 'arm64'] })
    await exec({ cmd: 'clang', args: ['-O2', '-c', 'lib.c', '-o', x86, '-arch', 'x86_64'] })
    await exec({ cmd: 'lipo', args: ['-create', arm64, x86, '-output', uni] })
    await exec({ cmd: 'ar', args: ['rcs', lib, uni] })

    clean({ path: arm64 })
    clean({ path: x86 })
    clean({ path: uni })
  } else {
    const obj = resolve(OUT, 'hvm.o')
    const lib = resolve(OUT, 'libhvm.a')

    await exec({ cmd: 'clang', args: ['-O2', '-c', 'lib.c', '-o', obj, '-arch', ARCH] })
    await exec({ cmd: 'ar', args: ['rcs', lib, obj] })

    clean({ path: obj })
  }

  console.log(`\nmacOS: ${OUT}/libhvm.a`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
