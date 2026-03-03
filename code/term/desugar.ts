/**
 * Desugar Surface AST to Core Terms.
 *
 * Maps the imperative Term language (task, form, call, save, fork)
 * to Kind-style core terms (All, Lam, App, Let, Mat) for type
 * checking and code generation.
 *
 * Key mappings:
 *   task  → All (pi type) + Lam (lambda)
 *   form  → ADT (algebraic data type)
 *   call  → App (application chain)
 *   save  → Let (let binding)
 *   host  → Let (constant binding)
 *   back  → return expression
 *   make  → Con (constructor)
 *   fork  → Mat (pattern match)
 *   sift  → literal values (Num, Flt, Txt, etc.)
 *
 * Uses HOAS for variable scoping: lambda bodies receive the bound
 * variable as a Term argument, which gets stored in a scope map.
 */

import type {
  Surf,
  SurfCard,
  SurfTask,
  SurfForm,
  SurfCall,
  SurfMake,
  SurfFork,
  SurfWalk,
  SurfHook,
  SurfLink,
  SurfWear,
} from '@/surf/form'
import type { Term, Book, Ctr, Tele } from '@/term/form'

/** Desugaring context: tracks variable scope and metavar counter. */
type Ctx = {
  scope: Map<string, Term>
  meta: { next: number }
}

/** Desugar a surface-level file (card) to a Book of Core Term definitions. */
export function desugarCard(input: { card: SurfCard }): Book {
  const book: Book = new Map()
  const meta = { next: 1000 }

  for (const node of input.card.list) {
    const result = desugarDef({
      surf: node,
      ctx: { scope: new Map(), meta },
    })
    if (result) {
      book.set(result.name, result.term)
    }

    // Process wear blocks inside forms
    if (node.form === 'form') {
      for (const w of (node as SurfForm).wear) {
        desugarWearTasks({ wear: w, book, meta })
      }
    }

    // Process top-level wear blocks
    if (node.form === 'wear') {
      desugarWearTasks({ wear: node as SurfWear, book, meta })
    }
  }

  return book
}

/** Desugar all tasks inside a wear block into the book. */
function desugarWearTasks(input: {
  wear: SurfWear
  book: Book
  meta: { next: number }
}): void {
  const { wear, book, meta } = input
  for (const t of wear.task) {
    const ctx: Ctx = { scope: new Map(), meta }
    book.set(t.name, desugarTask({ task: t, ctx }))
  }
}

/** Desugar a single top-level definition. */
function desugarDef(input: {
  surf: Surf
  ctx: Ctx
}): { name: string; term: Term } | null {
  const { surf, ctx } = input

  switch (surf.form) {
    case 'task':
      return { name: surf.name, term: desugarTask({ task: surf, ctx }) }
    case 'form':
      return { name: surf.name, term: desugarForm({ form: surf, ctx }) }
    case 'test':
      return {
        name: `test/${surf.name}`,
        term: desugarFlow({ flow: surf.flow, ctx }),
      }
    case 'wear':
    case 'mask':
    case 'suit':
      // Handled in desugarCard loop
      return null
    default:
      return null
  }
}

/**
 * Desugar a task definition.
 *
 * A task with head (type) and base (value) parameters becomes a
 * pi type (All chain) paired with a lambda (Lam chain).
 *
 *   task add
 *     base a, like u64
 *     base b, like u64
 *     back call add-prim, bind a, loan a, bind b, loan b
 *
 * → Ann True
 *     (Lam "a" (Lam "b" (App (App (Ref "add-prim") a) b)))
 *     (All "a" U64 (All "b" U64 ?ret))
 */
function desugarTask(input: { task: SurfTask; ctx: Ctx }): Term {
  const { task, ctx } = input

  // Collect all parameters: head (type params) then base (value params)
  const params: { name: string; typ: Term }[] = []

  for (const h of task.head) {
    params.push({
      name: h.name,
      typ: h.need ? resolveType(h.need) : { form: 'set' },
    })
  }

  for (const b of task.base) {
    params.push({
      name: b.name,
      typ: b.like ? resolveType(b.like) : freshMeta(ctx),
    })
  }

  // Build the value: Lam chain wrapping the flow body
  const value = buildLamChain({
    params,
    idx: 0,
    ctx,
    cont: innerCtx => desugarFlow({ flow: task.flow, ctx: innerCtx }),
  })

  // Build the type: All chain with metavar return type
  const returnType = freshMeta(ctx)
  const type = buildAllChain({ params, idx: 0, returnType })

  // Nested tasks become separate definitions in scope
  // (handled by the caller via desugarCard)

  return { form: 'ann', done: true, val: value, typ: type }
}

