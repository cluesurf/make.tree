import { it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import type { Term } from '@/term/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js')
const makeTree = require_(treeParsePath).default
const CASE_ROOT = path.resolve(__dirname, '../../../base.tree/code/native')

function getBook(filePath: string) {
  const text = fs.readFileSync(filePath, 'utf8')
  const lead = makeTree({ file: filePath, text })
  const rawCard = readCard({ tree: lead.tree, file: filePath })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card }).book
}

function showTerm(term: Term, depth = 0): string {
  const pad = '  '.repeat(depth)
  if (!term || typeof term !== 'object') return `${pad}?? ${JSON.stringify(term)}`
  switch (term.form) {
    case 'app': return `${pad}app\n${showTerm(term.func, depth+1)}\n${showTerm(term.argm, depth+1)}`
    case 'lam': return `${pad}lam(${term.name})\n${showTerm(term.bod({ form: 'var', name: term.name, idx: 0 }), depth+1)}`
    case 'let': return `${pad}let(${term.name})\n${pad}  val:\n${showTerm(term.val, depth+2)}\n${pad}  bod:\n${showTerm(term.bod({ form: 'var', name: term.name, idx: 0 }), depth+1)}`
    case 'use': return `${pad}use(${term.name})\n${pad}  val:\n${showTerm(term.val, depth+2)}\n${pad}  bod:\n${showTerm(term.bod({ form: 'var', name: term.name, idx: 0 }), depth+1)}`
    case 'ref': return `${pad}ref(${term.name})`
    case 'var': return `${pad}var(${term.name})`
    case 'mat': return `${pad}mat[${term.arms.map(([n,t]) => `${n}: ${showTerm(t, 0).trim()}`).join(', ')}]`
    case 'con': return `${pad}con(${term.name}, [${term.args.map(([n,t]) => `${n}=${showTerm(t,0).trim()}`).join(', ')}])`
    case 'txt': return `${pad}txt("${term.val}")`
    case 'num': return `${pad}num(${term.val})`
    case 'ann': return `${pad}ann\n${showTerm(term.val, depth+1)}`
    case 'hlt': return `${pad}hlt(${term.term})\n${showTerm(term.msg, depth+1)}`
    case 'lst': return `${pad}lst[${term.list.map(t => showTerm(t,0).trim()).join(', ')}]`
    default: return `${pad}${term.form}(${JSON.stringify(term).slice(0,80)})`
  }
}

it('inspect rust/process/current listen term', () => {
  const book = getBook(path.resolve(CASE_ROOT, 'rust/process/current.tree'))
  const listen = book.get('listen')!
  console.log('\n=== LISTEN TERM ===')
  console.log(showTerm(listen))
  expect(true).toBe(true)
})

it('inspect rust/process/base run term', () => {
  const book = getBook(path.resolve(CASE_ROOT, 'rust/process.tree'))
  const run = book.get('run')!
  console.log('\n=== RUN TERM ===')
  console.log(showTerm(run))
  expect(true).toBe(true)
})

it('inspect node/process/current listen term', () => {
  const book = getBook(path.resolve(CASE_ROOT, 'node/process/current.tree'))
  const listen = book.get('listen')!
  console.log('\n=== NODE LISTEN TERM ===')
  console.log(showTerm(listen))
  expect(true).toBe(true)
})

it('inspect node/process/base run term', () => {
  const book = getBook(path.resolve(CASE_ROOT, 'node/process.tree'))
  const run = book.get('run')!
  console.log('\n=== NODE RUN TERM ===')
  console.log(showTerm(run))
  expect(true).toBe(true)
})
