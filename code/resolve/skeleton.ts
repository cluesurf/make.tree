/**
 * Skeleton extraction: lightweight pass over a SurfCard to collect
 * declared names, template definitions, and template instantiations
 * without running full expansion or desugar.
 */

import type {
  Surf,
  SurfCard,
  SurfTree,
  SurfFuse,
  SurfTask,
  SurfForm,
  SurfMask,
  SurfHost,
  SurfBind,
  SurfBook,
} from '@/surf/form'

export type NameForm = 'task' | 'form' | 'mask' | 'host'

export type NameSkele = {
  form: NameForm
  name: string
  file: string
}

export type TreeSkele = {
  name: string
  params: string[]
  outputNames: string[]
}

export type FuseBinding =
  | { form: 'static'; value: string }
  | { form: 'dynamic'; detail: string }

export type FuseSkele = {
  templateName: string
  bindings: Map<string, FuseBinding>
  file: string
  predictedNames?: string[]
}

export type LoadSkele = {
  path: string[]
  find: Array<{ name: string; alias?: string }>
}

export type FileSkele = {
  file: string
  staticNames: Map<string, NameSkele>
  trees: Map<string, TreeSkele>
  fuses: FuseSkele[]
  loads: LoadSkele[]
  card: SurfCard
}

export function extractSkele(input: { card: SurfCard }): FileSkele {
  const { card } = input
  const file = card.file
  const staticNames = new Map<string, NameSkele>()
  const trees = new Map<string, TreeSkele>()
  const fuses: FuseSkele[] = []
  const loads: LoadSkele[] = []

  for (const node of card.list) {
    extractNode({ node, file, staticNames, trees, fuses, loads })
  }

  return { file, staticNames, trees, fuses, loads, card }
}

function extractNode(input: {
  node: Surf
  file: string
  staticNames: Map<string, NameSkele>
  trees: Map<string, TreeSkele>
  fuses: FuseSkele[]
  loads: LoadSkele[]
  prefix?: string
}): void {
  const { node, file, staticNames, trees, fuses, loads, prefix } = input
  const qualify = (name: string) => prefix ? `${prefix}/${name}` : name

  switch (node.form) {
    case 'task': {
      const task = node as SurfTask
      staticNames.set(qualify(task.name), {
        form: 'task',
        name: qualify(task.name),
        file,
      })
      extractNestedFuses({ list: task.flow, file, fuses })
      for (const t of task.task) {
        extractNode({ node: t, file, staticNames, trees, fuses, loads, prefix })
      }
      break
    }
    case 'form': {
      const form = node as SurfForm
      staticNames.set(qualify(form.name), {
        form: 'form',
        name: qualify(form.name),
        file,
      })
      extractNestedFuses({ list: form.bond, file, fuses })
      for (const t of form.task) {
        extractNode({ node: t, file, staticNames, trees, fuses, loads, prefix })
      }
      break
    }
    case 'mask': {
      const mask = node as SurfMask
      staticNames.set(qualify(mask.name), {
        form: 'mask',
        name: qualify(mask.name),
        file,
      })
      break
    }
    case 'host': {
      const host = node as SurfHost
      staticNames.set(qualify(host.name), {
        form: 'host',
        name: qualify(host.name),
        file,
      })
      break
    }
    case 'tree': {
      const tree = node as SurfTree
      trees.set(tree.name, extractTreeSkele({ tree }))
      break
    }
    case 'fuse': {
      const fuse = node as SurfFuse
      fuses.push(extractFuseSkele({ fuse, file }))
      break
    }
    case 'load': {
      const load = node as { path: string[]; find?: Array<{ name: string; alias?: string }> }
      loads.push({
        path: load.path,
        find: (load.find ?? []).map(f => ({ name: f.name, alias: (f as any).alias })),
      })
      break
    }
    case 'bear': {
      const bear = node as { path: string[] }
      loads.push({ path: bear.path, find: [] })
      break
    }
    case 'book': {
      const book = node as SurfBook
      for (const child of book.list) {
        extractNode({
          node: child,
          file,
          staticNames,
          trees,
          fuses,
          loads,
          prefix: prefix ? `${prefix}/${book.name}` : book.name,
        })
      }
      break
    }
  }
}

function extractNestedFuses(input: {
  list: Surf[]
  file: string
  fuses: FuseSkele[]
}): void {
  for (const node of input.list) {
    if (node.form === 'fuse') {
      input.fuses.push(extractFuseSkele({ fuse: node as SurfFuse, file: input.file }))
    }
  }
}

function extractTreeSkele(input: { tree: SurfTree }): TreeSkele {
  const { tree } = input
  const params = tree.base.map(b => b.name)
  const outputNames: string[] = []

  for (const hook of tree.hook) {
    if (hook.name !== 'fuse') continue
    for (const item of hook.list) {
      if (item.form === 'task') {
        outputNames.push((item as SurfTask).name)
      } else if (item.form === 'form') {
        outputNames.push((item as SurfForm).name)
      } else if (item.form === 'mask') {
        outputNames.push((item as SurfMask).name)
      } else if (item.form === 'host') {
        outputNames.push((item as SurfHost).name)
      }
    }
  }

  return { name: tree.name, params, outputNames }
}

function extractFuseSkele(input: { fuse: SurfFuse; file: string }): FuseSkele {
  const { fuse, file } = input
  const bindings = new Map<string, FuseBinding>()

  for (const bind of fuse.bind) {
    const binding = classifyBinding({ bind })
    bindings.set(bind.name, binding)
  }

  return { templateName: fuse.name, bindings, file }
}

function classifyBinding(input: { bind: SurfBind }): FuseBinding {
  const { bind } = input
  if (!bind.sift) return { form: 'static', value: '' }

  const sift = bind.sift
  switch (sift.form) {
    case 'sift-text':
      return { form: 'static', value: (sift as any).val }
    case 'sift-mark':
      return { form: 'static', value: String((sift as any).val) }
    case 'sift-wave':
      return { form: 'static', value: String((sift as any).val) }
    case 'sift-read':
      return { form: 'dynamic', detail: `read ${(sift as any).path.join('/')}` }
    case 'call':
      return { form: 'dynamic', detail: `call ${(sift as any).name}` }
    default:
      return { form: 'dynamic', detail: `expression (${sift.form})` }
  }
}
