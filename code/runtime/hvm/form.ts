// form.ts - Value types for marshaling between native and HVM terms.

export type HandleId = number

export type HvmValue =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'list'; value: HvmValue[] }
  | { kind: 'record'; name: number; fields: HvmValue[] }
  | { kind: 'handle'; id: HandleId }
  | { kind: 'null' }

export function hvmNum(value: number): HvmValue {
  return { kind: 'num', value }
}

export function hvmStr(value: string): HvmValue {
  return { kind: 'str', value }
}

export function hvmBool(value: boolean): HvmValue {
  return { kind: 'bool', value }
}

export function hvmList(value: HvmValue[]): HvmValue {
  return { kind: 'list', value }
}

export function hvmRecord(input: { name: number; fields: HvmValue[] }): HvmValue {
  return { kind: 'record', name: input.name, fields: input.fields }
}

export function hvmHandle(id: HandleId): HvmValue {
  return { kind: 'handle', id }
}

export function hvmNull(): HvmValue {
  return { kind: 'null' }
}
