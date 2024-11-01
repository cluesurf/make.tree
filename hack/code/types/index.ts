export type All = {
  bind: Term
  body: Term
  erased?: boolean
  name: Name
  typeName: 'All'
} & BaseNode
export type Ann = {
  expr: Term
  type: Term
  typeName: 'Ann'
} & BaseNode

export type App = {
  argm: Term
  erased?: boolean
  func: Term
  typeName: 'App'
} & BaseNode

export type Lam = {
  body: Term
  erased?: boolean
  name: Name
  typeName: 'Lam'
} & BaseNode

export type Let = {
  body: Term
  expr: Term
  name: Name
  typeName: 'Let'
} & BaseNode

type BaseNode = {
  location?: Location
}

export type Level = number

export type Location = {
  end: Position
  fileName: string
  start: Position
}

export type Met = {
  index: number
  typeName: 'Met'
} & BaseNode

export type Name = string

export type Position = {
  column: number
  line: number
  offset: number
}

export type Ref = {
  name: Name
  typeName: 'Ref'
} & BaseNode

export type Src = {
  location: Location
  term: Term
  typeName: 'Src'
} & BaseNode

export type Term =
  | Var
  | Typ
  | All
  | Lam
  | App
  | Let
  | Ann
  | Ref
  | Met
  | Src

export type Typ = {
  level: Level
  typeName: 'Typ'
} & BaseNode

export type Var = {
  index?: number
  name: Name
  typeName: 'Var'
} & BaseNode