/**
 * Desugar a form definition to an ADT.
 *
 *   form bool
 *     case true
 *     case false
 *
 * → ADT [] [Ctr "true" (TRet (Ref "bool")), Ctr "false" (TRet (Ref "bool"))] Set
 */
function desugarForm(input: { form: SurfForm; ctx: Ctx }): Term {
  const { form, ctx } = input
  const selfRef: Term = { form: 'ref', name: form.name }

  // Head params become indices
  const indx: Term[] = []
  const headScope = new Map(ctx.scope)

  // Build type for the ADT (Set for non-indexed, All chain for indexed)
  let adtType: Term = { form: 'set' }

  if (form.head.length > 0) {
    adtType = buildAllChain({
      params: form.head.map(h => ({
        name: h.name,
        typ: h.need ? resolveType(h.need) : { form: 'set' },
      })),
      idx: 0,
      returnType: { form: 'set' },
    })
  }

  // Convert each case arm to a constructor
  const ctrs: Ctr[] = form.case.map(c => ({
    name: c.name,
    tele: buildTele({ links: c.link, idx: 0, ret: selfRef }),
  }))

  return { form: 'adt', indx, ctrs, type: adtType }
}

/**
 * Desugar a flow (sequence of statements) to a Core Term.
 *
 * Statements chain via Let bindings. The last statement is the
 * return value. If the flow is empty, returns a Unit constructor.
 */
export function desugarFlow(input: { flow: Surf[]; ctx: Ctx }): Term {
  const { flow, ctx } = input

  if (flow.length === 0) {
    return { form: 'con', name: 'Unit', args: [] }
  }

  const first = flow[0]!
  const rest = flow.slice(1)

  switch (first.form) {
    case 'save': {
      const name = first.path[0] ?? '_'
      const val = first.sift
        ? desugarSift({ sift: first.sift, ctx })
        : freshMeta(ctx)
      if (rest.length === 0) return val
      return {
        form: 'let',
        name,
        val,
        bod: x => {
          const newScope = new Map(ctx.scope)
          newScope.set(name, x)
          return desugarFlow({
            flow: rest,
            ctx: { ...ctx, scope: newScope },
          })
        },
      }
    }

    case 'host': {
      const val = first.sift
        ? desugarSift({ sift: first.sift, ctx })
        : freshMeta(ctx)
      if (rest.length === 0) return val
      return {
        form: 'let',
        name: first.name,
        val,
        bod: x => {
          const newScope = new Map(ctx.scope)
          newScope.set(first.name, x)
          return desugarFlow({
            flow: rest,
            ctx: { ...ctx, scope: newScope },
          })
        },
      }
    }

    case 'back': {
      return first.sift
        ? desugarSift({ sift: first.sift, ctx })
        : { form: 'con', name: 'Unit', args: [] }
    }

    case 'call': {
      const callTerm = desugarCall({ call: first, ctx })
      if (rest.length === 0) return callTerm
      return {
        form: 'let',
        name: '_',
        val: callTerm,
        bod: () => desugarFlow({ flow: rest, ctx }),
      }
    }

    case 'fork': {
      const forkTerm = desugarFork({ fork: first, ctx })
      if (rest.length === 0) return forkTerm
      return {
        form: 'let',
        name: '_',
        val: forkTerm,
        bod: () => desugarFlow({ flow: rest, ctx }),
      }
    }

    case 'walk': {
      const walkTerm = desugarWalk({ walk: first, ctx })
      if (rest.length === 0) return walkTerm
      return {
        form: 'let',
        name: '_',
        val: walkTerm,
        bod: () => desugarFlow({ flow: rest, ctx }),
      }
    }

    case 'make': {
      const makeTerm = desugarMake({ make: first, ctx })
      if (rest.length === 0) return makeTerm
      return {
        form: 'let',
        name: '_',
        val: makeTerm,
        bod: () => desugarFlow({ flow: rest, ctx }),
      }
    }

    // Logging forms become Log nodes
    case 'show':
    case 'dive':
    case 'hint-log':
    case 'tell':
    case 'kink-log':
    case 'bust': {
      const msg = first.sift
        ? desugarSift({ sift: first.sift, ctx })
        : ({ form: 'txt', val: first.form } as Term)
      const val = desugarFlow({ flow: rest, ctx })
      return { form: 'log', msg, val }
    }

    default: {
      // Try to desugar as an expression
      const term = desugarSift({ sift: first, ctx })
      if (rest.length === 0) return term
      return {
        form: 'let',
        name: '_',
        val: term,
        bod: () => desugarFlow({ flow: rest, ctx }),
      }
    }
  }
}

