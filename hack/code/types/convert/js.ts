// Type definitions

// Using previous CT type definitions
import { topoSortBook } from '../util'
import { Book, Term, Fill } from '..'

type CTBook = Map<string, CT>

// Operator type (you'll need to define this based on your needs)
type Oper = string // Placeholder - define actual operators

// Compilable Term type
type CT =
  | { type: 'CNul' }
  | { body: (x: CT) => CT; name: string; type: 'CLam' }
  | { arg: CT; fun: CT; type: 'CApp' }
  | { fields: Array<[string, CT]>; name: string; type: 'CCon' }
  | {
      cases: Array<[string, Array<string>, CT]>
      term: CT
      type: 'CMat'
    }
  | { name: string; type: 'CRef' }
  | { name: string; type: 'CHol' }
  | { body: (x: CT) => CT; name: string; type: 'CLet'; val: CT }
  | { type: 'CNum'; value: number }
  | { type: 'CFlt'; value: number }
  | { left: CT; op: Oper; right: CT; type: 'COp2' }
  | { cond: CT; succ: CT; type: 'CSwi'; zero: CT }
  | { default: CT; map: Map<number, CT>; type: 'CKVs' }
  | {
      body: (x: CT, y: CT) => CT
      got: string
      key: CT
      map: CT
      name: string
      type: 'CGet'
    }
  | {
      body: (x: CT, y: CT) => CT
      got: string
      key: CT
      map: CT
      name: string
      type: 'CPut'
      val: CT
    }
  | { msg: CT; next: CT; type: 'CLog' }
  | { index: number; name: string; type: 'CVar' }
  | { text: string; type: 'CTxt' }
  | { items: Array<CT>; type: 'CLst' }
  | { type: 'CNat'; value: bigint }

function getADTCts(term: Term): Array<[string, any]> {
  // Implement based on your ADT structure
  return []
}

function getTeleNames(
  tele: any,
  depth: number,
  acc: Array<string>,
): Array<string> {
  // Implement based on your telescope structure
  return []
}

function reduce(
  book: Book,
  fill: Fill,
  depth: number,
  term: Term,
): Term {
  // Implement term reduction
  return term
}

function termToCT(
  book: Book,
  fill: Fill,
  term: Term,
  typx: Term | null,
  depth: number,
): CT {
  function bindCT(term: CT, bindings: Array<any>): CT {
    // Implement binding resolution
    return term
  }

  function t2ct(term: Term, typx: Term | null, depth: number): CT {
    // Helper function to get constructor information
    function lookupConstructor(
      name: string,
      type: Term,
    ): [Array<string>, any] | null {
      const ctors = getADTCts(reduce(book, fill, 2, type))
      const ctor = ctors.find(([n]) => n === name)
      if (!ctor) {
        return null
      }
      const [_, Ctr] = ctor
      const fieldNames = getTeleNames(Ctr.tele, depth, [])
      return [fieldNames, Ctr]
    }

    switch (term.type) {
      case 'Lam':
        return {
          body: (x: CT) =>
            t2ct(
              term.body(createVar(term.name, depth)),
              null,
              depth + 1,
            ),
          name: term.name,
          type: 'CLam',
        }

      case 'App':
        return {
          arg: t2ct(term.arg, null, depth),
          fun: t2ct(term.fun, null, depth),
          type: 'CApp',
        }

      case 'Con':
        if (!typx) {
          throw new Error('Constructor without type annotation')
        }
        const ctorInfo = lookupConstructor(term.name, typx)
        if (!ctorInfo) {
          throw new Error(`Constructor not found: ${term.name}`)
        }
        const [fieldNames] = ctorInfo

        return {
          fields: fieldNames.map((name, i) => [
            name,
            t2ct(term.args[i], null, depth),
          ]),
          name: term.name,
          type: 'CCon',
        }

      // Add more cases for other term types...

      default:
        throw new Error(`Unhandled term type: ${term.type}`)
    }
  }

  return bindCT(t2ct(term, typx, depth), [])
}

// Helper to create variable terms
function createVar(name: string, index: number): Term {
  return {
    index,
    name,
    type: 'Var',
  }
}

export { termToCT, type CT, type CTBook }

