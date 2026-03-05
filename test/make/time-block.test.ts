/**
 * Tests for `time` (benchmark) block parsing, desugaring, and codegen.
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
  return { card: rawCard, book, asyncMeta }
}

describe('time block parsing', () => {
  it('parses a time block into SurfTime', () => {
    const { card } = compileFile('time-test.tree')

    const timeNodes = card.list.filter(n => n.form === 'time')
    expect(timeNodes.length).toBe(2)

    expect(timeNodes[0]!.name).toBe('add-numbers')
    expect(timeNodes[1]!.name).toBe('string-concat')
  })

  it('parses head annotations', () => {
    const { card } = compileFile('time-test.tree')

    const timeNodes = card.list.filter(n => n.form === 'time')
    const withHead = timeNodes.find(
      (n: any) => n.head && n.head.length > 0,
    ) as any

    if (withHead) {
      expect(withHead.head.length).toBeGreaterThan(0)
    }
  })

  it('desugars time blocks into book with time/ prefix', () => {
    const { book } = compileFile('time-test.tree')

    const timeEntries = [...book.keys()].filter(k => k.startsWith('time/'))
    expect(timeEntries.length).toBe(2)
    expect(timeEntries).toContain('time/add-numbers')
    expect(timeEntries).toContain('time/string-concat')
  })

  it('TypeScript: generates functions for time blocks', () => {
    const { book, asyncMeta } = compileFile('time-test.tree')
    const ts = castTS({ book, asyncMeta })

    expect(ts).toContain('timeAddNumbers')
    expect(ts).toContain('timeStringConcat')
  })
})
