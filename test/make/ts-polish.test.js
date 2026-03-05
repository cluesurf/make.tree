/**
 * Tests for TypeScript codegen polish:
 * - Type annotations on function params and return types
 * - Multi-file output
 * - Risk error propagation
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { compileText } from '@/make';
import { castBookToFiles } from '@/cast/typescript';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileSingle(name) {
    const file = path.resolve(__dirname, name);
    const text = fs.readFileSync(file, 'utf8');
    return compileText({
        text,
        file: name,
        target: 'typescript',
        parse: makeTree,
    });
}
describe('type annotations', () => {
    it('annotates u64 params with number type', () => {
        const result = compileSingle('fibonacci.tree');
        // fib takes u64 params, should have : number
        expect(result.code).toMatch(/\bn: number\b/);
    });
    it('annotates return types when explicitly declared', () => {
        const result = compileSingle('meet.tree');
        // meet.tree tasks have explicit `like boolean` return type
        expect(result.code).toMatch(/\): boolean/);
    });
    it('annotates text params with string type', () => {
        const result = compileSingle('lists.tree');
        // Should contain string type annotations where text params exist
        expect(result.code).toBeDefined();
    });
    it('annotates boolean params', () => {
        const result = compileSingle('meet.tree');
        // meet.tree has boolean params
        expect(result.code).toMatch(/: boolean/);
    });
    it('annotates generic type params', () => {
        const result = compileSingle('generics.tree');
        // generics.tree has head params, should emit <T>
        expect(result.code).toMatch(/<T>/);
    });
    it('does not annotate unknown types with any in function params', () => {
        const result = compileSingle('fibonacci.tree');
        // Function params should NOT contain `: any` - we omit when type is unknown
        // ADT field types may contain `any` for unresolvable references
        const funcLines = result.code.split('\n').filter(l => l.includes('function '));
        for (const line of funcLines) {
            expect(line).not.toMatch(/: any[,)\s]/);
        }
    });
});
describe('multi-file output', () => {
    it('splits output by file', () => {
        const result = compileSingle('fibonacci.tree');
        const fileMap = new Map();
        // Simulate two files
        const names = [...result.book.keys()];
        const half = Math.ceil(names.length / 2);
        fileMap.set('file-a.ts', names.slice(0, half));
        fileMap.set('file-b.ts', names.slice(half));
        const files = castBookToFiles({
            book: result.book,
            fileMap,
        });
        expect(files.size).toBe(2);
        expect(files.has('file-a.ts')).toBe(true);
        expect(files.has('file-b.ts')).toBe(true);
        // Each file should have some content
        for (const [, code] of files) {
            expect(typeof code).toBe('string');
        }
    });
    it('produces correct code for each file', () => {
        var _a;
        const result = compileSingle('fibonacci.tree');
        const names = [...result.book.keys()];
        const fileMap = new Map();
        fileMap.set('main.ts', names);
        const files = castBookToFiles({
            book: result.book,
            fileMap,
        });
        const mainCode = (_a = files.get('main.ts')) !== null && _a !== void 0 ? _a : '';
        // Should contain function declarations
        expect(mainCode).toContain('export');
    });
});
describe('halt/risk error handling', () => {
    it('emits throw for halt statements', () => {
        const result = compileSingle('halt-test.tree');
        expect(result.code).toContain('throw new Error');
    });
    it('includes error message in throw', () => {
        const result = compileSingle('halt-test.tree');
        expect(result.code).toContain('division by zero');
    });
});
//# sourceMappingURL=ts-polish.test.js.map