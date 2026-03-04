/**
 * End-to-end tests: load base.tree stdlib files through the full
 * compiler pipeline and verify they parse, desugar, and codegen.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castHVM } from '@/cast/hvm'
import { loadBook } from '@/load'
import {
  resolveStdlib,
  setStdlibRoot,
  clearStdlibCache,
} from '@/stdlib'
import type { Book, Term } from '@/term/form'
import type { SurfCard } from '@/surf/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

const stdlibRoot = path.resolve(__dirname, '../../../')

const parse = (input: { file: string; text: string }) =>
  makeTree(input)

beforeEach(() => {
  clearStdlibCache()
  setStdlibRoot({ root: stdlibRoot })
})

/** Load a base.tree stdlib file and return the SurfCard. */
function loadStdlib(pkgPath: string): SurfCard {
  const card = resolveStdlib({ loadPath: pkgPath, parse })
  if (!card) throw new Error(`Failed to load: ${pkgPath}`)
  return card
}

/** Desugar a SurfCard and return the Book. */
function desugar(card: SurfCard): Book {
  const result = desugarCard({ card })
  return result.book
}

/** Compile a .tree text directly and return the Book. */
function compileText(text: string): Book {
  const lead = parse({ file: 'test.tree', text })
  if (!lead || !lead.tree) throw new Error('Parse failed')
  const rawCard = readCard({ tree: lead.tree, file: 'test.tree' })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card }).book
}

describe('boolean form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/boolean')
    const book = desugar(card)

    // Should have 'boolean' in the book
    expect(book.has('boolean')).toBe(true)
    const term = book.get('boolean')!
    expect(term.form).toBe('adt')
  })

  it('has true and false constructors', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/boolean')
    const book = desugar(card)
    const term = book.get('boolean')!

    if (term.form !== 'adt') throw new Error('expected adt')
    const ctrNames = term.ctrs.map(c => c.name)
    expect(ctrNames).toContain('true')
    expect(ctrNames).toContain('false')
  })

  it('generates TypeScript code', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/boolean')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toBeDefined()
    expect(typeof ts).toBe('string')
  })

  it('generates HVM code', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/boolean')
    const book = desugar(card)
    const hvm = castHVM({ book })
    expect(hvm).toBeDefined()
    expect(typeof hvm).toBe('string')
  })
})

describe('maybe form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/maybe')
    const book = desugar(card)

    expect(book.has('maybe')).toBe(true)
    const term = book.get('maybe')!
    expect(term.form).toBe('adt')
  })

  it('has some and none constructors', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/maybe')
    const book = desugar(card)
    const term = book.get('maybe')!

    if (term.form !== 'adt') throw new Error('expected adt')
    const ctrNames = term.ctrs.map(c => c.name)
    expect(ctrNames).toContain('some')
    expect(ctrNames).toContain('none')
  })

  it('some constructor has value field', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/maybe')
    const book = desugar(card)
    const term = book.get('maybe')!

    if (term.form !== 'adt') throw new Error('expected adt')
    const some = term.ctrs.find(c => c.name === 'some')!
    expect(some.tele.form).toBe('ext')
    if (some.tele.form === 'ext') {
      expect(some.tele.name).toBe('value')
    }
  })

  it('has type parameter in ADT type', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/maybe')
    const book = desugar(card)
    const term = book.get('maybe')!

    if (term.form !== 'adt') throw new Error('expected adt')
    // With head t, the type should be an All chain, not just Set
    expect(term.type.form).toBe('all')
  })

  it('generates TypeScript code', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/maybe')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toBeDefined()
  })
})

