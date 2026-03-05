/**
 * Runtime swap + signature firewall tests.
 *
 * Tests that the Runtime correctly:
 * - Tracks per-file definitions and signatures
 * - Detects signature changes vs body-only changes
 * - Computes transitive dependents when signatures change
 * - Supports multi-file loading
 */

import { describe, it, expect } from 'vitest'
import { Runtime } from '@/runtime'
import type { CompileOutput } from '@/runtime/form'

function mockOutput(input: {
  names: string[]
  files?: string[]
  terms?: Record<string, unknown>
}): CompileOutput {
  const book = new Map<string, unknown>()
  for (const n of input.names) {
    book.set(n, input.terms?.[n] ?? { form: 'ref', name: n })
  }
  return {
    code: input.names.map(n => `@${n} = λx x`).join('\n'),
    files: input.files ?? ['/main.tree'],
    book,
  }
}

describe('Runtime multi-file loading', () => {
  it('loads multiple files independently', () => {
    const rt = new Runtime()
    rt.loadFile({
      file: '/math.tree',
      output: mockOutput({ names: ['add', 'sub'], files: ['/math.tree'] }),
    })
    rt.loadFile({
      file: '/string.tree',
      output: mockOutput({ names: ['concat', 'split'], files: ['/string.tree'] }),
    })

    expect(rt.book().size).toBe(4)
    expect(rt.book().has('add')).toBe(true)
    expect(rt.book().has('concat')).toBe(true)
    expect(rt.files().length).toBe(2)
  })

  it('unloads a file and removes its definitions', () => {
    const rt = new Runtime()
    rt.loadFile({
      file: '/math.tree',
      output: mockOutput({ names: ['add', 'sub'], files: ['/math.tree'] }),
    })
    rt.loadFile({
      file: '/string.tree',
      output: mockOutput({ names: ['concat'], files: ['/string.tree'] }),
    })

    rt.unload({ file: '/math.tree' })

    expect(rt.book().size).toBe(1)
    expect(rt.book().has('add')).toBe(false)
    expect(rt.book().has('concat')).toBe(true)
    expect(rt.has({ file: '/math.tree' })).toBe(false)
  })
})

describe('Signature firewall', () => {
  it('detects no signature change when body changes but structure is same', () => {
    const rt = new Runtime()
    rt.loadFile({
      file: '/math.tree',
      output: mockOutput({
        names: ['add'],
        files: ['/math.tree'],
        terms: { add: { form: 'lam', body: { form: 'num', val: 1 } } },
      }),
    })

    const result = rt.swap({
      file: '/math.tree',
      output: mockOutput({
        names: ['add'],
        files: ['/math.tree'],
        terms: { add: { form: 'lam', body: { form: 'num', val: 1 } } },
      }),
    })

    expect(result.signatureChanged).toBe(false)
    expect(result.added).toHaveLength(0)
    expect(result.removed).toHaveLength(0)
  })

  it('detects signature change when term structure changes', () => {
    const rt = new Runtime()
    rt.loadFile({
      file: '/math.tree',
      output: mockOutput({
        names: ['add'],
        files: ['/math.tree'],
        terms: { add: { form: 'lam', body: { form: 'num', val: 1 } } },
      }),
    })

    const result = rt.swap({
      file: '/math.tree',
      output: mockOutput({
        names: ['add'],
        files: ['/math.tree'],
        terms: { add: { form: 'lam', body: { form: 'num', val: 2 } } },
      }),
    })

    expect(result.signatureChanged).toBe(true)
  })

  it('detects signature change when definitions are added', () => {
    const rt = new Runtime()
    rt.loadFile({
      file: '/math.tree',
      output: mockOutput({ names: ['add'], files: ['/math.tree'] }),
    })

    const result = rt.swap({
      file: '/math.tree',
      output: mockOutput({ names: ['add', 'sub'], files: ['/math.tree'] }),
    })

    expect(result.signatureChanged).toBe(true)
    expect(result.added).toContain('sub')
  })

  it('detects signature change when definitions are removed', () => {
    const rt = new Runtime()
    rt.loadFile({
      file: '/math.tree',
      output: mockOutput({ names: ['add', 'sub'], files: ['/math.tree'] }),
    })

    const result = rt.swap({
      file: '/math.tree',
      output: mockOutput({ names: ['add'], files: ['/math.tree'] }),
    })

    expect(result.signatureChanged).toBe(true)
    expect(result.removed).toContain('sub')
  })
})

describe('Dependency graph integration', () => {
  it('tracks dependencies from load', () => {
    const rt = new Runtime()
    rt.load({
      output: mockOutput({
        names: ['main'],
        files: ['/main.tree', '/lib.tree'],
      }),
    })

    const deps = rt.dependents({ file: '/lib.tree' })
    expect(deps).toContain('/main.tree')
  })

  it('computes dependents on signature change', () => {
    const rt = new Runtime()

    // Load main depending on lib
    rt.loadFile({
      file: '/lib.tree',
      output: mockOutput({ names: ['helper'], files: ['/lib.tree'] }),
    })
    rt.loadFile({
      file: '/main.tree',
      output: mockOutput({
        names: ['main'],
        files: ['/main.tree', '/lib.tree'],
      }),
    })

    // Swap lib with changed signature
    const result = rt.swap({
      file: '/lib.tree',
      output: mockOutput({
        names: ['helper', 'helper2'],
        files: ['/lib.tree'],
      }),
    })

    expect(result.signatureChanged).toBe(true)
    expect(result.dependents).toContain('/main.tree')
  })

  it('returns no dependents when signature unchanged', () => {
    const rt = new Runtime()

    rt.loadFile({
      file: '/lib.tree',
      output: mockOutput({
        names: ['helper'],
        files: ['/lib.tree'],
        terms: { helper: { form: 'ref', name: 'helper' } },
      }),
    })
    rt.loadFile({
      file: '/main.tree',
      output: mockOutput({
        names: ['main'],
        files: ['/main.tree', '/lib.tree'],
      }),
    })

    // Swap with identical content
    const result = rt.swap({
      file: '/lib.tree',
      output: mockOutput({
        names: ['helper'],
        files: ['/lib.tree'],
        terms: { helper: { form: 'ref', name: 'helper' } },
      }),
    })

    expect(result.signatureChanged).toBe(false)
    expect(result.dependents).toHaveLength(0)
  })
})
