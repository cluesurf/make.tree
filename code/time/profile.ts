/**
 * CPU profiling bridge using Node.js inspector protocol.
 */

export type CpuProfileNode = {
  id: number
  callFrame: {
    functionName: string
    scriptId: string
    url: string
    lineNumber: number
    columnNumber: number
  }
  hitCount: number
  children?: number[]
}

export type CpuProfile = {
  nodes: CpuProfileNode[]
  startTime: number
  endTime: number
  samples: number[]
  timeDeltas: number[]
}

export type HotspotEntry = {
  functionName: string
  url: string
  line: number
  selfTime: number
  totalTime: number
  selfPct: number
  totalPct: number
}

/**
 * Capture a CPU profile while running a function.
 */
export async function captureProfile(input: {
  run: () => void
  samplingInterval?: number
}): Promise<CpuProfile> {
  const inspector = await import('node:inspector/promises')
  const session = new inspector.Session()
  session.connect()

  const interval = input.samplingInterval ?? 100

  await session.post('Profiler.enable')
  await session.post('Profiler.setSamplingInterval', { interval })
  await session.post('Profiler.start')

  input.run()

  const result = await session.post('Profiler.stop')
  session.disconnect()

  return result.profile as CpuProfile
}

/**
 * Write a .cpuprofile file (compatible with Chrome DevTools / speedscope).
 */
export function serializeProfile(profile: CpuProfile): string {
  return JSON.stringify(profile, null, 2)
}

/**
 * Extract the top-N hottest functions from a CPU profile.
 */
export function extractHotspots(input: {
  profile: CpuProfile
  limit?: number
}): HotspotEntry[] {
  const { profile } = input
  const limit = input.limit ?? 20
  const nodeMap = new Map<number, CpuProfileNode>()

  for (const node of profile.nodes) {
    nodeMap.set(node.id, node)
  }

  // Compute self time from samples + timeDeltas
  const selfTimes = new Map<number, number>()
  let totalDuration = 0

  for (let i = 0; i < profile.samples.length; i++) {
    const nodeId = profile.samples[i]!
    const delta = profile.timeDeltas[i] ?? 0
    totalDuration += delta
    selfTimes.set(nodeId, (selfTimes.get(nodeId) ?? 0) + delta)
  }

  // Compute total time (self + children) via DFS
  const totalTimes = new Map<number, number>()

  function computeTotal(id: number): number {
    if (totalTimes.has(id)) return totalTimes.get(id)!

    const node = nodeMap.get(id)
    if (!node) return 0

    let total = selfTimes.get(id) ?? 0
    for (const childId of node.children ?? []) {
      total += computeTotal(childId)
    }
    totalTimes.set(id, total)
    return total
  }

  for (const node of profile.nodes) {
    computeTotal(node.id)
  }

  // Build hotspot entries
  const entries: HotspotEntry[] = []

  for (const node of profile.nodes) {
    const selfTime = selfTimes.get(node.id) ?? 0
    if (selfTime === 0) continue

    const name = node.callFrame.functionName || '(anonymous)'
    if (name === '(idle)' || name === '(program)' || name === '(garbage collector)') continue

    entries.push({
      functionName: name,
      url: node.callFrame.url,
      line: node.callFrame.lineNumber + 1,
      selfTime,
      totalTime: totalTimes.get(node.id) ?? selfTime,
      selfPct: totalDuration > 0 ? (selfTime / totalDuration) * 100 : 0,
      totalPct: totalDuration > 0 ? ((totalTimes.get(node.id) ?? selfTime) / totalDuration) * 100 : 0,
    })
  }

  // Sort by self time descending
  entries.sort((a, b) => b.selfTime - a.selfTime)

  return entries.slice(0, limit)
}

/**
 * Format hotspots as a table.
 */
export function formatHotspots(entries: HotspotEntry[]): string {
  const header = [
    'Time%'.padStart(8),
    'Self%'.padStart(8),
    'Function'.padEnd(30),
    'Location'.padEnd(40),
  ].join('  ')

  const sep = '-'.repeat(90)

  const rows = entries.map(e => {
    const loc = e.url ? `${e.url.split('/').pop()}:${e.line}` : '(unknown)'
    return [
      `${e.totalPct.toFixed(1)}%`.padStart(8),
      `${e.selfPct.toFixed(1)}%`.padStart(8),
      e.functionName.padEnd(30),
      loc.padEnd(40),
    ].join('  ')
  })

  return [header, sep, ...rows].join('\n')
}
