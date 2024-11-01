import {
  Term,
  Book,
  Fill,
  Tele,
  Ctr,
  Oper,
  Var,
  All,
  Lam,
  App,
  Ann,
  Slf,
  Ins,
  ADT,
  Con,
  Mat,
  Swi,
  Let,
  Use,
  Op2,
  MapType,
  KVs,
  Get,
  Put,
  Lst,
  Src,
  Log,
  TRet,
  TExt,
  Hol,
  Met,
  Bnd,
  Num,
  Txt,
  Nat,
} from '.'

// Evaluates a term to weak normal form
// 'lv' defines when to expand refs: 0 = never, 1 = on redexes
export function reduce(
  book: Map<string, Term>,
  fill: Map<number, Term>,
  lv: number,
  term: Term,
): Term {
  function red(term: Term): Term {
    switch (term.tag) {
      case 'App': {
        return app(red(term.func), term.arg)
      }
      case 'Ann': {
        return red(term.expr)
      }
      case 'Ins': {
        return red(term.term)
      }
      case 'Ref': {
        return ref(term.name)
      }
      case 'Let': {
        return red(term.bodyFn(red(term.value)))
      }
      case 'Use': {
        return red(term.bodyFn(red(term.value)))
      }
      case 'Op2': {
        return op2(term.operator, red(term.left), red(term.right))
      }
      case 'Txt': {
        return txt(term.value)
      }
      case 'Lst': {
        return lst(term.items)
      }
      case 'Nat': {
        return nat(term.value)
      }
      case 'Src': {
        return red(term.term)
      }
      case 'Met': {
        return met(term.id, term.terms)
      }
      case 'Log': {
        return log(term.message, term.next)
      }
      case 'Get': {
        return get(
          term.got,
          term.name,
          red(term.map),
          red(term.key),
          term.bodyFn,
        )
      }
      case 'Put': {
        return put(
          term.got,
          term.name,
          red(term.map),
          red(term.key),
          term.value,
          term.bodyFn,
        )
      }
      default:
        return term
    }
  }

  function app(fun: Term, arg: Term): Term {
    if (fun.tag === 'Ref' && lv > 0) {
      return app(ref(fun.name), arg)
    }
    if (fun.tag === 'Met') {
      return red({ ...fun, tag: 'Met', terms: [...fun.terms, arg] })
    }
    if (fun.tag === 'Lam') {
      return red(fun.bodyFn(reduce(book, fill, 0, arg)))
    }
    if (fun.tag === 'Mat') {
      return mat(fun.cases, red(arg))
    }
    if (fun.tag === 'Swi') {
      return swi(fun.zero, fun.succ, red(arg))
    }
    return { arg, func: fun, tag: 'App' }
  }

  function mat(cases: Array<Bnd>, arg: Term): Term {
    if (arg.tag === 'Con') {
      const matchedCase = cases.find(bnd => bnd.name === arg.name)
      if (matchedCase) {
        return red(
          arg.params.reduce(
            (acc, param) => new App(acc, param.value),
            matchedCase.value,
          ),
        )
      }
      const defaultCase = cases.find(bnd => bnd.name === '_')
      if (defaultCase) {
        return red(new App(defaultCase.value, arg))
      }
      throw new Error(
        `Constructor ${arg.name} not found in pattern match and no default case '_' provided`,
      )
    }
    return new Mat(cases)
  }

  function swi(zer: Term, suc: Term, val: Term): Term {
    if (val.tag === 'Num') {
      if (val.value === 0) {
        return red(zer)
      }
      return red({
        arg: { tag: 'Num', value: val.value - 1 },
        func: suc,
        tag: 'App',
      })
    }
    if (
      val.tag === 'Op2' &&
      val.operator === Oper.ADD &&
      val.left.tag === 'Num' &&
      val.left.value === 1
    ) {
      return red({ arg: val.right, func: suc, tag: 'App' })
    }
    return app({ succ: suc, tag: 'Swi', zero: zer }, val)
  }

  function met(uid: number, spn: Array<Term>): Term {
    const filledTerm = fill.get(uid)
    if (filledTerm) {
      return red(
        spn.reduce(
          (acc, arg) => ({ arg, func: acc, tag: 'App' }),
          filledTerm,
        ),
      )
    }
    return { id: uid, tag: 'Met', terms: spn }
  }

  function op2(op: Oper, fst: Term, snd: Term): Term {
    // Handle references
    if (fst.tag === 'Ref' && snd.tag === 'Num' && lv > 0) {
      return op2(op, ref(fst.name), snd)
    }
    if (fst.tag === 'Num' && snd.tag === 'Ref' && lv > 0) {
      return op2(op, fst, ref(snd.name))
    }

    // Integer operations
    if (fst.tag === 'Num' && snd.tag === 'Num') {
      switch (op) {
        case Oper.ADD:
          return { tag: 'Num', value: fst.value + snd.value }
        case Oper.SUB:
          return { tag: 'Num', value: fst.value - snd.value }
        case Oper.MUL:
          return { tag: 'Num', value: fst.value * snd.value }
        case Oper.DIV:
          return { tag: 'Num', value: fst.value / snd.value }
        case Oper.MOD:
          return { tag: 'Num', value: fst.value % snd.value }
        case Oper.EQ:
          return {
            tag: 'Num',
            value: fst.value === snd.value ? 1 : 0,
          }
        case Oper.NE:
          return {
            tag: 'Num',
            value: fst.value !== snd.value ? 1 : 0,
          }
        case Oper.LT:
          return { tag: 'Num', value: fst.value < snd.value ? 1 : 0 }
        case Oper.GT:
          return { tag: 'Num', value: fst.value > snd.value ? 1 : 0 }
        case Oper.LTE:
          return { tag: 'Num', value: fst.value <= snd.value ? 1 : 0 }
        case Oper.GTE:
          return { tag: 'Num', value: fst.value >= snd.value ? 1 : 0 }
        case Oper.AND:
          return { tag: 'Num', value: fst.value & snd.value }
        case Oper.OR:
          return { tag: 'Num', value: fst.value | snd.value }
        case Oper.XOR:
          return { tag: 'Num', value: fst.value ^ snd.value }
        case Oper.LSH:
          return { tag: 'Num', value: fst.value << Number(snd.value) }
        case Oper.RSH:
          return { tag: 'Num', value: fst.value >> Number(snd.value) }
      }
    }

    // Float operations
    if (fst.tag === 'Flt' && snd.tag === 'Flt') {
      switch (op) {
        case Oper.ADD:
          return { tag: 'Flt', value: fst.value + snd.value }
        case Oper.SUB:
          return { tag: 'Flt', value: fst.value - snd.value }
        case Oper.MUL:
          return { tag: 'Flt', value: fst.value * snd.value }
        case Oper.DIV:
          return { tag: 'Flt', value: fst.value / snd.value }
        case Oper.MOD:
          return { tag: 'Flt', value: fst.value % snd.value }
        case Oper.EQ:
          return {
            tag: 'Num',
            value: fst.value === snd.value ? 1 : 0,
          }
        case Oper.NE:
          return {
            tag: 'Num',
            value: fst.value !== snd.value ? 1 : 0,
          }
        case Oper.LT:
          return { tag: 'Num', value: fst.value < snd.value ? 1 : 0 }
        case Oper.GT:
          return { tag: 'Num', value: fst.value > snd.value ? 1 : 0 }
        case Oper.LTE:
          return { tag: 'Num', value: fst.value <= snd.value ? 1 : 0 }
        case Oper.GTE:
          return { tag: 'Num', value: fst.value >= snd.value ? 1 : 0 }
        case Oper.AND:
        case Oper.OR:
        case Oper.XOR:
          throw new Error(
            `Bitwise operations not supported for floating-point numbers`,
          )
        default:
          return { left: fst, operator: op, right: snd, tag: 'Op2' }
      }
    }

    return { left: fst, operator: op, right: snd, tag: 'Op2' }
  }

  function ref(name: string): Term {
    if (lv > 0) {
      const val = book.get(name)
      if (val) {
        return red(val)
      }
      return {
        name: `undefined-reference:${name}`,
        params: [],
        tag: 'Con',
      }
    }
    return { name, tag: 'Ref' }
  }

  function txt(value: string): Term {
    if (value.length === 0) {
      return red(new Con('Nil', []))
    }
    return red(
      new Con('Cons', [
        new Bnd('code', new Num(value.charCodeAt(0))),
        new Bnd('char', new Txt(value.slice(1))),
      ]),
    )
  }

  function lst(items: Array<Term>): Term {
    if (items.length === 0) {
      return red(new Con('Nil', []))
    }
    return red(
      new Con('Cons', [
        new Bnd('item', items[0]!),
        new Bnd('rest', new Lst(items.slice(1))),
      ]),
    )
  }

  function nat(value: number): Term {
    if (value === 0) {
      return new Con('Zero', [])
    }
    return new Con('Succ', [new Bnd('prev', new Nat(value - 1))])
  }

  function log(msg: Term, nxt: Term): Term {
    return logMsg(book, fill, lv, msg, msg, nxt, '')
  }

  function get(
    g: string,
    n: string,
    m: Term,
    k: Term,
    b: (v: Term, s: Term) => Term,
  ): Term {
    if (m.tag === 'KVs' && k.tag === 'Num') {
      const v = m.entries.get(Number(k.value)) ?? m.defaultValue
      return red(b(v, m))
    }
    return { bodyFn: b, got: g, key: k, map: m, name: n, tag: 'Get' }
  }

  function put(
    g: string,
    n: string,
    m: Term,
    k: Term,
    v: Term,
    b: (o: Term, s: Term) => Term,
  ): Term {
    if (m.tag === 'KVs' && k.tag === 'Num') {
      const numKey = Number(k.value)
      const oldVal = m.entries.get(numKey) ?? m.defaultValue
      const newEntries = new Map(m.entries)
      newEntries.set(numKey, v)
      return red(
        b(oldVal, {
          defaultValue: m.defaultValue,
          entries: newEntries,
          tag: 'KVs',
        }),
      )
    }
    return {
      bodyFn: b,
      got: g,
      key: k,
      map: m,
      name: n,
      tag: 'Put',
      value: v,
    }
  }

  return red(term)
}

