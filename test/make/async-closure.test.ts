/**
 * Tests for async (wait true) and closure/HOF features.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string) {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  const { book, asyncMeta } = desugarCard({ card })
  return { book, asyncMeta }
}

describe('async (wait true)', () => {
  it('TypeScript: emits async function and await', () => {
    const { book, asyncMeta } = compileFile('async-test.tree')
    const ts = castTS({ book, asyncMeta })
    expect(ts).toContain('export async function fetchData(url)')
    expect(ts).toContain('await fetchUrl(url)')
    // Non-async function should not have async keyword
    expect(ts).toContain('export function process(x)')
    expect(ts).not.toContain('async function process')
  })

  it('Rust: emits async fn and .await', () => {
    const { book, asyncMeta } = compileFile('async-test.tree')
    const rust = castRust({ book, asyncMeta })
    expect(rust).toContain('async fn fetch_data(url: String)')
    expect(rust).toContain('.await')
    expect(rust).toContain('fetch_url(url).await')
    // Non-async function should not have async keyword
    expect(rust).toContain('fn process(')
    expect(rust).not.toMatch(/async fn process/)
  })

  it('Kotlin: emits suspend fun', () => {
    const { book, asyncMeta } = compileFile('async-test.tree')
    const kt = castKotlin({ book, asyncMeta })
    expect(kt).toContain('suspend fun fetchData(url: Any)')
    // Non-async function should not have suspend keyword
    expect(kt).toContain('fun process(')
    expect(kt).not.toMatch(/suspend fun process/)
  })

  it('Swift: emits func ... async', () => {
    const { book, asyncMeta } = compileFile('async-test.tree')
    const swift = castSwift({ book, asyncMeta })
    expect(swift).toContain('func fetchData(_ url: Any) async -> Any')
    expect(swift).toContain('await ')
    // Non-async function should not have async keyword
    expect(swift).toMatch(/func process\(_ x: Any\) -> Any/)
  })
})

describe('closures/HOF (like task)', () => {
  it('TypeScript: compiles function-typed params and calls them', () => {
    const { book } = compileFile('closure-test.tree')
    const ts = castTS({ book })
    expect(ts).toContain('export function apply(f, x)')
    expect(ts).toContain('f(x)')
  })

  it('Rust: emits impl Fn for function-typed params', () => {
    const { book } = compileFile('closure-test.tree')
    const rust = castRust({ book })
    expect(rust).toContain('impl Fn(u64) -> u64')
    expect(rust).toContain('f(x)')
  })
})
