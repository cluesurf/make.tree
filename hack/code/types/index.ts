export type Term =
  | All
  | Lam
  | App
  | Bnd
  | Ann
  | Slf
  | Ins
  | ADT
  | Con
  | Mat
  | Ref
  | Let
  | Nil
  | Use
  | SetType
  | U64
  | F64
  | Num
  | Flt
  | Op2
  | Swi
  | MapType
  | KVs
  | Get
  | Put
  | Hol
  | Met
  | Log
  | Var
  | Src
  | Txt
  | Lst
  | Nat
  | Sub

// Product: ∀(x: A) B
export class All {
  readonly tag = 'All'

  constructor(
    public name: string,
    public paramType: Term,
    public bodyFn: (param: Term) => Term,
  ) {}
}

// Lambda: λx f
export class Lam {
  readonly tag = 'Lam'

  constructor(
    public name: string,
    public bodyFn: (param: Term) => Term,
  ) {}
}

export class Nil {
  readonly tag = 'Nil'
}

// Application: (fun arg)
export class App {
  readonly tag = 'App'

  constructor(public func: Term, public arg: Term) {}
}

// Annotation: {x: T}
export class Ann {
  readonly tag = 'Ann'

  constructor(
    public flag: boolean,
    public expr: Term,
    public type: Term,
  ) {}
}

// Self-Type: $(x: A) B
export class Slf {
  readonly tag = 'Slf'

  constructor(
    public name: string,
    public paramType: Term,
    public bodyFn: (param: Term) => Term,
  ) {}
}

// Self-Inst: ~x
export class Ins {
  readonly tag = 'Ins'

  constructor(public term: Term) {}
}

// Constructor information
export type ConstructorParam = {
  name: string | null
  type: Term
}

// Constructor definition
export class Ctr {
  constructor(public name: string, public tele: Tele) {}
}

// Datatype: #[i0 i1...]{ #C0 Tele0 #C1 Tele1 ... }
export class ADT {
  readonly tag = 'ADT'

  constructor(
    public indices: Array<Term>,
    public constructors: Array<Ctr>,
    public term: Term,
  ) {}
}

// Constructor: #CN { x0 x1 ... }
export class Con {
  readonly tag = 'Con'

  constructor(public name: string, public params: Array<Bnd>) {}
}

export class Bnd {
  readonly tag = 'Bnd'

  constructor(public name: string, public value: Term) {}
}

// Lambda-Match: λ{ #C0:B0 #C1:B1 ... }
export class Mat {
  readonly tag = 'Mat'

  constructor(public cases: Array<Bnd>) {}
}

// Top-Level Reference: Foo
export class Ref {
  readonly tag = 'Ref'

  constructor(public name: string) {}
}

// Local let-definition: let x = val body
export class Let {
  readonly tag = 'Let'

  constructor(
    public name: string,
    public value: Term,
    public bodyFn: (val: Term) => Term,
  ) {}
}

// Local use-definition: use x = val body
export class Use {
  readonly tag = 'Use'

  constructor(
    public name: string,
    public value: Term,
    public bodyFn: (val: Term) => Term,
  ) {}
}

// Universe: Set
export class SetType {
  readonly tag = 'Set'
}

// U64 Type: U64
export class U64 {
  readonly tag = 'U64'
}

// F64 Type: F64
export class F64 {
  readonly tag = 'F64'
}

// U64 Value: 123
export class Num {
  readonly tag = 'Num'

  constructor(public value: number) {}
}

// F64 Value: 1.5
export class Flt {
  readonly tag = 'Flt'

  constructor(public value: number) {}
}

// Numeric Operators
export enum Oper {
  ADD,
  SUB,
  MUL,
  DIV,
  MOD,
  EQ,
  NE,
  LT,
  GT,
  LTE,
  GTE,
  AND,
  OR,
  XOR,
  LSH,
  RSH,
}

// Binary Operation: (+ x y)
export class Op2 {
  readonly tag = 'Op2'

  constructor(
    public operator: Oper,
    public left: Term,
    public right: Term,
  ) {}
}

