/**
 * Kotlin backend compilation tests.
 *
 * Compiles core data type .tree files through the full pipeline
 * and verifies the Kotlin output has correct structure.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook } from '@/cast/kotlin';
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
    const { book } = desugarCard({ card });
    return castBook({ book });
}
describe('kotlin: Bool', () => {
    const kt = compileFile('stdlib-bool.tree');
    it('generates sealed class for Bool', () => {
        expect(kt).toContain('sealed class Bool');
    });
    it('generates boolNot function', () => {
        expect(kt).toContain('fun boolNot(');
    });
    it('generates boolAnd with two parameters', () => {
        expect(kt).toContain('fun boolAnd(');
    });
    it('generates boolOr with two parameters', () => {
        expect(kt).toContain('fun boolOr(');
    });
    it('generates boolXor', () => {
        expect(kt).toContain('fun boolXor(');
    });
    it('generates boolEq', () => {
        expect(kt).toContain('fun boolEq(');
    });
    it('uses when for pattern matching', () => {
        expect(kt).toContain('when (');
    });
    it('uses object for nullary constructors', () => {
        expect(kt).toContain('object True : Bool()');
        expect(kt).toContain('object False : Bool()');
    });
});
describe('kotlin: Maybe (native optional)', () => {
    const kt = compileFile('stdlib-maybe.tree');
    it('does not generate sealed class for Maybe (uses native null)', () => {
        expect(kt).not.toContain('sealed class Maybe');
    });
    it('generates maybeMap', () => {
        expect(kt).toContain('fun maybeMap(');
    });
    it('generates maybeUnwrap', () => {
        expect(kt).toContain('fun maybeUnwrap(');
    });
    it('generates maybeIsSome', () => {
        expect(kt).toContain('fun maybeIsSome(');
    });
    it('generates maybeIsNone', () => {
        expect(kt).toContain('fun maybeIsNone(');
    });
    it('uses null check for pattern matching', () => {
        expect(kt).toContain('!= null');
    });
});
describe('kotlin: Pair', () => {
    const kt = compileFile('stdlib-pair.tree');
    it('generates makePair', () => {
        expect(kt).toContain('fun makePair(');
    });
    it('generates pairFst', () => {
        expect(kt).toContain('fun pairFst(');
    });
    it('generates pairSnd', () => {
        expect(kt).toContain('fun pairSnd(');
    });
    it('generates pairSwap', () => {
        expect(kt).toContain('fun pairSwap(');
    });
    it('generates pairMapFst', () => {
        expect(kt).toContain('fun pairMapFst(');
    });
    it('generates pairMapSnd', () => {
        expect(kt).toContain('fun pairMapSnd(');
    });
});
describe('kotlin: Either', () => {
    const kt = compileFile('stdlib-either.tree');
    it('generates sealed class for Either', () => {
        expect(kt).toContain('sealed class Either');
    });
    it('generates eitherMapRight', () => {
        expect(kt).toContain('fun eitherMapRight(');
    });
    it('generates eitherMapLeft', () => {
        expect(kt).toContain('fun eitherMapLeft(');
    });
    it('generates eitherUnwrapRight', () => {
        expect(kt).toContain('fun eitherUnwrapRight(');
    });
    it('generates eitherUnwrapLeft', () => {
        expect(kt).toContain('fun eitherUnwrapLeft(');
    });
    it('generates eitherIsLeft', () => {
        expect(kt).toContain('fun eitherIsLeft(');
    });
    it('generates eitherIsRight', () => {
        expect(kt).toContain('fun eitherIsRight(');
    });
    it('has Left/Right data classes', () => {
        expect(kt).toContain('Left');
        expect(kt).toContain('Right');
    });
});
describe('kotlin: Order', () => {
    const kt = compileFile('stdlib-order.tree');
    it('generates sealed class for Order', () => {
        expect(kt).toContain('sealed class Order');
    });
    it('generates orderReverse', () => {
        expect(kt).toContain('fun orderReverse(');
    });
    it('generates orderIsLess', () => {
        expect(kt).toContain('fun orderIsLess(');
    });
    it('generates orderIsEqual', () => {
        expect(kt).toContain('fun orderIsEqual(');
    });
    it('generates orderIsMore', () => {
        expect(kt).toContain('fun orderIsMore(');
    });
    it('generates compareU64', () => {
        expect(kt).toContain('fun compareU64(');
    });
    it('has Less/Equal/More constructors', () => {
        expect(kt).toContain('Less');
        expect(kt).toContain('Equal');
        expect(kt).toContain('More');
    });
});
//# sourceMappingURL=backend-kotlin.test.js.map