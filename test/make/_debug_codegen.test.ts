import { it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castNode } from '@/cast/node'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castSwift } from '@/cast/swift'
import type { SurfLoad } from '@/surf/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js')
const makeTree = require_(treeParsePath).default
const CASE_ROOT = path.resolve(__dirname, '../../../base.tree/code/native')

function compile(filePath: string) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lead = makeTree({ file: filePath, text })
  const rawCard = readCard({ tree: lead.tree, file: filePath })
  const card = expandFuse({ card: rawCard })
  const dock = card.list
    .filter((n): n is SurfLoad => n.form === 'load' && (n as SurfLoad).dock === true)
    .map(n => ({ path: n.path[0] ?? '', name: n.name }))
  const { book } = desugarCard({ card })
  return { book, dock }
}

function logAll(label: string, filePath: string) {
  const { book, dock } = compile(filePath)
  console.log(`\n=== ${label} NODE ===`)
  console.log(castNode({ book, dock }))
  console.log(`\n=== ${label} RUST ===`)
  console.log(castRust({ book, dock }))
  console.log(`\n=== ${label} SWIFT ===`)
  console.log(castSwift({ book }))
}

it('node/process/current', () => {
  logAll('current', path.resolve(CASE_ROOT, 'node/process/current.tree'))
  expect(true).toBe(true)
})

it('rust/process/current', () => {
  logAll('current', path.resolve(CASE_ROOT, 'rust/process/current.tree'))
  expect(true).toBe(true)
})

it('swift/process/current', () => {
  logAll('current', path.resolve(CASE_ROOT, 'swift/process/current.tree'))
  expect(true).toBe(true)
})

it('node/process/base', () => {
  logAll('base', path.resolve(CASE_ROOT, 'node/process.tree'))
  expect(true).toBe(true)
})

it('rust/process/base', () => {
  logAll('base', path.resolve(CASE_ROOT, 'rust/process.tree'))
  expect(true).toBe(true)
})

it('node/process/child', () => {
  logAll('child', path.resolve(CASE_ROOT, 'node/process/child.tree'))
  expect(true).toBe(true)
})

it('rust/process/child', () => {
  logAll('child', path.resolve(CASE_ROOT, 'rust/process/child.tree'))
  expect(true).toBe(true)
})

it('node/process/pipe', () => {
  logAll('pipe', path.resolve(CASE_ROOT, 'node/process/pipe.tree'))
  expect(true).toBe(true)
})

it('rust/process/pipe', () => {
  logAll('pipe', path.resolve(CASE_ROOT, 'rust/process/pipe.tree'))
  expect(true).toBe(true)
})