// Helper function for logging
function logMsg(
  book: Map<string, Term>,
  fill: Map<number, Term>,
  lv: number,
  origMsg: Term,
  msg: Term,
  nxt: Term,
  txt: string,
): Term {
  const reducedMsg = reduce(book, fill, 2, msg)
  if (reducedMsg.tag === 'Con') {
    if (reducedMsg.name === 'Cons' && reducedMsg.params.length === 2) {
      const [head, tail] = reducedMsg.params
      const reducedHead = reduce(book, fill, lv, head!.value)
      if (reducedHead.tag === 'Num') {
        return logMsg(
          book,
          fill,
          lv,
          origMsg,
          tail!.value,
          nxt,
          txt + String.fromCharCode(Number(reducedHead.value)),
        )
      }
      // console.log('>>', showTerm(normal(book, fill, 1, origMsg, 0)))
      return reduce(book, fill, lv, nxt)
    }
    if (reducedMsg.name === 'Nil' && reducedMsg.params.length === 0) {
      console.log(txt)
      return reduce(book, fill, lv, nxt)
    }
  }
  // console.log('>>', showTerm(normal(book, fill, 1, origMsg, 0)))
  return reduce(book, fill, lv, nxt)
}
// Evaluates a term to full normal form
export function normal(
  book: Book,
  fill: Fill,
  lv: number,
  term: Term,
  dep: number,
): Term {
  function go(term: Term, dep: number): Term {
    switch (term.tag) {
      case 'All': {
        const nf_inp = normal(book, fill, lv, term.paramType, dep)
        const nf_bod = (x: Term) =>
          normal(
            book,
            fill,
            lv,
            term.bodyFn(new Var(term.name, dep)),
            dep + 1,
          )
        return new All(term.name, nf_inp, nf_bod)
      }
      case 'Lam': {
        const nf_bod = (x: Term) =>
          normal(
            book,
            fill,
            lv,
            term.bodyFn(new Var(term.name, dep)),
            dep + 1,
          )
        return new Lam(term.name, nf_bod)
      }
      case 'App': {
        const nf_fun = normal(book, fill, lv, term.func, dep)
        const nf_arg = normal(book, fill, lv, term.arg, dep)
        return new App(nf_fun, nf_arg)
      }
      case 'Ann': {
        const nf_val = normal(book, fill, lv, term.expr, dep)
        const nf_typ = normal(book, fill, lv, term.type, dep)
        return new Ann(term.flag, nf_val, nf_typ)
      }
      case 'Slf': {
        const nf_bod = (x: Term) =>
          normal(
            book,
            fill,
            lv,
            term.bodyFn(new Var(term.name, dep)),
            dep + 1,
          )
        return new Slf(term.name, term.paramType, nf_bod)
      }
      case 'Ins': {
        const nf_val = normal(book, fill, lv, term.term, dep)
        return new Ins(nf_val)
      }
      case 'ADT': {
        const go_ctr = (ctr: Ctr) => {
          const nf_tele = normalTele(book, fill, lv, ctr.tele, dep)
          return new Ctr(ctr.name, nf_tele)
        }
        const nf_scp = term.indices.map(x =>
          normal(book, fill, lv, x, dep),
        )
        const nf_cts = term.constructors.map(go_ctr)
        const nf_typ = normal(book, fill, lv, term.term, dep)
        return new ADT(nf_scp, nf_cts, nf_typ)
      }
      case 'Con': {
        const nf_arg = term.params.map(
          bnd =>
            new Bnd(bnd.name, normal(book, fill, lv, bnd.value, dep)),
        )
        return new Con(term.name, nf_arg)
      }
      case 'Mat': {
        const nf_cse = term.cases.map(
          bnd =>
            new Bnd(bnd.name, normal(book, fill, lv, bnd.value, dep)),
        )
        return new Mat(nf_cse)
      }
      case 'Swi': {
        const nf_zer = normal(book, fill, lv, term.zero, dep)
        const nf_suc = normal(book, fill, lv, term.succ, dep)
        return new Swi(nf_zer, nf_suc)
      }
      case 'Ref':
        return term
      case 'Let': {
        const nf_val = normal(book, fill, lv, term.value, dep)
        const nf_bod = (x: Term) =>
          normal(
            book,
            fill,
            lv,
            term.bodyFn(new Var(term.name, dep)),
            dep + 1,
          )
        return new Let(term.name, nf_val, nf_bod)
      }
      case 'Use': {
        const nf_val = normal(book, fill, lv, term.value, dep)
        const nf_bod = (x: Term) =>
          normal(
            book,
            fill,
            lv,
            term.bodyFn(new Var(term.name, dep)),
            dep + 1,
          )
        return new Use(term.name, nf_val, nf_bod)
      }
      case 'Hol':
        return term
      case 'Set':
      case 'U64':
      case 'F64':
        return term
      case 'Num':
      case 'Flt':
        return term
      case 'Op2': {
        const nf_fst = normal(book, fill, lv, term.left, dep)
        const nf_snd = normal(book, fill, lv, term.right, dep)
        return new Op2(term.operator, nf_fst, nf_snd)
      }
      case 'Map': {
        const nf_typ = normal(book, fill, lv, term.elemType, dep)
        return new MapType(nf_typ)
      }
      case 'KVs': {
        const nf_kvs = new Map(
          Array.from(term.entries.entries()).map(([k, v]) => [
            k,
            normal(book, fill, lv, v, dep),
          ]),
        )
        const nf_def = normal(book, fill, lv, term.defaultValue, dep)
        return new KVs(nf_kvs, nf_def)
      }
      case 'Get': {
        const nf_m = normal(book, fill, lv, term.map, dep)
        const nf_k = normal(book, fill, lv, term.key, dep)
        const nf_b = (v: Term, s: Term) =>
          normal(
            book,
            fill,
            lv,
            term.bodyFn(
              new Var(term.got, dep),
              new Var(term.name, dep),
            ),
            dep + 2,
          )
        return new Get(term.got, term.name, nf_m, nf_k, nf_b)
      }
      case 'Put': {
        const nf_m = normal(book, fill, lv, term.map, dep)
        const nf_k = normal(book, fill, lv, term.key, dep)
        const nf_v = normal(book, fill, lv, term.value, dep)
        const nf_b = (o: Term, s: Term) =>
          normal(
            book,
            fill,
            lv,
            term.bodyFn(
              new Var(term.got, dep),
              new Var(term.name, dep),
            ),
            dep + 2,
          )
        return new Put(term.got, term.name, nf_m, nf_k, nf_v, nf_b)
      }
      case 'Txt':
        return term
      case 'Lst': {
        const nf_val = term.items.map(x =>
          normal(book, fill, lv, x, dep),
        )
        return new Lst(nf_val)
      }
      case 'Nat':
        return term
      case 'Var':
        return term
      case 'Src': {
        const nf_val = normal(book, fill, lv, term.term, dep)
        return new Src(term.code, nf_val)
      }
      case 'Met':
        return term // TODO: normalize spine
      case 'Log': {
        const nf_msg = normal(book, fill, lv, term.message, dep)
        const nf_nxt = normal(book, fill, lv, term.next, dep)
        return new Log(nf_msg, nf_nxt)
      }
      default:
        return term
    }
  }

  return go(reduce(book, fill, lv, term), dep)
}

