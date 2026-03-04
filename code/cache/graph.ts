/**
 * Dependency graph for incremental compilation.
 *
 * Tracks which files depend on which, so we can compute the "dirty set"
 * when a file changes: the file itself plus everything that transitively
 * depends on it.
 */

export type DepGraph = {
  /** Forward deps: file -> set of files it imports. */
  deps: Map<string, Set<string>>
  /** Reverse deps: file -> set of files that import it. */
  rdeps: Map<string, Set<string>>
}

export function createGraph(): DepGraph {
  return { deps: new Map(), rdeps: new Map() }
}

export function addEdge(input: {
  graph: DepGraph
  from: string
  to: string
}): void {
  const { graph, from, to } = input

  if (!graph.deps.has(from)) graph.deps.set(from, new Set())
  graph.deps.get(from)!.add(to)

  if (!graph.rdeps.has(to)) graph.rdeps.set(to, new Set())
  graph.rdeps.get(to)!.add(from)
}

/**
 * Given a set of directly changed files, compute the full dirty set
 * by walking reverse dependencies transitively.
 */
export function getDirtySet(input: {
  graph: DepGraph
  changed: Set<string>
}): Set<string> {
  const { graph, changed } = input
  const dirty = new Set(changed)
  const queue = [...changed]

  while (queue.length > 0) {
    const file = queue.pop()!
    const dependents = graph.rdeps.get(file)
    if (dependents) {
      for (const dep of dependents) {
        if (!dirty.has(dep)) {
          dirty.add(dep)
          queue.push(dep)
        }
      }
    }
  }

  return dirty
}

/** Serialize graph to JSON-safe format. */
export function serializeGraph(input: { graph: DepGraph }): string {
  const { graph } = input
  const deps: Record<string, string[]> = {}
  const rdeps: Record<string, string[]> = {}

  for (const [k, v] of graph.deps) {
    deps[k] = [...v]
  }
  for (const [k, v] of graph.rdeps) {
    rdeps[k] = [...v]
  }

  return JSON.stringify({ deps, rdeps })
}

/** Deserialize graph from JSON string. */
export function deserializeGraph(input: { json: string }): DepGraph {
  const raw = JSON.parse(input.json) as {
    deps: Record<string, string[]>
    rdeps: Record<string, string[]>
  }

  const deps = new Map<string, Set<string>>()
  const rdeps = new Map<string, Set<string>>()

  for (const [k, v] of Object.entries(raw.deps)) {
    deps.set(k, new Set(v))
  }
  for (const [k, v] of Object.entries(raw.rdeps)) {
    rdeps.set(k, new Set(v))
  }

  return { deps, rdeps }
}
