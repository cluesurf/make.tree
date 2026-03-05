export type TimeConfig = {
  /** Time budget in milliseconds (default 3000). */
  budget: number
  /** Warmup iterations (0 = auto-detect). */
  warmup: number
  /** Explicit iteration count (overrides budget if set). */
  iterations: number | null
}

export type TimeResult = {
  name: string
  iterations: number
  mean_ns: number
  median_ns: number
  std_dev_ns: number
  min_ns: number
  max_ns: number
  ops_per_sec: number
  cv: number
  timings_ns: number[]
}

export type TimeSuite = {
  results: TimeResult[]
  timestamp: string
  platform: string
}

export const DEFAULT_CONFIG: TimeConfig = {
  budget: 3000,
  warmup: 0,
  iterations: null,
}
