import { describe, it, expect } from 'vitest'
import { makeKink } from '@/kink/form'
import { VOID_SITE, makeSite } from '@/kink/site'

describe('kink/form', () => {
  describe('makeKink', () => {
    it('creates an error with basic fields', () => {
      const site = makeSite({
        link: 'code/app.tree',
        base: { line: 5, mark: 10 },
        head: { line: 5, mark: 22 },
      })

      const kink = makeKink({
        form: 'type-mismatch',
        rank: 'halt',
        site,
        text: 'expected u64, got text',
      })

      expect(kink.form).toBe('type-mismatch')
      expect(kink.rank).toBe('halt')
      expect(kink.site).toBe(site)
      expect(kink.text).toBe('expected u64, got text')
    })

    it('spreads rest properties onto the kink', () => {
      const kink = makeKink({
        form: 'type-mismatch',
        rank: 'halt',
        site: VOID_SITE,
        text: 'mismatch',
        rest: { need: 'u64', have: 'text', term: 'x' },
      })

      const k = kink as Record<string, unknown>
      expect(k['need']).toBe('u64')
      expect(k['have']).toBe('text')
      expect(k['term']).toBe('x')
    })

    it('creates mill errors with name field', () => {
      const kink = makeKink({
        form: 'mill-bad-keyword',
        rank: 'halt',
        site: VOID_SITE,
        text: 'unknown keyword: bogus',
        rest: { name: 'bogus' },
      })

      expect(kink.form).toBe('mill-bad-keyword')
      expect((kink as Record<string, unknown>)['name']).toBe('bogus')
    })
  })
})