// Normalize telescope
export function normalTele(
  book: Book,
  fill: Fill,
  lv: number,
  tele: Tele,
  dep: number,
): Tele {
  switch (tele.tag) {
    case 'TRet': {
      const nf_term = normal(book, fill, lv, tele.term, dep)
      return new TRet(nf_term)
    }
    case 'TExt': {
      const nf_typ = normal(book, fill, lv, tele.paramType, dep)
      const nf_bod = (x: Term) =>
        normalTele(
          book,
          fill,
          lv,
          tele.bodyFn(new Var(tele.name, dep)),
          dep + 1,
        )
      return new TExt(nf_bod, tele.name, nf_typ)
    }
  }
}

// Binds quoted variables to bound HOAS variables
export function bind(term: Term, ctx: Array<[string, Term]>): Term {
  switch (term.tag) {
    case 'All': {
      const inp = bind(term.paramType, ctx)
      const bod = (x: Term) =>
        bind(term.bodyFn(new Var(term.name, 0)), [
          [term.name, x],
          ...ctx,
        ])
      return new All(term.name, inp, bod)
    }
    case 'Lam': {
      const bod = (x: Term) =>
        bind(term.bodyFn(new Var(term.name, 0)), [
          [term.name, x],
          ...ctx,
        ])
      return new Lam(term.name, bod)
    }
    case 'App': {
      const fun = bind(term.func, ctx)
      const arg = bind(term.arg, ctx)
      return new App(fun, arg)
    }
    case 'Ann': {
      const val = bind(term.expr, ctx)
      const typ = bind(term.type, ctx)
      return new Ann(term.flag, val, typ)
    }
    case 'Slf': {
      const typ = bind(term.paramType, ctx)
      const bod = (x: Term) =>
        bind(term.bodyFn(new Var(term.name, 0)), [
          [term.name, x],
          ...ctx,
        ])
      return new Slf(term.name, typ, bod)
    }
    case 'Ins': {
      const val = bind(term.term, ctx)
      return new Ins(val)
    }
    case 'ADT': {
      const scp = term.indices.map(x => bind(x, ctx))
      const cts = term.constructors.map(x => bindCtr(x, ctx))
      const typ = bind(term.term, ctx)
      return new ADT(scp, cts, typ)
    }
    case 'Con': {
      const arg = term.params.map(
        bnd => new Bnd(bnd.name, bind(bnd.value, ctx)),
      )
      return new Con(term.name, arg)
    }

    case 'Mat': {
      const cse = term.cases.map(
        bnd => new Bnd(bnd.name, bind(bnd.value, ctx)),
      )
      return new Mat(cse)
    }
    case 'Swi': {
      const zer = bind(term.zero, ctx)
      const suc = bind(term.succ, ctx)
      return new Swi(zer, suc)
    }
    case 'Map': {
      const typ = bind(term.elemType, ctx)
      return new MapType(typ)
    }
    case 'KVs': {
      const kvs = new Map(
        Array.from(term.entries.entries()).map(([k, v]) => [
          k,
          bind(v, ctx),
        ]),
      )
      const def = bind(term.defaultValue, ctx)
      return new KVs(kvs, def)
    }
    case 'Get': {
      const m = bind(term.map, ctx)
      const k = bind(term.key, ctx)
      const b = (v: Term, s: Term) =>
        bind(term.bodyFn(v, s), [[term.name, s], [term.got, v], ...ctx])
      return new Get(term.got, term.name, m, k, b)
    }
    case 'Put': {
      const m = bind(term.map, ctx)
      const k = bind(term.key, ctx)
      const v = bind(term.value, ctx)
      const b = (o: Term, s: Term) =>
        bind(term.bodyFn(o, s), [[term.name, s], [term.got, o], ...ctx])
      return new Put(term.got, term.name, m, k, v, b)
    }
    case 'Ref': {
      const found = ctx.find(([name]) => name === term.name)
      return found ? found[1] : term
    }
    case 'Let': {
      const val = bind(term.value, ctx)
      const bod = (x: Term) =>
        bind(term.bodyFn(new Var(term.name, 0)), [
          [term.name, x],
          ...ctx,
        ])
      return new Let(term.name, val, bod)
    }
    case 'Use': {
      const val = bind(term.value, ctx)
      const bod = (x: Term) =>
        bind(term.bodyFn(new Var(term.name, 0)), [
          [term.name, x],
          ...ctx,
        ])
      return new Use(term.name, val, bod)
    }
    case 'Set':
    case 'U64':
    case 'F64':
    case 'Num':
    case 'Flt':
      return term
    case 'Op2': {
      const fst = bind(term.left, ctx)
      const snd = bind(term.right, ctx)
      return new Op2(term.operator, fst, snd)
    }
    case 'Txt':
      return term
    case 'Lst': {
      const lst = term.items.map(x => bind(x, ctx))
      return new Lst(lst)
    }
    case 'Nat':
      return term
    case 'Hol':
      return new Hol(term.name, ctx.map(([_, term]) => term).reverse())
    case 'Met':
      return new Met(term.id, [])
    case 'Log': {
      const msg = bind(term.message, ctx)
      const nxt = bind(term.next, ctx)
      return new Log(msg, nxt)
    }
    case 'Var': {
      const found = ctx.find(([name]) => name === term.name)
      return found ? found[1] : term
    }
    case 'Src': {
      const val = bind(term.term, ctx)
      return new Src(term.code, val)
    }
    default:
      return term
  }
}