/**
 * Desugar a value expression (sift) to a Core Term.
 */
export function desugarSift(input: { sift: Surf; ctx: Ctx }): Term {
  const { sift, ctx } = input

  switch (sift.form) {
    case 'sift-text':
      return { form: 'txt', val: sift.val }

    case 'sift-mark':
      return { form: 'num', val: sift.val }

    case 'sift-comb':
      return { form: 'flt', val: sift.val }

    case 'sift-wave':
      return sift.val
        ? { form: 'con', name: 'True', args: [] }
        : { form: 'con', name: 'False', args: [] }

    case 'sift-link':
      return maybeSafe(lookupPath({ path: sift.path, ctx }), sift.safe)

    case 'sift-loan':
      return maybeSafe(lookupPath({ path: sift.path, ctx }), sift.safe)

    case 'sift-move':
      return maybeSafe(lookupPath({ path: sift.path, ctx }), sift.safe)

    case 'sift-read':
      return maybeSafe(lookupPath({ path: sift.path, ctx }), sift.safe)

    case 'call':
      return desugarCall({ call: sift, ctx })

    case 'make':
      return desugarMake({ make: sift, ctx })

    default:
      return { form: 'hol', name: `unsupported:${sift.form}`, ctx: [] }
  }
}

/**
 * Desugar a call to a chain of App nodes, or a method call.
 *
 *   call add, bind a, mark 1, bind b, mark 2
 *   → App (App (Ref "add") (Num 1)) (Num 2)
 *
 *   call x/save, bind val, mark 42
 *   → Method x "save" [Num 42]
 */
function desugarCall(input: { call: SurfCall; ctx: Ctx }): Term {
  const { call, ctx } = input
  const name = call.name

  // Method/property access: name contains "/" (e.g. "x/save", "x/size")
  const slashIdx = name.indexOf('/')
  if (slashIdx !== -1) {
    const objName = name.slice(0, slashIdx)
    const methodName = name.slice(slashIdx + 1)
    const obj = lookupPath({ path: [objName], ctx })
    if (call.bind.length === 0) {
      return { form: 'get', obj, name: methodName }
    }
    const args: Term[] = call.bind.map(b =>
      b.sift ? desugarSift({ sift: b.sift, ctx }) : freshMeta(ctx),
    )
    return { form: 'method', obj, name: methodName, args }
  }

  let result: Term = { form: 'ref', name }

  for (const bind of call.bind) {
    const arg = bind.sift
      ? desugarSift({ sift: bind.sift, ctx })
      : freshMeta(ctx)
    result = { form: 'app', func: result, argm: arg }
  }

  return result
}

/**
 * Desugar a make (constructor application) to a Con node,
 * or a built-in collection constructor.
 *
 *   make succ, bind pred, mark 5
 *   → Con "succ" [("pred", Num 5)]
 *
 *   make find, bind k1, text v1, bind k2, text v2
 *   → New "Map" [Lst [[k1, v1], [k2, v2]]]
 *
 *   make list, bind a, bind b
 *   → Lst [a, b]
 */
function desugarMake(input: { make: SurfMake; ctx: Ctx }): Term {
  const { make, ctx } = input

  // make find → new Map(entries)
  if (make.name === 'find') {
    const entries: Term[] = make.bind.map(b => {
      const key: Term = { form: 'txt', val: b.name }
      const val = b.sift
        ? desugarSift({ sift: b.sift, ctx })
        : freshMeta(ctx)
      return { form: 'lst', list: [key, val] }
    })
    if (entries.length === 0) {
      return { form: 'new', name: 'Map', args: [] }
    }
    return {
      form: 'new',
      name: 'Map',
      args: [{ form: 'lst', list: entries }],
    }
  }

  // make list → array literal
  if (make.name === 'list') {
    const items: Term[] = make.bind.map(b => {
      return b.sift
        ? desugarSift({ sift: b.sift, ctx })
        : freshMeta(ctx)
    })
    return { form: 'lst', list: items }
  }

  // Default: ADT constructor
  const args: [string | null, Term][] = make.bind.map(b => {
    const val = b.sift
      ? desugarSift({ sift: b.sift, ctx })
      : freshMeta(ctx)
    return [b.name || null, val]
  })

  return { form: 'con', name: make.name, args }
}

/**
 * Desugar a fork (pattern match) to a Mat applied to the scrutinee.
 *
 *   fork case, loan x
 *     hook zero
 *       back mark 0
 *     hook succ
 *       back loan pred
 *
 * → App (Mat [("zero", Num 0), ("succ", Lam "pred" (Var "pred"))]) (Var "x")
 */
