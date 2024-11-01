import { Lam, Location, Name, Term, Var } from '.'

export type Constraint = {
  actual: Term
  expected: Term
  location?: Location
}

export type MetaEntry = {
  constraints: Array<Constraint>
  solved?: Term
  type: Term
}

export class TypeChecker {
  private level = 0

  private context: Map<Name, Term> = new Map()

  private constraints: Array<Constraint> = []

  private metas: Map<number, MetaEntry> = new Map()

  private nextMetaIndex = 0

  check(term: Term, type: Term): boolean {
    try {
      this.checkTerm(term, type)
      return this.solveConstraints()
    } catch (error) {
      return false
    }
  }

  private checkTerm(term: Term, type: Term): void {
    switch (term.typeName) {
      case 'Var':
        this.checkVar(term, type)
        break
      case 'Lam':
        this.checkLam(term, type)
        break
      case 'App':
        this.checkApp(term, type)
        break
      case 'Let':
        this.checkLet(term, type)
        break
      case 'Ann':
        this.checkAnn(term, type)
        break
      case 'Typ':
        this.checkTyp(term, type)
        break
      case 'All':
        this.checkAll(term, type)
        break
      case 'Met':
        this.checkMeta(term, type)
        break
      case 'Ref':
        this.checkRef(term, type)
        break
      case 'Src':
        this.checkTerm(term.term, type)
        break
    }
  }

  private checkVar(term: Var, type: Term): void {
    const varType = this.context.get(term.name)
    if (!varType) {
      throw new Error(`Undefined variable: ${term.name}`)
    }
    this.unify(type, varType)
  }

  private checkLam(term: Lam, type: Term): void {
    const [argType, retType] = this.matchPi(type)

    // Add parameter to context
    this.context.set(term.name, argType)

    // Check body
    this.checkTerm(
      term.body,
      this.substitute(retType, term.name, new Var(term.name)),
    )

    // Remove parameter from context
    this.context.delete(term.name)
  }

  private checkApp(term: App, type: Term): void {
    const funcType = this.infer(term.func)
    const [argType, retType] = this.matchPi(funcType)

    this.checkTerm(term.argm, argType)
    this.unify(type, this.substitute(retType, term.argm))
  }

  private checkLet(term: Let, type: Term): void {
    const exprType = this.infer(term.expr)

    // Add definition to context
    this.context.set(term.name, exprType)

    // Check body
    this.checkTerm(term.body, type)

    // Remove definition from context
    this.context.delete(term.name)
  }

  private checkAnn(term: Ann, type: Term): void {
    this.checkTerm(term.type, new Typ({ level: this.level }))
    this.checkTerm(term.expr, term.type)
    this.unify(type, term.type)
  }

  private checkTyp(term: Typ, type: Term): void {
    if (term.level >= this.level) {
      throw new Error('Universe level error')
    }
    this.unify(type, new Typ({ level: term.level + 1 }))
  }

  private checkAll(term: All, type: Term): void {
    this.checkTerm(term.bind, new Typ({ level: this.level }))

    // Add parameter to context
    this.context.set(term.name, term.bind)

    // Check body
    this.checkTerm(term.body, new Typ({ level: this.level }))

    // Remove parameter from context
    this.context.delete(term.name)

    this.unify(type, new Typ({ level: this.level }))
  }

  private checkMeta(term: Met, type: Term): void {
    const meta = this.metas.get(term.index)
    if (!meta) {
      throw new Error(`Undefined metavariable: ?${term.index}`)
    }

    if (meta.solved) {
      this.checkTerm(meta.solved, type)
    } else {
      meta.constraints.push({ actual: term, expected: type })
    }
  }

  private checkRef(term: Ref, type: Term): void {
    const refType = this.context.get(term.name)
    if (!refType) {
      throw new Error(`Undefined reference: ${term.name}`)
    }
    this.unify(type, refType)
  }

  private infer(term: Term): Term {
    const meta = this.freshMeta()
    this.checkTerm(term, meta)
    return meta
  }

  private freshMeta(): Met {
    const index = this.nextMetaIndex++
    const type = new Typ({ level: this.level })
    this.metas.set(index, { constraints: [], type })
    return new Met({ index })
  }

  private matchPi(type: Term): [Term, Term] {
    if (type.type !== 'All') {
      throw new Error('Expected function type')
    }
    return [type.bind, type.body]
  }

