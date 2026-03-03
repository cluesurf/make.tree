/**
 * Macro expansion phase: resolves `fuse` directives by expanding
 * `tree` templates with parameter substitution.
 *
 * Runs after readCard and before desugarCard.
 *
 * 1. Collects all SurfTree definitions into a map.
 * 2. Walks all nodes. When encountering a SurfFuse:
 *    a. Looks up the tree template by name.
 *    b. Builds a substitution map from the fuse's binds.
 *    c. Clones the template's hook contents, substituting
 *       {param} in names with the bound value.
 *    d. Replaces the fuse node with the expanded nodes.
 * 3. Removes SurfTree definitions from the card.
 */

import type {
  Surf,
  SurfCard,
  SurfTree,
  SurfFuse,
  SurfBind,
  SurfTask,
  SurfForm,
  SurfHook,
  SurfFork,
  SurfWalk,
  SurfBase,
  SurfHead,
  SurfLink,
  SurfCaseArm,
  SurfCall,
  SurfMake,
  SurfSave,
  SurfBack,
  SurfType,
} from '@/surf/form'

type SubstMap = Map<string, string>

export function expandFuse(input: { card: SurfCard }): SurfCard {
  const { card } = input

  // Collect tree templates
  const trees = new Map<string, SurfTree>()
  for (const node of card.list) {
    if (node.form === 'tree') {
      trees.set(node.name, node)
    }
  }

  // Expand fuses and remove tree definitions
  const list: Surf[] = []
  for (const node of card.list) {
    if (node.form === 'tree') continue
    const expanded = expandNode({ node, trees })
    list.push(...expanded)
  }

  return { file: card.file, list }
}

function expandNode(input: {
  node: Surf
  trees: Map<string, SurfTree>
}): Surf[] {
  const { node, trees } = input

  if (node.form === 'fuse') {
    return expandFuseNode({ fuse: node, trees })
  }

  if (node.form === 'form') {
    return [expandForm({ form: node, trees })]
  }

  if (node.form === 'task') {
    return [expandTask({ task: node, trees })]
  }

  return [node]
}

function expandFuseNode(input: {
  fuse: SurfFuse
  trees: Map<string, SurfTree>
}): Surf[] {
  const { fuse, trees } = input
  const tree = trees.get(fuse.name)
  if (!tree) return []

  // Build substitution map from fuse binds
  const subst: SubstMap = new Map()
  for (const bind of fuse.bind) {
    const val = bindToString(bind)
    subst.set(bind.name, val)
  }

  // Expand all hooks from the tree template
  const result: Surf[] = []
  for (const hook of tree.hook) {
    for (const item of hook.list) {
      result.push(substSurf({ node: item, subst, trees }))
    }
  }

  return result
}

function expandForm(input: {
  form: SurfForm
  trees: Map<string, SurfTree>
}): SurfForm {
  const { form, trees } = input

  // Expand any fuse nodes in the bond list
  const bond: Surf[] = []
  const task: SurfTask[] = []

  for (const b of form.bond) {
    if (b.form === 'fuse') {
      const expanded = expandFuseNode({ fuse: b, trees })
      for (const e of expanded) {
        if (e.form === 'task') {
          task.push(e)
        } else {
          bond.push(e)
        }
      }
    } else {
      bond.push(b)
    }
  }

  for (const t of form.task) {
    task.push(expandTask({ task: t, trees }))
  }

  const wear = (form.wear ?? []).map(w => ({
    ...w,
    task: w.task.map(t => expandTask({ task: t, trees })),
  }))

  return { ...form, bond, task, wear }
}

function expandTask(input: {
  task: SurfTask
  trees: Map<string, SurfTree>
}): SurfTask {
  const { task, trees } = input

  const flow: Surf[] = []
  for (const stmt of task.flow) {
    if (stmt.form === 'fuse') {
      flow.push(...expandFuseNode({ fuse: stmt, trees }))
    } else {
      flow.push(stmt)
    }
  }

  const nestedTasks = task.task.map(t => expandTask({ task: t, trees }))

  return { ...task, flow, task: nestedTasks }
}

// -- Substitution --

function substSurf(input: {
  node: Surf
  subst: SubstMap
  trees: Map<string, SurfTree>
}): Surf {
  const { node, subst, trees } = input

  switch (node.form) {
    case 'task':
      return substTask({ task: node, subst, trees })
    case 'form':
      return substForm({ form: node, subst, trees })
    case 'wear':
      return {
        ...node,
        name: substString(node.name, subst),
        task: node.task.map(t => substTask({ task: t, subst, trees })),
      } as Surf
    case 'fuse': {
      // Nested fuse: expand with combined substitutions
      const innerBinds: SurfBind[] = node.bind.map(b => ({
        ...b,
        sift: b.sift
          ? (substSurf({ node: b.sift, subst, trees }) as any)
          : undefined,
      }))
      const expanded = expandFuseNode({
        fuse: { ...node, bind: innerBinds },
        trees,
      })
      return expanded[0] ?? node
    }
    default:
      return node
  }
}

function substTask(input: {
  task: SurfTask
  subst: SubstMap
  trees: Map<string, SurfTree>
}): SurfTask {
  const { task, subst, trees } = input
  const name = substString(task.name, subst)
  const base = task.base.map(b => ({
    ...b,
    name: substString(b.name, subst),
    like: b.like ? substSurfType(b.like, subst) : undefined,
  }))
  const flow = task.flow.flatMap(s => {
    if (s.form === 'fuse') {
      return expandFuseNode({ fuse: s, trees })
    }
    return [s]
  })
  const nestedTasks = task.task.map(t =>
    substTask({ task: t, subst, trees }),
  )
  return { ...task, name, base, flow, task: nestedTasks }
}

function substForm(input: {
  form: SurfForm
  subst: SubstMap
  trees: Map<string, SurfTree>
}): SurfForm {
  const { form, subst, trees } = input
  const name = substString(form.name, subst)
  const link = form.link.map(l => ({
    ...l,
    name: substString(l.name, subst),
    like: l.like ? substSurfType(l.like, subst) : undefined,
  }))
  const cases = form.case.map(c => ({
    ...c,
    name: substString(c.name, subst),
  }))
  const task = form.task.map(t => substTask({ task: t, subst, trees }))
  const bond: Surf[] = form.bond.flatMap(b => {
    if (b.form === 'fuse') {
      return expandFuseNode({ fuse: b, trees })
    }
    return [b]
  })
  const wear = (form.wear ?? []).map(w => ({
    ...w,
    name: substString(w.name, subst),
    task: w.task.map(t => substTask({ task: t, subst, trees })),
  }))
  return { ...form, name, link, case: cases, task, bond, wear }
}

/** Substitute {param} placeholders in a string. */
function substString(str: string, subst: SubstMap): string {
  return str.replace(/\{(\w+)\}/g, (_, key) => subst.get(key) ?? _)
}

/** Substitute {param} placeholders in a SurfType. */
function substSurfType(typ: SurfType, subst: SubstMap): SurfType {
  if (typ.form === 'type-or') {
    return {
      form: 'type-or',
      list: typ.list.map(t => substSurfType(t, subst)),
    }
  }
  return { form: 'type-name', name: substString(typ.name, subst) }
}

/** Extract a string value from a bind node. */
function bindToString(bind: SurfBind): string {
  if (!bind.sift) return ''
  const sift = bind.sift
  if (sift.form === 'sift-mark') return String(sift.val)
  if (sift.form === 'sift-text') return sift.val
  if (sift.form === 'sift-loan') return sift.path.join('/')
  return ''
}
