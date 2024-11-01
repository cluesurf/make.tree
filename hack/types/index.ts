// https://github.com/termsurf/make.tree/tree/465133c1daa64cd231c5ce4d8daef9d5173577e0/hack/code/types

// Term types, representing different syntax tree nodes in a type system
export type Term =
  | UniversalType
  | Function
  | Call
  | Binding
  | Annotation
  | Self
  | SelfInstance
  | AlgebraicDataType
  | Constructor
  | PatternMatch
  | Reference
  | LocalDefinition
  | LocalUsage
  | Base
  | UInt64
  | Float64
  | Integer
  | Float
  | BinaryOperation
  | SwitchCase
  | MapType
  | KeyValueMap
  | MapGetter
  | MapSetter
  | Placeholder
  | MetaVariable
  | Logger
  | Variable
  | SourceCode
  | Text
  | List
  | NaturalNumber
  | Substitution

// Universal Type (e.g., ∀(x: A) B)
export type UniversalType = {
  bodyFn: (param: Term) => Term
  name: string
  paramType: Term
  tag: 'UniversalType'
}

// Function (e.g., λx f)
export type Function = {
  bodyFn: (param: Term) => Term
  name: string
  tag: 'Function'
}

// Empty Value
export type Void = {
  tag: 'Void'
}

// Call of a function to an argument
export type Call = {
  arg: Term
  func: Term
  tag: 'Call'
}

// Type Annotation (e.g., {x: T})
export type Annotation = {
  expr: Term
  flag: boolean
  tag: 'Annotation'
  type: Term
}

// Self Type (e.g., $(x: A) B)
export type Self = {
  bodyFn: (param: Term) => Term
  name: string
  paramType: Term
  tag: 'Self'
}

// Instance of a Self Type (e.g., ~x)
export type SelfInstance = {
  tag: 'SelfInstance'
  term: Term
}

// Constructor Parameter
export type ConstructorParameter = {
  name: string | null
  type: Term
}

// Constructor Definition
export type ConstructorDefinition = {
  name: string
  params: Array<ConstructorParameter>
}

// Algebraic Data Type (e.g., #[i0 i1...]{ #C0 Tele0 #C1 Tele1 ... })
export type AlgebraicDataType = {
  constructors: Array<ConstructorDefinition>
  indices: Array<Term>
  tag: 'AlgebraicDataType'
  term: Term
}

// Constructor
export type Constructor = {
  name: string
  params: Array<Binding>
  tag: 'Constructor'
}

// Binding
export type Binding = {
  name: string
  tag: 'Binding'
  value: Term
}

// Pattern Matching (e.g., λ{ #C0:B0 #C1:B1 ... })
export type PatternMatch = {
  cases: Array<Binding>
  tag: 'PatternMatch'
}

// Top-Level Reference
export type Reference = {
  name: string
  tag: 'Reference'
}

// Local Definition (e.g., let x = val body)
export type LocalDefinition = {
  bodyFn: (val: Term) => Term
  name: string
  tag: 'LocalDefinition'
  value: Term
}

// Local Usage (e.g., use x = val body)
export type LocalUsage = {
  bodyFn: (val: Term) => Term
  name: string
  tag: 'LocalUsage'
  value: Term
}

// Type Universe
export type Base = {
  tag: 'Base'
}

// UInt64 Type
export type UInt64 = {
  tag: 'UInt64'
}

// Float64 Type
export type Float64 = {
  tag: 'Float64'
}

// Integer Value (e.g., 123)
export type Integer = {
  tag: 'Integer'
  value: number
}

// Floating Point Value (e.g., 1.5)
export type Float = {
  tag: 'Float'
  value: number
}

// Binary Operation Enum
export enum Operation {
  ADD,
  SUBTRACT,
  MULTIPLY,
  DIVIDE,
  MODULO,
  EQUAL,
  NOT_EQUAL,
  LESS_THAN,
  GREATER_THAN,
  LESS_THAN_OR_EQUAL,
  GREATER_THAN_OR_EQUAL,
  AND,
  OR,
  XOR,
  LEFT_SHIFT,
  RIGHT_SHIFT,
}