describe('result form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/result')
    const book = desugar(card)

    expect(book.has('result')).toBe(true)
    const term = book.get('result')!
    expect(term.form).toBe('adt')
  })

  it('has okay and error constructors', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/result')
    const book = desugar(card)
    const term = book.get('result')!

    if (term.form !== 'adt') throw new Error('expected adt')
    const ctrNames = term.ctrs.map(c => c.name)
    expect(ctrNames).toContain('okay')
    expect(ctrNames).toContain('error')
  })

  it('has two type parameters', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/result')
    const book = desugar(card)
    const term = book.get('result')!

    if (term.form !== 'adt') throw new Error('expected adt')
    // Two head params: t and e -> All chain of depth 2
    expect(term.type.form).toBe('all')
    if (term.type.form === 'all') {
      expect(term.type.name).toBe('t')
      const inner = term.type.bod({ form: 'var', name: 't', idx: 0 })
      expect(inner.form).toBe('all')
      if (inner.form === 'all') {
        expect(inner.name).toBe('e')
      }
    }
  })

  it('okay constructor has value field typed as t', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/result')
    const book = desugar(card)
    const term = book.get('result')!

    if (term.form !== 'adt') throw new Error('expected adt')
    const okay = term.ctrs.find(c => c.name === 'okay')!
    expect(okay.tele.form).toBe('ext')
    if (okay.tele.form === 'ext') {
      expect(okay.tele.name).toBe('value')
      // Type should be a Ref to 't'
      expect(okay.tele.typ.form).toBe('ref')
      if (okay.tele.typ.form === 'ref') {
        expect(okay.tele.typ.name).toBe('t')
      }
    }
  })

  it('generates TypeScript code', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/result')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toBeDefined()
  })
})

describe('kink form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/kink')
    const book = desugar(card)

    expect(book.has('kink')).toBe(true)
    const term = book.get('kink')!
    expect(term.form).toBe('adt')
  })

  it('has implicit constructor from struct links', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/kink')
    const book = desugar(card)
    const term = book.get('kink')!

    if (term.form !== 'adt') throw new Error('expected adt')
    // kink has link fields at form level, creating an implicit constructor
    expect(term.ctrs.length).toBe(1)
    expect(term.ctrs[0]!.name).toBe('kink')
    expect(term.ctrs[0]!.tele.form).toBe('ext')
  })

  it('generates TypeScript code', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/kink')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(ts).toBeDefined()
  })
})

describe('pair form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/pair')
    const book = desugar(card)

    expect(book.has('pair')).toBe(true)
    const term = book.get('pair')!
    expect(term.form).toBe('adt')
  })

  it('has two type parameters', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/pair')
    const book = desugar(card)
    const term = book.get('pair')!

    if (term.form !== 'adt') throw new Error('expected adt')
    expect(term.type.form).toBe('all')
    if (term.type.form === 'all') {
      expect(term.type.name).toBe('a')
    }
  })
})

describe('user code with stdlib types', () => {
  it('compiles code using boolean type annotation', () => {
    const book = compileText(`
task is-valid
  take x, like boolean
  like boolean
  back read x
`)
    expect(book.has('is-valid')).toBe(true)
    const ts = castTS({ book })
    expect(ts).toContain('isValid')
    expect(ts).toContain('boolean')
  })

  it('compiles code using u32 type annotation', () => {
    const book = compileText(`
task double
  take n, like u32
  like u32
  back call mul, read n, mark 2
`)
    expect(book.has('double')).toBe(true)
    const ts = castTS({ book })
    expect(ts).toContain('number')
  })

  it('compiles code using i64 type annotation', () => {
    const book = compileText(`
task negate
  take n, like i64
  like i64
  back call sub, mark 0, read n
`)
    expect(book.has('negate')).toBe(true)
    const ts = castTS({ book })
    expect(ts).toContain('number')
  })

  it('compiles code using void return type', () => {
    const book = compileText(`
task do-nothing
  like void
`)
    expect(book.has('do-nothing')).toBe(true)
    const ts = castTS({ book })
    // void resolves to Ref("Void") which becomes a Unit tag in codegen
    expect(ts).toContain('doNothing')
  })
})

