/**
 * Package-wide template resolution via fixed-point iteration.
 *
 * Phase 1: Collect skeletons from all files (static names, templates, fuses).
 * Phase 2: Expand templates iteratively until no new names are produced.
 *
 * After resolution, all names are known and the normal per-file
 * expandFuse + desugar pipeline can run with confidence that every
 * reference will resolve.
 */

import type { NameSkele, FileSkele, FuseSkele, TreeSkele } from './skeleton'
import { createWatchers, registerWatcher, notifyWatchers, type WatcherMap } from './watcher'
import { detectTemplateCycles } from './cycle'

export type ResolveError = {
  form: 'missing-template' | 'dynamic-binding' | 'circular-template' | 'unresolved-fuse'
  file: string
  name: string
  detail: string
}

export type ResolverState = {
  files: Map<string, FileSkele>
  known: Map<string, NameSkele>
  pending: FuseSkele[]
  watchers: WatcherMap
  trees: Map<string, TreeSkele>
  generation: number
  errors: ResolveError[]
}

export function initResolver(input: {
  skeletons: Map<string, FileSkele>
}): ResolverState {
  const { skeletons } = input
  const known = new Map<string, NameSkele>()
  const trees = new Map<string, TreeSkele>()
  const pending: FuseSkele[] = []

  for (const [, skele] of skeletons) {
    for (const [name, info] of skele.staticNames) {
      known.set(name, info)
    }
    for (const [name, tree] of skele.trees) {
      trees.set(name, tree)
    }
    for (const fuse of skele.fuses) {
      pending.push(fuse)
    }
  }

  return {
    files: skeletons,
    known,
    pending,
    watchers: createWatchers(),
    trees,
    generation: 0,
    errors: [],
  }
}

/**
 * Substitute {param} placeholders in a template output name pattern.
 */
function substitutePattern(input: {
  pattern: string
  subst: Map<string, string>
}): string {
  return input.pattern.replace(/\{(\w[\w-]*)\}/g, (_, key) => {
    return input.subst.get(key) ?? _
  })
}

/**
 * Run fixed-point template expansion.
 * Iterates until no new names are produced.
 */
export function resolveTemplates(input: {
  state: ResolverState
}): ResolverState {
  const { state } = input
  let changed = true

  while (changed) {
    changed = false
    state.generation++
    const stillPending: FuseSkele[] = []

    for (const fuse of state.pending) {
      const tree = state.trees.get(fuse.templateName)
      if (!tree) {
        state.errors.push({
          form: 'missing-template',
          file: fuse.file,
          name: fuse.templateName,
          detail: `No tree named "${fuse.templateName}" found in package`,
        })
        continue
      }

      // Check all bindings are static
      let hasDynamic = false
      for (const [param, binding] of fuse.bindings) {
        if (binding.form === 'dynamic') {
          state.errors.push({
            form: 'dynamic-binding',
            file: fuse.file,
            name: param,
            detail: `Template binding "${param}" is not a compile-time constant (${binding.detail}). Use text <...> or mark <...> instead.`,
          })
          hasDynamic = true
        }
      }
      if (hasDynamic) continue

      // Build substitution map
      const subst = new Map<string, string>()
      for (const [param, binding] of fuse.bindings) {
        if (binding.form === 'static') {
          subst.set(param, binding.value)
        }
      }

      // Predict output names
      const predicted: string[] = []
      for (const pattern of tree.outputNames) {
        const resolved = substitutePattern({ pattern, subst })
        predicted.push(resolved)

        if (!state.known.has(resolved)) {
          state.known.set(resolved, {
            form: 'task',
            name: resolved,
            file: fuse.file,
          })
          changed = true

          // Wake watchers
          const woken = notifyWatchers({ watchers: state.watchers, name: resolved })
          for (const f of woken) {
            stillPending.push(f)
          }
        }
      }

      fuse.predictedNames = predicted
    }

    state.pending = stillPending
  }

  // Anything still pending after fixed-point is an error
  for (const fuse of state.pending) {
    state.errors.push({
      form: 'unresolved-fuse',
      file: fuse.file,
      name: fuse.templateName,
      detail: `Template "${fuse.templateName}" could not be fully expanded`,
    })
  }

  // Check for cycles in template dependencies
  const producerMap = new Map<string, FuseSkele>()
  const allFuses: FuseSkele[] = []
  for (const [, skele] of state.files) {
    for (const fuse of skele.fuses) {
      allFuses.push(fuse)
      if (fuse.predictedNames) {
        for (const name of fuse.predictedNames) {
          producerMap.set(name, fuse)
        }
      }
    }
  }

  const cycles = detectTemplateCycles({ fuses: allFuses, producerMap })
  for (const cycle of cycles) {
    const names = cycle.fuses.map(f => `${f.templateName} (${f.file})`)
    state.errors.push({
      form: 'circular-template',
      file: cycle.fuses[0]!.file,
      name: cycle.fuses[0]!.templateName,
      detail: `Circular template dependency: ${names.join(' -> ')}`,
    })
  }

  return state
}

/**
 * Get the complete set of known names after resolution.
 */
export function getKnownNames(input: { state: ResolverState }): Map<string, NameSkele> {
  return input.state.known
}
