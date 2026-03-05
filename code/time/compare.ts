/**
 * Baseline comparison with Welch's t-test.
 */

import type { TimeResult, TimeSuite } from './form'

export type ComparisonRow = {
  name: string
  before_ns: number
  after_ns: number
  change_pct: number
  p_value: number
  significant: boolean
}

export type ComparisonResult = {
  rows: ComparisonRow[]
  threshold: number
  regressions: number
}

/**
 * Compare current results against a baseline suite.
 */
export function compareResults(input: {
  current: TimeResult[]
  baseline: TimeSuite
  threshold?: number
}): ComparisonResult {
  const { current, baseline } = input
  const threshold = input.threshold ?? 0.05
  const rows: ComparisonRow[] = []

  for (const cur of current) {
    const base = baseline.results.find(b => b.name === cur.name)
    if (!base) continue

    const change_pct = base.mean_ns > 0
      ? ((cur.mean_ns - base.mean_ns) / base.mean_ns) * 100
      : 0

    const p_value = welchTTest({
      mean1: base.mean_ns,
      mean2: cur.mean_ns,
      std1: base.std_dev_ns,
      std2: cur.std_dev_ns,
      n1: base.iterations,
      n2: cur.iterations,
    })

    rows.push({
      name: cur.name,
      before_ns: base.mean_ns,
      after_ns: cur.mean_ns,
      change_pct,
      p_value,
      significant: p_value < threshold,
    })
  }

  const regressions = rows.filter(r => r.significant && r.change_pct > 0).length

  return { rows, threshold, regressions }
}

/**
 * Welch's t-test for two independent samples with unequal variances.
 * Returns a two-tailed p-value.
 */
function welchTTest(input: {
  mean1: number
  mean2: number
  std1: number
  std2: number
  n1: number
  n2: number
}): number {
  const { mean1, mean2, std1, std2, n1, n2 } = input

  if (n1 < 2 || n2 < 2) return 1
  if (std1 === 0 && std2 === 0) return mean1 === mean2 ? 1 : 0

  const se1 = (std1 * std1) / n1
  const se2 = (std2 * std2) / n2
  const se = Math.sqrt(se1 + se2)

  if (se === 0) return 1

  const t = Math.abs(mean2 - mean1) / se

  // Welch-Satterthwaite degrees of freedom
  const num = (se1 + se2) ** 2
  const den = (se1 * se1) / (n1 - 1) + (se2 * se2) / (n2 - 1)
  const df = den > 0 ? num / den : 1

  return tDistPValue({ t, df })
}

/**
 * Approximate two-tailed p-value from t-distribution.
 * Uses the regularized incomplete beta function approximation.
 */
function tDistPValue(input: { t: number; df: number }): number {
  const { t, df } = input
  const x = df / (df + t * t)
  return regularizedBeta({ x, a: df / 2, b: 0.5 })
}

/**
 * Regularized incomplete beta function via continued fraction.
 * Approximation sufficient for p-value computation.
 */
function regularizedBeta(input: { x: number; a: number; b: number }): number {
  const { x, a, b } = input

  if (x <= 0) return 0
  if (x >= 1) return 1

  // Use the series expansion for small x
  const lnBeta = gammaLn(a) + gammaLn(b) - gammaLn(a + b)
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta)

  // Lentz's continued fraction
  const maxIter = 200
  const eps = 1e-10

  let f = 1
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < eps) d = eps
  d = 1 / d
  f = d

  for (let i = 1; i <= maxIter; i++) {
    const m = i
    // Even step
    let num = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
    d = 1 + num * d
    if (Math.abs(d) < eps) d = eps
    c = 1 + num / c
    if (Math.abs(c) < eps) c = eps
    d = 1 / d
    f *= d * c

    // Odd step
    num = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1))
    d = 1 + num * d
    if (Math.abs(d) < eps) d = eps
    c = 1 + num / c
    if (Math.abs(c) < eps) c = eps
    d = 1 / d
    const delta = d * c
    f *= delta

    if (Math.abs(delta - 1) < eps) break
  }

  return front * f / a
}

/**
 * Log-gamma function (Stirling approximation).
 */
function gammaLn(z: number): number {
  const c = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.001208650973866179,
    -0.000005395239384953,
  ]

  let x = z
  let y = z
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) {
    y += 1
    ser += c[j]! / y
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

/**
 * Format comparison results as a table.
 */
export function formatComparison(result: ComparisonResult): string {
  const header = [
    'Benchmark'.padEnd(30),
    'Before'.padEnd(12),
    'After'.padEnd(12),
    'Change'.padEnd(12),
    'Confidence'.padEnd(20),
  ].join('')

  const sep = '-'.repeat(86)

  const rows = result.rows.map(r => {
    const sign = r.change_pct > 0 ? '+' : ''
    const changeStr = `${sign}${r.change_pct.toFixed(1)}%`
    const confStr = r.significant
      ? `p<${r.p_value < 0.01 ? '0.01' : r.p_value.toFixed(2)}`
      : `p=${r.p_value.toFixed(2)} (not sig)`

    return [
      r.name.padEnd(30),
      formatNs(r.before_ns).padEnd(12),
      formatNs(r.after_ns).padEnd(12),
      changeStr.padEnd(12),
      confStr.padEnd(20),
    ].join('')
  })

  return [header, sep, ...rows].join('\n')
}

function formatNs(ns: number): string {
  if (ns < 1000) return `${ns.toFixed(1)}ns`
  if (ns < 1_000_000) return `${(ns / 1000).toFixed(1)}us`
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`
  return `${(ns / 1_000_000_000).toFixed(2)}s`
}
