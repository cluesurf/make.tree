import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import { castBook as castTS } from '@/cast/typescript'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileAll(name: string) {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  const { book } = desugarCard({ card })
  return {
    rust: castRust({ book }),
    kotlin: castKotlin({ book }),
    swift: castSwift({ book }),
    ts: castTS({ book }),
  }
}

describe('numeric type compilation across backends', () => {
  const out = compileAll('numeric-types.tree')

  describe('Rust backend', () => {
    it('emits i8 for i8 params', () => {
      expect(out.rust).toContain('fn use_i8(x: i8) -> i8')
    })
    it('emits i16 for i16 params', () => {
      expect(out.rust).toContain('fn use_i16(x: i16) -> i16')
    })
    it('emits i32 for i32 params', () => {
      expect(out.rust).toContain('fn use_i32(x: i32) -> i32')
    })
    it('emits i64 for i64 params', () => {
      expect(out.rust).toContain('fn use_i64(x: i64) -> i64')
    })
    it('emits u8 for u8 params', () => {
      expect(out.rust).toContain('fn use_u8(x: u8) -> u8')
    })
    it('emits u16 for u16 params', () => {
      expect(out.rust).toContain('fn use_u16(x: u16) -> u16')
    })
    it('emits u32 for u32 params', () => {
      expect(out.rust).toContain('fn use_u32(x: u32) -> u32')
    })
    it('emits u64 for u64 params', () => {
      expect(out.rust).toContain('fn use_u64(x: u64) -> u64')
    })
    it('emits f32 for f32 params', () => {
      expect(out.rust).toContain('fn use_f32(x: f32) -> f32')
    })
    it('emits f64 for f64 params', () => {
      expect(out.rust).toContain('fn use_f64(x: f64) -> f64')
    })
  })

  describe('TypeScript backend', () => {
    it('emits number for all fixed-size numeric types', () => {
      expect(out.ts).toContain('function useI8(x: number)')
      expect(out.ts).toContain('function useI16(x: number)')
      expect(out.ts).toContain('function useI32(x: number)')
      expect(out.ts).toContain('function useI64(x: number)')
      expect(out.ts).toContain('function useU8(x: number)')
      expect(out.ts).toContain('function useU16(x: number)')
      expect(out.ts).toContain('function useU32(x: number)')
      expect(out.ts).toContain('function useU64(x: number)')
      expect(out.ts).toContain('function useF32(x: number)')
      expect(out.ts).toContain('function useF64(x: number)')
    })
  })
})
