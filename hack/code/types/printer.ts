// Pretty printer for types
export default class TypePrinter {
  print(term: Term, precedence: number = 0): string {
    switch (term.type) {
      case 'Var':
        return term.name
      case 'Typ':
        return `Type${term.level}`
      case 'All':
        const arrow = term.erased ? '->' : '→'
        const printed = `(${term.name} : ${this.print(
          term.bind,
        )}) ${arrow} ${this.print(term.body)}`
        return precedence > 0 ? `(${printed})` : printed
      case 'Lam':
        const printed2 = `λ${term.name}. ${this.print(term.body)}`
        return precedence > 0 ? `(${printed2})` : printed2
      case 'App':
        const printed3 = `${this.print(term.func, 1)} ${this.print(
          term.argm,
          2,
        )}`
        return precedence > 1 ? `(${printed3})` : printed3
      case 'Let':
        return `let ${term.name} = ${this.print(
          term.expr,
        )} in ${this.print(term.body)}`
      case 'Ann':
        return `(${this.print(term.expr)} : ${this.print(term.type)})`
      case 'Ref':
        return term.name
      case 'Met':
        return `?${term.index}`
      case 'Src':
        return this.print(term.term, precedence)
    }
  }
}
