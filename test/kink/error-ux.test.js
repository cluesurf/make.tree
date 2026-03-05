/**
 * Tests for Error UX improvements:
 * - Context lines in source snippets
 * - "Did you mean?" suggestions for name-miss errors
 * - showTypeDiff for type mismatch display
 * - findSimilar for fuzzy name matching
 */
import { describe, it, expect } from 'vitest';
import { showKink, findSimilar, showTypeDiff } from '@/kink/show';
import { renderInfo, renderInfoList } from '@/kink/render';
import { makeKink } from '@/kink/form';
import { makeSite, VOID_SITE } from '@/kink/site';
describe('context lines in source snippets', () => {
    const load = (link) => {
        if (link === 'code/math.tree') {
            return [
                'task add-nums',
                '  take a, like u64',
                '  take b, like u64',
                '  like u64',
                '  back call add, read a, text <hello>',
                '  save result, mark 10',
            ];
        }
        return undefined;
    };
    it('shows line before and after the error line', () => {
        const site = makeSite({
            link: 'code/math.tree',
            base: { line: 5, mark: 30 },
            head: { line: 5, mark: 42 },
        });
        const kink = makeKink({
            form: 'type-mismatch',
            rank: 'halt',
            site,
            text: 'expected u64 but got text',
            rest: { need: 'U64', have: '"hello"' },
        });
        const output = showKink({ kink, load });
        // Should contain the error line
        expect(output).toContain('back call add, read a, text <hello>');
        // Should contain context line before
        expect(output).toContain('like u64');
        // Should contain context line after
        expect(output).toContain('save result, mark 10');
        // Should contain underline
        expect(output).toContain('^^^^');
    });
    it('shows context for first line (no line before)', () => {
        const site = makeSite({
            link: 'code/math.tree',
            base: { line: 1, mark: 1 },
            head: { line: 1, mark: 13 },
        });
        const kink = makeKink({
            form: 'mill-bad-keyword',
            rank: 'halt',
            site,
            text: 'unknown keyword',
            rest: { name: 'task' },
        });
        const output = showKink({ kink, load });
        // Should contain the first line
        expect(output).toContain('task add-nums');
        // Should contain the line after
        expect(output).toContain('take a, like u64');
    });
    it('shows context for last line (no line after)', () => {
        const site = makeSite({
            link: 'code/math.tree',
            base: { line: 6, mark: 3 },
            head: { line: 6, mark: 20 },
        });
        const kink = makeKink({
            form: 'type-mismatch',
            rank: 'halt',
            site,
            text: 'expected u64 but got text',
            rest: { need: 'U64', have: '"hello"' },
        });
        const output = showKink({ kink, load });
        // Should contain the last line
        expect(output).toContain('save result, mark 10');
        // Should contain line before
        expect(output).toContain('back call add');
        // Should NOT have extra lines after
        const lines = output.split('\n');
        const lastContentLine = lines.filter(l => l.trim().length > 0).pop();
        // The hint line should be the last meaningful content
        expect(lastContentLine).toBeDefined();
    });
});
describe('findSimilar', () => {
    const names = ['add', 'sub', 'mul', 'div', 'fibonacci', 'greet', 'hello'];
    it('finds close matches', () => {
        const result = findSimilar({ name: 'ad', names });
        expect(result).toContain('add');
    });
    it('finds matches with typos', () => {
        const result = findSimilar({ name: 'fibonaci', names });
        expect(result).toContain('fibonacci');
    });
    it('returns empty for no close matches', () => {
        const result = findSimilar({ name: 'zzzzzzz', names });
        expect(result).toHaveLength(0);
    });
    it('returns at most 3 suggestions', () => {
        const manyNames = ['ab', 'ac', 'ad', 'ae', 'af'];
        const result = findSimilar({ name: 'aa', names: manyNames });
        expect(result.length).toBeLessThanOrEqual(3);
    });
    it('sorts by edit distance', () => {
        const result = findSimilar({ name: 'gret', names });
        // "greet" (dist 1) should come before others
        expect(result[0]).toBe('greet');
    });
});
describe('showTypeDiff', () => {
    it('shows need and have lines', () => {
        const lines = showTypeDiff({ need: 'U64', have: 'F64' });
        expect(lines[0]).toContain('need: U64');
        expect(lines[1]).toContain('have: F64');
    });
    it('shows underline at diff position', () => {
        const lines = showTypeDiff({ need: 'U64', have: 'F64' });
        // They differ at the first char (U vs F)
        expect(lines.length).toBe(3);
        expect(lines[2]).toContain('^');
    });
    it('handles same types', () => {
        const lines = showTypeDiff({ need: 'U64', have: 'U64' });
        expect(lines[0]).toContain('need: U64');
        expect(lines[1]).toContain('have: U64');
        // No underline needed since they match
        expect(lines.length).toBe(2);
    });
    it('handles complex types', () => {
        const lines = showTypeDiff({
            need: '∀(x: U64) U64',
            have: '∀(x: U64) F64',
        });
        expect(lines[0]).toContain('∀(x: U64) U64');
        expect(lines[1]).toContain('∀(x: U64) F64');
    });
});
describe('renderInfo with suggestions', () => {
    const emptyFill = new Map();
    const bookNames = ['add', 'sub', 'mul', 'fibonacci', 'greet'];
    it('adds "did you mean?" to vague errors', () => {
        const info = { form: 'vague', name: 'ad' };
        const kink = renderInfo({ info, fill: emptyFill, names: bookNames });
        expect(kink).not.toBeNull();
        expect(kink.text).toContain('did you mean');
        expect(kink.text).toContain('add');
    });
    it('includes hint field with suggestions', () => {
        const info = { form: 'vague', name: 'gret' };
        const kink = renderInfo({ info, fill: emptyFill, names: bookNames });
        expect(kink).not.toBeNull();
        const k = kink;
        expect(k['hint']).toBeDefined();
        expect(k['hint']).toContain('greet');
    });
    it('skips suggestions when no similar names', () => {
        const info = { form: 'vague', name: 'zzzzzzz' };
        const kink = renderInfo({ info, fill: emptyFill, names: bookNames });
        expect(kink).not.toBeNull();
        expect(kink.text).not.toContain('did you mean');
    });
    it('works without names parameter', () => {
        const info = { form: 'vague', name: 'missing' };
        const kink = renderInfo({ info, fill: emptyFill });
        expect(kink).not.toBeNull();
        expect(kink.text).toBe('unresolved reference: missing');
    });
});
describe('renderInfoList with names', () => {
    const emptyFill = new Map();
    it('passes names through to renderInfo', () => {
        const logs = [
            { form: 'vague', name: 'ad' },
        ];
        const result = renderInfoList({
            logs,
            fill: emptyFill,
            names: ['add', 'sub'],
        });
        expect(result.length).toBe(1);
        expect(result[0].text).toContain('did you mean');
    });
});
describe('showKink with hint field', () => {
    it('displays did-you-mean suggestions', () => {
        const kink = makeKink({
            form: 'name-miss',
            rank: 'halt',
            site: VOID_SITE,
            text: 'unresolved reference: ad. did you mean: add?',
            rest: { name: 'ad', hint: ['add'] },
        });
        const output = showKink({ kink });
        expect(output).toContain('did you mean: add?');
    });
});
//# sourceMappingURL=error-ux.test.js.map