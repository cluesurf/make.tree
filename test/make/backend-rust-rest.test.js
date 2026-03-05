/**
 * Rust backend test: rest (debugger breakpoint).
 *
 * Tests that the `rest` keyword compiles and runs without error
 * in Rust (emitted as a comment, no-op).
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-rest');
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
    let result = debug_add(3, 4);
    println!("result={}", result);
}
`;
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
describe('rust: E2E rest (debugger breakpoint)', () => {
    let generatedRust = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedRust = compileTreeToRust('rest-test.tree');
        const fullSource = generatedRust + MAIN_HARNESS;
        writeFileSync(resolve(TMP, 'main.rs'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('generates a breakpoint comment', () => {
        expect(generatedRust).toContain('// breakpoint');
    });
    it('generates the debug_add function', () => {
        expect(generatedRust).toContain('fn debug_add(');
    });
    it('compiles with rustc', () => {
        const result = run({
            cmd: 'rustc',
            args: [
                '-A',
                'warnings',
                resolve(TMP, 'main.rs'),
                '-o',
                resolve(TMP, 'test_rest'),
            ],
        });
        if (result.code !== 0) {
            console.error('rustc stderr:', result.stderr);
            console.error('generated rust:', generatedRust);
        }
        expect(result.code).toBe(0);
    }, 60000);
    it('runs and computes correctly despite breakpoint', () => {
        const result = run({ cmd: resolve(TMP, 'test_rest'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('result=7');
    });
});
//# sourceMappingURL=backend-rust-rest.test.js.map