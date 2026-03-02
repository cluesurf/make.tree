// tool.ts - Shared helpers for HVM platform build scripts.

import { spawn, execSync } from 'child_process'
import { mkdirSync, rmSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'

export const HVM_DIR = resolve(
  dirname(new URL(import.meta.url).pathname),
)

export const HVM_SRC = process.env.HVM_SRC

export const HVM_OUTPUT =
  process.env.HVM_OUTPUT_PATH ?? resolve(process.cwd(), 'host', 'hvm')

export function buildDir(input: { platform: string }): string {
  const dir = resolve(HVM_OUTPUT, input.platform)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function clean(input: { path: string }) {
  if (existsSync(input.path)) {
    rmSync(input.path, { recursive: true })
  }
}

export function exec(input: {
  args: string[]
  cmd: string
  cwd?: string
}): Promise<void> {
  return new Promise((ok, fail) => {
    console.log(`  $ ${input.cmd} ${input.args.join(' ')}`)
    const child = spawn(input.cmd, input.args, {
      cwd: input.cwd ?? HVM_SRC,
      stdio: 'inherit',
    })
    child.on('close', code => {
      if (code !== 0) {
        fail(new Error(`${input.cmd} exited with code ${code}`))
      } else {
        ok()
      }
    })
    child.on('error', fail)
  })
}

export function execCapture(input: {
  args: string[]
  cmd: string
}): string {
  return execSync(`${input.cmd} ${input.args.join(' ')}`)
    .toString()
    .trim()
}
