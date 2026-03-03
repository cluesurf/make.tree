/**
 * Built-in standard library modules.
 *
 * Provides pre-defined SurfCard entries for @cluesurf/term imports.
 * When loadBook encounters a package path (starts with @), it
 * resolves to a built-in module instead of a file path.
 */

import type { SurfCard, SurfTask } from '@/surf/form'
import { VOID_SITE } from '@/kink/site'

const site = VOID_SITE

/** Registry of built-in module paths to their SurfCards. */
const modules = new Map<string, SurfCard>()

// -- @cluesurf/term/code/file --

modules.set('@cluesurf/term/code/file', {
  file: '@cluesurf/term/code/file',
  list: [
    {
      form: 'task',
      name: 'file/save',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
        { form: 'base', name: 'data', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
    {
      form: 'task',
      name: 'file/read',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

// -- @cluesurf/term/code/file/stream/read --

modules.set('@cluesurf/term/code/file/stream/read', {
  file: '@cluesurf/term/code/file/stream/read',
  list: [
    {
      form: 'task',
      name: 'file-stream-read/make',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

// -- @cluesurf/term/code/file/stream/write --

modules.set('@cluesurf/term/code/file/stream/write', {
  file: '@cluesurf/term/code/file/stream/write',
  list: [
    {
      form: 'task',
      name: 'file-stream-write/make',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

// -- @cluesurf/term/code/folder --

modules.set('@cluesurf/term/code/folder', {
  file: '@cluesurf/term/code/folder',
  list: [
    {
      form: 'task',
      name: 'folder/save',
      head: [],
      base: [
        { form: 'base', name: 'path', like: 'text', site },
      ],
      flow: [{ form: 'back', site }],
      task: [],
      site,
    } as SurfTask,
  ],
})

/** Look up a built-in module by package path. */
export function resolveStdlib(path: string): SurfCard | null {
  return modules.get(path) ?? null
}