function desugarFork(input: { fork: SurfFork; ctx: Ctx }): Term {
  const { fork, ctx } = input

  const arms: [string, Term][] = fork.hook.map(hook => [
    hook.name,
    desugarArm({ hook, ctx }),
  ])

  const mat: Term = { form: 'mat', arms }

  // If there's a scrutinee, apply the match to it
  if (fork.sift) {
    const scrutinee = desugarSift({ sift: fork.sift, ctx })
    return { form: 'app', func: mat, argm: scrutinee }
  }

  return mat
}

/**
 * Desugar a walk (fold/iteration) similarly to fork.
 * For now, treated the same as fork.
 */
function desugarWalk(input: { walk: SurfWalk; ctx: Ctx }): Term {
  const { walk, ctx } = input

  const arms: [string, Term][] = walk.hook.map(hook => [
    hook.name,
    desugarArm({ hook, ctx }),
  ])

  const mat: Term = { form: 'mat', arms }

  if (walk.sift) {
    const scrutinee = desugarSift({ sift: walk.sift, ctx })
    return { form: 'app', func: mat, argm: scrutinee }
  }

  return mat
}

/**
 * Desugar a match arm (hook).
 *
 * If the hook has base parameters, they become lambda bindings.
 * The flow becomes the body.
 */
function desugarArm(input: { hook: SurfHook; ctx: Ctx }): Term {
  const { hook, ctx } = input

  if (hook.base.length === 0) {
    return desugarFlow({ flow: hook.flow, ctx })
  }

  // Wrap the body in lambdas for each base parameter
  return buildLamChain({
    params: hook.base.map(b => ({
      name: b.name,
      typ: b.like ? resolveType(b.like) : freshMeta(ctx),
    })),
    idx: 0,
    ctx,
    cont: innerCtx => desugarFlow({ flow: hook.flow, ctx: innerCtx }),
  })
}

// ---- Helpers ----

/** Build a chain of Lam nodes from parameters. */
function buildLamChain(input: {
  params: { name: string; typ: Term }[]
  idx: number
  ctx: Ctx
  cont: (ctx: Ctx) => Term
}): Term {
  const { params, idx, ctx, cont } = input
  if (idx >= params.length) return cont(ctx)

  const param = params[idx]!
  return {
    form: 'lam',
    name: param.name,
    bod: x => {
      const newScope = new Map(ctx.scope)
      newScope.set(param.name, x)
      return buildLamChain({
        params,
        idx: idx + 1,
        ctx: { ...ctx, scope: newScope },
        cont,
      })
    },
  }
}

/** Build a chain of All (pi) nodes from parameters. */
function buildAllChain(input: {
  params: { name: string; typ: Term }[]
  idx: number
  returnType: Term
}): Term {
  const { params, idx, returnType } = input
  if (idx >= params.length) return returnType

  const param = params[idx]!
  return {
    form: 'all',
    name: param.name,
    inp: param.typ,
    bod: () => buildAllChain({ params, idx: idx + 1, returnType }),
  }
}

/** Build a telescope from link (field) declarations. */
function buildTele(input: {
  links: SurfLink[]
  idx: number
  ret: Term
}): Tele {
  const { links, idx, ret } = input
  if (idx >= links.length) {
    return { form: 'ret', term: ret }
  }

  const link = links[idx]!
  return {
    form: 'ext',
    name: link.name,
    typ: link.like ? resolveType(link.like) : { form: 'set' },
    bod: () => buildTele({ links, idx: idx + 1, ret }),
  }
}

/** Resolve a type name to a Core Term. */
function resolveType(name: string): Term {
  switch (name) {
    case 'u64':
      return { form: 'u64' }
    case 'f64':
      return { form: 'f64' }
    case 'text':
      return { form: 'ref', name: 'String' }
    case 'wave':
      return { form: 'ref', name: 'Bool' }
    default:
      return { form: 'ref', name }
  }
}

/** Generate a fresh metavariable. */
function freshMeta(ctx: Ctx): Term {
  const uid = ctx.meta.next++
  return { form: 'met', uid, ctx: [] }
}

/** Look up a path in scope, falling back to a Ref. */
function lookupPath(input: { path: string[]; ctx: Ctx }): Term {
  const { path, ctx } = input
  if (path.length === 0)
    return { form: 'hol', name: 'empty-path', ctx: [] }

  const name = path[0]!
  const local = ctx.scope.get(name)
  if (local) return local

  // Not in scope: treat as a top-level reference
  return { form: 'ref', name: path.join('/') }
}

/** Wrap a term in TermSafe if the safe flag is set. */
function maybeSafe(term: Term, safe?: boolean): Term {
  if (safe) return { form: 'safe', val: term }
  return term
}
