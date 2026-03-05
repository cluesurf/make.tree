/**
 * Signature extraction tests.
 *
 * Validates that definition signatures capture type-level shape
 * but not implementation bodies.
 */

import { describe, it, expect } from 'vitest'
import { defSignature, cardSignatures } from '@/cache/signature'
import type { Surf, SurfTask, SurfForm, SurfHost } from '@/surf/form'
import { VOID_SITE } from '@/kink/site'

const site = VOID_SITE

function makeTask(input: {
  name: string
  params?: Array<{ name: string; like?: { form: 'type-name'; name: string } }>
  like?: { form: 'type-name'; name: string }
  flow?: Surf[]
}): SurfTask {
  return {
    form: 'task',
    name: input.name,
    head: [],
    base: (input.params ?? []).map(p => ({
      form: 'base' as const,
      name: p.name,
      like: p.like,
      site,
    })),
    flow: input.flow ?? [],
    task: [],
    like: input.like,
    site,
  }
}

describe('defSignature', () => {
  it('produces same hash for same signature', () => {
    const a = makeTask({ name: 'add', params: [{ name: 'a' }, { name: 'b' }] })
    const b = makeTask({ name: 'add', params: [{ name: 'a' }, { name: 'b' }] })

    expect(defSignature({ def: a })).toBe(defSignature({ def: b }))
  })

  it('produces different hash for different param types', () => {
    const a = makeTask({
      name: 'add',
      params: [{ name: 'a', like: { form: 'type-name', name: 'u32' } }],
    })
    const b = makeTask({
      name: 'add',
      params: [{ name: 'a', like: { form: 'type-name', name: 'u64' } }],
    })

    expect(defSignature({ def: a })).not.toBe(defSignature({ def: b }))
  })

  it('produces different hash for different names', () => {
    const a = makeTask({ name: 'add' })
    const b = makeTask({ name: 'sub' })

    expect(defSignature({ def: a })).not.toBe(defSignature({ def: b }))
  })

  it('produces same hash regardless of body', () => {
    const a = makeTask({
      name: 'add',
      params: [{ name: 'a' }],
      flow: [{ form: 'back', site } as Surf],
    })
    const b = makeTask({
      name: 'add',
      params: [{ name: 'a' }],
      flow: [
        { form: 'back', sift: { form: 'sift-mark', val: 42, site }, site } as Surf,
      ],
    })

    expect(defSignature({ def: a })).toBe(defSignature({ def: b }))
  })

  it('handles form definitions', () => {
    const form: SurfForm = {
      form: 'form',
      name: 'point',
      head: [],
      link: [
        { form: 'link', name: 'x', like: { form: 'type-name', name: 'f64' }, site },
        { form: 'link', name: 'y', like: { form: 'type-name', name: 'f64' }, site },
      ],
      case: [],
      bond: [],
      task: [],
      wear: [],
      site,
    }

    const sig = defSignature({ def: form })
    expect(sig).toMatch(/^[0-9a-f]{16}$/)
  })

  it('detects form field changes', () => {
    const a: SurfForm = {
      form: 'form', name: 'point', head: [], case: [], bond: [], task: [], wear: [], site,
      link: [{ form: 'link', name: 'x', like: { form: 'type-name', name: 'f64' }, site }],
    }
    const b: SurfForm = {
      form: 'form', name: 'point', head: [], case: [], bond: [], task: [], wear: [], site,
      link: [{ form: 'link', name: 'x', like: { form: 'type-name', name: 'f32' }, site }],
    }

    expect(defSignature({ def: a })).not.toBe(defSignature({ def: b }))
  })

  it('handles host definitions', () => {
    const host: SurfHost = {
      form: 'host',
      name: 'PI',
      sift: { form: 'sift-mark', val: 3, site },
      site,
    }

    const sig = defSignature({ def: host })
    expect(sig).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('cardSignatures', () => {
  it('extracts signatures for all named definitions', () => {
    const list: Surf[] = [
      makeTask({ name: 'add' }),
      makeTask({ name: 'sub' }),
    ]

    const sigs = cardSignatures({ list })
    expect(sigs.size).toBe(2)
    expect(sigs.has('add')).toBe(true)
    expect(sigs.has('sub')).toBe(true)
  })

  it('returns stable signatures across calls', () => {
    const list: Surf[] = [makeTask({ name: 'add' })]

    const a = cardSignatures({ list })
    const b = cardSignatures({ list })

    expect(a.get('add')).toBe(b.get('add'))
  })
})
