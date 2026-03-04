/**
 * Logical operations tests (meet and / meet or).
 *
 * Verifies that `meet and` and `meet or` emit proper logical
 * operators across all backends.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTs } from '@/cast/typescript'
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

function compileFile(name: string): { book: import('@/term/form').Book } {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card })
}

const { book } = compileFile('meet.tree')

describe('typescript: meet', () => {
  const ts = castTs({ book })

  it('emits && for meet and', () => {
    expect(ts).toContain('&&')
  })

  it('emits || for meet or', () => {
    expect(ts).toContain('||')
  })

  it('emits checkBoth function', () => {
    expect(ts).toContain('checkBoth')
  })

  it('emits checkEither function', () => {
    expect(ts).toContain('checkEither')
  })

  it('emits checkTriple with chained &&', () => {
    // check-triple has 3 conditions, produces ((a && b) && c)
    expect(ts).toContain('&& b)')
    expect(ts).toContain('&& c)')
  })
})

describe('rust: meet', () => {
  const rs = castRust({ book })

  it('emits && for meet and', () => {
    expect(rs).toContain('&&')
  })

  it('emits || for meet or', () => {
    expect(rs).toContain('||')
  })

  it('emits check_both function', () => {
    expect(rs).toContain('check_both')
  })

  it('emits check_either function', () => {
    expect(rs).toContain('check_either')
  })
})

describe('kotlin: meet', () => {
  const kt = castKotlin({ book })

  it('emits && for meet and', () => {
    expect(kt).toContain('&&')
  })

  it('emits || for meet or', () => {
    expect(kt).toContain('||')
  })

  it('emits checkBoth function', () => {
    expect(kt).toContain('checkBoth')
  })
})

describe('swift: meet', () => {
  const sw = castSwift({ book })

  it('emits && for meet and', () => {
    expect(sw).toContain('&&')
  })

  it('emits || for meet or', () => {
    expect(sw).toContain('||')
  })

  it('emits checkBoth function', () => {
    expect(sw).toContain('checkBoth')
  })
})
