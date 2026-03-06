/**
 * ADT-to-self-type encoding.
 *
 * Converts algebraic data type definitions into self-type (Slf/Ins)
 * encodings following Kind's approach. This enables dependent
 * elimination and induction principles without built-in inductive
 * types.
 *
 * For example, Nat is encoded as:
 *
 *   Nat = $(self: Nat)
 *     forall(P: Nat -> *)
 *     P(Zero) ->
 *     (forall(pred: Nat) P(pred) -> P(Succ(pred))) ->
 *     P(self)
 *
 *   Zero = ~\P \z \s z
 *   Succ = \n ~\P \z \s (s n (~n P z s))
 *
 * The key insight: self-instantiation (~n) gives the induction
 * hypothesis, enabling genuine induction (not just recursion).
 */

import type { Term, Tele, Ctr } from '@/term/form'

/** Description of an ADT for encoding. */
export type AdtDesc = {
  /** Type name (e.g. "Nat", "Bool", "Equal") */
  name: string
  /** Index parameters (for indexed types like Equal) */
  indices: Array<{ name: string; typ: Term }>
  /** Constructors */
  ctrs: Array<CtrDesc>
}

/** Description of a constructor. */
export type CtrDesc = {
  /** Constructor name (e.g. "Zero", "Succ") */
  name: string
  /** Fields with types */
  fields: Array<{ name: string; typ: Term }>
  /** Index values this constructor produces (for indexed types) */
  indexValues?: Term[]
}

/**
 * Encode an ADT as a self-type.
 * Returns: { typeDef, ctrs, elim } where:
 *   typeDef: the self-type term for the ADT itself (e.g. Nat : *)
 *   ctrs: constructor terms (e.g. Zero : Nat, Succ : Nat -> Nat)
 *   elim: the eliminator / induction principle
 */
export function encodeSelfType(input: { adt: AdtDesc }): {
  typeDef: Term
  ctrs: Array<{ name: string; term: Term; typ: Term }>
} {
  const { adt } = input

  // Build the self-type for the ADT
  const typeDef = buildSelfType({ adt })

  // Build each constructor
  const ctrs = adt.ctrs.map(ctr => ({
    name: ctr.name,
    ...buildConstructor({ adt, ctr }),
  }))

  return { typeDef, ctrs }
}

/**
 * Build the self-type for the ADT.
 *
 * For Nat:
 *   $(self: Nat)
 *     forall(P: Nat -> *)
 *     P(Zero) ->
 *     (forall(pred: Nat) P(pred) -> P(Succ(pred))) ->
 *     P(self)
 */
function buildSelfType(input: { adt: AdtDesc }): Term {
  const { adt } = input
  const adtRef: Term = { form: 'ref', name: adt.name }

  return {
    form: 'slf',
    name: 'self',
    typ: adtRef,
    bod: self => {
      // Motive: P : Nat -> *
      const motiveType: Term = {
        form: 'all',
        name: '_',
        inp: adtRef,
        bod: () => ({ form: 'set' }),
      }

      return {
        form: 'all',
        name: 'P',
        inp: motiveType,
        bod: P => buildCtrArms({ adt, P, self }),
      }
    },
  }
}

/**
 * Build the chain of constructor arm types in the self-type.
 *
 * For Nat with motive P:
 *   P(Zero) -> (forall(pred: Nat) P(pred) -> P(Succ(pred))) -> P(self)
 */
function buildCtrArms(input: {
  adt: AdtDesc
  P: Term
  self: Term
}): Term {
  const { adt, P, self } = input
  const arms = adt.ctrs

  // Build from right to left: last arm wraps P(self)
  function go(idx: number): Term {
    if (idx >= arms.length) {
      // Final return type: P(self)
      return { form: 'app', func: P, argm: self }
    }

    const ctr = arms[idx]!
    const armType = buildCtrArmType({ adt, ctr, P })

    return {
      form: 'all',
      name: ctr.name.toLowerCase(),
      inp: armType,
      bod: () => go(idx + 1),
    }
  }

  return go(0)
}

/**
 * Build a single constructor arm type for the self-type.
 *
 * For Zero (no fields): P(Zero)
 * For Succ (field pred: Nat): forall(pred: Nat) P(pred) -> P(Succ(pred))
 */
