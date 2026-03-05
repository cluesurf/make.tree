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
  SurfMeet,
  SurfBook,
  SurfBeam,
  SurfType,
} from '@/surf/form'
import type { Term, Book, Ctr, Tele, Oper } from '@/term/form'
import type { Kink } from '@/kink/form'
import { makeKink } from '@/kink/form'
import { VOID_SITE } from '@/kink/site'

/** Desugaring context: tracks variable scope and metavar counter. */
type Ctx = {
  scope: Map<string, Term>
  meta: { next: number }
}

/** Async metadata: maps task names to whether they are async. */
export type AsyncMeta = Map<string, boolean>

/** Desugar a surface-level file (card) to a Book of Core Term definitions. */
export function desugarCard(input: { card: SurfCard }): { book: Book; asyncMeta: AsyncMeta } {
  const book: Book = new Map()
  const meta = { next: 1000 }
  const asyncMeta: AsyncMeta = new Map()

  // First pass: detect wear task name collisions so we can prefix
  const wearTaskCounts = new Map<string, number>()
  for (const node of input.card.list) {
    const wears: SurfWear[] = []
    if (node.form === 'form') {
      wears.push(...(node as SurfForm).wear)
    }
    if (node.form === 'suit') {
      wears.push(...(node as { wear: SurfWear[] }).wear)
    }
    for (const w of wears) {
      for (const t of w.task) {
        wearTaskCounts.set(t.name, (wearTaskCounts.get(t.name) ?? 0) + 1)
      }
    }
  }

  for (const node of input.card.list) {
    const result = desugarDef({
      surf: node,
      ctx: { scope: new Map(), meta },
    })
    if (result) {
      book.set(result.name, result.term)
    }

    // Collect async metadata from task definitions
    if (node.form === 'task' && (node as SurfTask).wait) {
      asyncMeta.set(node.name, true)
    }

    // Process wear blocks inside forms
    if (node.form === 'form') {
      for (const w of (node as SurfForm).wear) {
        desugarWearTasks({ wear: w, formName: node.name, book, meta, wearTaskCounts })
      }
      // Process direct tasks on forms (not inside wear blocks)
      for (const t of (node as SurfForm).task) {
        const ctx: Ctx = { scope: new Map(), meta }
        book.set(t.name, desugarTask({ task: t, ctx }))
        if (t.wait) asyncMeta.set(t.name, true)
      }
    }

    // Process top-level wear blocks
    if (node.form === 'wear') {
      desugarWearTasks({ wear: node as SurfWear, book, meta, wearTaskCounts })
    }

    // Process suit wear blocks
    if (node.form === 'suit') {
      for (const w of (node as { wear: SurfWear[] }).wear) {
        desugarWearTasks({ wear: w, formName: node.name, book, meta, wearTaskCounts })
      }
    }

    // Process book (namespace) blocks: prefix all children with book name
    if (node.form === 'book') {
      const bookNode = node as SurfBook
      for (const child of bookNode.list) {
        const childResult = desugarDef({ surf: child, ctx: { scope: new Map(), meta } })
        if (childResult) {
          book.set(`${bookNode.name}/${childResult.name}`, childResult.term)
        }
        if (child.form === 'task' && (child as SurfTask).wait) {
          asyncMeta.set(`${bookNode.name}/${child.name}`, true)
        }
      }
    }
  }

  return { book, asyncMeta }
}

/**
 * Error-tolerant desugar: wraps each definition in try-catch.
 * Failed definitions produce errors but don't prevent others from being desugared.
 */
