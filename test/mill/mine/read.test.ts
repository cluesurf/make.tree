import { describe, it, expect } from 'vitest'
import { readMineFile } from '@/mill/mine/read'
import type { Tree, TreeLink } from '@/mill/tree'

/** Helper to create a minimal TreeLink. */
function makeLink(text: string, list: Array<TreeLink | any> = []): TreeLink {
  return { form: 'link', text, list } as TreeLink
}

/** Helper to create a Tree. */
function makeTree(list: TreeLink[]): Tree {
  return { form: 'tree', list }
}

describe('mill/mine/read', () => {
  describe('readMineFile', () => {
    it('parses an empty tree into an empty file', () => {
      const tree = makeTree([])
      const file = readMineFile({ tree, file: 'test.note' })

      expect(file.load).toEqual([])
      expect(file.formList).toEqual([])
    })

    it('parses a mine definition', () => {
      const tree = makeTree([
        makeLink('mine', [
          makeLink('term', []),
        ]),
      ])

      const file = readMineFile({ tree, file: 'test.note' })

      expect(file.formList.length).toBe(1)
      expect(file.formList[0]!.form).toBe('mine-def')
    })

    it('parses a load directive', () => {
      const tree = makeTree([
        makeLink('load', [
          makeLink('hook', [
            makeLink('mine', []),
          ]),
        ]),
      ])

      const file = readMineFile({ tree, file: 'test.note' })

      expect(file.load.length).toBe(1)
      expect(file.load[0]!.form).toBe('mine-load')
    })
  })
})