function buildCtrArmType(input: {
  adt: AdtDesc
  ctr: CtrDesc
  P: Term
}): Term {
  const { adt, ctr, P } = input

  if (ctr.fields.length === 0) {
    // No fields: just P(CtrName)
    return { form: 'app', func: P, argm: { form: 'ref', name: ctr.name } }
  }

  // With fields: forall(field1: T1) ... P(field_i) -> ... P(Ctr(fields))
  return buildFieldChain({ adt, ctr, P, fieldIdx: 0, fieldVars: [] })
}

/**
 * Build the nested forall chain for a constructor's fields.
 *
 * For Succ with field (pred: Nat):
 *   forall(pred: Nat) P(pred) -> P(Succ(pred))
 *
 * The P(pred) is the induction hypothesis.
 */
function buildFieldChain(input: {
  adt: AdtDesc
  ctr: CtrDesc
  P: Term
  fieldIdx: number
  fieldVars: Term[]
}): Term {
  const { adt, ctr, P, fieldIdx, fieldVars } = input

  if (fieldIdx >= ctr.fields.length) {
    // All fields bound, return P(Ctr(field1, field2, ...))
    let ctrApp: Term = { form: 'ref', name: ctr.name }
    for (const v of fieldVars) {
      ctrApp = { form: 'app', func: ctrApp, argm: v }
    }
    return { form: 'app', func: P, argm: ctrApp }
  }

  const field = ctr.fields[fieldIdx]!
  const adtRef: Term = { form: 'ref', name: adt.name }

  return {
    form: 'all',
    name: field.name,
    inp: field.typ,
    bod: fieldVar => {
      const newVars = [...fieldVars, fieldVar]

      // If field type is the ADT itself, add induction hypothesis P(field)
      if (isAdtRef({ typ: field.typ, adtName: adt.name })) {
        return {
          form: 'all',
          name: `ih_${field.name}`,
          inp: { form: 'app', func: P, argm: fieldVar },
          bod: () =>
            buildFieldChain({
              adt,
              ctr,
              P,
              fieldIdx: fieldIdx + 1,
              fieldVars: newVars,
            }),
        }
      }

      return buildFieldChain({
        adt,
        ctr,
        P,
        fieldIdx: fieldIdx + 1,
        fieldVars: newVars,
      })
    },
  }
}

/** Check if a type is a reference to the ADT being defined. */
function isAdtRef(input: { typ: Term; adtName: string }): boolean {
  const { typ, adtName } = input
  if (typ.form === 'ref') return typ.name === adtName
  // Could also be an application (indexed type), check the head
  if (typ.form === 'app') return isAdtRef({ typ: typ.func, adtName })
  return false
}

/**
 * Build a constructor term.
 *
 * For Zero:
 *   ~\P \zero \succ zero
 *
 * For Succ:
 *   \n ~\P \zero \succ (succ n (~n P zero succ))
 *
 * The (~n P zero succ) is the induction hypothesis application.
 */
function buildConstructor(input: {
  adt: AdtDesc
  ctr: CtrDesc
}): { term: Term; typ: Term } {
  const { adt, ctr } = input
  const adtRef: Term = { form: 'ref', name: adt.name }

  // Build the constructor type: field1 -> field2 -> ... -> Nat
  let ctrType: Term = adtRef
  for (let i = ctr.fields.length - 1; i >= 0; i--) {
    const field = ctr.fields[i]!
    const retType = ctrType
    ctrType = {
      form: 'all',
      name: field.name,
      inp: field.typ,
      bod: () => retType,
    }
  }

  // Build the constructor value
  const ctrIdx = adt.ctrs.findIndex(c => c.name === ctr.name)

  // Wrap in field lambdas
  function wrapFields(
    fieldIdx: number,
    fieldVars: Term[],
  ): Term {
    if (fieldIdx >= ctr.fields.length) {
      return buildCtrBody({ adt, ctrIdx, fieldVars })
    }
    const field = ctr.fields[fieldIdx]!
    return {
      form: 'lam',
      name: field.name,
      bod: fieldVar =>
        wrapFields(fieldIdx + 1, [...fieldVars, fieldVar]),
    }
  }

  return { term: wrapFields(0, []), typ: ctrType }
}

