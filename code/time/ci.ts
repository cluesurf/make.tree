/**
 * CI integration: markdown summaries and regression gating.
 */

import type { ComparisonResult } from './compare'
import type { TimeSuite } from './form'

/**
 * Generate a markdown summary suitable for PR comments.
 */
export function formatMarkdown(input: {
  result: ComparisonResult
  suite: TimeSuite
}): string {
  const { result, suite } = input
  const lines: string[] = []

  lines.push('## Benchmark Results')
  lines.push('')
  lines.push(`Platform: ${suite.platform}`)
  lines.push(`Timestamp: ${suite.timestamp}`)
  lines.push('')
  lines.push('| Benchmark | Before | After | Change |')
  lines.push('|-----------|--------|-------|--------|')

  for (const row of result.rows) {
    const sign = row.change_pct > 0 ? '+' : ''
    const changeStr = row.significant
      ? `${sign}${row.change_pct.toFixed(1)}%`
      : `${sign}${row.change_pct.toFixed(1)}% (not significant)`

    lines.push(
      `| ${row.name} | ${formatNs(row.before_ns)} | ${formatNs(row.after_ns)} | ${changeStr} |`,
    )
  }

  if (result.regressions > 0) {
    lines.push('')
    lines.push(`**${result.regressions} regression(s) detected** (p < ${result.threshold})`)
  } else {
    lines.push('')
    lines.push('No significant regressions detected.')
  }

  return lines.join('\n')
}

/**
 * Check if results should fail the CI build.
 */
export function shouldFail(input: {
  result: ComparisonResult
  maxRegressionPct: number
}): boolean {
  const { result, maxRegressionPct } = input

  for (const row of result.rows) {
    if (row.significant && row.change_pct > maxRegressionPct) {
      return true
    }
  }

  return false
}

/**
 * Store benchmark results with commit metadata.
 */
export function buildHistoryEntry(input: {
  suite: TimeSuite
  commit?: string
}): {
  commit: string | undefined
  timestamp: string
  platform: string
  benchmarks: Array<{
    name: string
    mean_ns: number
    median_ns: number
    std_dev_ns: number
    ops_per_sec: number
  }>
} {
  return {
    commit: input.commit,
    timestamp: input.suite.timestamp,
    platform: input.suite.platform,
    benchmarks: input.suite.results.map(r => ({
      name: r.name,
      mean_ns: Math.round(r.mean_ns),
      median_ns: Math.round(r.median_ns),
      std_dev_ns: Math.round(r.std_dev_ns),
      ops_per_sec: Math.round(r.ops_per_sec),
    })),
  }
}

function formatNs(ns: number): string {
  if (ns < 1000) return `${ns.toFixed(1)}ns`
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(1)}us`
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`
  return `${(ns / 1_000_000_000).toFixed(2)}s`
}
