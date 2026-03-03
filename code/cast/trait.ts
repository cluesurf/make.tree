/**
 * Trait metadata extraction from Surface AST.
 *
 * Extracts mask (trait), wear (impl), and suit (standalone impl)
 * information from a SurfCard. This metadata is used by backends
 * to emit proper trait/impl blocks instead of flat functions.
 */

import type { SurfCard, SurfForm, SurfMask, SurfSuit } from '@/surf/form'

export type MaskMethod = {
  name: string
  params: Array<{ name: string; typeName: string | null }>
  returnType: string | null
  hasSelf: boolean
}

export type MaskInfo = {
  name: string
  methods: MaskMethod[]
}

export type ImplInfo = {
  formName: string
  maskName: string | null
  methods: string[]
}

export type TraitMeta = {
  masks: MaskInfo[]
  impls: ImplInfo[]
}

export function collectTraits(input: { card: SurfCard }): TraitMeta {
  const masks: MaskInfo[] = []
  const impls: ImplInfo[] = []
  const maskNames = new Set<string>()

  // First pass: collect mask names and detect wear task name collisions
  const wearTaskCounts = new Map<string, number>()
  for (const node of input.card.list) {
    if (node.form === 'mask') {
      maskNames.add(node.name)
    }
    const wears: Array<{ task: Array<{ name: string }> }> = []
    if (node.form === 'form') {
      wears.push(...(node as SurfForm).wear)
    }
    if (node.form === 'suit') {
      wears.push(...(node as SurfSuit).wear)
    }
    for (const w of wears) {
      for (const t of w.task) {
        wearTaskCounts.set(t.name, (wearTaskCounts.get(t.name) ?? 0) + 1)
      }
    }
  }

  function methodKey(formName: string, taskName: string): string {
    return (wearTaskCounts.get(taskName) ?? 0) > 1
      ? `${formName}/${taskName}`
      : taskName
  }

  // Second pass: extract mask definitions and impl blocks
  for (const node of input.card.list) {
    if (node.form === 'mask') {
      const mask = node as SurfMask
      const methods: MaskMethod[] = []
      for (const task of mask.task) {
        const hasSelf =
          task.base.length > 0 && task.base[0]!.name === 'self'
        const params = task.base.map(b => ({
          name: b.name,
          typeName: b.like?.form === 'type-name' ? b.like.name : null,
        }))
        const returnType =
          task.like?.form === 'type-name' ? task.like.name : null
        methods.push({ name: task.name, params, returnType, hasSelf })
      }
      masks.push({ name: mask.name, methods })
    }

    if (node.form === 'form') {
      const form = node as SurfForm
      for (const wear of form.wear) {
        const maskName = maskNames.has(wear.name) ? wear.name : null
        const methods = wear.task.map(t => methodKey(form.name, t.name))
        impls.push({ formName: form.name, maskName, methods })
      }
      // Direct tasks on form → bare impl block
      if (form.task.length > 0) {
        const methods = form.task.map(t => t.name)
        impls.push({ formName: form.name, maskName: null, methods })
      }
    }

    if (node.form === 'suit') {
      const suit = node as SurfSuit
      for (const wear of suit.wear) {
        const maskName = maskNames.has(wear.name) ? wear.name : null
        const methods = wear.task.map(t => methodKey(suit.name, t.name))
        impls.push({ formName: suit.name, maskName, methods })
      }
    }
  }

  return { masks, impls }
}
