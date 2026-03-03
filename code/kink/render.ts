/**
 * Info-to-Kink renderer.
 *
 * Converts type checker Info records (which carry raw Term objects)
 * into user-facing Kink errors (which carry readable strings).
 * This bridges the gap between the checker's internal log format
 * and the displayable error format used by showKink.
 */

import type { Info, Term, Fill } from '@/term/form'
import type { Kink } from '@/kink/form'
import type { Site } from '@/kink/site'
import { showTerm } from '@/term/show'
import { makeKink } from '@/kink/form'

/**
 * Convert a single Info record into a Kink error (or null if not an error).
 */
export function renderInfo(input: {
  info: Info
  fill: Fill
}): Kink | null {
  const { info, fill } = input

  switch (info.form) {
    case 'error': {
      const need = showTerm(resolveMetas({ term: info.need, fill }))
      const have = showTerm(resolveMetas({ term: info.have, fill }))
      const term = showTerm(resolveMetas({ term: info.term, fill }))
      const site = info.site ?? brewSite()

      return makeKink({
        form: 'type-mismatch',
        rank: 'halt',
        site,
        text: `expected ${need} but got ${have}`,
        rest: { need, have, term },
      })
    }

    case 'found': {
      const term = showTerm(resolveMetas({ term: info.term, fill }))
      return makeKink({
        form: 'type-hole-miss',
        rank: 'hint',
        site: brewSite(),
        text: `hole ?${info.name} filled with ${term}`,
        rest: { name: info.name, fill: term },
      })
    }

    case 'vague': {
      return makeKink({
        form: 'name-miss',
        rank: 'halt',
        site: brewSite(),
        text: `unresolved reference: ${info.name}`,
        rest: { name: info.name },
      })
    }

    case 'solve':
    case 'print':
      return null
  }
}

/**
 * Convert a list of Info records into Kink errors.
 * Filters out non-error records (solve, print).
 */
export function renderInfoList(input: {
  logs: Info[]
  fill: Fill
}): Kink[] {
  const { logs, fill } = input
  const result: Kink[] = []

  for (const info of logs) {
    const kink = renderInfo({ info, fill })
    if (kink && kink.rank === 'halt') {
      result.push(kink)
    }
  }

  return result
}

/** Create a synthetic site for generated/internal errors. */
function brewSite(): Site {
  return { form: 'brew-site' }
}

/**
 * Substitute solved metavariables in a term for display.
 * Shallow: only replaces top-level Met nodes, not inside HOAS bodies.
 */
function resolveMetas(input: { term: Term; fill: Fill }): Term {
  const { term, fill } = input

  switch (term.form) {
    case 'met': {
      const solved = fill.get(term.uid)
      if (solved) return resolveMetas({ term: solved, fill })
      return term
    }

    case 'app':
      return {
        form: 'app',
        func: resolveMetas({ term: term.func, fill }),
        argm: resolveMetas({ term: term.argm, fill }),
      }

    case 'ann':
      return {
        form: 'ann',
        done: term.done,
        val: resolveMetas({ term: term.val, fill }),
        typ: resolveMetas({ term: term.typ, fill }),
      }

    case 'ins':
      return {
        form: 'ins',
        val: resolveMetas({ term: term.val, fill }),
      }

    case 'op2':
      return {
        form: 'op2',
        oper: term.oper,
        a: resolveMetas({ term: term.a, fill }),
        b: resolveMetas({ term: term.b, fill }),
      }

    case 'src':
      return {
        form: 'src',
        site: term.site,
        val: resolveMetas({ term: term.val, fill }),
      }

    case 'log':
      return {
        form: 'log',
        msg: resolveMetas({ term: term.msg, fill }),
        val: resolveMetas({ term: term.val, fill }),
      }

    default:
      return term
  }
}
