export function computeStats(timings: number[]): {
  mean: number
  median: number
  std_dev: number
  min: number
  max: number
  cv: number
  p5: number
  p95: number
  p99: number
  iqr: number
  outliers: number
} {
  const sorted = [...timings].sort((a, b) => a - b)
  const n = sorted.length

  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const median = percentile(sorted, 0.5)
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  const std_dev = Math.sqrt(variance)
  const cv = mean > 0 ? std_dev / mean : 0

  const p5 = percentile(sorted, 0.05)
  const p25 = percentile(sorted, 0.25)
  const p75 = percentile(sorted, 0.75)
  const p95 = percentile(sorted, 0.95)
  const p99 = percentile(sorted, 0.99)
  const iqr = p75 - p25

  const lowerFence = p25 - 1.5 * iqr
  const upperFence = p75 + 1.5 * iqr
  const outliers = sorted.filter(v => v < lowerFence || v > upperFence).length

  return {
    mean,
    median,
    std_dev,
    min: sorted[0]!,
    max: sorted[n - 1]!,
    cv,
    p5,
    p95,
    p99,
    iqr,
    outliers,
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = p * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const frac = idx - lo
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac
}
