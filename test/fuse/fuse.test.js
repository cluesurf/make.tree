import { describe, it, expect } from 'vitest';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook } from '@/cast/typescript';
import { VOID_SITE } from '@/kink/site';
const site = VOID_SITE;
describe('fuse/index', () => {
    it('expands a simple tree template into a form', () => {
        const card = {
            file: 'test.tree',
            list: [
                // tree adder
                //   take size
                //   hook bind
                //     task add-{size}
                //       take a, like u64
                //       take b, like u64
                //       back call add-prim
                //         bind a, read a
                //         bind b, read b
                {
                    form: 'tree',
                    name: 'adder',
                    base: [{ form: 'base', name: 'size', site }],
                    hook: [{
                            form: 'tree-hook',
                            name: 'bind',
                            list: [{
                                    form: 'task',
                                    name: 'add-{size}',
                                    head: [],
                                    base: [
                                        { form: 'base', name: 'a', like: { form: 'type-name', name: 'u64' }, site },
                                        { form: 'base', name: 'b', like: { form: 'type-name', name: 'u64' }, site },
                                    ],
                                    flow: [{
                                            form: 'back',
                                            sift: {
                                                form: 'call',
                                                name: 'add-prim',
                                                bind: [
                                                    { form: 'bind', name: 'a', sift: { form: 'sift-read', path: ['a'], site }, site },
                                                    { form: 'bind', name: 'b', sift: { form: 'sift-read', path: ['b'], site }, site },
                                                ],
                                                hook: {},
                                                site,
                                            },
                                            site,
                                        }],
                                    task: [],
                                    site,
                                }],
                            site,
                        }],
                    site,
                },
                // form mark-8
                //   fuse adder
                //     bind size, mark 8
                {
                    form: 'form',
                    name: 'mark-8',
                    head: [],
                    link: [],
                    case: [],
                    bond: [{
                            form: 'fuse',
                            name: 'adder',
                            bind: [{
                                    form: 'bind',
                                    name: 'size',
                                    sift: { form: 'sift-mark', val: 8, site },
                                    site,
                                }],
                            site,
                        }],
                    task: [],
                    wear: [],
                    site,
                },
            ],
        };
        const expanded = expandFuse({ card });
        // Tree definition should be removed
        expect(expanded.list.filter(n => n.form === 'tree')).toHaveLength(0);
        // The form should now have a task named 'add-8'
        const form = expanded.list.find(n => n.form === 'form');
        expect(form).toBeDefined();
        if ((form === null || form === void 0 ? void 0 : form.form) === 'form') {
            expect(form.task).toHaveLength(1);
            expect(form.task[0].name).toBe('add-8');
        }
    });
    it('produces correct TS output after expansion', () => {
        const card = {
            file: 'test.tree',
            list: [
                {
                    form: 'tree',
                    name: 'doubler',
                    base: [{ form: 'base', name: 'name', site }],
                    hook: [{
                            form: 'tree-hook',
                            name: 'bind',
                            list: [{
                                    form: 'task',
                                    name: 'double-{name}',
                                    head: [],
                                    base: [{ form: 'base', name: 'n', like: { form: 'type-name', name: 'u64' }, site }],
                                    flow: [{
                                            form: 'back',
                                            sift: {
                                                form: 'call',
                                                name: 'mul',
                                                bind: [
                                                    { form: 'bind', name: 'a', sift: { form: 'sift-read', path: ['n'], site }, site },
                                                    { form: 'bind', name: 'b', sift: { form: 'sift-mark', val: 2, site }, site },
                                                ],
                                                hook: {},
                                                site,
                                            },
                                            site,
                                        }],
                                    task: [],
                                    site,
                                }],
                            site,
                        }],
                    site,
                },
                // Top-level fuse (not inside a form)
                {
                    form: 'fuse',
                    name: 'doubler',
                    bind: [{
                            form: 'bind',
                            name: 'name',
                            sift: { form: 'sift-text', val: 'int', site },
                            site,
                        }],
                    site,
                },
            ],
        };
        const expanded = expandFuse({ card });
        const { book } = desugarCard({ card: expanded });
        const ts = castBook({ book });
        expect(ts).toContain('export function doubleInt(n: number)');
        expect(ts).toContain('return (n * 2);');
    });
    it('handles tree with no fuse (nothing to expand)', () => {
        const card = {
            file: 'test.tree',
            list: [{
                    form: 'task',
                    name: 'id',
                    head: [],
                    base: [{ form: 'base', name: 'x', like: { form: 'type-name', name: 'u64' }, site }],
                    flow: [{ form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site }],
                    task: [],
                    site,
                }],
        };
        const expanded = expandFuse({ card });
        expect(expanded.list).toHaveLength(1);
        expect(expanded.list[0].form).toBe('task');
    });
    it('expands fuse inside a task body', () => {
        const card = {
            file: 'test.tree',
            list: [
                {
                    form: 'tree',
                    name: 'log-step',
                    base: [],
                    hook: [{
                            form: 'tree-hook',
                            name: 'bind',
                            list: [{
                                    form: 'show',
                                    sift: { form: 'sift-text', val: 'step done', site },
                                    site,
                                }],
                            site,
                        }],
                    site,
                },
                {
                    form: 'task',
                    name: 'work',
                    head: [],
                    base: [],
                    flow: [
                        { form: 'save', path: ['x'], sift: { form: 'sift-mark', val: 1, site }, site },
                        {
                            form: 'fuse',
                            name: 'log-step',
                            bind: [],
                            site,
                        },
                        { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
                    ],
                    task: [],
                    site,
                },
            ],
        };
        const expanded = expandFuse({ card });
        const task = expanded.list.find(n => n.form === 'task');
        if ((task === null || task === void 0 ? void 0 : task.form) === 'task') {
            // Fuse should be replaced with the show statement
            expect(task.flow).toHaveLength(3);
            expect(task.flow[1].form).toBe('show');
        }
    });
});
//# sourceMappingURL=fuse.test.js.map