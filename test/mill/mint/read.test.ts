import { describe, it, expect } from 'vitest'
import { readMintFile } from '@/mill/mint/read'
import type { Tree, TreeLink } from '@/mill/tree'

/** Helper to create a minimal TreeLink. */
function makeLink(text: string, list: Array<TreeLink | any> = []): TreeLink {
  return { form: 'link', text, list } as TreeLink
}

/** Helper to create a Tree. */
function makeTree(list: TreeLink[]): Tree {
  return { form: 'tree', list }
}

describe('mill/mint/read', () => {
  describe('readMintFile', () => {
    it('parses an empty tree into an empty file', () => {
      const tree = makeTree([])
      const file = readMintFile({ tree, file: 'test.note' })

      expect(file.load).toEqual([])
      expect(file.formList).toEqual([])
    })

    it('parses a mint definition', () => {
      const tree = makeTree([
        makeLink('mint', [
          makeLink('make', [
            makeLink('bind', []),
            makeLink('turn', [
              makeLink('seed', []),
            ]),
          ]),
        ]),
      ])

      const file = readMintFile({ tree, file: 'test.note' })

      expect(file.formList.length).toBe(1)
      expect(file.formList[0]!.form).toBe('mint-def')
    })
  })
})
