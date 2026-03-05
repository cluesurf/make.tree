import { describe, it, expect } from 'vitest';
import { castBook, castTerm, } from '@/cast/typescript';
import { desugarCard } from '@/term/desugar';
import { VOID_SITE } from '@/kink/site';
const site = VOID_SITE;
function cast(term) {
    return castTerm({ term, dep: 0 });
}
describe('cast/typescript', () => {
    describe('castTerm primitives', () => {
        it('casts Num', () => {
            expect(cast({ form: 'num', val: 42 })).toBe('42');
        });
        it('casts Var', () => {
            expect(cast({ form: 'var', name: 'x', idx: 0 })).toBe('x');
        });
        it('casts Ref', () => {
            expect(cast({ form: 'ref', name: 'add' })).toBe('add');
        });
        it('casts Ref with slashes', () => {
            expect(cast({ form: 'ref', name: 'std/math' })).toBe('stdMath');
        });
        it('casts Txt as JSON string', () => {
            expect(cast({ form: 'txt', val: 'hello' })).toBe('"hello"');
        });
        it('casts Txt with special chars', () => {
            expect(cast({ form: 'txt', val: 'say "hi"' })).toBe('"say \\"hi\\""');
        });
        it('casts Nat as number', () => {
            expect(cast({ form: 'nat', val: 7 })).toBe('7');
        });
        it('erases Set', () => {
            expect(cast({ form: 'set' })).toBe('undefined');
        });
        it('erases U64 type', () => {
            expect(cast({ form: 'u64' })).toBe('undefined');
        });
        it('erases F64 type', () => {
            expect(cast({ form: 'f64' })).toBe('undefined');
        });
        it('erases Ann', () => {
            expect(cast({
                form: 'ann', done: false,
                val: { form: 'num', val: 42 },
                typ: { form: 'u64' },
            })).toBe('42');
        });
        it('erases Ins', () => {
            expect(cast({
                form: 'ins',
                val: { form: 'num', val: 7 },
            })).toBe('7');
        });
        it('erases Src', () => {
            expect(cast({
                form: 'src',
                site: { form: 'brew-site' },
                val: { form: 'num', val: 7 },
            })).toBe('7');
        });
    });
    describe('castTerm lambda and application', () => {
        it('casts identity lambda', () => {
            const term = { form: 'lam', name: 'x', bod: (x) => x };
            expect(cast(term)).toBe('(x) => x');
        });
        it('casts nested lambda as multi-param', () => {
            const term = {
                form: 'lam', name: 'x',
                bod: (_x) => ({ form: 'lam', name: 'y', bod: (y) => y }),
            };
            expect(cast(term)).toBe('(x, y) => y');
        });
        it('casts simple application', () => {
            const term = {
                form: 'app',
                func: { form: 'ref', name: 'f' },
                argm: { form: 'num', val: 1 },
            };
            expect(cast(term)).toBe('f(1)');
        });
        it('casts nested application as multi-arg call', () => {
            const term = {
                form: 'app',
                func: {
                    form: 'app',
                    func: { form: 'ref', name: 'add' },
                    argm: { form: 'num', val: 1 },
                },
                argm: { form: 'num', val: 2 },
            };
            expect(cast(term)).toBe('add(1, 2)');
        });
    });
    describe('castTerm let and op2', () => {
        it('casts let binding as IIFE in expression mode', () => {
            const term = {
                form: 'let', name: 'x',
                val: { form: 'num', val: 10 },
                bod: (x) => x,
            };
            expect(cast(term)).toBe('(() => { const x = 10; return x; })()');
        });
        it('casts op2 add', () => {
            const term = {
                form: 'op2', oper: 'add',
                a: { form: 'var', name: 'a', idx: 0 },
                b: { form: 'var', name: 'b', idx: 1 },
            };
            expect(cast(term)).toBe('(a + b)');
        });
        it('casts op2 eq with strict equality', () => {
            const term = {
                form: 'op2', oper: 'eq',
                a: { form: 'num', val: 1 },
                b: { form: 'num', val: 2 },
            };
            expect(cast(term)).toBe('(1 === 2)');
        });
        it('casts op2 ne with strict inequality', () => {
            const term = {
                form: 'op2', oper: 'ne',
                a: { form: 'num', val: 1 },
                b: { form: 'num', val: 2 },
            };
            expect(cast(term)).toBe('(1 !== 2)');
        });
    });
    describe('castTerm constructors and match (no ctx)', () => {
        it('casts Con with no args as string-tagged object', () => {
            expect(cast({ form: 'con', name: 'True', args: [] }))
                .toBe('({ tag: "True" })');
        });
        it('casts Con with named fields', () => {
            const term = {
                form: 'con', name: 'Succ',
                args: [['pred', { form: 'num', val: 5 }]],
            };
            expect(cast(term)).toBe('({ tag: "Succ", pred: 5 })');
        });
        it('casts Con with positional args', () => {
            const term = {
                form: 'con', name: 'Pair',
                args: [
                    [null, { form: 'num', val: 1 }],
                    [null, { form: 'num', val: 2 }],
                ],
            };
            expect(cast(term)).toBe('({ tag: "Pair", _0: 1, _1: 2 })');
        });
        it('casts standalone Mat as switch function', () => {
            const term = {
                form: 'mat',
                arms: [
                    ['Zero', { form: 'num', val: 0 }],
                    ['Succ', { form: 'lam', name: 'p', bod: (p) => p }],
                ],
            };
            const result = cast(term);
            expect(result).toContain('switch (val.tag)');
            expect(result).toContain('case "Zero": return 0;');
            expect(result).toContain('case "Succ": return (p) => p;');
        });
        it('casts Swi as ternary function', () => {
            const term = {
                form: 'swi',
                zero: { form: 'num', val: 100 },
                succ: { form: 'lam', name: 'p', bod: (p) => p },
            };
            const result = cast(term);
            expect(result).toContain('num === 0');
            expect(result).toContain('100');
            expect(result).toContain('num - 1');
        });
    });
    describe('castTerm sugar', () => {
        it('casts empty Lst as empty array', () => {
            expect(cast({ form: 'lst', list: [] })).toBe('[]');
        });
        it('casts Lst as array literal', () => {
            const term = {
                form: 'lst',
                list: [
                    { form: 'num', val: 1 },
                    { form: 'num', val: 2 },
                    { form: 'num', val: 3 },
                ],
            };
            expect(cast(term)).toBe('[1, 2, 3]');
        });
    });
    describe('castTerm misc', () => {
        it('casts Log as comma expression', () => {
            const term = {
                form: 'log',
                msg: { form: 'txt', val: 'debug' },
                val: { form: 'num', val: 0 },
            };
            const result = cast(term);
            expect(result).toBe('(console.log("debug"), 0)');
        });
        it('casts Hol as throw', () => {
            const result = cast({ form: 'hol', name: 'goal', ctx: [] });
            expect(result).toContain('throw new Error');
            expect(result).toContain('hole: goal');
        });
        it('casts ADT as undefined', () => {
            expect(cast({
                form: 'adt',
                indx: [],
                ctrs: [],
                type: { form: 'set' },
            })).toBe('undefined');
        });
    });
    describe('castBook', () => {
        it('generates TS function for lam definition', () => {
            const book = new Map([
                ['id', {
                        form: 'ann', done: false,
                        val: { form: 'lam', name: 'x', bod: (x) => x },
                        typ: {
                            form: 'all', name: 'x',
                            inp: { form: 'u64' },
                            bod: () => ({ form: 'u64' }),
                        },
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('export function id(x: number)');
            expect(result).toContain('return x;');
        });
        it('generates TS const for non-lam definition', () => {
            const book = new Map([
                ['five', {
                        form: 'ann', done: false,
                        val: { form: 'num', val: 5 },
                        typ: { form: 'u64' },
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('export const five = 5;');
        });
        it('erases type-only definitions', () => {
            const book = new Map([
                ['Nat', {
                        form: 'adt', indx: [], ctrs: [],
                        type: { form: 'set' },
                    }],
                ['zero', { form: 'con', name: 'Zero', args: [] }],
            ]);
            const result = castBook({ book });
            expect(result).not.toContain('export const Nat');
            expect(result).toContain('export const zero');
        });
        it('sanitizes names with special chars', () => {
            const book = new Map([
                ['std/math/pi', { form: 'num', val: 314 }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('export const stdMathPi = 314;');
        });
        it('uses numeric tags when ADTs are defined', () => {
            const book = new Map([
                ['Bool', {
                        form: 'adt', indx: [],
                        ctrs: [
                            { name: 'true', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
                            { name: 'false', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
                        ],
                        type: { form: 'set' },
                    }],
                ['yes', { form: 'con', name: 'true', args: [] }],
                ['no', { form: 'con', name: 'false', args: [] }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('{ $: 0 }');
            expect(result).toContain('{ $: 1 }');
            expect(result).not.toContain('tag:');
        });
        it('emits multi-param function for nested lam', () => {
            const book = new Map([
                ['add', {
                        form: 'ann', done: false,
                        val: {
                            form: 'lam', name: 'a',
                            bod: (_a) => ({
                                form: 'lam', name: 'b',
                                bod: (b) => b,
                            }),
                        },
                        typ: { form: 'set' },
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('export function add(a, b)');
            expect(result).toContain('return b;');
        });
        it('emits flat const for let in function body', () => {
            const book = new Map([
                ['ten', {
                        form: 'let', name: 'x',
                        val: { form: 'num', val: 10 },
                        bod: (x) => x,
                    }],
            ]);
            const result = castBook({ book });
            // Non-lam top-level, so emits as const with IIFE
            expect(result).toContain('export const ten');
        });
    });
    describe('castBook with match', () => {
        it('emits inline if/else for 2-arm match in function', () => {
            const book = new Map([
                ['Bool', {
                        form: 'adt', indx: [],
                        ctrs: [
                            { name: 'true', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
                            { name: 'false', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
                        ],
                        type: { form: 'set' },
                    }],
                ['not', {
                        form: 'ann', done: false,
                        val: {
                            form: 'lam', name: 'b',
                            bod: (b) => ({
                                form: 'app',
                                func: {
                                    form: 'mat',
                                    arms: [
                                        ['true', { form: 'con', name: 'false', args: [] }],
                                        ['false', { form: 'con', name: 'true', args: [] }],
                                    ],
                                },
                                argm: b,
                            }),
                        },
                        typ: { form: 'set' },
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('export function not(b)');
            expect(result).toContain('b.$ === 0');
            expect(result).toContain('if (');
            expect(result).toContain('} else {');
            expect(result).not.toContain('switch');
        });
        it('emits switch for 3+ arm match in function', () => {
            const book = new Map([
                ['Color', {
                        form: 'adt', indx: [],
                        ctrs: [
                            { name: 'red', tele: { form: 'ret', term: { form: 'ref', name: 'Color' } } },
                            { name: 'green', tele: { form: 'ret', term: { form: 'ref', name: 'Color' } } },
                            { name: 'blue', tele: { form: 'ret', term: { form: 'ref', name: 'Color' } } },
                        ],
                        type: { form: 'set' },
                    }],
                ['toNum', {
                        form: 'ann', done: false,
                        val: {
                            form: 'lam', name: 'c',
                            bod: (c) => ({
                                form: 'app',
                                func: {
                                    form: 'mat',
                                    arms: [
                                        ['red', { form: 'num', val: 0 }],
                                        ['green', { form: 'num', val: 1 }],
                                        ['blue', { form: 'num', val: 2 }],
                                    ],
                                },
                                argm: c,
                            }),
                        },
                        typ: { form: 'set' },
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('export function toNum(c)');
            expect(result).toContain('switch (c.$)');
            expect(result).toContain('case 0:');
            expect(result).toContain('case 1:');
            expect(result).toContain('case 2:');
        });
    });
    describe('tail-call optimization', () => {
        it('wraps tail-recursive function in while loop', () => {
            // countdown(n) = swi n { 0: 0, succ p: countdown(p) }
            const book = new Map([
                ['countdown', {
                        form: 'lam', name: 'n',
                        bod: (n) => ({
                            form: 'app',
                            func: {
                                form: 'swi',
                                zero: { form: 'num', val: 0 },
                                succ: {
                                    form: 'lam', name: 'p',
                                    bod: (p) => ({
                                        form: 'app',
                                        func: { form: 'ref', name: 'countdown' },
                                        argm: p,
                                    }),
                                },
                            },
                            argm: n,
                        }),
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('while (true)');
            expect(result).toContain('continue;');
            expect(result).not.toContain('return countdown(');
        });
        it('does not optimize non-tail-recursive function', () => {
            // double_call(n) = add(double_call(n), double_call(n))
            const book = new Map([
                ['double_call', {
                        form: 'lam', name: 'n',
                        bod: (n) => ({
                            form: 'app',
                            func: {
                                form: 'app',
                                func: { form: 'ref', name: 'add' },
                                argm: {
                                    form: 'app',
                                    func: { form: 'ref', name: 'double_call' },
                                    argm: n,
                                },
                            },
                            argm: {
                                form: 'app',
                                func: { form: 'ref', name: 'double_call' },
                                argm: n,
                            },
                        }),
                    }],
            ]);
            const result = castBook({ book });
            expect(result).not.toContain('while (true)');
            expect(result).not.toContain('continue;');
            expect(result).toContain('return add(');
        });
        it('optimizes tail call in match arm', () => {
            // loop(b) = match b { true: loop(false), false: 0 }
            const book = new Map([
                ['Bool', {
                        form: 'adt', indx: [],
                        ctrs: [
                            { name: 'true', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
                            { name: 'false', tele: { form: 'ret', term: { form: 'ref', name: 'Bool' } } },
                        ],
                        type: { form: 'set' },
                    }],
                ['loop', {
                        form: 'lam', name: 'b',
                        bod: (b) => ({
                            form: 'app',
                            func: {
                                form: 'mat',
                                arms: [
                                    ['true', {
                                            form: 'app',
                                            func: { form: 'ref', name: 'loop' },
                                            argm: { form: 'con', name: 'false', args: [] },
                                        }],
                                    ['false', { form: 'num', val: 0 }],
                                ],
                            },
                            argm: b,
                        }),
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('while (true)');
            expect(result).toContain('continue;');
        });
        it('optimizes tail call in let body', () => {
            // inc_loop(n) = let x = add(n, 1); inc_loop(x)
            const book = new Map([
                ['inc_loop', {
                        form: 'lam', name: 'n',
                        bod: (n) => ({
                            form: 'let', name: 'x',
                            val: {
                                form: 'app',
                                func: {
                                    form: 'app',
                                    func: { form: 'ref', name: 'add' },
                                    argm: n,
                                },
                                argm: { form: 'num', val: 1 },
                            },
                            bod: (x) => ({
                                form: 'app',
                                func: { form: 'ref', name: 'inc_loop' },
                                argm: x,
                            }),
                        }),
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('while (true)');
            expect(result).toContain('const x = add(n, 1);');
            expect(result).toContain('continue;');
            expect(result).not.toContain('return inc_loop(');
        });
        it('uses temporaries for swap pattern', () => {
            // swap(a, b) = swap(b, a)
            const book = new Map([
                ['swap', {
                        form: 'lam', name: 'a',
                        bod: (a) => ({
                            form: 'lam', name: 'b',
                            bod: (b) => ({
                                form: 'app',
                                func: {
                                    form: 'app',
                                    func: { form: 'ref', name: 'swap' },
                                    argm: b,
                                },
                                argm: a,
                            }),
                        }),
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('while (true)');
            expect(result).toContain('const next_a = b;');
            expect(result).toContain('const next_b = a;');
            expect(result).toContain('a = next_a;');
            expect(result).toContain('b = next_b;');
            expect(result).toContain('continue;');
        });
        it('optimizes tail call in match arm with field destructuring', () => {
            // loop(n) = match n { zero: 0, succ pred: loop(pred) }
            const book = new Map([
                ['Nat', {
                        form: 'adt', indx: [],
                        ctrs: [
                            { name: 'zero', tele: { form: 'ret', term: { form: 'ref', name: 'Nat' } } },
                            { name: 'succ', tele: {
                                    form: 'ext', name: 'pred', typ: { form: 'ref', name: 'Nat' },
                                    bod: () => ({ form: 'ret', term: { form: 'ref', name: 'Nat' } }),
                                } },
                        ],
                        type: { form: 'set' },
                    }],
                ['loop', {
                        form: 'lam', name: 'n',
                        bod: (n) => ({
                            form: 'app',
                            func: {
                                form: 'mat',
                                arms: [
                                    ['zero', { form: 'num', val: 0 }],
                                    ['succ', {
                                            form: 'lam', name: 'pred',
                                            bod: (pred) => ({
                                                form: 'app',
                                                func: { form: 'ref', name: 'loop' },
                                                argm: pred,
                                            }),
                                        }],
                                ],
                            },
                            argm: n,
                        }),
                    }],
            ]);
            const result = castBook({ book });
            expect(result).toContain('while (true)');
            expect(result).toContain('const pred = ');
            expect(result).toContain('continue;');
            expect(result).not.toContain('return loop(');
        });
    });
    describe('end-to-end: desugar then cast to TS', () => {
        it('generates TS for a desugared identity task', () => {
            const card = {
                file: 'test.tree',
                list: [{
                        form: 'task', name: 'id', head: [],
                        base: [{ form: 'base', name: 'x', like: { form: 'type-name', name: 'u64' }, site }],
                        flow: [
                            { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
                        ],
                        task: [], site,
                    }],
            };
            const { book } = desugarCard({ card });
            const ts = castBook({ book });
            expect(ts).toContain('export function id(x: number)');
            expect(ts).toContain('return x;');
        });
        it('generates TS for a task with call', () => {
            const card = {
                file: 'test.tree',
                list: [{
                        form: 'task', name: 'double', head: [],
                        base: [{ form: 'base', name: 'n', like: { form: 'type-name', name: 'u64' }, site }],
                        flow: [
                            { form: 'back', sift: {
                                    form: 'call', name: 'mul', bind: [
                                        { form: 'bind', name: 'a', sift: { form: 'sift-read', path: ['n'], site }, site },
                                        { form: 'bind', name: 'b', sift: { form: 'sift-mark', val: 2, site }, site },
                                    ], hook: {}, site,
                                }, site },
                        ],
                        task: [], site,
                    }],
            };
            const { book } = desugarCard({ card });
            const ts = castBook({ book });
            expect(ts).toContain('export function double(n: number)');
            expect(ts).toContain('return (n * 2);');
        });
        it('generates TS for a task with save', () => {
            const card = {
                file: 'test.tree',
                list: [{
                        form: 'task', name: 'ten', head: [],
                        base: [],
                        flow: [
                            { form: 'save', path: ['x'], sift: { form: 'sift-mark', val: 10, site }, site },
                            { form: 'back', sift: { form: 'sift-read', path: ['x'], site }, site },
                        ],
                        task: [], site,
                    }],
            };
            const { book } = desugarCard({ card });
            const ts = castBook({ book });
            // ten has no params, so it's a const, but the body is a Let
            // which in expression mode becomes IIFE
            expect(ts).toContain('export const ten');
            expect(ts).toContain('const x = 10');
        });
        it('generates TS for form + task with fork', () => {
            const card = {
                file: 'test.tree',
                list: [
                    {
                        form: 'form', name: 'bool', head: [], link: [], bond: [], task: [], wear: [],
                        case: [
                            { form: 'case-arm', name: 'true', link: [], site },
                            { form: 'case-arm', name: 'false', link: [], site },
                        ], site,
                    },
                    {
                        form: 'task', name: 'not', head: [],
                        base: [{ form: 'base', name: 'b', like: { form: 'type-name', name: 'bool' }, site }],
                        flow: [{
                                form: 'fork', mode: 'case',
                                sift: { form: 'sift-read', path: ['b'], site },
                                hook: [
                                    { form: 'hook', name: 'true', base: [], flow: [
                                            { form: 'back', sift: { form: 'make', name: 'false', bind: [], site }, site },
                                        ], site },
                                    { form: 'hook', name: 'false', base: [], flow: [
                                            { form: 'back', sift: { form: 'make', name: 'true', bind: [], site }, site },
                                        ], site },
                                ],
                                site,
                            }],
                        task: [], site,
                    },
                ],
            };
            const { book } = desugarCard({ card });
            const ts = castBook({ book });
            // bool ADT should be erased
            expect(ts).not.toContain('export const bool');
            expect(ts).not.toContain('export function bool');
            // not should be a function with inline match
            expect(ts).toContain('export function not(b: boolean)');
            // Should use numeric tags since ADT is defined
            expect(ts).toContain('$');
        });
    });
});
//# sourceMappingURL=typescript.test.js.map