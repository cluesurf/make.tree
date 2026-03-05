/**
 * Rust backend end-to-end test: single-arm pattern matches.
 *
 * Tests edge cases where fork case has fewer arms than the ADT has
 * constructors:
 * - Single-constructor form (struct): one arm should work
 * - Two-constructor form with one arm: needs wildcard or exhaustive fix
 * - Four-constructor form with one arm: needs wildcard
 *
 * These tests verify the Rust backend emits compilable match statements
 * even when not all constructors are covered.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync, } from 'fs';
import { resolve, dirname } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook } from '@/cast/rust';
const TEST_DIR = dirname(new URL(import.meta.url).pathname);
const MAKE_ROOT = resolve(TEST_DIR, '..', '..');
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-fork-case-single');
const require_ = createRequire(import.meta.url);
const treeParsePath = resolve(TEST_DIR, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileTreeToRust(name) {
    const file = resolve(TEST_DIR, name);
    const text = readFileSync(file, 'utf8');
    const lead = makeTree({ file: name, text });
    const rawCard = readCard({ tree: lead.tree, file: name });
    const card = expandFuse({ card: rawCard });
    const { book } = desugarCard({ card });
    return castBook({ book });
}
function mainHarness() {
    return `

fn main() {
    // Single-constructor enum unwrap
    let w = Wrapper::Make { value: 42 };
    println!("unwrap={}", unwrap(w));

    // Two-constructor: force unwrap of Some (native Option)
    let s = Some(99_u64);
    println!("force={}", force_unwrap(s));

    // Four-constructor: is_north
    println!("north={}", is_north(Direction::North));
}
`;
}
function run(input) {
    var _a, _b, _c, _d;
    try {
        const stdout = execFileSync(input.cmd, input.args, {
            cwd: (_a = input.cwd) !== null && _a !== void 0 ? _a : TMP,
            encoding: 'utf-8',
            timeout: 120000,
        });
        return { code: 0, stdout, stderr: '' };
    }
    catch (e) {
        const err = e;
        return {
            code: (_b = err.status) !== null && _b !== void 0 ? _b : 1,
            stdout: (_c = err.stdout) !== null && _c !== void 0 ? _c : '',
            stderr: (_d = err.stderr) !== null && _d !== void 0 ? _d : '',
        };
    }
}
describe('rust: E2E single-arm pattern matches', () => {
    let generatedRust = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedRust = compileTreeToRust('fork-case-single.tree');
        const fullSource = generatedRust + mainHarness();
        writeFileSync(resolve(TMP, 'main.rs'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    // -- Structural: single-constructor enum (case make ≠ form name) --
    it('generates enum for single-constructor form with different case name', () => {
        expect(generatedRust).toContain('enum Wrapper');
    });
    it('generates unwrap function', () => {
        expect(generatedRust).toContain('fn unwrap(');
    });
    // -- Structural: non-exhaustive match should have wildcard --
    it('force_unwrap has wildcard or panic for missing arms', () => {
        expect(generatedRust).toContain('fn force_unwrap(');
        // Native optional: should have either a wildcard arm `_ =>` or both Some/None
        const hasWildcard = generatedRust.includes('_ =>');
        const hasBothArms = generatedRust.includes('Some(') &&
            generatedRust.includes('None');
        expect(hasWildcard || hasBothArms).toBe(true);
    });
    it('is_north has wildcard or all arms for direction', () => {
        expect(generatedRust).toContain('fn is_north(');
        const hasWildcard = generatedRust.includes('_ =>');
        const hasAllArms = generatedRust.includes('Direction::North') &&
            generatedRust.includes('Direction::South') &&
            generatedRust.includes('Direction::East') &&
            generatedRust.includes('Direction::West');
        expect(hasWildcard || hasAllArms).toBe(true);
    });
    // -- Compilation --
    it('compiles with rustc', () => {
        const result = run({
            cmd: 'rustc',
            args: [
                '-A',
                'warnings',
                resolve(TMP, 'main.rs'),
                '-o',
                resolve(TMP, 'test_single'),
            ],
        });
        if (result.code !== 0) {
            console.error('rustc stderr:', result.stderr);
            console.error('Generated source:\n', readFileSync(resolve(TMP, 'main.rs'), 'utf8'));
        }
        expect(result.code).toBe(0);
    }, 60000);
    // -- Runtime --
    it('unwrap extracts value from struct', () => {
        const result = run({ cmd: resolve(TMP, 'test_single'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('unwrap=42');
    });
    it('force_unwrap extracts value from Some', () => {
        const result = run({ cmd: resolve(TMP, 'test_single'), args: [] });
        expect(result.stdout).toContain('force=99');
    });
    it('is_north returns 1 for North', () => {
        const result = run({ cmd: resolve(TMP, 'test_single'), args: [] });
        expect(result.stdout).toContain('north=1');
    });
});
//# sourceMappingURL=backend-rust-fork-case-single.test.js.map