// Removes unreachable cases from the CT
function removeUnreachables(ct: CT): CT {
  function isNul(ct: CT): boolean {
    return ct.type === 'CNul'
  }

  function go(ct: CT): CT {
    switch (ct.type) {
      case 'CMat':
        return {
          cases: ct.cases.filter(([_, __, t]) => !isNul(t)),
          term: go(ct.term),
          type: 'CMat',
        }

      case 'CLam':
        return {
          body: x => go(ct.body(x)),
          name: ct.name,
          type: 'CLam',
        }

      case 'CApp':
        return {
          arg: go(ct.arg),
          fun: go(ct.fun),
          type: 'CApp',
        }

      case 'CCon':
        return {
          fields: ct.fields.map(([f, t]) => [f, go(t)] as [string, CT]),
          name: ct.name,
          type: 'CCon',
        }

      case 'CLet':
        return {
          body: x => go(ct.body(x)),
          name: ct.name,
          type: 'CLet',
          val: go(ct.val),
        }

      case 'COp2':
        return {
          left: go(ct.left),
          op: ct.op,
          right: go(ct.right),
          type: 'COp2',
        }

      case 'CSwi':
        return {
          cond: go(ct.cond),
          succ: go(ct.succ),
          type: 'CSwi',
          zero: go(ct.zero),
        }

      case 'CKVs':
        const newMap = new Map<number, CT>()
        ct.map.forEach((value, key) => {
          newMap.set(key, go(value))
        })
        return {
          default: go(ct.default),
          map: newMap,
          type: 'CKVs',
        }

      case 'CGet':
        return {
          body: (x, y) => go(ct.body(x, y)),
          got: ct.got,
          key: go(ct.key),
          map: go(ct.map),
          name: ct.name,
          type: 'CGet',
        }

      case 'CPut':
        return {
          body: (x, y) => go(ct.body(x, y)),
          got: ct.got,
          key: go(ct.key),
          map: go(ct.map),
          name: ct.name,
          type: 'CPut',
          val: go(ct.val),
        }

      case 'CLog':
        return {
          msg: go(ct.msg),
          next: go(ct.next),
          type: 'CLog',
        }

      case 'CLst':
        return {
          items: ct.items.map(go),
          type: 'CLst',
        }

      // Pass-through cases
      case 'CRef':
      case 'CHol':
      case 'CNum':
      case 'CFlt':
      case 'CVar':
      case 'CTxt':
      case 'CNat':
      case 'CNul':
        return ct
    }
  }

  return go(ct)
}

// Lifts shareable lambdas across branches
function liftLambdas(ct: CT, depth: number): CT {
  function nam(d: number): string {
    return '_$' + d
  }

  function getVar(ctx: Array<CT>, d: number): CT {
    return d < ctx.length ? ctx[d] : { type: 'CNul' }
  }

  function eta(fields: Array<string>, ct: CT): CT {
    if (fields.length === 0) {
      return ct
    }

    if (ct.type === 'CLam') {
      return {
        body: x => eta(fields.slice(1), ct.body(x)),
        name: ct.name,
        type: 'CLam',
      }
    }

    const field = fields[0]
    return {
      body: x => ({
        arg: x,
        fun: eta(fields.slice(1), ct),
        type: 'CApp',
      }),
      name: field,
      type: 'CLam',
    }
  }

  function liftLen(
    ct: CT,
    depth: number,
    lifts: number,
    skip: number,
  ): number {
    function go(
      ct: CT,
      depth: number,
      lifts: number,
      skip: number,
    ): number {
      switch (ct.type) {
        case 'CLam': {
          if (skip === 0) {
            return liftLen(
              ct.body({ type: 'CNul' }),
              depth + 1,
              lifts + 1,
              0,
            )
          }
          return liftLen(
            ct.body({ type: 'CNul' }),
            depth + 1,
            lifts,
            skip - 1,
          )
        }

        case 'CLet':
          return liftLen(
            ct.body({ type: 'CNul' }),
            depth + 1,
            lifts,
            skip,
          )

        case 'CMat':
          if (ct.cases.length > 0) {
            const recsL = ct.cases.map(([_, f, b]) =>
              liftLen(eta(f, b), depth, lifts, skip + f.length),
            )
            const valid = recsL.every(a => a === recsL[0])
            return valid ? recsL[0] : lifts
          }
          return lifts

        case 'CSwi': {
          const recZL = liftLen(eta([], ct.zero), depth, lifts, skip)
          const recSL = liftLen(
            eta(['p'], ct.succ),
            depth,
            lifts,
            skip + 1,
          )
          return recZL === recSL ? recZL : lifts
        }

        default:
          return lifts
      }
    }
    return go(ct, depth, lifts, skip)
  }

  function liftVal(
    ctx: Array<CT>,
    ct: CT,
    depth: number,
    lifts: number,
    skip: number,
  ): CT {
    function go(
      ct: CT,
      depth: number,
      lifts: number,
      skip: number,
    ): CT {
      switch (ct.type) {
        case 'CLam': {
          if (skip === 0) {
            return liftVal(
              ctx,
              ct.body(getVar(ctx, lifts)),
              depth + 1,
              lifts + 1,
              0,
            )
          }
          return {
            body: x =>
              liftVal(ctx, ct.body(x), depth + 1, lifts, skip - 1),
            name: ct.name,
            type: 'CLam',
          }
        }

        case 'CLet':
          return {
            body: x => liftVal(ctx, ct.body(x), depth + 1, lifts, skip),
            name: ct.name,
            type: 'CLet',
            val: ct.val,
          }

        case 'CMat': {
          if (ct.cases.length === 0) {
            return ct
          }

          const recsV = ct.cases.map(([_, f, b]) =>
            liftVal(ctx, eta(f, b), depth, lifts, skip + f.length),
          )
          const recsL = ct.cases.map(([_, f, b]) =>
            liftLen(eta(f, b), depth, lifts, skip + f.length),
          )

          const valid = recsL.every(a => a === recsL[0])
          if (!valid) {
            return ct
          }

          return {
            cases: ct.cases.map(
              ([n, f, _], i) =>
                [n, f, recsV[i]] as [string, Array<string>, CT],
            ),
            term: ct.term,
            type: 'CMat',
          }
        }

        case 'CSwi': {
          const recZL = liftLen(eta([], ct.zero), depth, lifts, skip)
          const recZV = liftVal(
            ctx,
            eta([], ct.zero),
            depth,
            lifts,
            skip,
          )
          const recSL = liftLen(
            eta(['p'], ct.succ),
            depth,
            lifts,
            skip + 1,
          )
          const recSV = liftVal(
            ctx,
            eta(['p'], ct.succ),
            depth,
            lifts,
            skip + 1,
          )

          return recZL === recSL
            ? {
                cond: ct.cond,
                succ: recSV,
                type: 'CSwi',
                zero: recZV,
              }
            : ct
        }

        default:
          return ct
      }
    }
    return go(ct, depth, lifts, skip)
  }

  function gen(n: number, ctx: Array<CT>, ct: CT, depth: number): CT {
    if (n === 0) {
      return liftVal(ctx, ct, depth, 0, 0)
    }
    return {
      body: x => gen(n - 1, [...ctx, x], ct, depth + 1),
      name: nam(depth),
      type: 'CLam',
    }
  }

  return gen(liftLen(ct, depth, 0, 0), [], ct, depth)
}

