/**
 * Rust backend end-to-end test: fork test (if/else conditionals).
 *
 * Compiles fork-test.tree to Rust. The .tree file uses `fork test`
 * with comparison operators (gt, eq, lt) to produce native if/else
 * statements in Rust.
 *
 * Tests: fork test → if/else, built-in binary ops → native operators,
 * nested conditionals, u64 return type inference.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-fork-test');
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
    // max tests
    println!("max(10,5)={}", max(10, 5));
    println!("max(3,7)={}", max(3, 7));
    println!("max(5,5)={}", max(5, 5));

    // is_zero tests
    println!("is_zero(0)={}", is_zero(0));
    println!("is_zero(5)={}", is_zero(5));

    // clamp tests
    println!("clamp(3,1,10)={}", clamp(3, 1, 10));
    println!("clamp(0,1,10)={}", clamp(0, 1, 10));
    println!("clamp(15,1,10)={}", clamp(15, 1, 10));
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
describe('rust: E2E fork test (if/else conditionals)', () => {
    let generatedRust = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedRust = compileTreeToRust('fork-test.tree');
        const fullSource = generatedRust + mainHarness();
        writeFileSync(resolve(TMP, 'main.rs'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('generates if/else instead of match', () => {
        expect(generatedRust).toContain('if ');
        expect(generatedRust).toContain('} else {');
        expect(generatedRust).not.toContain('match ');
    });
    it('generates native comparison operators', () => {
        expect(generatedRust).toMatch(/\(a > b\)/);
        expect(generatedRust).toMatch(/\(n == 0/);
        expect(generatedRust).toMatch(/\(n < lo\)/);
    });
    it('generates max function with u64 params', () => {
        expect(generatedRust).toContain('fn max(a: u64, b: u64)');
    });
    it('generates is_zero function', () => {
        expect(generatedRust).toContain('fn is_zero(n: u64)');
    });
    it('generates clamp function with nested if/else', () => {
        var _a;
        expect(generatedRust).toContain('fn clamp(n: u64, lo: u64, hi: u64)');
        // Should have nested if/else for the two conditions
        const ifCount = ((_a = generatedRust.match(/\bif\b/g)) !== null && _a !== void 0 ? _a : []).length;
        expect(ifCount).toBeGreaterThanOrEqual(3);
    });
    it('compiles with rustc', () => {
        const result = run({
            cmd: 'rustc',
            args: [
                '-A',
                'warnings',
                resolve(TMP, 'main.rs'),
                '-o',
                resolve(TMP, 'test_fork'),
            ],
        });
        if (result.code !== 0) {
            console.error('rustc stderr:', result.stderr);
            console.error('Generated source:\n', readFileSync(resolve(TMP, 'main.rs'), 'utf8'));
        }
        expect(result.code).toBe(0);
    }, 60000);
    it('max returns correct values', () => {
        const result = run({ cmd: resolve(TMP, 'test_fork'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('max(10,5)=10');
        expect(result.stdout).toContain('max(3,7)=7');
        expect(result.stdout).toContain('max(5,5)=5');
    });
    it('is_zero returns correct values', () => {
        const result = run({ cmd: resolve(TMP, 'test_fork'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('is_zero(0)=1');
        expect(result.stdout).toContain('is_zero(5)=0');
    });
    it('clamp returns correct values', () => {
        const result = run({ cmd: resolve(TMP, 'test_fork'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('clamp(3,1,10)=3');
        expect(result.stdout).toContain('clamp(0,1,10)=1');
        expect(result.stdout).toContain('clamp(15,1,10)=10');
    });
});
//# sourceMappingURL=backend-rust-fork-test.test.js.map