export function desugarCardTolerant(input: { card: SurfCard }): { book: Book; asyncMeta: AsyncMeta; errors: Kink[] } {
  const book: Book = new Map()
  const meta = { next: 1000 }
  const asyncMeta: AsyncMeta = new Map()
  const errors: Kink[] = []

  const wearTaskCounts = new Map<string, number>()
  for (const node of input.card.list) {
    const wears: SurfWear[] = []
    if (node.form === 'form') wears.push(...(node as SurfForm).wear)
    if (node.form === 'suit') wears.push(...(node as { wear: SurfWear[] }).wear)
    for (const w of wears) {
      for (const t of w.task) {
        wearTaskCounts.set(t.name, (wearTaskCounts.get(t.name) ?? 0) + 1)
      }
    }
  }

  for (const node of input.card.list) {
    try {
      const result = desugarDef({ surf: node, ctx: { scope: new Map(), meta } })
      if (result) book.set(result.name, result.term)

      if (node.form === 'task' && (node as SurfTask).wait) {
        asyncMeta.set(node.name, true)
      }

      if (node.form === 'form') {
        for (const w of (node as SurfForm).wear) {
          desugarWearTasks({ wear: w, formName: node.name, book, meta, wearTaskCounts })
        }
        for (const t of (node as SurfForm).task) {
          const ctx: Ctx = { scope: new Map(), meta }
          book.set(t.name, desugarTask({ task: t, ctx }))
          if (t.wait) asyncMeta.set(t.name, true)
        }
      }

      if (node.form === 'wear') {
        desugarWearTasks({ wear: node as SurfWear, book, meta, wearTaskCounts })
      }

      if (node.form === 'suit') {
        for (const w of (node as { wear: SurfWear[] }).wear) {
          desugarWearTasks({ wear: w, formName: node.name, book, meta, wearTaskCounts })
        }
      }

      if (node.form === 'book') {
        const bookNode = node as SurfBook
        for (const child of bookNode.list) {
          try {
            const childResult = desugarDef({ surf: child, ctx: { scope: new Map(), meta } })
            if (childResult) book.set(`${bookNode.name}/${childResult.name}`, childResult.term)
            if (child.form === 'task' && (child as SurfTask).wait) {
              asyncMeta.set(`${bookNode.name}/${child.name}`, true)
            }
          } catch (e) {
            errors.push(
              makeKink({
                form: 'desugar-bad',
                rank: 'halt',
                site: VOID_SITE,
                text: `Failed to desugar ${child.form} "${child.name}" in book "${bookNode.name}": ${e instanceof Error ? e.message : String(e)}`,
                rest: { surf: child.form },
              }),
            )
          }
        }
      }
    } catch (e) {
      errors.push(
        makeKink({
          form: 'desugar-bad',
          rank: 'halt',
          site: VOID_SITE,
          text: `Failed to desugar ${node.form} "${node.name}": ${e instanceof Error ? e.message : String(e)}`,
          rest: { surf: node.form },
        }),
      )
    }
  }

  return { book, asyncMeta, errors }
}

/** Desugar all tasks inside a wear block into the book.
 * Prefixes keys with formName when the task name collides with
 * another wear task across forms, to avoid overwriting. */
