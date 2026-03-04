// base.ts - HVM4 constants and term layout helpers.
//
// These mirror the defines in hvm.c. Keep in sync with upstream.

// Tags
// ====

export const APP = 0
export const VAR = 1
export const LAM = 2
export const DP0 = 3
export const DP1 = 4
export const SUP = 5
export const DUP = 6
export const ALO = 7
export const REF = 8
export const NAM = 9
export const DRY = 10
export const ERA = 11
export const MAT = 12
export const C00 = 13
export const C01 = 14
export const C02 = 15
export const C03 = 16
export const C04 = 17
export const C05 = 18
export const C06 = 19
export const C07 = 20
export const C08 = 21
export const C09 = 22
export const C10 = 23
export const C11 = 24
export const C12 = 25
export const C13 = 26
export const C14 = 27
export const C15 = 28
export const C16 = 29
export const NUM = 30
export const SWI = 31
export const USE = 32
export const OP2 = 33
export const PRI = 45

// Bit layout
// ==========
//
// SUB (1 bit) | TAG (7 bits) | EXT (18 bits) | VAL (38 bits)

export const SUB_BITS = 1
export const TAG_BITS = 7
export const EXT_BITS = 18
export const VAL_BITS = 38

export const SUB_SHIFT = 63n
export const TAG_SHIFT = 56n
export const EXT_SHIFT = 38n
export const VAL_SHIFT = 0n

export const SUB_MASK = 0x1n
export const TAG_MASK = 0x7fn
export const EXT_MASK = 0x3ffffn
export const VAL_MASK = 0x3fffffffffn

// LAM flags
// =========

export const LAM_ERA_MASK = 0x20000

// Operation codes (OP2 ext field)
// ===============================

export const OP_ADD = 0
export const OP_SUB = 1
export const OP_MUL = 2
export const OP_DIV = 3
export const OP_MOD = 4
export const OP_AND = 5
export const OP_OR = 6
export const OP_XOR = 7
export const OP_LSH = 8
export const OP_RSH = 9
export const OP_NOT = 10
export const OP_EQ = 11
export const OP_NE = 12
export const OP_LT = 13
export const OP_LE = 14
export const OP_GT = 15
export const OP_GE = 16

// Term helpers
// ============

export function termTag(term: bigint): number {
  return Number((term >> TAG_SHIFT) & TAG_MASK)
}

export function termExt(term: bigint): number {
  return Number((term >> EXT_SHIFT) & EXT_MASK)
}

export function termVal(term: bigint): bigint {
  return (term >> VAL_SHIFT) & VAL_MASK
}

export function termNew(input: {
  tag: number
  ext: number
  val: bigint
}): bigint {
  return (
    (BigInt(input.tag) << TAG_SHIFT) |
    (BigInt(input.ext) << EXT_SHIFT) |
    (input.val & VAL_MASK)
  )
}

// The ERA term constant (tag=ERA, ext=0, val=0).
export const ERA_TERM = termNew({ tag: ERA, ext: 0, val: 0n })

// Constructor arity from tag.
export function ctrArity(tag: number): number {
  if (tag >= C00 && tag <= C16) {
    return tag - C00
  }
  return -1
}

// Check if a tag is a constructor (C00-C16).
export function isCtr(tag: number): boolean {
  return tag >= C00 && tag <= C16
}
