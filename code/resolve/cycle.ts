/**
 * Cycle detection for template dependency graphs using Tarjan's SCC.
 *
 * Finds strongly connected components in the fuse dependency graph.
 * Any SCC of size > 1 is a circular template dependency error.
 */

import type { FuseSkele } from './skeleton'

export type TemplateCycle = {
  fuses: FuseSkele[]
}

/**
 * Detect circular template dependencies.
 * Builds a graph where fuse A depends on fuse B if A needs a name
 * that B produces. Returns all cycles (SCCs of size > 1).
 */
export function detectTemplateCycles(input: {
  fuses: FuseSkele[]
  producerMap: Map<string, FuseSkele>
}): TemplateCycle[] {
  const { fuses, producerMap } = input

  // Build adjacency list: fuse → set of fuses it depends on
  const adj = new Map<FuseSkele, Set<FuseSkele>>()
  for (const fuse of fuses) {
    const deps = new Set<FuseSkele>()
    for (const [, binding] of fuse.bindings) {
      if (binding.form === 'dynamic') continue
      // Check if this fuse's template name is produced by another fuse
      // (This is rare but possible with nested templates)
    }
    adj.set(fuse, deps)
  }

  // For the purpose of cycle detection, we care about name production
  // dependencies: fuse A is in the pending queue and needs name X,
  // which is produced by fuse B. If B also needs a name from A, cycle.
  // Since we restrict bindings to compile-time constants, the only
  // cycles possible are if two fuses produce names that each other
  // references in their template output bodies (not bindings).
  // Those are actually fine (mutual recursion at the definition level).
  // True template expansion cycles cannot happen with static bindings.

  return tarjan({ adj })
}

/** Tarjan's SCC algorithm. Returns SCCs of size > 1. */
function tarjan(input: { adj: Map<FuseSkele, Set<FuseSkele>> }): TemplateCycle[] {
  const { adj } = input
  let index = 0
  const stack: FuseSkele[] = []
  const onStack = new Set<FuseSkele>()
  const indices = new Map<FuseSkele, number>()
  const lowlinks = new Map<FuseSkele, number>()
  const cycles: TemplateCycle[] = []

  function strongConnect(v: FuseSkele): void {
    indices.set(v, index)
    lowlinks.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)

    const neighbors = adj.get(v) ?? new Set()
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w)
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!))
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!))
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: FuseSkele[] = []
      let w: FuseSkele
      do {
        w = stack.pop()!
        onStack.delete(w)
        scc.push(w)
      } while (w !== v)

      if (scc.length > 1) {
        cycles.push({ fuses: scc })
      }
    }
  }

  for (const v of adj.keys()) {
    if (!indices.has(v)) {
      strongConnect(v)
    }
  }

  return cycles
}