function desugarWearTasks(input: {
  wear: SurfWear
  formName?: string
  book: Book
  meta: { next: number }
  wearTaskCounts: Map<string, number>
}): void {
  const { wear, formName, book, meta, wearTaskCounts } = input
  for (const t of wear.task) {
    const ctx: Ctx = { scope: new Map(), meta }
    const needsPrefix = formName && (wearTaskCounts.get(t.name) ?? 0) > 1
    const key = needsPrefix ? `${formName}/${t.name}` : t.name
    book.set(key, desugarTask({ task: t, ctx }))
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
    case 'time':
      return {
        name: `time/${surf.name}`,
        term: desugarFlow({ flow: surf.flow, ctx }),
      }
    case 'wear':
    case 'mask':
    case 'suit':
      // Handled in desugarCard loop
      return null
    case 'bear':
    case 'load':
      // Handled by the loader
      return null
    case 'book':
    case 'slot':
    case 'beam':
      // book: handled in desugarCard loop
      // slot/beam: template constructs expanded by fuse phase
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
      typ: h.need ? resolveTypeName(h.need) : { form: 'set' },
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

  // Build the type: All chain with explicit return type or metavar
  const returnType = task.like ? resolveType(task.like) : freshMeta(ctx)
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
        typ: h.need ? resolveTypeName(h.need) : { form: 'set' },
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

  // Struct-like form: links at form level with no case arms become
  // a single implicit constructor named after the form
  if (ctrs.length === 0 && form.link.length > 0) {
    ctrs.push({
      name: form.name,
      tele: buildTele({ links: form.link, idx: 0, ret: selfRef }),
    })
  }

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
      let val: Term
      if (first.list && first.list.length > 0) {
        val = {
          form: 'lst',
          list: first.list.map(s => desugarSift({ sift: s, ctx })),
        }
      } else if (first.sift) {
        val = desugarSift({ sift: first.sift, ctx })
      } else {
        val = freshMeta(ctx)
      }
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

    case 'meet': {
      const meetTerm = desugarMeet({ meet: first as SurfMeet, ctx })
      if (rest.length === 0) return meetTerm
      return {
        form: 'let',
        name: '_',
        val: meetTerm,
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

    // Debugger breakpoint
    case 'rest': {
      const val = desugarFlow({ flow: rest, ctx })
      return { form: 'rst', val }
    }

    // Standalone halt (panic/throw)
    case 'halt': {
      const msg = first.sift
        ? desugarSift({ sift: first.sift, ctx })
        : ({ form: 'txt', val: 'halt' } as Term)
      const term = first.term as 'kink' | 'flow' | 'fork' | undefined
      return { form: 'hlt', msg, term }
    }

    // Continue/skip in loops
    case 'next': {
      return { form: 'nxt' }
    }

    // Beam (template emit): should be expanded by fuse, treat as no-op
    case 'beam': {
      const beamNode = first as SurfBeam
      const val = desugarFlow({ flow: beamNode.flow, ctx })
      if (rest.length === 0) return val
      return {
        form: 'let',
        name: '_',
        val,
        bod: () => desugarFlow({ flow: rest, ctx }),
      }
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

    case 'sift-wave':
      return sift.val
        ? { form: 'con', name: 'True', args: [] }
        : { form: 'con', name: 'False', args: [] }

    case 'sift-link':
    case 'sift-read':
      return maybeSafe(lookupPath({ path: sift.path, ctx }), sift.safe)

    case 'call':
      return desugarCall({ call: sift, ctx })

    case 'make':
      return desugarMake({ make: sift, ctx })

    case 'meet':
      return desugarMeet({ meet: sift as SurfMeet, ctx })

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
/** Built-in binary operators → Op2 nodes.
 * All standard arithmetic, comparison, and bitwise ops are converted
 * to Op2 so backends can emit native operators. */
const BUILTIN_BINARY_OPS: Record<string, Oper> = {
  add: 'add', sub: 'sub', mul: 'mul',
  div: 'div', mod: 'mod',
  eq: 'eq', ne: 'ne', lt: 'lt',
  gt: 'gt', lte: 'lte', gte: 'gte',
  and: 'and', or: 'or', xor: 'xor',
  lsh: 'lsh', rsh: 'rsh',
}

function desugarCall(input: { call: SurfCall; ctx: Ctx }): Term {
  const { call, ctx } = input
  const name = call.name

  // Built-in binary ops: call gt, bind a, ..., bind b, ... → Op2
  const oper = BUILTIN_BINARY_OPS[name]
  if (oper && call.bind.length === 2) {
    const a = call.bind[0]!.sift
      ? desugarSift({ sift: call.bind[0]!.sift, ctx })
      : freshMeta(ctx)
    const b = call.bind[1]!.sift
      ? desugarSift({ sift: call.bind[1]!.sift, ctx })
      : freshMeta(ctx)
    return { form: 'op2', oper, a, b }
  }

  // Method/property access: name contains "/" (e.g. "x/save", "x/size")
  const slashIdx = name.indexOf('/')
  if (slashIdx !== -1) {
    const objName = name.slice(0, slashIdx)
    const methodName = name.slice(slashIdx + 1)
    const obj = lookupPath({ path: [objName], ctx })
    // Encode as App(Ref ".name") applied to obj then args
    let result: Term = { form: 'app', func: { form: 'ref', name: `.${methodName}` }, argm: obj }
    for (const bind of call.bind) {
      const arg = bind.sift ? desugarSift({ sift: bind.sift, ctx }) : freshMeta(ctx)
      result = { form: 'app', func: result, argm: arg }
    }
    if (call.halt) {
      result = { form: 'app', func: { form: 'ref', name: '.halt' }, argm: result }
    }
    if (call.wait) {
      result = { form: 'app', func: { form: 'ref', name: '.wait' }, argm: result }
    }
    return result
  }

  let result: Term = { form: 'ref', name }

  for (const bind of call.bind) {
    const arg = bind.sift
      ? desugarSift({ sift: bind.sift, ctx })
      : freshMeta(ctx)
    result = { form: 'app', func: result, argm: arg }
  }

  if (call.halt) {
    result = { form: 'app', func: { form: 'ref', name: '.halt' }, argm: result }
  }

  if (call.wait) {
    result = { form: 'app', func: { form: 'ref', name: '.wait' }, argm: result }
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

  // make find → App(Ref ".map") (Lst entries)
  if (make.name === 'find') {
    const entries: Term[] = make.bind.map(b => {
      const key: Term = { form: 'txt', val: b.name }
      const val = b.sift
        ? desugarSift({ sift: b.sift, ctx })
        : freshMeta(ctx)
      return { form: 'lst', list: [key, val] }
    })
    return {
      form: 'app',
      func: { form: 'ref', name: '.map' },
      argm: { form: 'lst', list: entries },
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
 * Desugar a fork (pattern match or conditional test).
 *
 * fork case → Mat applied to scrutinee (pattern match):
 *   fork case, loan x
 *     hook zero → back mark 0
 *     hook succ → back loan pred
 *   → App (Mat [("zero", Num 0), ("succ", Lam "pred" ...)]) (Var "x")
 *
 * fork test → .test convention (boolean conditional):
 *   fork test
 *     call gt, bind a, loan x, bind b, loan y
 *     hook true → back loan x
 *     hook false → back loan y
 *   → App (App (Ref ".test") (Mat [("true", ...), ("false", ...)])) condition)
 */
function desugarFork(input: { fork: SurfFork; ctx: Ctx }): Term {
  const { fork, ctx } = input

  const arms: [string, Term][] = fork.hook.map(hook => [
    hook.name,
    desugarArm({ hook, ctx }),
  ])

  const mat: Term = { form: 'mat', arms }

  // fork test → .test(mat, condition) for if/else codegen
  if (fork.mode === 'test' && fork.sift) {
    const condition = desugarSift({ sift: fork.sift, ctx })
    return {
      form: 'app',
      func: { form: 'app', func: { form: 'ref', name: '.test' }, argm: mat },
      argm: condition,
    }
  }

  // fork roll → chained if/else-if (each hook is a condition+body pair)
  // Desugars to nested .test applications
  if (fork.mode === 'roll') {
    return desugarRoll({ hooks: fork.hook, idx: 0, ctx })
  }

  // fork tree → scoped branching (execute hooks sequentially in a scope)
  if (fork.mode === 'tree') {
    return desugarFlow({
      flow: fork.hook.flatMap(h => h.flow),
      ctx,
    })
  }

  // fork case → App(Mat, scrutinee) for pattern match
  if (fork.sift) {
    const scrutinee = desugarSift({ sift: fork.sift, ctx })
    return { form: 'app', func: mat, argm: scrutinee }
  }

  return mat
}

/**
 * Desugar a meet (logical AND/OR) to chained App(.and/.or, ...).
 *
 * meet and [a, b, c] → App(App(App(Ref ".and") a) b) c)
 * meet or  [a, b, c] → App(App(App(Ref ".or") a) b) c)
 */
function desugarMeet(input: { meet: SurfMeet; ctx: Ctx }): Term {
  const { meet, ctx } = input
  const sentinel = meet.mode === 'and' ? '.and' : '.or'
  const terms = meet.list.map(s => desugarSift({ sift: s, ctx }))
  if (terms.length === 0) return { form: 'ref', name: 'true' }
  let result = terms[0]!
  for (let i = 1; i < terms.length; i++) {
    result = {
      form: 'app',
      func: {
        form: 'app',
        func: { form: 'ref', name: sentinel } as Term,
        argm: result,
      },
      argm: terms[i]!,
    }
  }
  return result
}

/**
 * Desugar a walk to iteration (for...of) or pattern-matching fold.
 *
 * walk list/find → for...of iteration over the collection.
 * Other modes fall back to pattern match (same as fork).
 */
function desugarWalk(input: { walk: SurfWalk; ctx: Ctx }): Term {
  const { walk, ctx } = input

  // Iteration modes: list, find → App(App(Ref ".for") iter) (Lam "x" body)
  if (walk.mode === 'list' || walk.mode === 'find') {
    const iter = walk.sift
      ? desugarSift({ sift: walk.sift, ctx })
      : freshMeta(ctx)
    const hook = walk.hook[0]
    if (!hook) return { form: 'con', name: 'Unit', args: [] }
    const paramName = hook.base[0]?.name ?? 'item'
    const handler: Term = {
      form: 'lam',
      name: paramName,
      bod: x => {
        const newScope = new Map(ctx.scope)
        newScope.set(paramName, x)
        return desugarFlow({
          flow: hook.flow,
          ctx: { ...ctx, scope: newScope },
        })
      },
    }
    return {
      form: 'app',
      func: { form: 'app', func: { form: 'ref', name: '.for' }, argm: iter },
      argm: handler,
    }
  }

  // walk test → while loop: App(App(Ref ".while") condition) (Lam "_" body)
  if (walk.mode === 'test' && walk.sift) {
    const condition = desugarSift({ sift: walk.sift, ctx })
    const hook = walk.hook[0]
    if (!hook) return { form: 'con', name: 'Unit', args: [] }
    const body: Term = {
      form: 'lam',
      name: '_',
      bod: () => desugarWhileBody({ flow: hook.flow, ctx }),
    }
    return {
      form: 'app',
      func: {
        form: 'app',
        func: { form: 'ref', name: '.while' },
        argm: condition,
      },
      argm: body,
    }
  }

  // walk size → range loop: App(App(Ref ".range") count) (Lam "i" body)
  if (walk.mode === 'size') {
    const count = walk.sift
      ? desugarSift({ sift: walk.sift, ctx })
      : freshMeta(ctx)
    const hook = walk.hook[0]
    if (!hook) return { form: 'con', name: 'Unit', args: [] }
    const paramName = hook.base[0]?.name ?? 'i'
    const handler: Term = {
      form: 'lam',
      name: paramName,
      bod: x => {
        const newScope = new Map(ctx.scope)
        newScope.set(paramName, x)
        return desugarFlow({
          flow: hook.flow,
          ctx: { ...ctx, scope: newScope },
        })
      },
    }
    return {
      form: 'app',
      func: { form: 'app', func: { form: 'ref', name: '.range' }, argm: count },
      argm: handler,
    }
  }

  // walk site → iterator loop: App(App(Ref ".iter") iterator) (Lam "item" body)
  if (walk.mode === 'site') {
    const iter = walk.sift
      ? desugarSift({ sift: walk.sift, ctx })
      : freshMeta(ctx)
    const hook = walk.hook[0]
    if (!hook) return { form: 'con', name: 'Unit', args: [] }
    const paramName = hook.base[0]?.name ?? 'item'
    const handler: Term = {
      form: 'lam',
      name: paramName,
      bod: x => {
        const newScope = new Map(ctx.scope)
        newScope.set(paramName, x)
        return desugarFlow({
          flow: hook.flow,
          ctx: { ...ctx, scope: newScope },
        })
      },
    }
    return {
      form: 'app',
      func: { form: 'app', func: { form: 'ref', name: '.iter' }, argm: iter },
      argm: handler,
    }
  }

  // Default: pattern-matching walk (existing behavior)
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

/**
 * Desugar a fork roll (if/else-if chain).
 *
 * Each hook has a condition (first flow item as a call) and a body.
 * The last hook without a condition is the else branch.
 * Desugars to nested .test applications.
 */
function desugarRoll(input: { hooks: SurfHook[]; idx: number; ctx: Ctx }): Term {
  const { hooks, idx, ctx } = input

  if (idx >= hooks.length) {
    return { form: 'con', name: 'Unit', args: [] }
  }

  const hook = hooks[idx]!
  const isLast = idx === hooks.length - 1

  // Last hook with no explicit condition is the else branch
  if (isLast || hook.base.length === 0 && hook.flow.length > 0) {
    // If this is the only remaining hook, just emit the body
    if (isLast) {
      return desugarFlow({ flow: hook.flow, ctx })
    }
  }

  // Hook has a condition: first base entry names the condition
  // The hook's flow is the then-branch body
  const thenBranch = desugarFlow({ flow: hook.flow, ctx })
  const elseBranch = desugarRoll({ hooks, idx: idx + 1, ctx })

  // Build a condition from the hook name (treated as a call result)
  const condition: Term = { form: 'ref', name: hook.name }

  const mat: Term = {
    form: 'mat',
    arms: [
      ['True', thenBranch],
      ['False', elseBranch],
    ],
  }

  return {
    form: 'app',
    func: { form: 'app', func: { form: 'ref', name: '.test' }, argm: mat },
    argm: condition,
  }
}

// ---- Helpers ----

/** Desugar a while body flow, ensuring every save produces a Let binding.
 * Unlike desugarFlow (which returns the value directly when rest is empty),
 * this always wraps save in Let name val (continuation | Unit). */
function desugarWhileBody(input: { flow: Surf[]; ctx: Ctx }): Term {
  const { flow, ctx } = input

  if (flow.length === 0) return { form: 'con', name: 'Unit', args: [] }

  const first = flow[0]!
  const rest = flow.slice(1)

  if (first.form === 'save') {
    const name = first.path[0] ?? '_'
    const val = first.sift
      ? desugarSift({ sift: first.sift, ctx })
      : freshMeta(ctx)
    return {
      form: 'let',
      name,
      val,
      bod: x => {
        const newScope = new Map(ctx.scope)
        newScope.set(name, x)
        return desugarWhileBody({
          flow: rest,
          ctx: { ...ctx, scope: newScope },
        })
      },
    }
  }

  // For other statement types, delegate to desugarFlow
  return desugarFlow({ flow, ctx })
}

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

/** Resolve a structured type expression to a Core Term. */
function resolveType(typ: SurfType): Term {
  if (typ.form === 'type-or') {
    return { form: 'set' }
  }
  if (typ.form === 'type-fn') {
    // Build an All (pi type) chain: All(p0, T0, All(p1, T1, ... Ret))
    const returnType: Term = typ.ret ? resolveType(typ.ret) : { form: 'set' }
    // Build inside-out to avoid closure capture bugs
    function buildFnAll(idx: number): Term {
      if (idx >= typ.params.length) return returnType
      const paramType = resolveType(typ.params[idx]!)
      return {
        form: 'all',
        name: `_fn${idx}`,
        inp: paramType,
        bod: () => buildFnAll(idx + 1),
      }
    }
    return buildFnAll(0)
  }
  return resolveTypeName(typ.name)
}

/** Resolve a type name string to a Core Term. */
function resolveTypeName(name: string): Term {
  switch (name) {
    // Unsigned integers
    case 'u8': case 'u16': case 'u32': case 'u64':
      return { form: 'u64' }
    // Signed integers
    case 'i8': case 'i16': case 'i32': case 'i64':
      return { form: 'u64' }
    // Floats
    case 'f32': case 'f64':
      return { form: 'f64' }
    // Text / string
    case 'text': case 'string':
      return { form: 'ref', name: 'String' }
    // Boolean
    case 'boolean': case 'wave': case 'bool':
      return { form: 'ref', name: 'Bool' }
    // Void
    case 'void':
      return { form: 'ref', name: 'Void' }
    // Size (unsigned integer alias)
    case 'size': case 'mark':
      return { form: 'u64' }
    // Stdlib ADT types (resolved as refs to their form names)
    case 'maybe':
      return { form: 'ref', name: 'maybe' }
    case 'result':
      return { form: 'ref', name: 'result' }
    case 'list':
      return { form: 'ref', name: 'list' }
    case 'line':
      return { form: 'ref', name: 'line' }
    case 'hash':
      return { form: 'ref', name: 'hash' }
    case 'pair':
      return { form: 'ref', name: 'pair' }
    case 'walk':
      return { form: 'ref', name: 'walk' }
    case 'kink':
      return { form: 'ref', name: 'kink' }
    default:
      return { form: 'ref', name }
  }
}

/** Generate a fresh metavariable. */
function freshMeta(ctx: Ctx): Term {
  const uid = ctx.meta.next++
  return { form: 'met', uid, ctx: [] }
}

/** Look up a path in scope, falling back to a Ref. Chain Get for multi-segment. */
function lookupPath(input: { path: string[]; ctx: Ctx }): Term {
  const { path, ctx } = input
  if (path.length === 0)
    return { form: 'hol', name: 'empty-path', ctx: [] }

  const name = path[0]!
  let base: Term = ctx.scope.get(name) ?? { form: 'ref', name }

  for (let i = 1; i < path.length; i++) {
    base = { form: 'app', func: { form: 'ref', name: `.${path[i]!}` }, argm: base }
  }

  return base
}

/** Wrap a term in App(Ref ".safe") if the safe flag is set. */
function maybeSafe(term: Term, safe?: boolean): Term {
  if (safe) return { form: 'app', func: { form: 'ref', name: '.safe' }, argm: term }
  return term
}
