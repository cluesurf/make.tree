/**
 * Proof erasure pass.
 *
 * Removes proof-only definitions from the Book before code generation.
 * Proofs are functions marked `firm true` whose return type is a proof
 * type (Equal, Void, Unit, Decidable, Sigma). These exist only for
 * compile-time verification and have zero runtime cost.
 *
 * Also strips type-level annotations (Ann, Slf, Ins, All) from
 * runtime terms, since backends don't need them.
 *
 * Runs after checkBook(), before optimizeBook().
 */

import type { Term, Book } from '@/term/form'
import { reduce } from '@/term/reduce'

/** Known proof type names that can be erased. */
const PROOF_TYPES = new Set([
  'Equal',
  'equal',
  'Void',
  'void',
  'Unit',
  'unit',
  'Decidable',
  'decidable',
  'Sigma',
  'sigma',
])

/**
 * Check if a term is (or reduces to) a proof type.
 * Looks at the outermost type constructor after stripping foralls.
 */
function isProofType(input: { term: Term; book: Book }): boolean {
  const { term, book } = input

  // Check the unreduced term first (before unfolding refs like Equal)
  if (checkHead({ term })) return true

  // Then try after reduction
  const fill = new Map()
  const reduced = reduce({ term, book, fill, lv: 2 })
  return checkHead({ term: reduced })

  function checkHead(input: { term: Term }): boolean {
    const { term } = input
    switch (term.form) {
      case 'ref':
        return PROOF_TYPES.has(term.name)
      case 'app': {
        let head: Term = term.func
        while (head.form === 'app') {
          head = head.func
        }
        if (head.form === 'ref') {
          return PROOF_TYPES.has(head.name)
        }
        return false
      }
      case 'all':
        return isProofType({
          term: term.bod({ form: 'ref', name: '_erase_dummy' }),
          book,
        })
      default:
        return false
    }
  }
}

/**
 * Get the return type of a definition.
 * Strips outer annotations and lambdas to find the type.
 */
function getReturnType(input: { term: Term }): Term | null {
  let { term } = input

  // Strip Ann to get the type
  if (term.form === 'ann') {
    return getReturnType({ term: term.typ })
  }

  // Strip All (forall) to get the final return type
  if (term.form === 'all') {
    return getReturnType({
      term: term.bod({ form: 'ref', name: '_erase_dummy' }),
    })
  }

  return term
}

/**
 * Erase proof-only definitions from a Book.
 *
 * A definition is erased if:
 * 1. Its return type is a known proof type (Equal, Void, etc.)
 * 2. It is annotated (has a type) so we can determine the return type
 *
 * Definitions without type annotations are kept (runtime code).
 * The firmSet is used as a hint: firm definitions are more likely proofs.
 */
export function eraseProofs(input: {
  book: Book
  firmSet?: Set<string>
}): Book {
  const { book, firmSet } = input
  const erased = new Set<string>()

  // First pass: identify proof definitions
  for (const [name, term] of book) {
    if (term.form !== 'ann') continue

    const returnType = getReturnType({ term: term.typ })
    if (returnType && isProofType({ term: returnType, book })) {
      erased.add(name)
    }
  }

  // Also erase the proof type definitions themselves
  for (const name of PROOF_TYPES) {
    if (book.has(name)) {
      erased.add(name)
    }
  }

  // Second pass: build new book without erased definitions
  const result: Book = new Map()
  for (const [name, term] of book) {
    if (!erased.has(name)) {
      result.set(name, eraseAnnotations({ term }))
    }
  }

  return result
}

/**
 * Strip type-level annotations from a runtime term.
 * Removes Ann wrappers, keeping only the value.
 */
function eraseAnnotations(input: { term: Term }): Term {
  const { term } = input

  switch (term.form) {
    case 'ann':
      return eraseAnnotations({ term: term.val })
    case 'ins':
      return eraseAnnotations({ term: term.val })
    case 'app':
      return {
        form: 'app',
        func: eraseAnnotations({ term: term.func }),
        argm: eraseAnnotations({ term: term.argm }),
      }
    case 'lam':
      return {
        form: 'lam',
        name: term.name,
        bod: (x: Term) => eraseAnnotations({ term: term.bod(x) }),
      }
    case 'let':
      return {
        form: 'let',
        name: term.name,
        val: eraseAnnotations({ term: term.val }),
        bod: (x: Term) => eraseAnnotations({ term: term.bod(x) }),
      }
    case 'op2':
      return {
        form: 'op2',
        oper: term.oper,
        a: eraseAnnotations({ term: term.a }),
        b: eraseAnnotations({ term: term.b }),
      }
    default:
      return term
  }
}
