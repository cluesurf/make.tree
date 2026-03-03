/**
 * Core Term types: Kind-style lambda calculus with self-types.
 *
 * This is the internal representation used for type checking and
 * code generation. Users never see these directly. The Surface AST
 * (task, form, call, save, fork, walk) is desugared into these.
 *
 * Modeled after Kind's Type.hs. Uses HOAS (higher-order abstract
 * syntax) for variable binding, same as Kind.
 *
 * The self-type constructs (Slf, Ins) enable dependent types and
 * proof assistant features without built-in inductive types.
 */

import type { Site } from '@/kink/site'

/** Numeric binary operators. */
export type Oper =
  | 'add' | 'sub' | 'mul' | 'div'
  | 'mod' | 'eq'  | 'ne'  | 'lt'
  | 'gt'  | 'lte' | 'gte' | 'and'
  | 'or'  | 'xor' | 'lsh' | 'rsh'

/** Pi type: forall(x: A) B */
export type TermAll = {
  form: 'all'
  name: string
  inp: Term
  bod: (x: Term) => Term
}

/** Lambda: lambda(x) body */
export type TermLam = {
  form: 'lam'
  name: string
  bod: (x: Term) => Term
}

/** Application: (fun arg) */
export type TermApp = {
  form: 'app'
  func: Term
  argm: Term
}

/** Annotation: {val : typ} */
export type TermAnn = {
  form: 'ann'
  done: boolean
  val: Term
  typ: Term
}

/** Self-type: $(x: A) B */
export type TermSlf = {
  form: 'slf'
  name: string
  typ: Term
  bod: (x: Term) => Term
}

/** Self-instantiation: ~x */
export type TermIns = {
  form: 'ins'
  val: Term
}

/** Algebraic data type with constructors */
export type TermADT = {
  form: 'adt'
  indx: Term[]
  ctrs: Ctr[]
  type: Term
}

/** Constructor value: #Name { args } */
export type TermCon = {
  form: 'con'
  name: string
  args: Array<[string | null, Term]>
}

/** Pattern match: lambda{ #C0: B0, #C1: B1 } */
export type TermMat = {
  form: 'mat'
  arms: Array<[string, Term]>
}

/** Top-level reference */
export type TermRef = {
  form: 'ref'
  name: string
}

/** Let binding: let x = val; body */
export type TermLet = {
  form: 'let'
  name: string
  val: Term
  bod: (x: Term) => Term
}

/** Use binding: use x = val; body */
export type TermUse = {
  form: 'use'
  name: string
  val: Term
  bod: (x: Term) => Term
}

/** Universe (type of types) */
export type TermSet = {
  form: 'set'
}

/** U64 type */
export type TermU64 = {
  form: 'u64'
}

/** F64 type */
export type TermF64 = {
  form: 'f64'
}

/** U64 value */
export type TermNum = {
  form: 'num'
  val: number
}

/** F64 value */
export type TermFlt = {
  form: 'flt'
  val: number
}

/** Binary operation: (op a b) */
export type TermOp2 = {
  form: 'op2'
  oper: Oper
  a: Term
  b: Term
}

/** U64 switch: lambda{ 0: A, 1+p: B } */
export type TermSwi = {
  form: 'swi'
  zero: Term
  succ: Term
}

/** Text literal (sugar, encoded as list of chars) */
export type TermTxt = {
  form: 'txt'
  val: string
}

/** List literal (sugar) */
export type TermLst = {
  form: 'lst'
  list: Term[]
}

/** Nat literal (sugar) */
export type TermNat = {
  form: 'nat'
  val: number
}

/** Inspection hole (for proof development) */
export type TermHol = {
  form: 'hol'
  name: string
  ctx: Term[]
}

/** Unification metavariable */
export type TermMet = {
  form: 'met'
  uid: number
  ctx: Term[]
}

/** Variable (de Bruijn level) */
export type TermVar = {
  form: 'var'
  name: string
  idx: number
}

/** Source location wrapper */
export type TermSrc = {
  form: 'src'
  site: Site
  val: Term
}

/** Logging (debug print) */
export type TermLog = {
  form: 'log'
  msg: Term
  val: Term
}

/** Debugger breakpoint (rest) */
export type TermRst = {
  form: 'rst'
  val: Term
}

/** Halt (panic/throw with message) */
export type TermHlt = {
  form: 'hlt'
  msg: Term
}

/** Union of all core term variants. */
export type Term =
  | TermAll
  | TermLam
  | TermApp
  | TermAnn
  | TermSlf
  | TermIns
  | TermADT
  | TermCon
  | TermMat
  | TermRef
  | TermLet
  | TermUse
  | TermSet
  | TermU64
  | TermF64
  | TermNum
  | TermFlt
  | TermOp2
  | TermSwi
  | TermTxt
  | TermLst
  | TermNat
  | TermHol
  | TermMet
  | TermVar
  | TermSrc
  | TermLog
  | TermRst
  | TermHlt

/** Constructor in an ADT. */
export type Ctr = {
  name: string
  tele: Tele
}

/** Telescope (list of typed parameters). */
export type Tele =
  | { form: 'ret', term: Term }
  | { form: 'ext', name: string, typ: Term, bod: (x: Term) => Tele }

/** A book of named definitions. */
export type Book = Map<string, Term>

/** Checker output info. */
export type Info =
  | { form: 'found', name: string, term: Term, ctx: Term[], dep: number }
  | { form: 'solve', uid: number, term: Term, dep: number }
  | { form: 'error', site: Site | null, need: Term, have: Term, term: Term, dep: number }
  | { form: 'vague', name: string }
  | { form: 'print', term: Term, dep: number }

/** Unification solutions: metavar uid -> solved term. */
export type Fill = Map<number, Term>

/** A suspended type check (re-checked after metavar solving). */
export type Susp = {
  need: Term
  have: Term
  dep: number
}

/** Checker state. */
export type State = {
  book: Book
  fill: Fill
  susp: Susp[]
  logs: Info[]
}
