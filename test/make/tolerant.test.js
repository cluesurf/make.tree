/**
 * Error-tolerant parsing and desugaring tests.
 *
 * Validates that the tolerant pipeline (readCardTolerant, desugarCardTolerant,
 * compileTextTolerant) returns partial results + errors instead of throwing.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readCard, readCardTolerant } from '@/read';
import { desugarCard, desugarCardTolerant } from '@/term/desugar';
import { expandFuse } from '@/fuse';
import { compileTextTolerant } from '@/make';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function parseFile(name) {
    const file = path.resolve(__dirname, name);
    const text = fs.readFileSync(file, 'utf8');
    const lead = makeTree({ file: name, text });
    return { lead, text, name };
}
describe('readCardTolerant', () => {
    it('returns same result as readCard for valid input', () => {
        const { lead, name } = parseFile('math.tree');
        const strict = readCard({ tree: lead.tree, file: name });
        const { card, errors } = readCardTolerant({ tree: lead.tree, file: name });
        expect(errors).toHaveLength(0);
        expect(card.list.length).toBe(strict.list.length);
        expect(card.file).toBe(strict.file);
    });
    it('returns partial card for files with multiple definitions', () => {
        const { lead, name } = parseFile('halt-variants.tree');
        const { card, errors } = readCardTolerant({ tree: lead.tree, file: name });
        expect(errors).toHaveLength(0);
        expect(card.list.length).toBeGreaterThan(0);
    });
});
describe('desugarCardTolerant', () => {
    it('returns same book as desugarCard for valid input', () => {
        const { lead, name } = parseFile('math.tree');
        const rawCard = readCard({ tree: lead.tree, file: name });
        const card = expandFuse({ card: rawCard });
        const strict = desugarCard({ card });
        const tolerant = desugarCardTolerant({ card });
        expect(tolerant.errors).toHaveLength(0);
        expect([...tolerant.book.keys()].sort()).toEqual([...strict.book.keys()].sort());
    });
    it('returns partial book for file with book namespace', () => {
        const { lead, name } = parseFile('book-test.tree');
        const rawCard = readCard({ tree: lead.tree, file: name });
        const card = expandFuse({ card: rawCard });
        const tolerant = desugarCardTolerant({ card });
        expect(tolerant.errors).toHaveLength(0);
        expect(tolerant.book.has('math/square')).toBe(true);
        expect(tolerant.book.has('math/cube')).toBe(true);
    });
});
describe('compileTextTolerant', () => {
    it('compiles valid file and returns code + no errors', () => {
        const file = path.resolve(__dirname, 'math.tree');
        const text = fs.readFileSync(file, 'utf8');
        const result = compileTextTolerant({
            text,
            file: 'math.tree',
            target: 'typescript',
            parse: makeTree,
        });
        expect(result.code.length).toBeGreaterThan(0);
        expect(result.book.size).toBeGreaterThan(0);
    });
    it('compiles file with type errors and returns both code and errors', () => {
        const file = path.resolve(__dirname, 'type-error-mismatch.tree');
        const text = fs.readFileSync(file, 'utf8');
        const result = compileTextTolerant({
            text,
            file: 'type-error-mismatch.tree',
            target: 'typescript',
            parse: makeTree,
        });
        // Should still produce code (best-effort)
        expect(result.code.length).toBeGreaterThan(0);
        expect(result.book.has('bad-add')).toBe(true);
    });
    it('returns empty result for null parse', () => {
        const result = compileTextTolerant({
            text: '',
            file: 'empty.tree',
            target: 'typescript',
            parse: () => null,
        });
        expect(result.code).toBe('');
        expect(result.errors).toHaveLength(0);
        expect(result.book.size).toBe(0);
    });
});
//# sourceMappingURL=tolerant.test.js.map