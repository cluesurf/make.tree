/**
 * Generic type parameters tests (head keyword).
 *
 * Verifies that `head` type parameters emit proper generic syntax
 * across all backends.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook as castTs } from '@/cast/typescript';
import { castBook as castRust } from '@/cast/rust';
import { castBook as castKotlin } from '@/cast/kotlin';
import { castBook as castSwift } from '@/cast/swift';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileFile(name) {
    const file = path.resolve(__dirname, name);
    const text = fs.readFileSync(file, 'utf8');
    const lead = makeTree({ file: name, text });
    const rawCard = readCard({ tree: lead.tree, file: name });
    const card = expandFuse({ card: rawCard });
    return desugarCard({ card });
}
const { book } = compileFile('generics.tree');
describe('typescript: generics', () => {
    const ts = castTs({ book });
    it('emits <T> for single head param', () => {
        expect(ts).toContain('function identity<T>');
    });
    it('emits <A, B> for multiple head params', () => {
        expect(ts).toContain('function apply<A, B>');
    });
    it('emits identity with value param', () => {
        expect(ts).toContain('identity<T>(x)');
    });
});
describe('rust: generics', () => {
    const rs = castRust({ book });
    it('emits <T> for single head param', () => {
        expect(rs).toContain('fn identity<T>');
    });
    it('emits <A, B> for multiple head params', () => {
        expect(rs).toContain('fn apply<A, B>');
    });
});
describe('kotlin: generics', () => {
    const kt = castKotlin({ book });
    it('emits <T> for single head param', () => {
        expect(kt).toContain('fun <T> identity');
    });
    it('emits <A, B> for multiple head params', () => {
        expect(kt).toContain('fun <A, B> apply');
    });
});
describe('swift: generics', () => {
    const sw = castSwift({ book });
    it('emits <T> for single head param', () => {
        expect(sw).toContain('func identity<T>');
    });
    it('emits <A, B> for multiple head params', () => {
        expect(sw).toContain('func apply<A, B>');
    });
});
//# sourceMappingURL=generics.test.js.map