/**
 * Build the body of a constructor (the Ins + lambdas part).
 *
 * For Zero (ctrIdx=0, no fields):
 *   ~\P \zero \succ zero
 *
 * For Succ (ctrIdx=1, fields=[n]):
 *   ~\P \zero \succ (succ n (~n P zero succ))
 */
function buildCtrBody(input: {
  adt: AdtDesc
  ctrIdx: number
  fieldVars: Term[]
}): Term {
  const { adt, ctrIdx, fieldVars } = input
  const ctr = adt.ctrs[ctrIdx]!

  // ~\P \arm0 \arm1 ... armI(fields, IH)
  return {
    form: 'ins',
    val: {
      form: 'lam',
      name: 'P',
      bod: P => {
        // Chain of arm lambdas
        function armChain(armIdx: number, armVars: Term[]): Term {
          if (armIdx >= adt.ctrs.length) {
            // Apply the correct arm to field values + induction hypotheses
            const arm = armVars[ctrIdx]!
            return applyArmToFields({
              adt,
              ctr,
              arm,
              P,
              armVars,
              fieldVars,
            })
          }
          const armCtr = adt.ctrs[armIdx]!
          return {
            form: 'lam',
            name: armCtr.name.toLowerCase(),
            bod: armVar =>
              armChain(armIdx + 1, [...armVars, armVar]),
          }
        }
        return armChain(0, [])
      },
    },
  }
}

/**
 * Apply a constructor arm to field values and induction hypotheses.
 *
 * For Zero: just return the arm variable (zero)
 * For Succ with field n: (succ n (~n P zero succ))
 *   where (~n P zero succ) is the IH
 */
function applyArmToFields(input: {
  adt: AdtDesc
  ctr: CtrDesc
  arm: Term
  P: Term
  armVars: Term[]
  fieldVars: Term[]
}): Term {
  const { adt, ctr, arm, P, armVars, fieldVars } = input

  let result: Term = arm

  for (let i = 0; i < ctr.fields.length; i++) {
    const field = ctr.fields[i]!
    const fieldVar = fieldVars[i]!

    // Apply field value
    result = { form: 'app', func: result, argm: fieldVar }

    // If field type is the ADT, also apply the induction hypothesis
    if (isAdtRef({ typ: field.typ, adtName: adt.name })) {
      const ih = buildIH({ fieldVar, P, armVars })
      result = { form: 'app', func: result, argm: ih }
    }
  }

  return result
}

/**
 * Build the induction hypothesis for a recursive field.
 *
 * (~fieldVar P arm0 arm1 ...)
 *
 * This self-instantiates the recursive field and applies
 * P and all arm functions, yielding P(fieldVar).
 */
function buildIH(input: {
  fieldVar: Term
  P: Term
  armVars: Term[]
}): Term {
  const { fieldVar, P, armVars } = input
  let result: Term = { form: 'ins', val: fieldVar }
  result = { form: 'app', func: result, argm: P }
  for (const armVar of armVars) {
    result = { form: 'app', func: result, argm: armVar }
  }
  return result
}

/**
 * Build the Equal (propositional equality) type.
 *
 *   Equal(A, a, b) = $(self: Equal(A, a, b))
 *     forall(P: A -> *)
 *     P(a) ->
 *     P(b)
 *
 * With refl:
 *   refl(A, a) : Equal(A, a, a) = ~\P \p p
 */