// U64 Elimination: λ{ 0:A 1+p:B }
export class Swi {
  readonly tag = 'Swi'

  constructor(public zero: Term, public succ: Term) {}
}

// Linear Map Type: (Map T)
export class MapType {
  readonly tag = 'Map'

  constructor(public elemType: Term) {}
}

// Linear Map Value: { k0:v0 k1:v1 ... | default }
export class KVs {
  readonly tag = 'KVs'

  constructor(
    public entries: Map<number, Term>,
    public defaultValue: Term,
  ) {}
}

// Linear Map Getter
export class Get {
  readonly tag = 'Get'

  constructor(
    public got: string,
    public name: string,
    public map: Term,
    public key: Term,
    public bodyFn: (value: Term, map: Term) => Term,
  ) {}
}

// Map Swapper
export class Put {
  readonly tag = 'Put'

  constructor(
    public got: string,
    public name: string,
    public map: Term,
    public key: Term,
    public value: Term,
    public bodyFn: (oldValue: Term, newMap: Term) => Term,
  ) {}
}

// Inspection Hole
export class Hol {
  readonly tag = 'Hol'

  constructor(public name: string, public terms: Array<Term>) {}
}

// Unification Metavar
export class Met {
  readonly tag = 'Met'

  constructor(public id: number, public terms: Array<Term>) {}
}

// Logging
export class Log {
  readonly tag = 'Log'

  constructor(public message: Term, public next: Term) {}
}

// Variable
export class Var {
  readonly tag = 'Var'

  constructor(public name: string, public index: number) {}
}

// Source Location
export class Loc {
  constructor(
    public name: string,
    public line: number,
    public column: number,
  ) {}
}

export class Cod {
  constructor(public start: Loc, public end: Loc) {}
}

// Source Location Term
export class Src {
  readonly tag = 'Src'

  constructor(public code: Cod, public term: Term) {}
}

// Text Literal
export class Txt {
  readonly tag = 'Txt'

  constructor(public value: string) {}
}

// List Literal
export class Lst {
  readonly tag = 'Lst'

  constructor(public items: Array<Term>) {}
}

// Nat Literal
export class Nat {
  readonly tag = 'Nat'

  constructor(public value: number) {}
}

// Substitution
export class Sub {
  readonly tag = 'Sub'

  constructor(public term: Term) {}
}

export class TRet {
  readonly tag = 'TRet'

  constructor(public term: Term) {}
}

export class TExt {
  readonly tag = 'TExt'

  constructor(
    public bodyFn: (param: Term) => Tele,
    public name: string,
    public paramType: Term,
  ) {}
}

// Telescope
export type Tele = TRet | TExt

export class Found {
  readonly tag: 'Found' = 'Found'

  constructor(
    public count: number,
    public name: string,
    public term: Term,
    public terms: Array<Term>,
  ) {}
}

export class Solve {
  readonly tag: 'Solve' = 'Solve'

  constructor(
    public count: number,
    public id: number,
    public solution: Term,
  ) {}
}

export class Error {
  readonly tag: 'Error' = 'Error'

  constructor(
    public code: Cod | null,
    public expected: Term,
    public actual: Term,
    public term: Term,
    public count: number,
  ) {}
}

export class Vague {
  constructor(public message: string) {}
}

export class Print {
  readonly tag: 'Print' = 'Print'

  constructor(public count: number, public term: Term) {}
}

// Type-Checker Outputs
export type Info = Found | Solve | Error | Vague | Print

// Book of Definitions
export type Book = Map<string, Term>

// Unification Solutions
export type Fill = Map<number, Term>

// Checker State
export class Check {
  constructor(
    public code: Cod | null,
    public expected: Term,
    public actual: Term,
    public count: number,
  ) {}
}

export class State {
  constructor(
    public book: Book,
    public fill: Fill,
    public checks: Array<Check>,
    public info: Array<Info>,
  ) {}
}

export class Done<T> {
  readonly tag: 'Done' = 'Done'

  constructor(public state: State, public value: T) {}
}

export class Fail {
  readonly tag: 'Fail' = 'Fail'

  constructor(public state: State) {}
}

export type Res<T> = Done<T> | Fail
