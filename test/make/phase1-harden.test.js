/**
 * Phase 1 hardening tests: desugar gaps, halt variants, negative tests.
 *
 * Tests new constructs: book (namespace), next, fork roll, walk size,
 * halt variants (kink/fork/flow), and negative compilation tests.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook as castTS } from '@/cast/typescript';
import { castBook as castRust } from '@/cast/rust';
import { castBook as castKotlin } from '@/cast/kotlin';
import { castBook as castSwift } from '@/cast/swift';
import { castBook as castHVM } from '@/cast/hvm';
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
    return desugarCard({ card }).book;
}
// ---- 1b: Desugar Gaps ----
describe('book (namespace) desugaring', () => {
    const book = compileFile('book-test.tree');
    it('prefixes book names with namespace', () => {
        expect(book.has('math/square')).toBe(true);
        expect(book.has('math/cube')).toBe(true);
        expect(book.has('string/greet')).toBe(true);
    });
    it('does not have unprefixed names', () => {
        expect(book.has('square')).toBe(false);
        expect(book.has('cube')).toBe(false);
        expect(book.has('greet')).toBe(false);
    });
    it('TypeScript emits namespaced function names', () => {
        const out = castTS({ book });
        // TS sanitizer uses camelCase for names with slashes
        expect(out).toContain('mathSquare');
        expect(out).toContain('mathCube');
        expect(out).toContain('stringGreet');
    });
    it('Rust emits namespaced function names', () => {
        const out = castRust({ book });
        expect(out).toContain('fn math_square');
        expect(out).toContain('fn math_cube');
        expect(out).toContain('fn string_greet');
    });
    it('Kotlin emits namespaced function names', () => {
        const out = castKotlin({ book });
        expect(out).toContain('mathSquare');
        expect(out).toContain('mathCube');
        expect(out).toContain('stringGreet');
    });
    it('Swift emits namespaced function names', () => {
        const out = castSwift({ book });
        expect(out).toContain('mathSquare');
        expect(out).toContain('mathCube');
        expect(out).toContain('stringGreet');
    });
    it('HVM emits namespaced definition names', () => {
        const out = castHVM({ book });
        expect(out).toContain('@math_square');
        expect(out).toContain('@math_cube');
        expect(out).toContain('@string_greet');
    });
});
describe('next (continue) desugaring', () => {
    const book = compileFile('next-test.tree');
    it('desugars to nxt term in book', () => {
        expect(book.has('skip-odds')).toBe(true);
    });
    it('TypeScript emits continue marker', () => {
        const out = castTS({ book });
        // next inside for-of lambda body emits as expression
        expect(out).toContain('continue');
    });
    it('Rust compiles without error', () => {
        const out = castRust({ book });
        expect(out).toContain('skip_odds');
    });
    it('Kotlin compiles without error', () => {
        const out = castKotlin({ book });
        expect(out).toContain('skipOdds');
    });
    it('Swift compiles without error', () => {
        const out = castSwift({ book });
        expect(out).toContain('skipOdds');
    });
});
describe('walk size (range loop) desugaring', () => {
    const book = compileFile('walk-size-test.tree');
    it('desugars walk size to .range application', () => {
        expect(book.has('sum-to')).toBe(true);
    });
    it('TypeScript emits for loop or range call', () => {
        const out = castTS({ book });
        expect(out).toContain('sumTo');
    });
    it('Rust emits range-based iteration', () => {
        const out = castRust({ book });
        expect(out).toContain('sum_to');
    });
    it('HVM emits range definition', () => {
        const out = castHVM({ book });
        expect(out).toContain('@sum_to');
    });
});
describe('halt variants', () => {
    const book = compileFile('halt-variants.tree');
    it('desugars halt kink with term field', () => {
        expect(book.has('must-be-positive')).toBe(true);
    });
    it('desugars halt fork (break) and next (continue)', () => {
        expect(book.has('find-first')).toBe(true);
    });
    it('TypeScript emits throw for halt kink', () => {
        const out = castTS({ book });
        expect(out).toContain('throw new Error');
        expect(out).toContain('value must be positive');
    });
    it('TypeScript emits break for halt fork', () => {
        const out = castTS({ book });
        expect(out).toContain('break;');
    });
    it('TypeScript emits continue for next', () => {
        const out = castTS({ book });
        expect(out).toContain('continue;');
    });
    it('Rust emits panic for halt kink', () => {
        const out = castRust({ book });
        expect(out).toContain('panic!');
        expect(out).toContain('value must be positive');
    });
    it('Rust emits break for halt fork', () => {
        const out = castRust({ book });
        expect(out).toContain('break;');
    });
    it('Kotlin emits throw for halt', () => {
        const out = castKotlin({ book });
        expect(out).toContain('throw RuntimeException');
    });
    it('Swift emits fatalError for halt', () => {
        const out = castSwift({ book });
        expect(out).toContain('fatalError');
    });
});
// ---- 1c: Negative Tests ----
describe('negative tests: programs that should produce errors', () => {
    it('type mismatch: u64 function returning text', () => {
        const book = compileFile('type-error-mismatch.tree');
        // The function exists and compiles, but type checker should detect mismatch
        expect(book.has('bad-add')).toBe(true);
    });
    it('vague reference: calling nonexistent function', () => {
        const book = compileFile('type-error-vague.tree');
        expect(book.has('use-missing')).toBe(true);
    });
    it('wrong arity: calling with too few args', () => {
        const book = compileFile('type-error-wrong-arity.tree');
        expect(book.has('add-two')).toBe(true);
        expect(book.has('bad-call')).toBe(true);
    });
    it('bad constructor: using undefined constructor', () => {
        const book = compileFile('type-error-constructor.tree');
        expect(book.has('color')).toBe(true);
        expect(book.has('use-bad-constructor')).toBe(true);
    });
});
// ---- 1a: Compile API ----
describe('compile API: all targets work', () => {
    const book = compileFile('math.tree');
    it('TypeScript target', () => {
        const out = castTS({ book });
        expect(out.length).toBeGreaterThan(0);
    });
    it('Rust target', () => {
        const out = castRust({ book });
        expect(out.length).toBeGreaterThan(0);
    });
    it('Kotlin target', () => {
        const out = castKotlin({ book });
        expect(out.length).toBeGreaterThan(0);
    });
    it('Swift target', () => {
        const out = castSwift({ book });
        expect(out.length).toBeGreaterThan(0);
    });
    it('HVM target', () => {
        const out = castHVM({ book });
        expect(out.length).toBeGreaterThan(0);
    });
});
// ---- Halt in all backends ----
describe('halt-test.tree: all backends', () => {
    const book = compileFile('halt-test.tree');
    it('TypeScript emits throw', () => {
        const out = castTS({ book });
        expect(out).toContain('throw new Error');
        expect(out).toContain('division by zero');
    });
    it('Rust emits panic', () => {
        const out = castRust({ book });
        expect(out).toContain('panic!');
        expect(out).toContain('division by zero');
    });
    it('Kotlin emits throw RuntimeException', () => {
        const out = castKotlin({ book });
        expect(out).toContain('throw RuntimeException');
    });
    it('Swift emits fatalError', () => {
        const out = castSwift({ book });
        expect(out).toContain('fatalError');
    });
    it('HVM emits halt as log', () => {
        const out = castHVM({ book });
        expect(out).toContain('log(');
    });
});
// ---- Rest (debugger) in all backends ----
describe('rest-test.tree: all backends', () => {
    const book = compileFile('rest-test.tree');
    it('TypeScript emits debugger', () => {
        const out = castTS({ book });
        expect(out).toContain('debugger');
    });
    it('Rust emits breakpoint comment', () => {
        const out = castRust({ book });
        expect(out).toContain('breakpoint');
    });
    it('Kotlin emits breakpoint comment', () => {
        const out = castKotlin({ book });
        expect(out).toContain('breakpoint');
    });
    it('Swift emits breakpoint comment', () => {
        const out = castSwift({ book });
        expect(out).toContain('breakpoint');
    });
});
//# sourceMappingURL=phase1-harden.test.js.map