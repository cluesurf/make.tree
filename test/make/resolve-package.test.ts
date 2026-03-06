/**
 * Tests for package-wide template resolution.
 *
 * Tests the skeleton extraction, fixed-point template expansion,
 * and package loading pipeline that handles circular references
 * between files including template-generated names.
 */

import { describe, it, expect } from 'vitest'
import { resolve, dirname } from 'path'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { predictFuseNames } from '@/fuse'
import { extractSkele } from '@/resolve/skeleton'
import { initResolver, resolveTemplates } from '@/resolve'
import { loadPackage } from '@/load'
import type { LoadEnv } from '@/load'
import type { SurfCard, SurfTree, SurfFuse } from '@/surf/form'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  TEST_DIR,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function parseCard(input: { file: string; text: string }): SurfCard {
  const lead = makeTree({ file: input.file, text: input.text })
  return readCard({ tree: lead.tree, file: input.file })
}

/** Normalize path: resolve `.` and `..` segments. */
function normPath(p: string): string {
  const parts = p.split('/')
  const out: string[] = []
  for (const part of parts) {
    if (part === '.') continue
    if (part === '..' && out.length > 0 && out[out.length - 1] !== '..') {
      out.pop()
    } else {
      out.push(part)
    }
  }
  return out.join('/') || '/'
}

function makeEnv(files: Map<string, string>): LoadEnv {
  return {
    readFile: (p: string) => {
      const content = files.get(p)
      if (!content) throw new Error(`Not found: ${p}`)
      return content
    },
    resolvePath: (from: string, load: string) => {
      const dir = from.replace(/\/[^/]+$/, '')
      const target = normPath(`${dir}/${load}.tree`)
      return files.has(target) ? target : null
    },
    parse: (input: { file: string; text: string }) => {
      try {
        return makeTree({ file: input.file, text: input.text })
      } catch {
        return null
      }
    },
  }
}

// -- Skeleton extraction tests --

describe('skeleton extraction', () => {
  it('extracts static task names', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
task greet
  take name, like text
  like text
`,
    })
    const skele = extractSkele({ card })
    expect(skele.staticNames.has('greet')).toBe(true)
    expect(skele.staticNames.get('greet')!.form).toBe('task')
  })

  it('extracts static form names', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
form point
  link x, like u64
  link y, like u64
`,
    })
    const skele = extractSkele({ card })
    expect(skele.staticNames.has('point')).toBe(true)
    expect(skele.staticNames.get('point')!.form).toBe('form')
  })

  it('extracts tree templates', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
tree make-getter
  take name
  take type

  hook fuse
    task get-{name}
      like {type}
`,
    })
    const skele = extractSkele({ card })
    expect(skele.trees.has('make-getter')).toBe(true)
    const tree = skele.trees.get('make-getter')!
    expect(tree.params).toEqual(['name', 'type'])
    expect(tree.outputNames).toEqual(['get-{name}'])
  })

  it('extracts fuse instantiations with static bindings', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
fuse make-getter
  bind name, text <age>
  bind type, text <u64>
`,
    })
    const skele = extractSkele({ card })
    expect(skele.fuses.length).toBe(1)
    const fuse = skele.fuses[0]!
    expect(fuse.templateName).toBe('make-getter')
    expect(fuse.bindings.get('name')).toEqual({ form: 'static', value: 'age' })
    expect(fuse.bindings.get('type')).toEqual({ form: 'static', value: 'u64' })
  })

  it('extracts load directives', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
load ./other
  find greet
`,
    })
    const skele = extractSkele({ card })
    expect(skele.loads.length).toBe(1)
  })

  it('extracts host names', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
host max-size, mark 100
`,
    })
    const skele = extractSkele({ card })
    expect(skele.staticNames.has('max-size')).toBe(true)
    expect(skele.staticNames.get('max-size')!.form).toBe('host')
  })
})

// -- Template resolution tests --

