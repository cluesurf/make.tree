/**
 * Watcher system for reactive template resolution.
 *
 * When a fuse cannot expand because it references a template that
 * produces names needed by other pending fuses, watchers track
 * which names each fuse is waiting on. When a name becomes known,
 * watchers are notified and the fuse is moved back to the pending queue.
 */

import type { FuseSkele } from './skeleton'

export type WatcherMap = Map<string, Set<FuseSkele>>

export function createWatchers(): WatcherMap {
  return new Map()
}

export function registerWatcher(input: {
  watchers: WatcherMap
  name: string
  fuse: FuseSkele
}): void {
  const { watchers, name, fuse } = input
  let set = watchers.get(name)
  if (!set) {
    set = new Set()
    watchers.set(name, set)
  }
  set.add(fuse)
}

/**
 * Notify watchers that a name has become known.
 * Returns the set of fuses that were waiting on this name
 * and should be re-evaluated.
 */
export function notifyWatchers(input: {
  watchers: WatcherMap
  name: string
}): Set<FuseSkele> {
  const { watchers, name } = input
  const waiting = watchers.get(name)
  if (!waiting) return new Set()
  watchers.delete(name)
  return waiting
}