// Inlines definitions from the book into the CT
function inline(book: CTBook, ct: CT): CT {
  function red(book: CTBook, ct: CT): CT {
    // Implement reduction based on your needs
    return ct
  }

  function go(ct: CT): CT {
    switch (ct.type) {
      case 'CLam':
        return {
          body: x => nf(ct.body(x)),
          name: ct.name,
          type: 'CLam',
        }

      case 'CApp':
        return {
          arg: nf(ct.arg),
          fun: nf(ct.fun),
          type: 'CApp',
        }

      case 'CCon':
        return {
          fields: ct.fields.map(([f, t]) => [f, nf(t)] as [string, CT]),
          name: ct.name,
          type: 'CCon',
        }

      case 'CMat':
        return {
          cases: ct.cases.map(
            ([n, f, b]) => [n, f, nf(b)] as [string, Array<string>, CT],
          ),
          term: nf(ct.term),
          type: 'CMat',
        }

      // Pass-through cases
      case 'CRef':
      case 'CHol':
      case 'CNum':
      case 'CFlt':
      case 'CVar':
      case 'CTxt':
      case 'CNat':
      case 'CNul':
        return ct

      // Other cases following the same pattern...
      default:
        return ct
    }
  }

  function nf(ct: CT): CT {
    return go(red(book, ct))
  }

  return nf(ct)
}

export { removeUnreachables, liftLambdas, inline }

// --- CT Evaluation ---

// Reduce to Weak Normal Form
function red(book: CTBook, term: CT): CT {
  function go(term: CT): CT {
    if (term.type === 'CApp') {
      return app(book, red(book, term.fun), term.arg)
    }
    if (term.type === 'CRef') {
      return ref(book, term.name)
    }
    return term
  }
  return go(term)
}

// Application
function app(book: CTBook, fun: CT, arg: CT): CT {
  if (fun.type === 'CLam') {
    return red(book, fun.body(red(book, arg)))
  }
  if (fun.type === 'CMat') {
    return {
      cases: fun.cases.map(
        ([n, f, b]) =>
          [n, f, skip(f, b, b => ({ arg, fun: b, type: 'CApp' }))] as [
            string,
            Array<string>,
            CT,
          ],
      ),
      term: fun.term,
      type: 'CMat',
    }
  }
  if (fun.type === 'CLet') {
    return {
      body: x => app(book, fun.body(x), arg),
      name: fun.name,
      type: 'CLet',
      val: fun.val,
    }
  }
  return { arg, fun, type: 'CApp' }
}

// Maps inside N lambdas
function skip(
  fields: Array<string>,
  term: CT,
  fn: (term: CT) => CT,
): CT {
  if (fields.length === 0) {
    return fn(term)
  }
  const [field, ...rest] = fields
  return {
    body: x => skip(rest, { arg: x, fun: term, type: 'CApp' }, fn),
    name: field,
    type: 'CLam',
  }
}

// Reference
function ref(book: CTBook, name: string): CT {
  function shouldInline(name: string): boolean {
    const suffixes = [
      '/bind',
      '/bind/go',
      '/pure',
      'IO/print',
      'IO/prompt',
      'IO/swap',
    ]
    return suffixes.some(suffix => name.endsWith(suffix))
  }

  if (shouldInline(name)) {
    const term = book.get(name)
    if (!term) {
      throw new Error(`Term not found: ${name}`)
    }
    return red(book, term)
  }
  return { name, type: 'CRef' }
}

// --- JavaScript Code Generation ---

type State = {
  counter: number
}

