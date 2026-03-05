/**
 * Runtime class tests.
 *
 * Uses mock compiled output to test the Runtime in isolation.
 */
import { describe, it, expect } from 'vitest';
import { Runtime } from '@/runtime';
// ---- Mock compiled output ----
function mockOutput() {
    return {
        code: '// compiled\n@hello = λx x\n@Nat = λz λs z',
        files: ['/main.tree', '/dep/nat.tree'],
        book: new Map([
            ['hello', { form: 'ref', name: 'hello' }],
            ['Nat', { form: 'ref', name: 'Nat' }],
        ]),
    };
}
function mockSwapOutput(names) {
    return {
        code: names.map(n => `@${n} = λx x`).join('\n'),
        files: ['/main.tree'],
        book: new Map(names.map(n => [n, { form: 'ref', name: n }])),
    };
}
// ---- Tests ----
describe('Runtime', () => {
    it('loads compiled output into the book', () => {
        const rt = new Runtime();
        rt.load({ output: mockOutput() });
        const book = rt.book();
        expect(book.size).toBe(2);
        expect(book.has('hello')).toBe(true);
        expect(book.has('Nat')).toBe(true);
    });
    it('creates a card for the entry file', () => {
        const rt = new Runtime();
        rt.load({ output: mockOutput() });
        const card = rt.card({ file: '/main.tree' });
        expect(card).not.toBeNull();
        expect(card.file).toBe('/main.tree');
        expect(card.code).toContain('hello');
    });
    it('tracks dependency files', () => {
        const rt = new Runtime();
        rt.load({ output: mockOutput() });
        expect(rt.has({ file: '/dep/nat.tree' })).toBe(true);
    });
    it('lists all loaded files', () => {
        const rt = new Runtime();
        rt.load({ output: mockOutput() });
        expect(rt.files().length).toBe(2);
    });
    it('swaps a file with new definitions', () => {
        const rt = new Runtime();
        rt.load({ output: mockOutput() });
        const result = rt.swap({
            file: '/main.tree',
            output: mockSwapOutput(['greet', 'farewell']),
        });
        expect(result.changed).toContain('greet');
        expect(result.changed).toContain('farewell');
        const book = rt.book();
        expect(book.has('greet')).toBe(true);
        expect(book.has('farewell')).toBe(true);
    });
    it('removes old definitions on swap', () => {
        const rt = new Runtime();
        rt.load({ output: mockOutput() });
        rt.swap({
            file: '/main.tree',
            output: mockSwapOutput(['alpha', 'beta']),
        });
        expect(rt.book().has('alpha')).toBe(true);
        expect(rt.book().has('beta')).toBe(true);
        rt.swap({
            file: '/main.tree',
            output: mockSwapOutput(['gamma']),
        });
        expect(rt.book().has('gamma')).toBe(true);
        expect(rt.book().has('alpha')).toBe(false);
        expect(rt.book().has('beta')).toBe(false);
    });
    it('clears state on close', () => {
        const rt = new Runtime();
        rt.load({ output: mockOutput() });
        rt.close();
        expect(rt.book().size).toBe(0);
    });
    it('handles empty load', () => {
        const rt = new Runtime();
        rt.load({
            output: {
                code: '',
                files: [],
                book: new Map(),
            },
        });
        expect(rt.book().size).toBe(0);
    });
});
//# sourceMappingURL=runtime.test.js.map