describe('stdlib via loadBook', () => {
  it('loads boolean via load directive', () => {
    // Write a test .tree file that loads from stdlib
    const testFile = path.resolve(__dirname, '_tmp_load_test.tree')
    const testText = `
load @cluesurf/base/code/base/form/boolean

task use-bool
  take x, like boolean
  like boolean
  back read x
`
    fs.writeFileSync(testFile, testText)

    try {
      const result = loadBook({
        file: testFile,
        env: {
          readFile: p => fs.readFileSync(p, 'utf8'),
          resolvePath: (fromFile, loadPath) => {
            const dir = path.dirname(fromFile)
            const direct = path.resolve(dir, loadPath + '.tree')
            if (fs.existsSync(direct)) return direct
            return null
          },
          parse,
        },
      })

      // Should have both the stdlib boolean and the user task
      expect(result.book.has('boolean')).toBe(true)
      expect(result.book.has('use-bool')).toBe(true)

      // The boolean should be an ADT
      const boolTerm = result.book.get('boolean')!
      expect(boolTerm.form).toBe('adt')

      // Should generate valid TS
      const ts = castTS({ book: result.book })
      expect(ts).toContain('useBool')
    } finally {
      fs.unlinkSync(testFile)
    }
  })

  it('loads maybe via load directive with find filter', () => {
    const testFile = path.resolve(__dirname, '_tmp_find_test.tree')
    const testText = `
load @cluesurf/base/code/base/form/maybe
  find form maybe

task wrap
  take x, like u64
  like u64
  back read x
`
    fs.writeFileSync(testFile, testText)

    try {
      const result = loadBook({
        file: testFile,
        env: {
          readFile: p => fs.readFileSync(p, 'utf8'),
          resolvePath: (fromFile, loadPath) => {
            const dir = path.dirname(fromFile)
            const direct = path.resolve(dir, loadPath + '.tree')
            if (fs.existsSync(direct)) return direct
            return null
          },
          parse,
        },
      })

      // Should have maybe (from find filter) and wrap (from user code)
      expect(result.book.has('maybe')).toBe(true)
      expect(result.book.has('wrap')).toBe(true)
    } finally {
      fs.unlinkSync(testFile)
    }
  })
})

describe('codegen for stdlib ADTs', () => {
  it('ADT-only book emits type declaration in TypeScript', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/boolean')
    const book = desugar(card)
    const ts = castTS({ book })

    // ADTs now emit discriminated union type declarations
    expect(ts).toContain('export type Boolean')
    expect(ts).toContain('$: 0')
    expect(ts).toContain('$: 1')
  })

  it('Rust codegen does not crash for ADT-only book', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/boolean')
    const book = desugar(card)
    const rust = castRust({ book })

    expect(typeof rust).toBe('string')
  })

  it('HVM codegen does not crash for ADT-only book', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/maybe')
    const book = desugar(card)
    const hvm = castHVM({ book })

    expect(typeof hvm).toBe('string')
  })

  it('book with ADT + function generates TS with correct type annotation', () => {
    const userBook = compileText(`
form boolean
  case true
  case false

task is-true
  take x, like boolean
  like boolean
  back read x
`)
    const ts = castTS({ book: userBook })
    expect(ts).toContain('isTrue')
    // boolean type annotation should appear
    expect(ts).toContain('boolean')
  })

  it('TS codegen for task referencing a form type', () => {
    const book = compileText(`
form result
  case okay
    link value
  case error
    link reason

task get-value
  take r, like result
  back read r
`)
    const ts = castTS({ book })
    expect(ts).toContain('getValue')
    // The form name should be recognized as a type
    expect(ts).toContain('Result')
  })

  it('TS codegen for task with maybe-typed param', () => {
    const book = compileText(`
form maybe
  case some
    link value
  case none

task unwrap-or
  take m, like maybe
  take fallback, like u64
  like u64
  back read fallback
`)
    const ts = castTS({ book })
    expect(ts).toContain('unwrapOr')
    // maybe is recognized as a form name
    expect(ts).toContain('Maybe')
  })
})

describe('list form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/list')
    const book = desugar(card)

    expect(book.has('list')).toBe(true)
    const term = book.get('list')!
    expect(term.form).toBe('adt')
  })

  it('has type parameter', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/list')
    const book = desugar(card)
    const term = book.get('list')!

    if (term.form !== 'adt') throw new Error('expected adt')
    expect(term.type.form).toBe('all')
  })

  it('generates TypeScript without crashing', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/list')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(typeof ts).toBe('string')
  })

  it('generates Rust without crashing', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/list')
    const book = desugar(card)
    const rust = castRust({ book })
    expect(typeof rust).toBe('string')
  })
})

describe('line form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/line')
    const book = desugar(card)

    expect(book.has('line')).toBe(true)
    const term = book.get('line')!
    expect(term.form).toBe('adt')
  })

  it('has type parameter', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/line')
    const book = desugar(card)
    const term = book.get('line')!

    if (term.form !== 'adt') throw new Error('expected adt')
    expect(term.type.form).toBe('all')
  })

  it('generates TypeScript without crashing', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/line')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(typeof ts).toBe('string')
  })
})

