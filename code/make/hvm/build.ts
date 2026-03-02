// build.ts - Top-level HVM library build for all platforms.
//
// Usage: npx tsx code/make/hvm/build.ts [platform...]
//
// Platforms: macos, ios, android, wasm, server, windows
// No args = build all platforms.

import { spawn } from 'child_process'
import { resolve, dirname } from 'path'
import { HVM_SRC } from './tool'

const PLATFORMS = [
  'macos',
  'ios',
  'android',
  'wasm',
  'server',
  'windows',
]

function run(input: {
  cmd: string
  args: string[]
  env?: Record<string, string>
}): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(input.cmd, input.args, {
      env: { ...process.env, HVM_SRC, ...input.env },
      stdio: 'inherit',
    })
    child.on('close', code => {
      if (code !== 0) {
        fail(new Error(`${input.cmd} ${input.args.join(' ')} exited with ${code}`))
      } else {
        ok()
      }
    })
    child.on('error', fail)
  })
}

async function buildPlatform(input: { platform: string }) {
  const script = resolve(
    dirname(new URL(import.meta.url).pathname),
    input.platform,
    'build.ts',
  )
  console.log(`\n=== Building HVM for ${input.platform} ===\n`)
  await run({ cmd: 'npx', args: ['tsx', script] })
}

async function main() {
  const args = process.argv.slice(2)
  const targets = args.length > 0 ? args : PLATFORMS

  for (const target of targets) {
    if (!PLATFORMS.includes(target)) {
      console.error(`Unknown platform: ${target}`)
      console.error(`Available: ${PLATFORMS.join(', ')}`)
      process.exit(1)
    }
    await buildPlatform({ platform: target })
  }

  console.log('\nDone.')
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
