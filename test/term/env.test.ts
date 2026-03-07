import { describe, it, expect, beforeEach } from 'vitest'
import {
  envPure, envBind, envFail, envRun, envInit,
  envLog, envGetBook, envGetFill, envGetLogs,
  envFill, envSusp, envTakeSusp,
  envSnapshot, envRewind,
  envTry, envMap, envAll,
  envFreshMeta, envResetMeta,
} from '@/term/env'
import type { Term, Book, State, Info } from '@/term/form'

function emptyState(): State {
  return envInit({ book: new Map() })
}

describe('term/env', () => {
  beforeEach(() => {
    envResetMeta()
  })

  it('pure returns value without modifying state', () => {
    const state = emptyState()
    const result = envRun({ env: envPure(42), state })
    expect(result).not.toBeNull()
    expect(result!.value).toBe(42)
    expect(result!.state).toEqual(state)
  })

  it('fail returns null', () => {
    const state = emptyState()
    const result = envRun({ env: envFail(), state })
    expect(result).toBeNull()
  })

  it('bind sequences computations', () => {
    const state = emptyState()
    const env = envBind({
      env: envPure(10),
      fn: (a) => envPure(a + 5),
    })
    const result = envRun({ env, state })
    expect(result!.value).toBe(15)
  })

  it('bind short-circuits on failure', () => {
    const state = emptyState()
    const env = envBind({
      env: envFail<number>(),
      fn: (a) => envPure(a + 5),
    })
    const result = envRun({ env, state })
    expect(result).toBeNull()
  })

  it('log adds info entries', () => {
    const state = emptyState()
    const info: Info = { form: 'vague', name: 'test' }
    const env = envBind({
      env: envLog(info),
      fn: () => envGetLogs(),
    })
    const result = envRun({ env, state })
    expect(result!.value).toHaveLength(1)
    expect(result!.value[0]).toEqual(info)
  })

  it('fill stores metavar solutions', () => {
    const state = emptyState()
    const term: Term = { form: 'num', val: 42 }
    const env = envBind({
      env: envFill({ uid: 0, term }),
      fn: () => envGetFill(),
    })
    const result = envRun({ env, state })
    expect(result!.value.get(0)).toEqual(term)
  })

  it('getBook returns the book', () => {
    const book: Book = new Map([['add', { form: 'ref', name: 'add' } as Term]])
    const state = envInit({ book })
    const result = envRun({ env: envGetBook(), state })
    expect(result!.value).toBe(book)
  })

  it('susp and takeSusp manage suspended checks', () => {
    const state = emptyState()
    const susp = {
      need: { form: 'int', size: 64, sign: false } as Term,
      have: { form: 'num', val: 1 } as Term,
      dep: 0,
    }
    const env = envBind({
      env: envSusp(susp),
      fn: () => envTakeSusp(),
    })
    const result = envRun({ env, state })
    expect(result!.value).toHaveLength(1)
    expect(result!.value[0]).toEqual(susp)
    // State should have susp cleared after take
    expect(result!.state.susp).toHaveLength(0)
  })

  it('snapshot and rewind restore state', () => {
    const state = emptyState()
    const env = envBind({
      env: envSnapshot(),
      fn: (snap) => envBind({
        env: envFill({ uid: 0, term: { form: 'num', val: 1 } }),
        fn: () => envBind({
          env: envRewind(snap),
          fn: () => envGetFill(),
        }),
      }),
    })
    const result = envRun({ env, state })
    expect(result!.value.size).toBe(0) // fill should be empty after rewind
  })

  it('try recovers from failure', () => {
    const state = emptyState()
    const env = envTry({ env: envFail<number>(), fall: 99 })
    const result = envRun({ env, state })
    expect(result!.value).toBe(99)
  })

  it('map transforms the result', () => {
    const state = emptyState()
    const env = envMap({ env: envPure(5), fn: (x) => x * 2 })
    const result = envRun({ env, state })
    expect(result!.value).toBe(10)
  })

  it('all sequences a list of computations', () => {
    const state = emptyState()
    const env = envAll([envPure(1), envPure(2), envPure(3)])
    const result = envRun({ env, state })
    expect(result!.value).toEqual([1, 2, 3])
  })

  it('all fails if any computation fails', () => {
    const state = emptyState()
    const env = envAll([envPure(1), envFail<number>(), envPure(3)])
    const result = envRun({ env, state })
    expect(result).toBeNull()
  })

  it('freshMeta generates unique uids', () => {
    const state = emptyState()
    const env = envBind({
      env: envFreshMeta([]),
      fn: (m1) => envBind({
        env: envFreshMeta([]),
        fn: (m2) => envPure([m1, m2]),
      }),
    })
    const result = envRun({ env, state })
    const [m1, m2] = result!.value as Term[]
    expect(m1.form).toBe('met')
    expect(m2.form).toBe('met')
    if (m1.form === 'met' && m2.form === 'met') {
      expect(m1.uid).not.toBe(m2.uid)
    }
  })
})