export function buildEqualType(): {
  Equal: Term
  refl: Term
} {
  // Equal : forall(A: *) forall(a: A) forall(b: A) *
  const Equal: Term = {
    form: 'ann',
    done: false,
    val: {
      form: 'lam',
      name: 'A',
      bod: A => ({
        form: 'lam',
        name: 'a',
        bod: a => ({
          form: 'lam',
          name: 'b',
          bod: b => ({
            form: 'slf',
            name: 'self',
            typ: {
              form: 'app',
              func: {
                form: 'app',
                func: {
                  form: 'app',
                  func: { form: 'ref', name: 'Equal' },
                  argm: A,
                },
                argm: a,
              },
              argm: b,
            },
            bod: () => ({
              form: 'all',
              name: 'P',
              inp: {
                form: 'all',
                name: '_',
                inp: A,
                bod: () => ({ form: 'set' }),
              },
              bod: P => ({
                form: 'all',
                name: '_',
                inp: { form: 'app', func: P, argm: a },
                bod: () => ({ form: 'app', func: P, argm: b }),
              }),
            }),
          }),
        }),
      }),
    },
    typ: {
      form: 'all',
      name: 'A',
      inp: { form: 'set' },
      bod: A => ({
        form: 'all',
        name: 'a',
        inp: A,
        bod: () => ({
          form: 'all',
          name: 'b',
          inp: A,
          bod: () => ({ form: 'set' }),
        }),
      }),
    },
  }

  // refl : forall(A: *) forall(a: A) Equal(A, a, a)
  const refl: Term = {
    form: 'ann',
    done: false,
    val: {
      form: 'lam',
      name: 'A',
      bod: () => ({
        form: 'lam',
        name: 'a',
        bod: () => ({
          form: 'ins',
          val: {
            form: 'lam',
            name: 'P',
            bod: () => ({
              form: 'lam',
              name: 'p',
              bod: p => p,
            }),
          },
        }),
      }),
    },
    typ: {
      form: 'all',
      name: 'A',
      inp: { form: 'set' },
      bod: A => ({
        form: 'all',
        name: 'a',
        inp: A,
        bod: a => ({
          form: 'app',
          func: {
            form: 'app',
            func: {
              form: 'app',
              func: { form: 'ref', name: 'Equal' },
              argm: A,
            },
            argm: a,
          },
          argm: a,
        }),
      }),
    },
  }

  return { Equal, refl }
}

/**
 * Build the cong (congruence) proof term.
 *
 *   cong : forall(A B: *) forall(f: A -> B) forall(a b: A)
 *          Equal(A, a, b) -> Equal(B, f(a), f(b))
 *   cong = \A \B \f \a \b \e ~e (\x Equal(B, f(a), f(x))) refl(B, f(a))
 */
export function buildCong(): Term {
  const EqualApp = (A: Term, a: Term, b: Term): Term => ({
    form: 'app',
    func: {
      form: 'app',
      func: { form: 'app', func: { form: 'ref', name: 'Equal' }, argm: A },
      argm: a,
    },
    argm: b,
  })

  const reflApp = (A: Term, a: Term): Term => ({
    form: 'app',
    func: { form: 'app', func: { form: 'ref', name: 'refl' }, argm: A },
    argm: a,
  })

  return {
    form: 'ann',
    done: false,
    val: {
      form: 'lam',
      name: 'A',
      bod: () => ({
        form: 'lam',
        name: 'B',
        bod: B => ({
          form: 'lam',
          name: 'f',
          bod: f => ({
            form: 'lam',
            name: 'a',
            bod: a => ({
              form: 'lam',
              name: 'b',
              bod: () => ({
                form: 'lam',
                name: 'e',
                bod: e => ({
                  form: 'app',
                  func: {
                    form: 'app',
                    func: {
                      form: 'app',
                      func: { form: 'ins', val: e },
                      argm: {
                        form: 'lam',
                        name: 'x',
                        bod: x =>
                          EqualApp(
                            B,
                            { form: 'app', func: f, argm: a },
                            { form: 'app', func: f, argm: x },
                          ),
                      },
                    },
                    argm: reflApp(
                      B,
                      { form: 'app', func: f, argm: a },
                    ),
                  },
                  argm: { form: 'set' }, // dummy, will be inferred
                }),
              }),
            }),
          }),
        }),
      }),
    },
    typ: {
      form: 'all',
      name: 'A',
      inp: { form: 'set' },
      bod: A => ({
        form: 'all',
        name: 'B',
        inp: { form: 'set' },
        bod: B => ({
          form: 'all',
          name: 'f',
          inp: {
            form: 'all',
            name: '_',
            inp: A,
            bod: () => B,
          },
          bod: f => ({
            form: 'all',
            name: 'a',
            inp: A,
            bod: a => ({
              form: 'all',
              name: 'b',
              inp: A,
              bod: b => ({
                form: 'all',
                name: '_',
                inp: EqualApp(A, a, b),
                bod: () =>
                  EqualApp(
                    B,
                    { form: 'app', func: f, argm: a },
                    { form: 'app', func: f, argm: b },
                  ),
              }),
            }),
          }),
        }),
      }),
    },
  }
}
