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
    const arm64Obj = resolve(OUT, 'hvm-arm64.o')
    const arm64Lib = resolve(OUT, 'libhvm-arm64.a')
    const x86Obj = resolve(OUT, 'hvm-x86-64.o')
    const x86Lib = resolve(OUT, 'libhvm-x86-64.a')
    const lib = resolve(OUT, 'libhvm.a')

    await exec({ cmd: 'clang', args: ['-O2', '-c', 'lib.c', '-o', arm64Obj, '-arch', 'arm64'] })
    await exec({ cmd: 'libtool', args: ['-static', '-o', arm64Lib, arm64Obj] })
    await exec({ cmd: 'clang', args: ['-O2', '-c', 'lib.c', '-o', x86Obj, '-arch', 'x86_64'] })
    await exec({ cmd: 'libtool', args: ['-static', '-o', x86Lib, x86Obj] })
    await exec({ cmd: 'lipo', args: ['-create', arm64Lib, x86Lib, '-output', lib] })

    clean({ path: arm64Obj })
    clean({ path: arm64Lib })
    clean({ path: x86Obj })
    clean({ path: x86Lib })
  } else {
    const obj = resolve(OUT, 'hvm.o')
    const lib = resolve(OUT, 'libhvm.a')

    await exec({ cmd: 'clang', args: ['-O2', '-c', 'lib.c', '-o', obj, '-arch', ARCH] })
    await exec({ cmd: 'libtool', args: ['-static', '-o', lib, obj] })

    clean({ path: obj })
  }

  console.log(`\nmacOS: ${OUT}/libhvm.a`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
