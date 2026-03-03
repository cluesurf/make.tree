import { describe, it, expect } from 'vitest'
import { showSurf } from '@/surf/show'
import { VOID_SITE } from '@/kink/site'
import type { Surf, SurfTask, SurfCall } from '@/surf/form'

const site = VOID_SITE

describe('surf/show', () => {
  it('shows a simple task', () => {
    const task: SurfTask = {
      form: 'task',
      name: 'greet',
      head: [],
      base: [
        { form: 'base', name: 'name', like: { form: 'type-name', name: 'text' }, site },
      ],
      flow: [
        { form: 'back', sift: { form: 'sift-text', val: 'hello', site }, site },
      ],
      task: [],
      site,
    }

    const output = showSurf(task)
    expect(output).toContain('task greet')
    expect(output).toContain('base name, like text')
    expect(output).toContain('back text <hello>')
  })

  it('shows a call with arguments', () => {
    const call: SurfCall = {
      form: 'call',
      name: 'add',
      bind: [
        { form: 'bind', name: 'a', sift: { form: 'sift-mark', val: 1, site }, site },
        { form: 'bind', name: 'b', sift: { form: 'sift-mark', val: 2, site }, site },
      ],
      hook: {},
      site,
    }

    const output = showSurf(call)
    expect(output).toContain('call add')
    expect(output).toContain('mark 1')
    expect(output).toContain('mark 2')
  })

  it('shows save with path', () => {
    const save: Surf = {
      form: 'save',
      path: ['x'],
      sift: { form: 'sift-mark', val: 42, site },
      site,
    }

    const output = showSurf(save)
    expect(output).toContain('save x')
    expect(output).toContain('mark 42')
  })

  it('shows value expressions', () => {
    expect(showSurf({ form: 'sift-text', val: 'hi', site })).toContain('text <hi>')
    expect(showSurf({ form: 'sift-mark', val: 99, site })).toContain('mark 99')
    expect(showSurf({ form: 'sift-comb', val: 3.14, site })).toContain('comb 3.14')
    expect(showSurf({ form: 'sift-wave', val: true, site })).toContain('wave true')
    expect(showSurf({ form: 'sift-read', path: ['x'], site })).toContain('read x')
  })
})
