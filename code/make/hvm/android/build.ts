// android/build.ts - Build libhvm.so for Android (arm64-v8a + x86_64).
//
// Output:
//   build/android/arm64-v8a/libhvm.so
//   build/android/x86_64/libhvm.so
//
// Env:
//   HVM_SRC       - path to fork-HVM4/clang (default: auto-resolved)
//   ANDROID_NDK   - path to NDK (default: $HOME/Library/Android/sdk/ndk/*)
//   ANDROID_API   - minimum API level (default: "26")
//   HEAP_CAP_BITS - heap size exponent (default: "30")
//   MAX_THREADS   - max worker threads (default: "4")

import { exec, buildDir } from '../tool'
import { resolve, dirname } from 'path'
import { mkdirSync, readdirSync } from 'fs'
import { homedir } from 'os'

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const OUT = buildDir({ platform: 'android' })
const API = process.env.ANDROID_API ?? '26'
const HEAP_BITS = process.env.HEAP_CAP_BITS ?? '30'
const THREADS = process.env.MAX_THREADS ?? '4'

const DEFS = [`-DHEAP_CAP_BITS=${HEAP_BITS}`, `-DMAX_THREADS=${THREADS}`]

type Abi = {
  name: string
  prefix: string
}

const ABIS: Abi[] = [
  { name: 'arm64-v8a', prefix: `aarch64-linux-android${API}-clang` },
  { name: 'x86_64', prefix: `x86_64-linux-android${API}-clang` },
]

function findNdk(): string {
  if (process.env.ANDROID_NDK) {
    return process.env.ANDROID_NDK
  }
  const sdkNdk = resolve(homedir(), 'Library', 'Android', 'sdk', 'ndk')
  try {
    const versions = readdirSync(sdkNdk).filter(d => !d.startsWith('.'))
    if (versions.length === 0) {
      throw new Error('No NDK versions found')
    }
    versions.sort()
    return resolve(sdkNdk, versions[versions.length - 1]!)
  } catch {
    throw new Error(
      'Cannot find Android NDK. Set ANDROID_NDK env var.',
    )
  }
}

function ndkCompiler(input: { ndk: string, prefix: string }): string {
  const host = process.platform === 'darwin' ? 'darwin-x86_64' : 'linux-x86_64'
  return resolve(input.ndk, 'toolchains', 'llvm', 'prebuilt', host, 'bin', input.prefix)
}

async function main() {
  const ndk = findNdk()
  console.log(`NDK: ${ndk}`)

  const exportMap = resolve(SCRIPT_DIR, 'hvm-exports.map')

  for (const abi of ABIS) {
    const cc = ndkCompiler({ ndk, prefix: abi.prefix })
    const abiDir = resolve(OUT, abi.name)
    mkdirSync(abiDir, { recursive: true })

    await exec({
      cmd: cc,
      args: [
        '-O2', '-shared', '-fPIC',
        'lib.c',
        '-o', resolve(abiDir, 'libhvm.so'),
        ...DEFS,
        '-lm',
        `-Wl,--version-script=${exportMap}`,
      ],
    })

    console.log(`  ${abi.name}: ${abiDir}/libhvm.so`)
  }

  console.log(`\nAndroid: ${OUT}/`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
