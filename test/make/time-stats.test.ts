/**
 * Tests for benchmark statistical calculations.
 */

import { describe, it, expect } from 'vitest'
import { computeStats } from '@/time/stats'

describe('time stats', () => {
  it('computes mean correctly', () => {
    const stats = computeStats([100, 200, 300, 400, 500])
    expect(stats.mean).toBe(300)
  })

  it('computes median for odd count', () => {
    const stats = computeStats([100, 200, 300, 400, 500])
    expect(stats.median).toBe(300)
  })

  it('computes median for even count', () => {
    const stats = computeStats([100, 200, 300, 400])
    expect(stats.median).toBe(250)
  })

  it('computes min and max', () => {
    const stats = computeStats([50, 100, 200, 300, 1000])
    expect(stats.min).toBe(50)
    expect(stats.max).toBe(1000)
  })

  it('computes standard deviation', () => {
    const stats = computeStats([100, 100, 100, 100, 100])
    expect(stats.std_dev).toBe(0)
  })

  it('detects outliers', () => {
    const data = [100, 101, 99, 100, 102, 98, 100, 101, 99, 500]
    const stats = computeStats(data)
    expect(stats.outliers).toBeGreaterThan(0)
  })

  it('computes coefficient of variation', () => {
    const stats = computeStats([100, 100, 100, 100])
    expect(stats.cv).toBe(0)
  })

  it('handles single element', () => {
    const stats = computeStats([42])
    expect(stats.mean).toBe(42)
    expect(stats.median).toBe(42)
    expect(stats.min).toBe(42)
    expect(stats.max).toBe(42)
  })
})