  private unify(expected: Term, actual: Term): void {
    // Normalize both terms
    const norm1 = this.normalize(expected)
    const norm2 = this.normalize(actual)

    if (this.equalTerms(norm1, norm2)) {
      return
    }

    // Handle metavariables
    if (norm1.type === 'Met') {
      this.solveMeta(norm1.index, norm2)
      return
    }
    if (norm2.type === 'Met') {
      this.solveMeta(norm2.index, norm1)
      return
    }

    // Structure equality
    if (norm1.type !== norm2.type) {
      throw new Error('Type mismatch')
    }

    switch (norm1.type) {
      case 'All':
        this.unify(norm1.bind, (norm2 as All).bind)
        this.unify(norm1.body, (norm2 as All).body)
        break
      case 'Lam':
        this.unify(norm1.body, (norm2 as Lam).body)
        break
      case 'App':
        this.unify(norm1.func, (norm2 as App).func)
        this.unify(norm1.argm, (norm2 as App).argm)
        break
      // Add other cases as needed
    }
  }

  private solveMeta(index: number, solution: Term): void {
    const meta = this.metas.get(index)
    if (!meta) {
      throw new Error(`Undefined metavariable: ?${index}`)
    }

    if (meta.solved) {
      this.unify(meta.solved, solution)
      return
    }

    // Occur check
    if (this.occurs(index, solution)) {
      throw new Error('Occurs check failed')
    }

    meta.solved = solution

    // Solve accumulated constraints
    for (const constraint of meta.constraints) {
      this.unify(
        constraint.expected,
        this.substitute(solution, constraint.actual),
      )
    }
    meta.constraints = []
  }

  private occurs(index: number, term: Term): boolean {
    switch (term.type) {
      case 'Met':
        return term.index === index
      case 'App':
        return (
          this.occurs(index, term.func) || this.occurs(index, term.argm)
        )
      case 'Lam':
        return this.occurs(index, term.body)
      case 'All':
        return (
          this.occurs(index, term.bind) || this.occurs(index, term.body)
        )
      // Add other cases as needed
      default:
        return false
    }
  }

  private normalize(term: Term): Term {
    switch (term.type) {
      case 'App':
        const func = this.normalize(term.func)
        if (func.type === 'Lam') {
          return this.normalize(this.substitute(func.body, term.argm))
        }
        return { ...term, func }
      case 'Let':
        return this.normalize(
          this.substitute(term.body, term.name, term.expr),
        )
      case 'Met':
        const meta = this.metas.get(term.index)
        if (meta?.solved) {
          return this.normalize(meta.solved)
        }
        return term
      default:
        return term
    }
  }

  private substitute(term: Term, arg: Term): Term
  private substitute(term: Term, name: Name, value: Term): Term
  private substitute(
    term: Term,
    nameOrArg: Name | Term,
    value?: Term,
  ): Term {
    const doSubst = (term: Term): Term => {
      switch (term.type) {
        case 'Var':
          if (
            typeof nameOrArg === 'string' &&
            term.name === nameOrArg
          ) {
            return value!
          }
          return term
        case 'App':
          return {
            ...term,
            argm: doSubst(term.argm),
            func: doSubst(term.func),
          }
        case 'Lam':
          if (
            typeof nameOrArg === 'string' &&
            term.name === nameOrArg
          ) {
            return term
          }
          return {
            ...term,
            body: doSubst(term.body),
          }
        case 'All':
          if (
            typeof nameOrArg === 'string' &&
            term.name === nameOrArg
          ) {
            return term
          }
          return {
            ...term,
            bind: doSubst(term.bind),
            body: doSubst(term.body),
          }
        // Add other cases as needed
        default:
          return term
      }
    }

    return doSubst(term)
  }

  private equalTerms(term1: Term, term2: Term): boolean {
    if (term1.type !== term2.type) {
      return false
    }

    switch (term1.type) {
      case 'Var':
        return term1.name === (term2 as Var).name
      case 'Typ':
        return term1.level === (term2 as Typ).level
      case 'All':
        return (
          this.equalTerms(term1.bind, (term2 as All).bind) &&
          this.equalTerms(term1.body, (term2 as All).body)
        )
      case 'Lam':
        return this.equalTerms(term1.body, (term2 as Lam).body)
      case 'App':
        return (
          this.equalTerms(term1.func, (term2 as App).func) &&
          this.equalTerms(term1.argm, (term2 as App).argm)
        )
      case 'Met':
        return term1.index === (term2 as Met).index
      default:
        return false
    }
  }

  private solveConstraints(): boolean {
    try {
      for (const meta of this.metas.values()) {
        if (!meta.solved && meta.constraints.length > 0) {
          const constraint = meta.constraints[0]
          this.unify(constraint.expected, constraint.actual)
        }
      }
      return true
    } catch {
      return false
    }
  }
}
