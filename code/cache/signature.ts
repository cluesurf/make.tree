/**
 * Definition signature extraction for incremental compilation.
 *
 * Extracts a stable "signature" from each SurfCard definition that
 * captures its type-level shape but not its implementation body.
 * When only the body changes, the signature stays the same and
 * dependents don't need rechecking.
 *
 * Signature includes:
 *   task  → name, params (names + types), return type, generics, async, risk
 *   form  → name, fields (names + types), cases, generics
 *   mask  → name, method signatures
 *   host  → name, value type
 *   load  → path, find list
 *
 * Signature excludes:
 *   task body (flow), form bond (impl), test body
 */

import { hashContent } from '@/cache/hash'
import type { Surf, SurfTask, SurfForm, SurfMask, SurfHost, SurfLoad, SurfType } from '@/surf/form'

/** Extract a stable signature hash from a surface definition. */
export function defSignature(input: { def: Surf }): string {
  const sig = extractSignature({ def: input.def })
  return hashContent({ content: JSON.stringify(sig) })
}

/** Extract all definition signatures from a card's list. */
export function cardSignatures(input: { list: Surf[] }): Map<string, string> {
  const sigs = new Map<string, string>()
  for (const def of input.list) {
    if ('name' in def && typeof def.name === 'string' && def.name) {
      sigs.set(def.name, defSignature({ def }))
    }
  }
  return sigs
}

function extractSignature(input: { def: Surf }): unknown {
  const { def } = input

  switch (def.form) {
    case 'task':
      return taskSignature({ task: def as SurfTask })
    case 'form':
      return formSignature({ form: def as SurfForm })
    case 'mask':
      return maskSignature({ mask: def as SurfMask })
    case 'host':
      return hostSignature({ host: def as SurfHost })
    case 'load':
      return loadSignature({ load: def as SurfLoad })
    default:
      return { form: def.form, name: (def as { name?: string }).name ?? '' }
  }
}

function taskSignature(input: { task: SurfTask }): unknown {
  return {
    form: 'task',
    name: input.task.name,
    head: input.task.head.map(h => ({
      name: h.name,
      need: h.need,
    })),
    base: input.task.base.map(b => ({
      name: b.name,
      like: b.like,
    })),
    like: input.task.like,
    wait: input.task.wait,
    risk: input.task.risk,
    hide: input.task.hide,
  }
}

function formSignature(input: { form: SurfForm }): unknown {
  return {
    form: 'form',
    name: input.form.name,
    head: input.form.head.map(h => ({
      name: h.name,
      need: h.need,
    })),
    link: input.form.link.map(l => ({
      name: l.name,
      like: l.like,
    })),
    case: input.form.case.map(c => ({
      name: c.name,
      link: c.link.map(l => ({ name: l.name, like: l.like })),
    })),
    like: input.form.like,
    hide: input.form.hide,
    fold: input.form.fold,
  }
}

function maskSignature(input: { mask: SurfMask }): unknown {
  return {
    form: 'mask',
    name: input.mask.name,
    task: input.mask.task.map(t => taskSignature({ task: t })),
  }
}

function hostSignature(input: { host: SurfHost }): unknown {
  return {
    form: 'host',
    name: input.host.name,
  }
}

function loadSignature(input: { load: SurfLoad }): unknown {
  return {
    form: 'load',
    path: input.load.path,
    find: input.load.find?.map(f => ({
      name: f.name,
      kind: f.kind,
      alias: f.alias,
    })),
  }
}