describe('hash form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/hash')
    const book = desugar(card)

    expect(book.has('hash')).toBe(true)
    const term = book.get('hash')!
    expect(term.form).toBe('adt')
  })

  it('has two type parameters (k, v)', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/hash')
    const book = desugar(card)
    const term = book.get('hash')!

    if (term.form !== 'adt') throw new Error('expected adt')
    expect(term.type.form).toBe('all')
    if (term.type.form === 'all') {
      expect(term.type.name).toBe('k')
      const inner = term.type.bod({ form: 'var', name: 'k', idx: 0 })
      expect(inner.form).toBe('all')
      if (inner.form === 'all') {
        expect(inner.name).toBe('v')
      }
    }
  })

  it('generates TypeScript without crashing', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/hash')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(typeof ts).toBe('string')
  })
})

describe('walk form', () => {
  it('parses and desugars correctly', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/walk')
    const book = desugar(card)

    expect(book.has('walk')).toBe(true)
    const term = book.get('walk')!
    expect(term.form).toBe('adt')
  })

  it('has type parameter', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/walk')
    const book = desugar(card)
    const term = book.get('walk')!

    if (term.form !== 'adt') throw new Error('expected adt')
    expect(term.type.form).toBe('all')
  })

  it('generates TypeScript without crashing', () => {
    const card = loadStdlib('@cluesurf/base/code/base/form/walk')
    const book = desugar(card)
    const ts = castTS({ book })
    expect(typeof ts).toBe('string')
  })
})

describe('ADT type emission', () => {
  it('emits discriminated union for boolean', () => {
    const book = compileText(`
form boolean
  case true
  case false
`)
    const ts = castTS({ book })
    expect(ts).toContain('export type Boolean')
    expect(ts).toContain('$: 0')
    expect(ts).toContain('$: 1')
  })

  it('emits fields in constructor variants', () => {
    const book = compileText(`
form shape
  case circle
    link radius
  case rect
    link width
    link height
`)
    const ts = castTS({ book })
    expect(ts).toContain('export type Shape')
    expect(ts).toContain('radius')
    expect(ts).toContain('width')
    expect(ts).toContain('height')
    expect(ts).toContain('$: 0')
    expect(ts).toContain('$: 1')
  })

  it('emits struct type for single constructor', () => {
    const book = compileText(`
form point
  case point
    link x
    link y
`)
    const ts = castTS({ book })
    expect(ts).toContain('export type Point')
    // Single constructor - no tag needed
    expect(ts).not.toContain('$:')
    expect(ts).toContain('x:')
    expect(ts).toContain('y:')
  })

  it('emits generic type params', () => {
    const book = compileText(`
form box
  head t
  case box
    link value
`)
    const ts = castTS({ book })
    expect(ts).toContain('export type Box<T>')
  })

  it('emits generic type with two params', () => {
    const book = compileText(`
form pair
  head a
  head b
  case pair
    link first
    link second
`)
    const ts = castTS({ book })
    expect(ts).toContain('export type Pair<A, B>')
  })

  it('maybe type is skipped (maps to native T | null)', () => {
    const book = compileText(`
form maybe
  head t
  case some
    link value
  case none
`)
    const ts = castTS({ book })
    // maybe is treated as native optional, no type declaration emitted
    expect(ts).not.toContain('export type Maybe')
  })

  it('emits type + function together', () => {
    const book = compileText(`
form color
  case red
  case green
  case blue

task is-red
  take c, like color
  like boolean
  back read c
`)
    const ts = castTS({ book })
    // Type declaration
    expect(ts).toContain('export type Color')
    // Function
    expect(ts).toContain('export function isRed')
    // Type should appear before function
    const typeIdx = ts.indexOf('export type Color')
    const funcIdx = ts.indexOf('export function isRed')
    expect(typeIdx).toBeLessThan(funcIdx)
  })

  it('stripTypes suppresses type declarations', () => {
    const book = compileText(`
form color
  case red
  case blue

task pick
  take c, like color
  back read c
`)
    const ts = castTS({ book, stripTypes: true })
    expect(ts).not.toContain('export type Color')
    expect(ts).toContain('pick')
  })

  it('struct-like form with no constructors emits type from links', () => {
    const book = compileText(`
form kink
  link note, like text
  link code, like u64
`)
    const ts = castTS({ book })
    expect(ts).toContain('export type Kink')
    expect(ts).toContain('note: string')
    expect(ts).toContain('code: number')
  })
})
