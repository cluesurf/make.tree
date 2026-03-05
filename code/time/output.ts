import type { TimeResult, TimeSuite } from './form'

export function formatTable(results: TimeResult[]): string {
  const header = [
    pad('Benchmark', 30),
    pad('Iterations', 12),
    pad('Mean', 12),
    pad('Median', 12),
    pad('Std Dev', 12),
    pad('Ops/sec', 12),
  ].join('')

  const sep = '-'.repeat(90)

  const rows = results.map(r => {
    const row = [
      pad(r.name, 30),
      pad(formatNum(r.iterations), 12),
      pad(formatNs(r.mean_ns), 12),
      pad(formatNs(r.median_ns), 12),
      pad(formatNs(r.std_dev_ns), 12),
      pad(formatNum(r.ops_per_sec), 12),
    ].join('')
    return row
  })

  const warnings = results
    .filter(r => r.cv > 0.05)
    .map(r => `  warning: ${r.name} has high variance (cv=${(r.cv * 100).toFixed(1)}%), results may be unreliable`)

  const parts = [header, sep, ...rows]
  if (warnings.length > 0) {
    parts.push('', ...warnings)
  }
  return parts.join('\n')
}

export function formatJson(suite: TimeSuite): string {
  return JSON.stringify({
    benchmarks: suite.results.map(r => ({
      name: r.name,
      iterations: r.iterations,
      mean_ns: Math.round(r.mean_ns),
      median_ns: Math.round(r.median_ns),
      std_dev_ns: Math.round(r.std_dev_ns),
      min_ns: Math.round(r.min_ns),
      max_ns: Math.round(r.max_ns),
      ops_per_sec: Math.round(r.ops_per_sec),
    })),
    timestamp: suite.timestamp,
    platform: suite.platform,
  }, null, 2)
}

function formatNs(ns: number): string {
  if (ns < 1000) return `${ns.toFixed(1)}ns`
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(1)}us`
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`
  return `${(ns / 1_000_000_000).toFixed(2)}s`
}

function formatNum(n: number): string {
  return n.toLocaleString('en-US')
}

function pad(text: string, width: number): string {
  return text.padEnd(width)
}
