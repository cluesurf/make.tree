/**
 * Benchmark runner: discovers `time` blocks in .tree files,
 * compiles them, and executes them with timing measurement.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { SurfCard, SurfTime, SurfHead } from '@/surf/form'
import type { TimeConfig, TimeResult, TimeSuite } from './form'
import { DEFAULT_CONFIG } from './form'
import { measure } from './measure'
import { computeStats } from './stats'

export type TimeBlock = {
  name: string
  config: TimeConfig
  surf: SurfTime
  file: string
}

/**
 * Discover all `time` blocks from a parsed SurfCard.
 */
export function discoverTimeBlocks(input: {
  card: SurfCard
  file: string
}): TimeBlock[] {
  const blocks: TimeBlock[] = []

  for (const node of input.card.list) {
    if (node.form === 'time') {
      blocks.push({
        name: node.name,
        config: parseConfig(node.head),
        surf: node,
        file: input.file,
      })
    }
  }

  return blocks
}

/**
 * Parse `head` annotations into a TimeConfig.
 */
function parseConfig(heads: SurfHead[]): TimeConfig {
  const config = { ...DEFAULT_CONFIG }

  for (const head of heads) {
    switch (head.name) {
      case 'time': {
        const val = head.fall
        if (val && val.form === 'size') {
          config.budget = (val as any).bond * 1000
        }
        break
      }
      case 'warm': {
        const val = head.fall
        if (val && val.form === 'size') {
          config.warmup = (val as any).bond
        }
        break
      }
      case 'iter': {
        const val = head.fall
        if (val && val.form === 'size') {
          config.iterations = (val as any).bond
        }
        break
      }
    }
  }

  return config
}

/**
 * Run a single time block and return the result.
 * The `run` callback executes the compiled benchmark body.
 */
export function runTimeBlock(input: {
  block: TimeBlock
  run: () => void
  setup?: () => void
}): TimeResult {
  const timings = measure({
    body: input.run,
    setup: input.setup,
    config: input.block.config,
  })

  const stats = computeStats(timings)

  return {
    name: input.block.name,
    iterations: timings.length,
    mean_ns: stats.mean,
    median_ns: stats.median,
    std_dev_ns: stats.std_dev,
    min_ns: stats.min,
    max_ns: stats.max,
    ops_per_sec: stats.mean > 0 ? 1e9 / stats.mean : 0,
    cv: stats.cv,
    timings_ns: timings,
  }
}

/**
 * Build a TimeSuite from an array of results.
 */
export function buildSuite(results: TimeResult[]): TimeSuite {
  return {
    results,
    timestamp: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}-node${process.version}`,
  }
}
