/**
 * Checker environment monad.
 *
 * Modeled after Kind's Env.hs. A state-passing monad that carries
 * the book of definitions, metavar solutions (fill), suspended type
 * checks, and info logs. Operations can fail (return null).
 *
 * The Env monad threads State through a chain of checker operations.
 * When an operation fails, the whole chain short-circuits to null.
 */

import type { Site } from '@/kink/site'
import type { Term, Fill, Book, State, Info, Susp } from '@/term/form'

/**
 * The Env monad: a stateful computation that can fail.
 * null = failure (type mismatch, unresolvable metavar, etc.)
 */
export type Env<A> = (state: State) => { state: State; value: A } | null

/** Return a value without modifying state. */
export function envPure<A>(value: A): Env<A> {
  return state => ({ state, value })
}

/** Sequence two Env computations. */
export function envBind<A, B>(input: {
  env: Env<A>
  fn: (a: A) => Env<B>
}): Env<B> {
  const { env, fn } = input
  return state => {
    const result = env(state)
    if (result === null) return null
    return fn(result.value)(result.state)
  }
}

/** A computation that always fails. */
export function envFail<A>(): Env<A> {
  return () => null
}

/** Run an Env computation with initial state. Returns the final state and value, or null. */
export function envRun<A>(input: {
  env: Env<A>
  state: State
}): { state: State; value: A } | null {
  return input.env(input.state)
}

/** Create an empty initial state. */
export function envInit(input: { book: Book }): State {
  return {
    book: input.book,
    fill: new Map(),
    susp: [],
    logs: [],
  }
}

/** Log an info entry. */
export function envLog(info: Info): Env<null> {
  return state => ({
    state: { ...state, logs: [...state.logs, info] },
    value: null,
  })
}

/** Get the current book of definitions. */
export function envGetBook(): Env<Book> {
  return state => ({ state, value: state.book })
}

/** Get the current fill (metavar solutions). */
export function envGetFill(): Env<Fill> {
  return state => ({ state, value: state.fill })
}

/** Get the current logs. */
export function envGetLogs(): Env<Info[]> {
  return state => ({ state, value: state.logs })
}

/** Set a metavar solution. */
export function envFill(input: { uid: number; term: Term }): Env<null> {
  const { uid, term } = input
  return state => {
    const fill = new Map(state.fill)
    fill.set(uid, term)
    return { state: { ...state, fill }, value: null }
  }
}

/** Add a suspended type check. */
export function envSusp(susp: Susp): Env<null> {
  return state => ({
    state: { ...state, susp: [...state.susp, susp] },
    value: null,
  })
}

/** Take all suspended checks, clearing them from state. */
export function envTakeSusp(): Env<Susp[]> {
  return state => ({
    state: { ...state, susp: [] },
    value: state.susp,
  })
}

/** Snapshot the current state (for speculative checking). */
export function envSnapshot(): Env<State> {
  return state => ({ state, value: { ...state } })
}

/** Rewind to a previous state snapshot. */
export function envRewind(snapshot: State): Env<null> {
  return () => ({ state: snapshot, value: null })
}

/** Try an Env computation. If it fails, return the fallback value. */
export function envTry<A>(input: { env: Env<A>; fall: A }): Env<A> {
  const { env, fall } = input
  return state => {
    const result = env(state)
    if (result === null) return { state, value: fall }
    return result
  }
}

/** Map a function over the result of an Env computation. */
export function envMap<A, B>(input: {
  env: Env<A>
  fn: (a: A) => B
}): Env<B> {
  const { env, fn } = input
  return state => {
    const result = env(state)
    if (result === null) return null
    return { state: result.state, value: fn(result.value) }
  }
}

/** Sequence a list of Env computations, collecting results. */
export function envAll<A>(list: Env<A>[]): Env<A[]> {
  return state => {
    const results: A[] = []
    let cur = state
    for (const env of list) {
      const result = env(cur)
      if (result === null) return null
      results.push(result.value)
      cur = result.state
    }
    return { state: cur, value: results }
  }
}

/** Generate a fresh metavar uid. */
let nextMetaUid = 0

export function envFreshMeta(ctx: Term[]): Env<Term> {
  return state => {
    const uid = nextMetaUid++
    const term: Term = { form: 'met', uid, ctx }
    return { state, value: term }
  }
}

/** Reset the metavar counter (for testing). */
export function envResetMeta(): void {
  nextMetaUid = 0
}
