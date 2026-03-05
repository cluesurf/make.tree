/**
 * Rust backend end-to-end test.
 *
 * Compiles stdlib-bool.tree to Rust, appends a main() harness,
 * writes to a temp file, compiles with rustc, and verifies output.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust');
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
const MAIN_HARNESS = `

fn main() {
    let t = Bool::True;
    let f = Bool::False;

    print_result("not_t", bool_not(t.clone()));
    print_result("not_f", bool_not(f.clone()));
    print_result("and_tt", bool_and(t.clone(), t.clone()));
    print_result("and_tf", bool_and(t.clone(), f.clone()));
    print_result("and_ft", bool_and(f.clone(), t.clone()));
    print_result("or_ff", bool_or(f.clone(), f.clone()));
    print_result("or_ft", bool_or(f.clone(), t.clone()));
    print_result("xor_tt", bool_xor(t.clone(), t.clone()));
    print_result("xor_tf", bool_xor(t.clone(), f.clone()));
    print_result("eq_tt", bool_eq(t.clone(), t.clone()));
    print_result("eq_tf", bool_eq(t.clone(), f.clone()));
}

fn print_result(name: &str, val: Bool) {
    let tag = match val {
        Bool::True => 0,
        Bool::False => 1,
    };
    println!("{}={}", name, tag);
}
`;
function run(input) {
    var _a, _b, _c, _d;
    try {
        const stdout = execFileSync(input.cmd, input.args, {
            cwd: (_a = input.cwd) !== null && _a !== void 0 ? _a : TMP,
            encoding: 'utf-8',
            timeout: 60000,
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
describe('rust: E2E Bool compilation', () => {
    let generatedRust = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedRust = compileTreeToRust('stdlib-bool.tree');
        const fullSource = generatedRust + MAIN_HARNESS;
        writeFileSync(resolve(TMP, 'main.rs'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('generates valid Rust source', () => {
        expect(generatedRust).toContain('enum Bool');
        expect(generatedRust).toContain('fn bool_not(');
        expect(generatedRust).toContain('Bool::True');
    });
    it('compiles with rustc', () => {
        const result = run({
            cmd: 'rustc',
            args: [
                resolve(TMP, 'main.rs'),
                '-o',
                resolve(TMP, 'test_bool'),
            ],
        });
        expect(result.stderr).toBe('');
        expect(result.code).toBe(0);
    }, 30000);
    it('not(true) = false', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('not_t=1');
    });
    it('not(false) = true', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('not_f=0');
    });
    it('and(t,t) = true', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('and_tt=0');
    });
    it('and(t,f) = false', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('and_tf=1');
    });
    it('and(f,t) = false', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('and_ft=1');
    });
    it('or(f,f) = false', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('or_ff=1');
    });
    it('or(f,t) = true', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('or_ft=0');
    });
    it('xor(t,t) = false', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('xor_tt=1');
    });
    it('xor(t,f) = true', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('xor_tf=0');
    });
    it('eq(t,t) = true', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('eq_tt=0');
    });
    it('eq(t,f) = false', () => {
        const result = run({ cmd: resolve(TMP, 'test_bool'), args: [] });
        expect(result.stdout).toContain('eq_tf=1');
    });
});
//# sourceMappingURL=backend-rust-run.test.js.map