function bindCtr(ctr: Ctr, ctx: Array<[string, Term]>): Ctr {
  return new Ctr(ctr.name, bindTele(ctr.tele, ctx))
}

function bindTele(tele: Tele, ctx: Array<[string, Term]>): Tele {
  switch (tele.tag) {
    case 'TRet':
      return new TRet(bind(tele.term, ctx))
    case 'TExt': {
      const typ = bind(tele.paramType, ctx)
      const bod = (x: Term) =>
        bindTele(tele.bodyFn(x), [[tele.name, x], ...ctx])
      return new TExt(bod, tele.name, typ)
    }
  }
}

export function genMetas(term: Term): Term {
  return genMetasGo(term, 0)[0]
}

export function genMetasGo(term: Term, c: number): [Term, number] {
  switch (term.tag) {
    case 'All': {
      const [inp, c1] = genMetasGo(term.paramType, c)
      const [bod, c2] = genMetasGo(
        term.bodyFn(new Var(term.name, 0)),
        c1,
      )
      return [new All(term.name, inp, _ => bod), c2]
    }
    case 'Lam': {
      const [bod, c1] = genMetasGo(
        term.bodyFn(new Var(term.name, 0)),
        c,
      )
      return [new Lam(term.name, _ => bod), c1]
    }
    case 'App': {
      const [fun, c1] = genMetasGo(term.func, c)
      const [arg, c2] = genMetasGo(term.arg, c1)
      return [new App(fun, arg), c2]
    }
    case 'Ann': {
      const [val, c1] = genMetasGo(term.expr, c)
      const [typ, c2] = genMetasGo(term.type, c1)
      return [new Ann(term.flag, val, typ), c2]
    }
    case 'Slf': {
      const [typ, c1] = genMetasGo(term.paramType, c)
      const [bod, c2] = genMetasGo(
        term.bodyFn(new Var(term.name, 0)),
        c1,
      )
      return [new Slf(term.name, typ, _ => bod), c2]
    }
    case 'Ins': {
      const [val, c1] = genMetasGo(term.term, c)
      return [new Ins(val), c1]
    }
    case 'ADT': {
      const scopeResult = term.indices.reduceRight<
        [Array<Term>, number]
      >(
        (acc, t) => {
          const [accTerms, accC] = acc
          const [t2, c2] = genMetasGo(t, accC)
          return [[...accTerms, t2], c2]
        },
        [[], c],
      )
      const [scp, c1] = scopeResult

      const ctrsResult = term.constructors.reduceRight<
        [Array<Ctr>, number]
      >(
        (acc, ctr) => {
          const [accCtrs, accC] = acc
          const [tele, c2] = genMetasGoTele(ctr.tele, accC)
          return [[new Ctr(ctr.name, tele), ...accCtrs], c2]
        },
        [[], c1],
      )
      const [cts, c2] = ctrsResult

      const [typ, c3] = genMetasGo(term.term, c2)
      return [new ADT(scp, cts, typ), c3]
    }
    case 'Con': {
      const argResult = term.params.reduceRight<[Array<Bnd>, number]>(
        (acc, bnd) => {
          const [accArgs, accC] = acc
          const [valueResult, c2] = genMetasGo(bnd.value, accC)
          return [[new Bnd(bnd.name, valueResult), ...accArgs], c2]
        },
        [[], c],
      )
      const [arg, c1] = argResult
      return [new Con(term.name, arg), c1]
    }

    case 'Mat': {
      const cseResult = term.cases.reduceRight<[Array<Bnd>, number]>(
        (acc, bnd) => {
          const [accCases, accC] = acc
          const [valueResult, c2] = genMetasGo(bnd.value, accC)
          return [[new Bnd(bnd.name, valueResult), ...accCases], c2]
        },
        [[], c],
      )
      const [cse, c1] = cseResult
      return [new Mat(cse), c1]
    }
    case 'Swi': {
      const [zer, c1] = genMetasGo(term.zero, c)
      const [suc, c2] = genMetasGo(term.succ, c1)
      return [new Swi(zer, suc), c2]
    }
    case 'Map': {
      const [typ, c1] = genMetasGo(term.elemType, c)
      return [new MapType(typ), c1]
    }
    case 'KVs': {
      const [def, c1] = genMetasGo(term.defaultValue, c)
      const entriesArray = Array.from(term.entries.entries())
      const kvResult = entriesArray.reduceRight<
        [Map<number, Term>, number]
      >(
        (acc, [k, t]) => {
          const [accMap, accC] = acc
          const [t2, c2] = genMetasGo(t, accC)
          return [new Map(accMap).set(k, t2), c2]
        },
        [new Map<number, Term>(), c1],
      )
      const [kvs, c2] = kvResult
      return [new KVs(kvs, def), c2]
    }
    case 'Get': {
      const [m, c1] = genMetasGo(term.map, c)
      const [k, c2] = genMetasGo(term.key, c1)
      const [b, c3] = genMetasGo(
        term.bodyFn(new Var(term.got, 0), new Var(term.name, 0)),
        c2,
      )
      return [new Get(term.got, term.name, m, k, (_, __) => b), c3]
    }
    case 'Put': {
      const [m, c1] = genMetasGo(term.map, c)
      const [k, c2] = genMetasGo(term.key, c1)
      const [v, c3] = genMetasGo(term.value, c2)
      const [b, c4] = genMetasGo(
        term.bodyFn(new Var(term.got, 0), new Var(term.name, 0)),
        c3,
      )
      return [new Put(term.got, term.name, m, k, v, (_, __) => b), c4]
    }
    case 'Let': {
      const [val, c1] = genMetasGo(term.value, c)
      const [bod, c2] = genMetasGo(
        term.bodyFn(new Var(term.name, 0)),
        c1,
      )
      return [new Let(term.name, val, _ => bod), c2]
    }
    case 'Use': {
      const [val, c1] = genMetasGo(term.value, c)
      const [bod, c2] = genMetasGo(
        term.bodyFn(new Var(term.name, 0)),
        c1,
      )
      return [new Use(term.name, val, _ => bod), c2]
    }
    case 'Met': {
      const spnResult = term.terms.reduceRight<[Array<Term>, number]>(
        (acc, t) => {
          const [accTerms, accC] = acc
          const [t2, c2] = genMetasGo(t, accC)
          return [[t2, ...accTerms], c2]
        },
        [[], c],
      )
      const [spn, c1] = spnResult
      return [new Met(c1, spn), c1 + 1]
    }
    case 'Op2': {
      const [fst, c1] = genMetasGo(term.left, c)
      const [snd, c2] = genMetasGo(term.right, c1)
      return [new Op2(term.operator, fst, snd), c2]
    }
    case 'Lst': {
      const lstResult = term.items.reduceRight<[Array<Term>, number]>(
        (acc, t) => {
          const [accItems, accC] = acc
          const [t2, c2] = genMetasGo(t, accC)
          return [[t2, ...accItems], c2]
        },
        [[], c],
      )
      const [lst, c1] = lstResult
      return [new Lst(lst), c1]
    }
    case 'Log': {
      const [msg, c1] = genMetasGo(term.message, c)
      const [nxt, c2] = genMetasGo(term.next, c1)
      return [new Log(msg, nxt), c2]
    }
    case 'Hol': {
      const ctxResult = term.terms.reduceRight<[Array<Term>, number]>(
        (acc, t) => {
          const [accTerms, accC] = acc
          const [t2, c2] = genMetasGo(t, accC)
          return [[t2, ...accTerms], c2]
        },
        [[], c],
      )
      const [ctx, c1] = ctxResult
      return [new Hol(term.name, ctx), c1]
    }
    case 'Src': {
      const [val, c1] = genMetasGo(term.term, c)
      return [new Src(term.code, val), c1]
    }
    default:
      return [term, c]
  }
}

export function genMetasGoTele(tele: Tele, c: number): [Tele, number] {
  switch (tele.tag) {
    case 'TRet': {
      const [term, c1] = genMetasGo(tele.term, c)
      return [new TRet(term), c1]
    }
    case 'TExt': {
      const [typ, c1] = genMetasGo(tele.paramType, c)
      const [bod, c2] = genMetasGoTele(
        tele.bodyFn(new Var(tele.name, 0)),
        c1,
      )
      return [new TExt(_ => bod, tele.name, typ), c2]
    }
  }
}

export function countMetas(term: Term): number {
  return genMetasGo(term, 0)[1]
}
