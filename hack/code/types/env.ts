// Import types from the previous module
import { Term, Book, State, Check, Info, Fill, Res } from '.'

// Environment operations
export class Env<A> {
  constructor(public run: (state: State) => Res<A>) {}

  // Functor map
  map<B>(f: (a: A) => B): Env<B> {
    return new Env(state => {
      const result = this.run(state)
      if (result.tag === 'Done') {
        return {
          state: result.state,
          tag: 'Done',
          value: f(result.value),
        }
      } else {
        return result
      }
    })
  }

  // Applicative apply
  ap<B>(ef: Env<(a: A) => B>): Env<B> {
    return new Env(state => {
      const fResult = (ef as Env<(a: A) => B>).run(state)
      if (fResult.tag === 'Done') {
        const aResult = this.run(fResult.state)
        if (aResult.tag === 'Done') {
          return {
            state: aResult.state,
            tag: 'Done',
            value: fResult.value(aResult.value),
          }
        }
        return aResult
      }
      return fResult
    })
  }

  // Monad bind
  bind<B>(f: (a: A) => Env<B>): Env<B> {
    return new Env(state => {
      const result = this.run(state)
      if (result.tag === 'Done') {
        return (f(result.value) as Env<B>).run(result.state)
      }
      return result
    })
  }
}

// Environment constructors and operations
export function envBind<A, B>(ma: Env<A>, f: (a: A) => Env<B>): Env<B> {
  return (ma as Env<A>).bind(f)
}

export function envPure<A>(a: A): Env<A> {
  return new Env(state => ({ state, tag: 'Done', value: a }))
}

export function envFail<A>(): Env<A> {
  return new Env(state => ({ state, tag: 'Fail' }))
}

export function envRun<A>(env: Env<A>, book: Book): Res<A> {
  return (env as Env<A>).run(
    new State(
      book,
      new Map(), // empty fill
      [], // empty suspensions
      [], // empty logs
    ),
  )
}

export function envLog(log: Info): Env<number> {
  return new Env(state => ({
    state: new State(state.book, state.fill, state.checks, [
      log,
      ...state.info,
    ]),
    tag: 'Done',
    value: 1,
  }))
}

export function envSnapshot(): Env<State> {
  return new Env(state => ({
    state,
    tag: 'Done',
    value: state,
  }))
}

export function envRewind(state: State): Env<number> {
  return new Env(_ => ({
    state,
    tag: 'Done',
    value: 0,
  }))
}

export function envSusp(check: Check): Env<void> {
  return new Env(state => ({
    state: new State(
      state.book,
      state.fill,
      [...state.checks, check],
      state.info,
    ),
    tag: 'Done',
    value: undefined,
  }))
}

export function envFill(key: number, value: Term): Env<void> {
  return new Env(state => ({
    state: new State(
      state.book,
      new Map(state.fill).set(key, value),
      state.checks,
      state.info,
    ),
    tag: 'Done',
    value: undefined,
  }))
}

export function envGetFill(): Env<Fill> {
  return new Env(state => ({
    state,
    tag: 'Done',
    value: state.fill,
  }))
}

export function envGetBook(): Env<Book> {
  return new Env(state => ({
    state,
    tag: 'Done',
    value: state.book,
  }))
}

export function envTakeSusp(): Env<Array<Check>> {
  return new Env(state => ({
    state: new State(
      state.book,
      state.fill,
      [], // Clear suspensions
      state.info,
    ),
    tag: 'Done',
    value: state.checks,
  }))
}
