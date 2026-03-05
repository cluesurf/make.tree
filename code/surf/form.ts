/**
 * Surface AST: the imperative Term language.
 *
 * Users write task, form, call, save, fork, walk, etc.
 * The mill engine (mine/mint) produces these nodes from Tree AST.
 * Phase 3 (desugar) converts them to Core Terms for type checking.
 *
 * Every node carries a Loc for error reporting and debugging.
 */

import type { Site } from '@/kink/site'

/** Base shape for all surface nodes. */
export type SurfMixin = {
  form: string
  site: Site
}

// -- Definitions --

export type SurfTask = SurfMixin & {
  form: 'task'
  name: string
  head: SurfHead[]
  base: SurfBase[]
  flow: Surf[]
  task: SurfTask[]
  like?: SurfType
  risk?: boolean
  wait?: boolean
  hide?: boolean
  firm?: boolean
}

export type SurfForm = SurfMixin & {
  form: 'form'
  name: string
  head: SurfHead[]
  link: SurfLink[]
  case: SurfCaseArm[]
  bond: Surf[]
  task: SurfTask[]
  wear: SurfWear[]
  like?: SurfType
  hide?: boolean
  firm?: boolean
  hold?: Surf[]
}

export type SurfMask = SurfMixin & {
  form: 'mask'
  name: string
  task: SurfTask[]
}

export type SurfSuit = SurfMixin & {
  form: 'suit'
  name: string
  wear: SurfWear[]
}

export type SurfWear = SurfMixin & {
  form: 'wear'
  name: string
  task: SurfTask[]
}

export type SurfTest = SurfMixin & {
  form: 'test'
  name: string
  flow: Surf[]
}

// -- Type expressions --

export type SurfType =
  | { form: 'type-name'; name: string; args?: SurfType[] }
  | { form: 'type-or'; list: SurfType[] }
  | { form: 'type-and'; list: SurfType[] }
  | { form: 'type-fn'; params: SurfType[]; ret?: SurfType }

// -- Type annotations --

export type SurfHead = SurfMixin & {
  form: 'head'
  name: string
  need?: string
  fall?: Surf
}

export type SurfBase = SurfMixin & {
  form: 'base'
  name: string
  like?: SurfType
  fall?: Surf
}

export type SurfLink = SurfMixin & {
  form: 'link'
  name: string
  like?: SurfType
}

export type SurfCaseArm = SurfMixin & {
  form: 'case-arm'
  name: string
  link: SurfLink[]
}

export type SurfBond = SurfMixin & {
  form: 'bond'
  name: string
  call: Surf[]
}

// -- Binding and assignment --

export type SurfBind = SurfMixin & {
  form: 'bind'
  name: string
  sift?: Surf
}

export type SurfSave = SurfMixin & {
  form: 'save'
  path: string[]
  sift?: Surf
}

export type SurfHost = SurfMixin & {
  form: 'host'
  name: string
  sift?: Surf
  list?: Surf[]
}

export type SurfMake = SurfMixin & {
  form: 'make'
  name: string
  bind: SurfBind[]
}

// -- Control flow --

export type SurfCall = SurfMixin & {
  form: 'call'
  name: string
  bind: SurfBind[]
  hook: Record<string, SurfHook>
  halt?: boolean
  wait?: boolean
}

export type SurfBack = SurfMixin & {
  form: 'back'
  sift?: Surf
}

export type SurfHalt = SurfMixin & {
  form: 'halt'
  term?: string
  sift?: Surf
}

export type SurfRest = SurfMixin & {
  form: 'rest'
}

export type SurfNext = SurfMixin & {
  form: 'next'
}

export type SurfSlot = SurfMixin & {
  form: 'slot'
  name: string
}

export type SurfBeam = SurfMixin & {
  form: 'beam'
  name: string
  flow: Surf[]
}

export type SurfMeet = SurfMixin & {
  form: 'meet'
  mode: 'and' | 'or'
  list: Surf[]
}