function getArguments(term: CT): [Array<string>, CT] {
  function go(term: CT, depth: number): [Array<string>, CT] {
    if (term.type === 'CLam') {
      const [args, body] = go(
        term.body({ index: depth, name: term.name, type: 'CVar' }),
        depth + 1,
      )
      return [[term.name, ...args], body]
    }
    return [[], term]
  }
  return go(term, 0)
}

function arityOf(book: CTBook, name: string): number {
  const term = book.get(name)
  if (!term) {
    return 0
  }
  const [args] = getArguments(term)
  return args.length
}

function isRecCall(
  fnName: string,
  arity: number,
  appFun: CT,
  appArgs: Array<CT>,
): boolean {
  if (appFun.type !== 'CRef') {
    return false
  }
  return appFun.name === fnName && appArgs.length === arity
}

function isSatCall(book: CTBook, fun: CT, args: Array<CT>): boolean {
  if (fun.type !== 'CRef') {
    return false
  }
  return arityOf(book, fun.name) === args.length
}

function isEffCall(book: CTBook, fun: CT, args: Array<CT>): boolean {
  return fun.type === 'CHol'
}

// More extensive type for JavaScript compilation context
type CompileContext = {
  book: CTBook
  depth: number
  fnArgs: Array<string>
  fnName: string
  state: State
  tail: boolean
}

type State = {
  counter: number
}

// Helper to convert operators to JavaScript
function operToJS(op: Oper): string {
  const opMap: Record<Oper, string> = {
    ADD: '+',
    AND: '&',
    DIV: '/',
    EQ: '===',
    GT: '>',
    GTE: '>=',
    LSH: '<<',
    LT: '<',
    LTE: '<=',
    MOD: '%',
    MUL: '*',
    NE: '!==',
    OR: '|',
    RSH: '>>',
    SUB: '-',
    XOR: '^',
  }
  return opMap[op] || op
}

function getArguments(term: CT): [Array<string>, CT] {
  function go(term: CT, depth: number): [Array<string>, CT] {
    if (term.type === 'CLam') {
      const [args, body] = go(
        term.body({ index: depth, name: term.name, type: 'CVar' }),
        depth + 1,
      )
      return [[term.name, ...args], body]
    }
    return [[], term]
  }
  return go(term, 0)
}