describe('template resolution', () => {
  it('resolves simple template expansion', () => {
    const cardA = parseCard({
      file: 'template.tree',
      text: `
tree make-getter
  take name

  hook fuse
    task get-{name}
      like u64
`,
    })
    const cardB = parseCard({
      file: 'models.tree',
      text: `
fuse make-getter
  bind name, text <age>
`,
    })

    const skeleA = extractSkele({ card: cardA })
    const skeleB = extractSkele({ card: cardB })

    const skeletons = new Map([
      ['template.tree', skeleA],
      ['models.tree', skeleB],
    ])

    const state = initResolver({ skeletons })
    const resolved = resolveTemplates({ state })

    expect(resolved.errors).toEqual([])
    expect(resolved.known.has('get-age')).toBe(true)
  })

  it('resolves multiple fuses from the same template', () => {
    const cardA = parseCard({
      file: 'template.tree',
      text: `
tree make-pair
  take name

  hook fuse
    task get-{name}
      like u64
    task set-{name}
      take value, like u64
`,
    })
    const cardB = parseCard({
      file: 'models.tree',
      text: `
fuse make-pair
  bind name, text <alpha>

fuse make-pair
  bind name, text <beta>
`,
    })

    const skeleA = extractSkele({ card: cardA })
    const skeleB = extractSkele({ card: cardB })

    const skeletons = new Map([
      ['template.tree', skeleA],
      ['models.tree', skeleB],
    ])

    const state = initResolver({ skeletons })
    const resolved = resolveTemplates({ state })

    expect(resolved.errors).toEqual([])
    expect(resolved.known.has('get-alpha')).toBe(true)
    expect(resolved.known.has('set-alpha')).toBe(true)
    expect(resolved.known.has('get-beta')).toBe(true)
    expect(resolved.known.has('set-beta')).toBe(true)
  })

  it('reports error for missing template', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
fuse nonexistent
  bind name, text <foo>
`,
    })
    const skele = extractSkele({ card })
    const skeletons = new Map([['test.tree', skele]])
    const state = initResolver({ skeletons })
    const resolved = resolveTemplates({ state })

    expect(resolved.errors.length).toBeGreaterThan(0)
    expect(resolved.errors[0]!.form).toBe('missing-template')
  })

  it('static names coexist with template-generated names', () => {
    const cardA = parseCard({
      file: 'template.tree',
      text: `
tree make-getter
  take name

  hook fuse
    task get-{name}
      like u64
`,
    })
    const cardB = parseCard({
      file: 'models.tree',
      text: `
task compute
  like u64

fuse make-getter
  bind name, text <height>
`,
    })

    const skeleA = extractSkele({ card: cardA })
    const skeleB = extractSkele({ card: cardB })

    const skeletons = new Map([
      ['template.tree', skeleA],
      ['models.tree', skeleB],
    ])

    const state = initResolver({ skeletons })
    const resolved = resolveTemplates({ state })

    expect(resolved.errors).toEqual([])
    expect(resolved.known.has('compute')).toBe(true)
    expect(resolved.known.has('get-height')).toBe(true)
  })
})

// -- predictFuseNames tests --

describe('predictFuseNames', () => {
  it('predicts names from a fuse with static bindings', () => {
    const card = parseCard({
      file: 'test.tree',
      text: `
tree make-getter
  take name

  hook fuse
    task get-{name}
      like u64

fuse make-getter
  bind name, text <width>
`,
    })

    const trees = new Map<string, SurfTree>()
    const fuses: SurfFuse[] = []
    for (const node of card.list) {
      if (node.form === 'tree') trees.set(node.name, node)
      if (node.form === 'fuse') fuses.push(node)
    }

    const names = predictFuseNames({ fuse: fuses[0]!, trees })
    expect(names).toEqual(['get-width'])
  })
})

// -- loadPackage integration tests --

describe('loadPackage', () => {
  it('loads a single file package', () => {
    const files = new Map<string, string>([
      ['/test/main.tree', `
task greet
  take name, like text
  like text
`],
    ])

    const result = loadPackage({
      file: '/test/main.tree',
      env: makeEnv(files),
    })

    expect(result.resolveErrors).toEqual([])
    expect(result.book.has('greet')).toBe(true)
  })

  it('loads multi-file package with templates', () => {
    const files = new Map<string, string>([
      ['/test/main.tree', `
load ./template
load ./models

task use-age
  like u64
`],
      ['/test/template.tree', `
tree make-getter
  take name

  hook fuse
    task get-{name}
      like u64
`],
      ['/test/models.tree', `
load ./template

fuse make-getter
  bind name, text <age>
`],
    ])

    const result = loadPackage({
      file: '/test/main.tree',
      env: makeEnv(files),
    })

    expect(result.resolveErrors).toEqual([])
    expect(result.book.has('use-age')).toBe(true)
    expect(result.book.has('get-age')).toBe(true)
  })

  it('handles mutual recursion between files', () => {
    const files = new Map<string, string>([
      ['/test/even.tree', `
load ./odd

task is-even
  take n, like u64
  like u64
`],
      ['/test/odd.tree', `
load ./even

task is-odd
  take n, like u64
  like u64
`],
    ])

    const result = loadPackage({
      file: '/test/even.tree',
      env: makeEnv(files),
    })

    expect(result.resolveErrors).toEqual([])
    expect(result.book.has('is-even')).toBe(true)
    expect(result.book.has('is-odd')).toBe(true)
  })
})
