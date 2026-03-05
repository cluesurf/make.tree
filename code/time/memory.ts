/**
 * Memory profiling: allocation tracking and heap analysis.
 */

export type MemorySnapshot = {
  heap_used: number
  heap_total: number
  external: number
  array_buffers: number
  rss: number
}

export type MemoryResult = {
  name: string
  before: MemorySnapshot
  after: MemorySnapshot
  heap_growth: number
  allocation_rate: number
  duration_ms: number
  gc_count: number
}

export type MemoryTimeline = {
  entries: Array<{
    time_ms: number
    heap_used: number
    heap_total: number
    external: number
  }>
}

/**
 * Take a snapshot of current memory usage.
 */
export function takeSnapshot(): MemorySnapshot {
  const mem = process.memoryUsage()
  return {
    heap_used: mem.heapUsed,
    heap_total: mem.heapTotal,
    external: mem.external,
    array_buffers: mem.arrayBuffers,
    rss: mem.rss,
  }
}

/**
 * Profile memory usage of a function.
 */
export function profileMemory(input: {
  name: string
  run: () => void
  forceGc?: boolean
}): MemoryResult {
  const { name, run } = input

  // Force GC before measurement if available
  if (input.forceGc && typeof globalThis.gc === 'function') {
    globalThis.gc()
  }

  const before = takeSnapshot()
  const start = performance.now()

  run()

  const end = performance.now()
  const duration_ms = end - start

  // Force GC after to get accurate retained memory
  let gcCount = 0
  if (input.forceGc && typeof globalThis.gc === 'function') {
    globalThis.gc()
    gcCount = 1
  }

  const after = takeSnapshot()

  return {
    name,
    before,
    after,
    heap_growth: after.heap_used - before.heap_used,
    allocation_rate: duration_ms > 0
      ? (after.heap_used - before.heap_used) / (duration_ms / 1000)
      : 0,
    duration_ms,
    gc_count: gcCount,
  }
}

/**
 * Record a memory timeline by sampling at intervals.
 */
export function recordTimeline(input: {
  run: () => void
  intervalMs?: number
}): MemoryTimeline {
  const interval = input.intervalMs ?? 100
  const entries: MemoryTimeline['entries'] = []
  const startTime = performance.now()

  // Start sampling
  const timer = setInterval(() => {
    const mem = process.memoryUsage()
    entries.push({
      time_ms: Math.round(performance.now() - startTime),
      heap_used: mem.heapUsed,
      heap_total: mem.heapTotal,
      external: mem.external,
    })
  }, interval)

  // Run the function
  input.run()

  clearInterval(timer)

  // Final sample
  const mem = process.memoryUsage()
  entries.push({
    time_ms: Math.round(performance.now() - startTime),
    heap_used: mem.heapUsed,
    heap_total: mem.heapTotal,
    external: mem.external,
  })

  return { entries }
}

/**
 * Format memory result as a table row.
 */
export function formatMemoryResult(result: MemoryResult): string {
  const header = [
    'Benchmark'.padEnd(30),
    'Heap Growth'.padEnd(14),
    'Duration'.padEnd(12),
    'Alloc Rate'.padEnd(14),
  ].join('')

  const sep = '-'.repeat(70)

  const row = [
    result.name.padEnd(30),
    formatBytes(result.heap_growth).padEnd(14),
    `${result.duration_ms.toFixed(1)}ms`.padEnd(12),
    `${formatBytes(result.allocation_rate)}/s`.padEnd(14),
  ].join('')

  return [header, sep, row].join('\n')
}

/**
 * Format a memory timeline as CSV.
 */
export function formatTimelineCsv(timeline: MemoryTimeline): string {
  const header = 'time_ms,heap_used_bytes,heap_total_bytes,external_bytes'
  const rows = timeline.entries.map(e =>
    `${e.time_ms},${e.heap_used},${e.heap_total},${e.external}`,
  )
  return [header, ...rows].join('\n')
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes)
  const sign = bytes < 0 ? '-' : '+'
  if (abs < 1024) return `${sign}${abs}B`
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)}KB`
  if (abs < 1024 * 1024 * 1024) return `${sign}${(abs / (1024 * 1024)).toFixed(1)}MB`
  return `${sign}${(abs / (1024 * 1024 * 1024)).toFixed(2)}GB`
}
