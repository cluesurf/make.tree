import { describe, it, expect } from 'vitest'
import { showKink, showSite, showKinkList } from '@/kink/show'
import { makeKink } from '@/kink/form'
import { VOID_SITE, makeSite } from '@/kink/site'

describe('kink/show', () => {
  describe('showSite', () => {
    it('formats a card-site as file:line:col', () => {
      const site = makeSite({
        link: 'code/math.tree',
        base: { line: 5, mark: 10 },
        head: { line: 5, mark: 22 },
      })
      expect(showSite(site)).toBe('code/math.tree:5:10')
    })

    it('returns <generated> for brew-site', () => {
      expect(showSite(VOID_SITE)).toBe('<generated>')
    })
  })

  describe('showKink', () => {
    it('formats a basic error without colors', () => {
      const site = makeSite({
        link: 'code/app.tree',
        base: { line: 3, mark: 5 },
        head: { line: 3, mark: 15 },
      })

      const kink = makeKink({
        form: 'mill-bad-keyword',
        rank: 'halt',
        site,
        text: 'unknown keyword: bogus',
        rest: { name: 'bogus' },
      })

      const output = showKink({ kink })

      expect(output).toContain('kink')
      expect(output).toContain('mill bad keyword')
      expect(output).toContain('0003')
      expect(output).toContain('@cluesurf/term')
      expect(output).toContain('code/app.tree:3:5')
      expect(output).toContain('unknown keyword: bogus')
    })

    it('includes source snippet when load function provided', () => {
      const site = makeSite({
        link: 'code/math.tree',
        base: { line: 2, mark: 3 },
        head: { line: 2, mark: 10 },
      })

      const kink = makeKink({
        form: 'type-mismatch',
        rank: 'halt',
        site,
        text: 'expected u64, got text',
        rest: { need: 'u64', have: 'text' },
      })

      const load = (link: string) => {
        if (link === 'code/math.tree') {
          return [
            'task add',
            '  back call add, read x, text <hello>',
            '  save y, mark 10',
          ]
        }
        return undefined
      }

      const output = showKink({ kink, load })

      expect(output).toContain('back call add, read x, text <hello>')
      expect(output).toContain('^^^^^^^')
      expect(output).toContain('need')
      expect(output).toContain('u64')
      expect(output).toContain('have')
      expect(output).toContain('text')
    })

    it('formats a brew-site error without crashing', () => {
      const kink = makeKink({
        form: 'desugar-bad',
        rank: 'halt',
        site: VOID_SITE,
        text: 'cannot desugar node',
        rest: { surf: 'unknown' },
      })

      const output = showKink({ kink })

      expect(output).toContain('desugar bad')
      expect(output).toContain('<generated>')
    })
  })

  describe('showKinkList', () => {
    it('formats multiple errors separated by blank lines', () => {
      const kinks = [
        makeKink({
          form: 'name-miss',
          rank: 'halt',
          site: VOID_SITE,
          text: 'undefined: foo',
          rest: { name: 'foo' },
        }),
        makeKink({
          form: 'name-miss',
          rank: 'halt',
          site: VOID_SITE,
          text: 'undefined: bar',
          rest: { name: 'bar' },
        }),
      ]

      const output = showKinkList({ list: kinks })

      expect(output).toContain('undefined: foo')
      expect(output).toContain('undefined: bar')
      expect(output.split('\n\n').length).toBeGreaterThanOrEqual(2)
    })
  })
})