export type SurfFork = SurfMixin & {
  form: 'fork'
  mode: string
  sift?: Surf
  hook: SurfHook[]
}

export type SurfWalk = SurfMixin & {
  form: 'walk'
  mode: string
  sift?: Surf
  hook: SurfHook[]
}

export type SurfHook = SurfMixin & {
  form: 'hook'
  name: string
  base: SurfBase[]
  flow: Surf[]
}

// -- Modules --

export type SurfBear = SurfMixin & {
  form: 'bear'
  path: string[]
}

export type SurfLoad = SurfMixin & {
  form: 'load'
  path: string[]
  name?: string
  find: SurfFind[]
  hook: SurfLoadHook[]
  dock?: boolean
}

export type SurfFind = SurfMixin & {
  form: 'find'
  name: string
  kind?: string
  alias?: string
}

export type SurfLoadHook = SurfMixin & {
  form: 'load-hook'
  kind: string
  name: string
}


// -- Macros --

export type SurfTree = SurfMixin & {
  form: 'tree'
  name: string
  base: SurfBase[]
  hook: SurfTreeHook[]
}

export type SurfTreeHook = SurfMixin & {
  form: 'tree-hook'
  name: string
  list: Surf[]
}

export type SurfFuse = SurfMixin & {
  form: 'fuse'
  name: string
  bind: SurfBind[]
}

// -- Value expressions (sift) --

export type SurfSiftLink = SurfMixin & {
  form: 'sift-link'
  path: string[]
  safe?: boolean
}

export type SurfSiftRead = SurfMixin & {
  form: 'sift-read'
  path: string[]
  safe?: boolean
}

export type SurfSiftText = SurfMixin & {
  form: 'sift-text'
  val: string
}

export type SurfSiftMark = SurfMixin & {
  form: 'sift-mark'
  val: number
}

export type SurfSiftWave = SurfMixin & {
  form: 'sift-wave'
  val: boolean
}

export type SurfShow = SurfMixin & {
  form: 'show'
  sift?: Surf
}

// -- Logging --

export type SurfDive = SurfMixin & { form: 'dive', sift?: Surf }
export type SurfHint = SurfMixin & { form: 'hint-log', sift?: Surf }
export type SurfTell = SurfMixin & { form: 'tell', sift?: Surf }
export type SurfKink = SurfMixin & { form: 'kink-log', sift?: Surf }
export type SurfBust = SurfMixin & { form: 'bust', sift?: Surf }

// -- Namespaces --

export type SurfBook = SurfMixin & {
  form: 'book'
  name: string
  list: Surf[]
}

/** Union of all surface AST nodes. */
export type Surf =
  // Definitions
  | SurfTask
  | SurfForm
  | SurfMask
  | SurfSuit
  | SurfWear
  | SurfTest
  // Type annotations
  | SurfHead
  | SurfBase
  | SurfLink
  | SurfCaseArm
  | SurfBond
  // Binding and assignment
  | SurfBind
  | SurfSave
  | SurfHost
  | SurfMake
  // Control flow
  | SurfCall
  | SurfBack
  | SurfHalt
  | SurfRest
  | SurfNext
  | SurfMeet
  | SurfFork
  | SurfWalk
  | SurfHook
  | SurfSlot
  | SurfBeam
  // Modules
  | SurfBear
  | SurfLoad
  | SurfFind
  | SurfLoadHook
  // Macros
  | SurfTree
  | SurfTreeHook
  | SurfFuse
  // Value expressions
  | SurfSiftLink
  | SurfSiftRead
  | SurfSiftText
  | SurfSiftMark
  | SurfSiftWave
  // Namespaces
  | SurfBook
  // Logging
  | SurfShow
  | SurfDive
  | SurfHint
  | SurfTell
  | SurfKink
  | SurfBust

/** A surface-level file (card). */
export type SurfCard = {
  file: string
  list: Surf[]
}