function nameToJS(name: string): string {
  return '$' + name.replace(/[/.#-]/g, '$')
}

function fresh(state: State): string {
  return `$x${state.counter++}`
}

function isRecCall(
  fnName: string,
  arity: number,
  appFun: CT,
  appArgs: Array<CT>,
): boolean {
  return (
    appFun.type === 'CRef' &&
    appFun.name === fnName &&
    appArgs.length === arity
  )
}

function isSatCall(book: CTBook, fun: CT, args: Array<CT>): boolean {
  if (fun.type !== 'CRef') {
    return false
  }
  const arity = arityOf(book, fun.name)
  return arity === args.length
}

function isEffCall(book: CTBook, fun: CT): boolean {
  return fun.type === 'CHol'
}

function arityOf(book: CTBook, name: string): number {
  const term = book.get(name)
  if (!term) {
    return 0
  }
  const [args] = getArguments(term)
  return args.length
}

function getAppChain(term: CT): [CT, Array<CT>] {
  if (term.type === 'CApp') {
    const [f, args] = getAppChain(term.fun)
    return [f, [...args, term.arg]]
  }
  return [term, []]
}

function fnToJS(book: CTBook, fnName: string, term: CT): string {
  const state: State = { counter: 0 }
  const [fnArgs, fnBody] = getArguments(term)

  function ret(varName: string | undefined, expr: string): string {
    return varName ? `var ${varName} = ${expr};` : expr
  }

  function ctToJS(
    tail: boolean,
    varName: string | undefined,
    term: CT,
    depth: number,
  ): string {
    console.log(`COMPILE: ${showCT(term, 0)}`)

    const t = red(book, term)

    switch (t.type) {
      case 'CNul':
        return ret(varName, 'null')

      case 'CLam': {
        const bodyName = fresh(state)
        const bodyStmt = ctToJS(
          false,
          bodyName,
          t.body({ index: depth, name: t.name, type: 'CVar' }),
          depth + 1,
        )
        return ret(
          varName,
          `(${t.name} => {${bodyStmt}return ${bodyName};})`,
        )
      }

      case 'CApp': {
        const [appFun, appArgs] = getAppChain(t)

        // Tail Recursive Call
        if (tail && isRecCall(fnName, fnArgs.length, appFun, appArgs)) {
          const assignments = appArgs.map(arg => {
            const argName = fresh(state)
            const argStmt = ctToJS(false, argName, arg, depth)
            return [argStmt, `${fnArgs[0]} = ${argName};`]
          })
          const [argStmts, assignments2] = assignments.reduce(
            ([s1, s2], [as, asn]) => [
              [...s1, as],
              [...s2, asn],
            ],
            [[] as Array<string>, [] as Array<string>],
          )
          return `${argStmts.join('')}${assignments2.join(
            '',
          )} continue;`
        }

        // Saturated Call Optimization
        if (isSatCall(book, appFun, appArgs)) {
          if (appFun.type !== 'CRef') {
            throw new Error('Expected CRef')
          }
          const argExprs = appArgs.map(arg =>
            ctToJS(false, undefined, arg, depth),
          )
          return ret(
            varName,
            `${nameToJS(appFun.name)}$(${argExprs.join(', ')})`,
          )
        }

        // IO Actions
        if (isEffCall(book, appFun)) {
          if (appFun.type !== 'CHol') {
            throw new Error('Expected CHol')
          }

          switch (appFun.name) {
            case 'IO_BIND': {
              const [_, __, call, cont] = appArgs
              const callName = fresh(state)
              const callStmt = ctToJS(false, callName, call, depth)
              const contStmt = ctToJS(
                false,
                varName,
                {
                  arg: { index: depth, name: callName, type: 'CVar' },
                  fun: cont,
                  type: 'CApp',
                },
                depth,
              )
              return `${callStmt}${contStmt}`
            }

            case 'IO_PURE': {
              const [_, value] = appArgs
              return ctToJS(false, varName, value, depth)
            }

            case 'IO_SWAP': {
              const [key, val] = appArgs
              const keyName = fresh(state)
              const valName = fresh(state)
              const resName = fresh(state)
              const keyStmt = ctToJS(false, keyName, key, depth)
              const valStmt = ctToJS(false, valName, val, depth)
              const resStmt = `var ${resName} = SWAP(${keyName}, ${valName});`
              const doneStmt = ctToJS(
                false,
                varName,
                {
                  index: 0,
                  name: resName,
                  type: 'CVar',
                },
                depth,
              )
              return `${keyStmt}${valStmt}${resStmt}${doneStmt}`
            }

            case 'IO_PRINT': {
              const [text] = appArgs
              const textName = fresh(state)
              const textStmt = ctToJS(false, textName, text, depth)
              const doneStmt = ctToJS(
                false,
                varName,
                {
                  fields: [],
                  name: 'Unit',
                  type: 'CCon',
                },
                depth,
              )
              return `${textStmt}console.log(LIST_TO_JSTR(${textName}));${doneStmt}`
            }

            case 'IO_PROMPT':
              throw new Error('TODO: IO_PROMPT not implemented')

            default:
              throw new Error(`Unknown IO operation: ${appFun.name}`)
          }
        }

        // Normal Application
        const funExpr = ctToJS(false, undefined, t.fun, depth)
        const argExpr = ctToJS(false, undefined, t.arg, depth)
        return ret(varName, `(${funExpr})(${argExpr})`)
      }

      case 'CCon': {
        const fieldExprs = t.fields.map(([fname, fterm]) => {
          const expr = ctToJS(false, undefined, fterm, depth)
          return `${fname}: ${expr}`
        })
        return ret(
          varName,
          `({$: "${t.name}"${
            fieldExprs.length ? ', ' : ''
          }${fieldExprs.join(', ')}})`,
        )
      }

      case 'CMat': {
        const isRecord =
          t.cases.length === 1 && !t.cases.some(([nm]) => nm === '_')
        const valName = fresh(state)
        const valStmt = ctToJS(false, valName, t.term, depth)
        const retName = varName || fresh(state)

        const cases = t.cases.map(([cnam, fields, cbod]) => {
          if (cnam === '_') {
            const retStmt = ctToJS(
              tail,
              retName,
              {
                arg: { index: 0, name: valName, type: 'CVar' },
                fun: cbod,
                type: 'CApp',
              },
              depth,
            )
            return `default: { ${retStmt} break; }`
          } else {
            const body = fields.reduce(
              (acc, f) => ({
                arg: {
                  index: 0,
                  name: `${valName}.${f}`,
                  type: 'CVar',
                },
                fun: acc,
                type: 'CApp',
              }),
              cbod,
            )
            const retStmt = ctToJS(tail, retName, body, depth)
            return isRecord
              ? retStmt
              : `case "${cnam}": { ${retStmt} break; }`
          }
        })

        const switchStmt = isRecord
          ? `${valStmt}${cases.join('')}`
          : `${valStmt}switch (${valName}.$) { ${cases.join(' ')} }`

        return varName
          ? switchStmt
          : `((B) => { var ${retName};${switchStmt} return ${retName}; })()`
      }

      // ... remaining cases follow similar pattern

      case 'CRef':
        return ret(varName, nameToJS(t.name))

      case 'CHol':
        return ret(varName, 'null')

      case 'CLet': {
        const uid = nameToJS(t.name) + '$' + depth
        const valExpr = ctToJS(false, uid, t.val, depth)
        const bodyExpr = ctToJS(
          tail,
          varName,
          t.body({ index: depth, name: uid, type: 'CVar' }),
          depth + 1,
        )
        return varName
          ? `${valExpr}${bodyExpr}`
          : `((D) => {${valExpr}return ${bodyExpr};})()`
      }

      case 'CNum':
        return ret(varName, `${t.value}n`)

      case 'CFlt':
        return ret(varName, t.value.toString())

      case 'COp2': {
        const op = operToJS(t.op)
        const fstExpr = ctToJS(false, undefined, t.left, depth)
        const sndExpr = ctToJS(false, undefined, t.right, depth)
        return ret(
          varName,
          `BigInt.asUintN(64, ${fstExpr} ${op} ${sndExpr})`,
        )
      }

      case 'CLog': {
        const msgExpr = ctToJS(false, undefined, t.msg, depth)
        const nxtExpr = ctToJS(tail, undefined, t.next, depth)
        return ret(
          varName,
          `(console.log(LIST_TO_JSTR(${msgExpr})), ${nxtExpr})`,
        )
      }

      case 'CVar':
        return ret(varName, t.name)

      case 'CTxt':
        return ret(varName, `JSTR_TO_LIST(\`${t.text}\`)`)

      case 'CLst': {
        const cons = (x: CT, acc: CT): CT => ({
          fields: [
            ['head', x],
            ['tail', acc],
          ],
          name: 'Cons',
          type: 'CCon',
        })
        const nil: CT = { fields: [], name: 'Nil', type: 'CCon' }
        return ctToJS(
          false,
          varName,
          t.items.reduceRight((acc, x) => cons(x, acc), nil),
          depth,
        )
      }

      case 'CNat': {
        const succ = (x: CT): CT => ({
          fields: [['pred', x]],
          name: 'Succ',
          type: 'CCon',
        })
        const zero: CT = { fields: [], name: 'Zero', type: 'CCon' }
        return ctToJS(
          false,
          varName,
          Array(Number(t.value))
            .fill(null)
            .reduce(acc => succ(acc), zero),
          depth,
        )
      }

      default:
        throw new Error(`Unhandled CT type: ${(t as any).type}`)
    }
  }

  const bodyName = fresh(state)
  const bodyStmt = ctToJS(true, bodyName, fnBody, 0)

  function wrapArgs(
    curried: boolean,
    args: Array<string>,
    body: string,
  ): string {
    if (args.length === 0) {
      return `((A) => ${body})()`
    }
    return curried
      ? `${args.join(' => ')} => ${body}`
      : `(${args.join(',')}) => ${body}`
  }

  const uncBody = `{ while (1) { ${bodyStmt}return ${bodyName}; } }`
  const curBody =
    nameToJS(fnName) +
    '$' +
    (fnArgs.length ? `(${fnArgs.join(',')})` : '')
  const uncFunc = `const ${nameToJS(fnName)}$ = ${wrapArgs(
    false,
    fnArgs,
    uncBody,
  )}`
  const curFunc = `const ${nameToJS(fnName)} = ${wrapArgs(
    true,
    fnArgs,
    curBody,
  )}`

  return `${uncFunc}\n${curFunc}`
}

export { red, app, ref, fnToJS, isRecCall, isSatCall, isEffCall }

// JavaScript prelude - Helper functions
const prelude = `
function LIST_TO_JSTR(list) {
  try {
    let result = '';
    let current = list;
    while (current.$ === 'Cons') {
      result += String.fromCodePoint(Number(current.head));
      current = current.tail;
    }
    if (current.$ === 'Nil') {
      return result;
    }
  } catch (e) {}
  return list;
}

function JSTR_TO_LIST(str) {
  let list = {$: 'Nil'};
  for (let i = str.length - 1; i >= 0; i--) {
    list = {$: 'Cons', head: BigInt(str.charCodeAt(i)), tail: list};
  }
  return list;
}

let MEMORY = new Map();
function SWAP(key, val) {
  var old = MEMORY.get(key) || 0n;
  MEMORY.set(key, val);
  return old;
}
`

// Code generation functions
function generateJS(book: CTBook, [name, ct]: [string, CT]): string {
  let counter = 0
  const js = fnToJS(book, name, ct, () => counter++)
  return js + '\n\n'
}

function defToCT(
  book: Book,
  [name, term]: [string, Term],
): [string, CT] {
  const result = doAnnotate(term, book)
  if (!result.success) {
    throw new Error(`COMPILATION_ERROR: ${name} is ill-typed`)
  }
  const [term2, fill] = result.value
  return [name, termToCT(book, fill, term2, null, 0)]
}

export function compileJS(book: Book): string {
  const ctDefs0 = topoSortBook(book).map(def => defToCT(book, def))
  const ctDefs1 = ctDefs0.map(
    ([nm, ct]) => [nm, removeUnreachables(ct)] as [string, CT],
  )
  const ctBook1 = new Map(ctDefs1)
  const ctDefs2 = ctDefs1.map(
    ([nm, ct]) => [nm, inline(ctBook1, ct)] as [string, CT],
  )
  const ctDefs3 = ctDefs2.map(
    ([nm, ct]) => [nm, liftLambdas(ct, 0)] as [string, CT],
  )
  const ctBook3 = new Map(ctDefs3)

  console.log('\nCompiled CTs:')
  ctDefs3.forEach(([n, c]) => {
    console.log(`- ${n}:\n${showCT(c, 0)}`)
  })

  const jsFns = ctDefs3.map(def => generateJS(ctBook3, def)).join('')
  return prelude + '\n\n' + jsFns
}

// Utility functions
function bindCT(ct: CT, ctx: Map<string, CT>): CT {
  function bind(ct: CT): CT {
    switch (ct.type) {
      case 'CNul':
        return ct

      case 'CLam':
        return {
          body: x =>
            bind(ct.body({ index: 0, name: ct.name, type: 'CVar' })),
          name: ct.name,
          type: 'CLam',
        }

      case 'CApp':
        return {
          arg: bind(ct.arg),
          fun: bind(ct.fun),
          type: 'CApp',
        }

      case 'CCon':
        return {
          fields: ct.fields.map(
            ([f, x]) => [f, bind(x)] as [string, CT],
          ),
          name: ct.name,
          type: 'CCon',
        }

      case 'CMat':
        return {
          cases: ct.cases.map(
            ([cn, fs, cb]) =>
              [cn, fs, bind(cb)] as [string, Array<string>, CT],
          ),
          term: bind(ct.term),
          type: 'CMat',
        }

      case 'CRef':
        return ctx.get(ct.name) ?? ct

      // ... implement other cases similarly
    }
  }
  return bind(ct)
}

function rnCT(ct: CT, ctx: Map<string, CT>): CT {
  switch (ct.type) {
    case 'CNul':
      return { type: 'CNul' }

    case 'CLam': {
      const newName = `x${ctx.size}`
      return {
        body: x => {
          const newCtx = new Map(ctx)
          newCtx.set(newName, x)
          return rnCT(
            ct.body({
              index: 0,
              name: newName,
              type: 'CVar',
            }),
            newCtx,
          )
        },
        name: newName,
        type: 'CLam',
      }
    }

    case 'CApp':
      return {
        arg: rnCT(ct.arg, ctx),
        fun: rnCT(ct.fun, ctx),
        type: 'CApp',
      }

    case 'CCon':
      return {
        fields: ct.fields.map(
          ([f, t]) => [f, rnCT(t, ctx)] as [string, CT],
        ),
        name: ct.name,
        type: 'CCon',
      }

    case 'CMat':
      return {
        cases: ct.cases.map(
          ([cn, fs, cb]) =>
            [cn, fs, rnCT(cb, ctx)] as [string, Array<string>, CT],
        ),
        term: rnCT(ct.term, ctx),
        type: 'CMat',
      }

    case 'CRef':
      return ctx.get(ct.name) ?? ct

    case 'CHol':
      return {
        name: ct.name,
        type: 'CHol',
      }

    case 'CLet': {
      const newName = `x${ctx.size}`
      const val = rnCT(ct.val, ctx)
      return {
        body: x => {
          const newCtx = new Map(ctx)
          newCtx.set(newName, x)
          return rnCT(
            ct.body({
              index: 0,
              name: newName,
              type: 'CVar',
            }),
            newCtx,
          )
        },
        name: newName,
        type: 'CLet',
        val,
      }
    }

    case 'CNum':
      return {
        type: 'CNum',
        value: ct.value,
      }

    case 'CFlt':
      return {
        type: 'CFlt',
        value: ct.value,
      }

    case 'COp2':
      return {
        left: rnCT(ct.left, ctx),
        op: ct.op,
        right: rnCT(ct.right, ctx),
        type: 'COp2',
      }

    case 'CSwi':
      return {
        cond: rnCT(ct.cond, ctx),
        succ: rnCT(ct.succ, ctx),
        type: 'CSwi',
        zero: rnCT(ct.zero, ctx),
      }

    case 'CKVs': {
      const newMap = new Map<number, CT>()
      ct.map.forEach((value, key) => {
        newMap.set(key, rnCT(value, ctx))
      })
      return {
        default: rnCT(ct.default, ctx),
        map: newMap,
        type: 'CKVs',
      }
    }

    case 'CGet': {
      const newGot = `x${ctx.size}`
      const newName = `x${ctx.size + 1}`
      return {
        body: (x, y) => {
          const newCtx = new Map(ctx)
          newCtx.set(newGot, x)
          newCtx.set(newName, y)
          return rnCT(
            ct.body(
              { index: 0, name: newGot, type: 'CVar' },
              { index: 0, name: newName, type: 'CVar' },
            ),
            newCtx,
          )
        },
        got: newGot,
        key: rnCT(ct.key, ctx),
        map: rnCT(ct.map, ctx),
        name: newName,
        type: 'CGet',
      }
    }

    case 'CPut': {
      const newGot = `x${ctx.size}`
      const newName = `x${ctx.size + 1}`
      return {
        body: (x, y) => {
          const newCtx = new Map(ctx)
          newCtx.set(newGot, x)
          newCtx.set(newName, y)
          return rnCT(
            ct.body(
              { index: 0, name: newGot, type: 'CVar' },
              { index: 0, name: newName, type: 'CVar' },
            ),
            newCtx,
          )
        },
        got: newGot,
        key: rnCT(ct.key, ctx),
        map: rnCT(ct.map, ctx),
        name: newName,
        type: 'CPut',
        val: rnCT(ct.val, ctx),
      }
    }

    case 'CLog':
      return {
        msg: rnCT(ct.msg, ctx),
        next: rnCT(ct.next, ctx),
        type: 'CLog',
      }

    case 'CVar':
      return (
        ctx.get(ct.name) ?? {
          index: ct.index,
          name: ct.name,
          type: 'CVar',
        }
      )

    case 'CTxt':
      return {
        text: ct.text,
        type: 'CTxt',
      }

    case 'CLst':
      return {
        items: ct.items.map(item => rnCT(item, ctx)),
        type: 'CLst',
      }

    case 'CNat':
      return {
        type: 'CNat',
        value: ct.value,
      }
  }
}

function getAppChain(term: CT): [CT, Array<CT>] {
  if (term.type === 'CApp') {
    const [f, args] = getAppChain(term.fun)
    return [f, [...args, term.arg]]
  }
  return [term, []]
}

function isNul(ct: CT): boolean {
  return ct.type === 'CNul'
}

// Helper to show operator names
function showOper(op: Oper): string {
  switch (op) {
    case 'ADD':
      return '+'
    case 'SUB':
      return '-'
    case 'MUL':
      return '*'
    case 'DIV':
      return '/'
    case 'MOD':
      return '%'
    case 'EQ':
      return '==='
    case 'NE':
      return '!=='
    case 'LT':
      return '<'
    case 'GT':
      return '>'
    case 'LTE':
      return '<='
    case 'GTE':
      return '>='
    case 'AND':
      return '&'
    case 'OR':
      return '|'
    case 'XOR':
      return '^'
    case 'LSH':
      return '<<'
    case 'RSH':
      return '>>'
    default:
      return op
  }
}

function showCT(ct: CT, depth: number): string {
  switch (ct.type) {
    case 'CNul':
      return '*'

    case 'CLam':
      return `λ${ct.name} ${showCT(
        ct.body({
          index: depth,
          name: ct.name,
          type: 'CVar',
        }),
        depth + 1,
      )}`

    case 'CApp':
      return `(${showCT(ct.fun, depth)} ${showCT(ct.arg, depth)})`

    case 'CCon':
      return `#${ct.name}{${ct.fields
        .map(([f, t]) => `${f}:${showCT(t, depth)}`)
        .join(' ')}}`

    case 'CMat': {
      const cases = ct.cases
        .map(([cn, fs, cb]) => `#${cn}:${showCT(cb, depth)}`)
        .join(' ')
      return `match ${showCT(ct.term, depth)} {${cases}}`
    }

    case 'CRef':
      return ct.name

    case 'CHol':
      return ct.name

    case 'CLet': {
      const letBody = showCT(
        ct.body({
          index: depth,
          name: ct.name,
          type: 'CVar',
        }),
        depth + 1,
      )
      return `let ${ct.name} = ${showCT(ct.val, depth)}; ${letBody}`
    }

    case 'CNum':
      return ct.value.toString()

    case 'CFlt':
      return ct.value.toString()

    case 'COp2':
      return `(<${showOper(ct.op)}> ${showCT(ct.left, depth)} ${showCT(
        ct.right,
        depth,
      )})`

    case 'CSwi':
      return `switch ${showCT(ct.cond, depth)} {0:${showCT(
        ct.zero,
        depth,
      )} _: ${showCT(ct.succ, depth)}}`

    case 'CKVs': {
      const entries = Array.from(ct.map.entries())
        .map(([k, v]) => `${k}:${showCT(v, depth)}`)
        .join(' ')
      return `{${entries} | ${showCT(ct.default, depth)}}`
    }

    case 'CGet': {
      const body = showCT(
        ct.body(
          { index: depth, name: ct.got, type: 'CVar' },
          { index: depth, name: ct.name, type: 'CVar' },
        ),
        depth + 2,
      )
      return `get ${ct.got} = ${ct.name}@${showCT(
        ct.map,
        depth,
      )}[${showCT(ct.key, depth)}] ${body}`
    }

    case 'CPut': {
      const body = showCT(
        ct.body(
          { index: depth, name: ct.got, type: 'CVar' },
          { index: depth, name: ct.name, type: 'CVar' },
        ),
        depth + 2,
      )
      return `put ${ct.got} = ${ct.name}@${showCT(
        ct.map,
        depth,
      )}[${showCT(ct.key, depth)}] := ${showCT(ct.val, depth)} ${body}`
    }

    case 'CLog':
      return `log(${showCT(ct.msg, depth)},${showCT(ct.next, depth)})`

    case 'CVar':
      return `${ct.name}^${ct.index}`

    case 'CTxt':
      return JSON.stringify(ct.text)

    case 'CLst':
      return `[${ct.items.map(x => showCT(x, depth)).join(' ')}]`

    case 'CNat':
      return ct.value.toString()
  }
}

export { compileJS, bindCT, rnCT, showCT, ctest }