// Binary Operation (e.g., (+ x y))
export type BinaryOperation = {
  left: Term
  operator: Operation
  right: Term
  tag: 'BinaryOperation'
}

// Switch Case (e.g., λ{ 0:A 1+p:B })
export type SwitchCase = {
  successorCase: Term
  tag: 'SwitchCase'
  zeroCase: Term
}

// Map Type (e.g., (Map T))
export type MapType = {
  elementType: Term
  tag: 'MapType'
}

// Key-Value Map
export type KeyValueMap = {
  defaultValue: Term
  entries: Map<number, Term>
  tag: 'KeyValueMap'
}

// Map Getter
export type MapGetter = {
  accessor: string
  bodyFn: (value: Term, map: Term) => Term
  key: Term
  map: Term
  mapName: string
  tag: 'MapGetter'
}

// Map Setter
export type MapSetter = {
  accessor: string
  bodyFn: (oldValue: Term, newMap: Term) => Term
  key: Term
  map: Term
  mapName: string
  tag: 'MapSetter'
  value: Term
}

// Placeholder
export type Placeholder = {
  name: string
  tag: 'Placeholder'
  terms: Array<Term>
}

// Meta Variable for Unification
export type MetaVariable = {
  id: number
  tag: 'MetaVariable'
  terms: Array<Term>
}

// Logging
export type Logger = {
  message: Term
  next: Term
  tag: 'Logger'
}

// Variable
export type Variable = {
  index: number
  name: string
  tag: 'Variable'
}

// Source Location
export type SourceLocation = {
  columnNumber: number
  lineNumber: number
}

// Source Code Span
export type CodeSpan = {
  end: SourceLocation
  fileName: string
  start: SourceLocation
}

// Source Code Term
export type SourceCode = {
  span: CodeSpan
  tag: 'SourceCode'
  term: Term
}

// Text Literal
export type Text = {
  tag: 'Text'
  value: string
}

// List Literal
export type List = {
  items: Array<Term>
  tag: 'List'
}

// Natural Number Literal
export type NaturalNumber = {
  tag: 'NaturalNumber'
  value: number
}

// Substitution
export type Substitution = {
  tag: 'Substitution'
  term: Term
}

// Telescope Types
export type Telescope = TelescopeReturn | TelescopeExtension

// Return Telescope
export type TelescopeReturn = {
  tag: 'Return'
  term: Term
}

// Extend Telescope
export type TelescopeExtension = {
  bodyFn: (param: Term) => Telescope
  name: string
  paramType: Term
  tag: 'Extension'
}

// Info Types for Type-Checker Outputs
export type Info =
  | FoundInfo
  | SolvedInfo
  | ErrorInfo
  | GenericInfo
  | PrintInfo

// Found Information
export type FoundInfo = {
  name: string
  occurrence: number
  tag: 'FoundInfo'
  term: Term
  terms: Array<Term>
}

// Solved Information
export type SolvedInfo = {
  id: number
  occurrence: number
  solution: Term
  tag: 'SolvedInfo'
}

// Error Information
export type ErrorInfo = {
  actual: Term
  expected: Term
  location: CodeSpan | null
  occurrence: number
  tag: 'ErrorInfo'
  term: Term
}

// Generic Information
export type GenericInfo = {
  message: string
  tag: 'GenericInfo'
}

// Print Information
export type PrintInfo = {
  occurrence: number
  tag: 'PrintInfo'
  term: Term
}

// Book of Definitions
export type DefinitionsBook = Map<string, Term>

// Unification Solutions
export type SolutionMap = Map<number, Term>

// Checker State
export type CheckerState = {
  checks: Array<CheckerResult>
  definitions: DefinitionsBook
  info: Array<Info>
  solutions: SolutionMap
}

// Checker Result
export type CheckerResult = {
  actual: Term
  expected: Term
  location: CodeSpan | null
  occurrence: number
}

// Result Types
export type Result<T> = Success<T> | Failure

// Success Result
export type Success<T> = {
  state: CheckerState
  tag: 'Success'
  value: T
}

// Failure Result
export type Failure = {
  state: CheckerState
  tag: 'Failure'
}
