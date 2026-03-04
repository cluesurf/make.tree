/**
 * HMR orchestrator tests.
 *
 * Tests the Hmr class with mock compile callbacks. Does not test
 * actual file watching (that requires filesystem events).
 */

import { describe, it, expect } from 'vitest'
import { Runtime } from '@/runtime'
import { Hmr } from '@/runtime/hmr'
import type { CompileOutput } from '@/runtime/form'
import type { CompileFileResult, HmrEvent } from '@/runtime/hmr'

function mockOutput(names: string[]): CompileOutput {
  return {
    code: names.map(n => `@${n} = λx x`).join('\n'),
    files: ['/main.tree'],
    book: new Map(names.map(n => [n, { form: 'ref', name: n }])),
  }
}

function mockCompile(names: string[]): (input: { file: string; text: string }) => CompileFileResult {
  return () => ({
    code: names.map(n => `@${n} = λx x`).join('\n'),
    errors: [],
    files: ['/main.tree'],
    book: new Map(names.map(n => [n, { form: 'ref', name: n }])),
  })
}

function mockCompileWithError(): (input: { file: string; text: string }) => CompileFileResult {
  return () => ({
    code: '',
    errors: [{ message: 'parse error at line 1' }],
    files: [],
    book: new Map(),
  })
}

describe('Hmr', () => {
  it('swaps definitions on handleChange', () => {
    const rt = new Runtime()
    rt.load({ output: mockOutput(['hello', 'world']) })

    const hmr = new Hmr({
      root: '/project',
      runtime: rt,
      compile: mockCompile(['greet', 'farewell']),
    })

    const events: HmrEvent[] = []
    hmr.on(e => events.push(e))

    hmr.handleChange({ file: '/main.tree', text: 'mock' })

    expect(events.length).toBe(1)
    expect(events[0]!.kind).toBe('swap')
    if (events[0]!.kind === 'swap') {
      expect(events[0]!.changed).toContain('greet')
      expect(events[0]!.changed).toContain('farewell')
    }

    const book = rt.book()
    expect(book.has('greet')).toBe(true)
    expect(book.has('farewell')).toBe(true)
  })

  it('emits error event on compile failure', () => {
    const rt = new Runtime()
    rt.load({ output: mockOutput(['hello']) })

    const hmr = new Hmr({
      root: '/project',
      runtime: rt,
      compile: mockCompileWithError(),
    })

    const events: HmrEvent[] = []
    hmr.on(e => events.push(e))

    hmr.handleChange({ file: '/main.tree', text: 'mock' })

    expect(events.length).toBe(1)
    expect(events[0]!.kind).toBe('error')
    if (events[0]!.kind === 'error') {
      expect(events[0]!.errors[0]!.message).toContain('parse error')
    }

    // Book should still have original definitions
    expect(rt.book().has('hello')).toBe(true)
  })

  it('handles multiple sequential changes', () => {
    const rt = new Runtime()
    rt.load({ output: mockOutput(['a']) })

    let compileNames = ['b']
    const hmr = new Hmr({
      root: '/project',
      runtime: rt,
      compile: (input) => ({
        code: compileNames.map(n => `@${n} = λx x`).join('\n'),
        errors: [],
        files: [input.file],
        book: new Map(compileNames.map(n => [n, { form: 'ref', name: n }])),
      }),
    })

    hmr.handleChange({ file: '/main.tree', text: 'mock' })
    expect(rt.book().has('b')).toBe(true)
    expect(rt.book().has('a')).toBe(false)

    compileNames = ['c', 'd']
    hmr.handleChange({ file: '/main.tree', text: 'mock' })
    expect(rt.book().has('c')).toBe(true)
    expect(rt.book().has('d')).toBe(true)
    expect(rt.book().has('b')).toBe(false)
  })

  it('supports multiple event listeners', () => {
    const rt = new Runtime()
    rt.load({ output: mockOutput(['x']) })

    const hmr = new Hmr({
      root: '/project',
      runtime: rt,
      compile: mockCompile(['y']),
    })

    let count1 = 0
    let count2 = 0
    hmr.on(() => count1++)
    hmr.on(() => count2++)

    hmr.handleChange({ file: '/main.tree', text: 'mock' })

    expect(count1).toBe(1)
    expect(count2).toBe(1)
  })
})
