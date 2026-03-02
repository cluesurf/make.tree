// ios/build.ts - Build HVM.xcframework for iOS (device + simulator).
//
// Output: build/ios/HVM.xcframework/
//
// Env:
//   HVM_SRC         - path to fork-HVM4/clang (default: auto-resolved)
//   IOS_MIN_VERSION - minimum iOS version (default: "16.0")
//   HEAP_CAP_BITS   - heap size exponent (default: "30")
//   MAX_THREADS     - max worker threads (default: "4")

import { exec, execCapture, buildDir, clean, HVM_SRC } from '../tool'
import { resolve, dirname } from 'path'
import { mkdirSync, copyFileSync } from 'fs'

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname)
const OUT = buildDir({ platform: 'ios' })
const IOS_MIN = process.env.IOS_MIN_VERSION ?? '16.0'
const HEAP_BITS = process.env.HEAP_CAP_BITS ?? '30'
const THREADS = process.env.MAX_THREADS ?? '4'

const DEFS = [`-DHEAP_CAP_BITS=${HEAP_BITS}`, `-DMAX_THREADS=${THREADS}`]

function sdkPath(input: { sdk: string }): string {
  return execCapture({ cmd: 'xcrun', args: ['--sdk', input.sdk, '--show-sdk-path'] })
}

async function main() {
  const deviceObj = resolve(OUT, 'hvm-device.o')
  const deviceLib = resolve(OUT, 'libhvm-device.a')
  const simObj = resolve(OUT, 'hvm-sim.o')
  const simLib = resolve(OUT, 'libhvm-sim.a')
  const headerDir = resolve(OUT, 'headers')
  const xcf = resolve(OUT, 'HVM.xcframework')

  // Device (arm64)
  await exec({
    cmd: 'xcrun',
    args: [
      '-sdk', 'iphoneos', 'clang', '-O2', '-c', 'lib.c',
      '-o', deviceObj,
      '-arch', 'arm64',
      `-miphoneos-version-min=${IOS_MIN}`,
      ...DEFS,
      '-fembed-bitcode=off',
      '-isysroot', sdkPath({ sdk: 'iphoneos' }),
    ],
  })
  await exec({ cmd: 'ar', args: ['rcs', deviceLib, deviceObj] })

  // Simulator (arm64, Apple Silicon)
  await exec({
    cmd: 'xcrun',
    args: [
      '-sdk', 'iphonesimulator', 'clang', '-O2', '-c', 'lib.c',
      '-o', simObj,
      '-arch', 'arm64',
      `-miphonesimulator-version-min=${IOS_MIN}`,
      ...DEFS,
      '-fembed-bitcode=off',
      '-isysroot', sdkPath({ sdk: 'iphonesimulator' }),
    ],
  })
  await exec({ cmd: 'ar', args: ['rcs', simLib, simObj] })

  // Prepare headers for XCFramework
  mkdirSync(headerDir, { recursive: true })
  copyFileSync(resolve(HVM_SRC, 'hvm_lib.h'), resolve(headerDir, 'hvm_lib.h'))
  copyFileSync(
    resolve(SCRIPT_DIR, 'module.modulemap'),
    resolve(headerDir, 'module.modulemap'),
  )

  // Create XCFramework
  clean({ path: xcf })
  await exec({
    cmd: 'xcodebuild',
    args: [
      '-create-xcframework',
      '-library', deviceLib, '-headers', headerDir,
      '-library', simLib, '-headers', headerDir,
      '-output', xcf,
    ],
  })

  // Clean intermediates
  clean({ path: deviceObj })
  clean({ path: simObj })
  clean({ path: deviceLib })
  clean({ path: simLib })
  clean({ path: headerDir })

  console.log(`\niOS: ${xcf}`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
