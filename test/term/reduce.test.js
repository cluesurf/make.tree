import { describe, it, expect } from 'vitest';
import { reduce, normal } from '@/term/reduce';
const book = new Map();
const fill = new Map();
function red(term) {
    return reduce({ book, fill, lv: 2, term });
}
describe('term/reduce', () => {
    it('reduces beta: (lam x. x) 42 → 42', () => {
        const term = {
            form: 'app',
            func: { form: 'lam', name: 'x', bod: (x) => x },
            argm: { form: 'num', val: 42 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(42);
    });
    it('reduces nested beta: (lam f. lam x. f x) (lam y. y) 7 → 7', () => {
        const id = { form: 'lam', name: 'y', bod: (y) => y };
        const term = {
            form: 'app',
            func: {
                form: 'app',
                func: {
                    form: 'lam', name: 'f',
                    bod: (f) => ({ form: 'lam', name: 'x', bod: (x) => ({ form: 'app', func: f, argm: x }) }),
                },
                argm: id,
            },
            argm: { form: 'num', val: 7 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(7);
    });
    it('reduces let: let x = 5 in x → 5', () => {
        const term = {
            form: 'let',
            name: 'x',
            val: { form: 'num', val: 5 },
            bod: (x) => x,
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(5);
    });
    it('reduces use: use x = 5 in x → 5', () => {
        const term = {
            form: 'use',
            name: 'x',
            val: { form: 'num', val: 5 },
            bod: (x) => x,
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(5);
    });
    it('reduces op2 on nums', () => {
        const term = {
            form: 'op2',
            oper: 'add',
            a: { form: 'num', val: 3 },
            b: { form: 'num', val: 4 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(7);
    });
    it('reduces op2 mul', () => {
        const term = {
            form: 'op2',
            oper: 'mul',
            a: { form: 'num', val: 6 },
            b: { form: 'num', val: 7 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(42);
    });
    it('reduces op2 eq', () => {
        const eq = {
            form: 'op2', oper: 'eq',
            a: { form: 'num', val: 5 },
            b: { form: 'num', val: 5 },
        };
        expect(red(eq).val).toBe(1);
        const ne = {
            form: 'op2', oper: 'eq',
            a: { form: 'num', val: 5 },
            b: { form: 'num', val: 6 },
        };
        expect(red(ne).val).toBe(0);
    });
    it('reduces ref lookup', () => {
        const myBook = new Map([
            ['five', { form: 'num', val: 5 }],
        ]);
        const term = { form: 'ref', name: 'five' };
        const result = reduce({ book: myBook, fill, lv: 2, term });
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(5);
    });
    it('does not unfold ref at lv=0', () => {
        const myBook = new Map([
            ['five', { form: 'num', val: 5 }],
        ]);
        const term = { form: 'ref', name: 'five' };
        const result = reduce({ book: myBook, fill, lv: 0, term });
        expect(result.form).toBe('ref');
    });
    it('reduces metavar substitution', () => {
        const myFill = new Map([
            [0, { form: 'num', val: 99 }],
        ]);
        const term = { form: 'met', uid: 0, ctx: [] };
        const result = reduce({ book, fill: myFill, lv: 2, term });
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(99);
    });
    it('reduces ann to inner value', () => {
        const term = {
            form: 'ann',
            done: false,
            val: { form: 'num', val: 10 },
            typ: { form: 'u64' },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(10);
    });
    it('reduces ins to inner value', () => {
        const term = {
            form: 'ins',
            val: { form: 'num', val: 10 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(10);
    });
    it('reduces mat on con', () => {
        const term = {
            form: 'app',
            func: {
                form: 'mat',
                arms: [
                    ['Zero', { form: 'num', val: 0 }],
                    ['Succ', { form: 'lam', name: 'p', bod: (p) => p }],
                ],
            },
            argm: {
                form: 'con', name: 'Succ',
                args: [[null, { form: 'num', val: 41 }]],
            },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(41);
    });
    it('reduces swi on zero', () => {
        const term = {
            form: 'app',
            func: {
                form: 'swi',
                zero: { form: 'num', val: 100 },
                succ: { form: 'lam', name: 'p', bod: (p) => p },
            },
            argm: { form: 'num', val: 0 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(100);
    });
    it('reduces swi on succ', () => {
        const term = {
            form: 'app',
            func: {
                form: 'swi',
                zero: { form: 'num', val: 100 },
                succ: { form: 'lam', name: 'p', bod: (p) => p },
            },
            argm: { form: 'num', val: 5 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
        if (result.form === 'num')
            expect(result.val).toBe(4);
    });
    it('reduces nat sugar to Succ/Zero', () => {
        const term = { form: 'nat', val: 3 };
        const result = red(term);
        // Should be Succ(Succ(Succ(Zero)))
        expect(result.form).toBe('con');
        if (result.form === 'con') {
            expect(result.name).toBe('Succ');
        }
    });
    it('reduces txt to Cons/Nil', () => {
        const term = { form: 'txt', val: '' };
        const result = red(term);
        expect(result.form).toBe('con');
        if (result.form === 'con')
            expect(result.name).toBe('Nil');
    });
    it('reduces lst to Cons/Nil', () => {
        const term = { form: 'lst', list: [] };
        const result = red(term);
        expect(result.form).toBe('con');
        if (result.form === 'con')
            expect(result.name).toBe('Nil');
    });
    it('reduces src wrapper', () => {
        const term = {
            form: 'src',
            site: { form: 'brew-site' },
            val: { form: 'num', val: 7 },
        };
        const result = red(term);
        expect(result.form).toBe('num');
    });
    it('normal fully normalizes under binders', () => {
        const term = {
            form: 'lam', name: 'x',
            bod: (_x) => ({
                form: 'op2', oper: 'add',
                a: { form: 'num', val: 1 },
                b: { form: 'num', val: 2 },
            }),
        };
        const result = normal({ book, fill, lv: 2, dep: 0, term });
        expect(result.form).toBe('lam');
        if (result.form === 'lam') {
            const body = result.bod({ form: 'var', name: 'x', idx: 0 });
            expect(body.form).toBe('num');
            if (body.form === 'num')
                expect(body.val).toBe(3);
        }
    });
});
//# sourceMappingURL=reduce.test.js.map