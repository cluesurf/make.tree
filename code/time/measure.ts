import type { TimeConfig } from './form'

/**
 * Run a function repeatedly and collect timing data.
 *
 * Returns an array of elapsed times in nanoseconds.
 */
export function measure(input: {
  setup?: () => void
  body: () => void
  config: TimeConfig
}): number[] {
  const { setup, body, config } = input

  if (setup) setup()

  // Warmup phase
  const warmupCount = config.warmup > 0
    ? config.warmup
    : detectWarmup(body, config.budget)

  for (let i = 0; i < warmupCount; i++) {
    body()
  }

  // Measurement phase
  const timings: number[] = []

  if (config.iterations != null) {
    for (let i = 0; i < config.iterations; i++) {
      const start = performance.now()
      body()
      const end = performance.now()
      timings.push((end - start) * 1e6) // ms → ns
    }
  } else {
    const deadline = performance.now() + config.budget
    while (performance.now() < deadline) {
      const start = performance.now()
      body()
      const end = performance.now()
      timings.push((end - start) * 1e6)
    }
  }

  return timings
}

/**
 * Auto-detect warmup by running until coefficient of variation
 * stabilizes (CV < 2% over a rolling window of 50 samples).
 * Cap at 10% of the time budget.
 */
function detectWarmup(body: () => void, budgetMs: number): number {
  const maxTime = budgetMs * 0.1
  const windowSize = 50
  const threshold = 0.02
  const deadline = performance.now() + maxTime

  const recent: number[] = []
  let count = 0

  while (performance.now() < deadline) {
    const start = performance.now()
    body()
    const end = performance.now()
    const elapsed = end - start

    recent.push(elapsed)
    if (recent.length > windowSize) recent.shift()
    count++

    if (recent.length >= windowSize) {
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length
      if (mean > 0) {
        const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / (recent.length - 1)
        const cv = Math.sqrt(variance) / mean
        if (cv < threshold) break
      }
    }
  }

  return count
}
