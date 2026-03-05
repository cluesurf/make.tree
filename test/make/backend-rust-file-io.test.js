/**
 * Rust backend end-to-end test: File I/O.
 *
 * Compiles file-io-rust.tree to Rust. The .tree file uses `dock load`
 * to import std::fs and calls fs::write / fs::read_to_string with
 * .unwrap() for error handling. The compiled Rust is fully
 * self-contained (no external prelude needed).
 *
 * Tests: dock load → use statement, module-level function calls
 * (fs::write via :: syntax), method calls (.unwrap()), String
 * parameter types, String return type inference.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-file-io');
const require_ = createRequire(import.meta.url);
const treeParsePath = resolve(TEST_DIR, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileTreeToRust(name) {
    const file = resolve(TEST_DIR, name);
    const text = readFileSync(file, 'utf8');
    const lead = makeTree({ file: name, text });
    const rawCard = readCard({ tree: lead.tree, file: name });
    const card = expandFuse({ card: rawCard });
    const dock = card.list
        .filter((n) => n.form === 'load' && n.dock === true)
        .map(n => { var _a; return ({ path: (_a = n.path[0]) !== null && _a !== void 0 ? _a : '', name: n.name }); });
    const { book } = desugarCard({ card });
    const code = castBook({ book, dock });
    return { code, dock };
}
function mainHarness(tmpDir) {
    const testFile = resolve(tmpDir, 'test.txt').replace(/\\/g, '/');
    return `

fn main() {
    let path = String::from("${testFile}");
    let content = String::from("hello from tree-lang");
    write_file(path.clone(), content);
    let result = read_file(path);
    println!("content={}", result);
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
describe('rust: E2E File I/O (dock load, self-contained)', () => {
    let generatedRust = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        const result = compileTreeToRust('file-io-rust.tree');
        generatedRust = result.code;
        const fullSource = generatedRust + mainHarness(TMP);
        writeFileSync(resolve(TMP, 'main.rs'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('emits use statement from dock load', () => {
        expect(generatedRust).toContain('use std::fs;');
    });
    it('generates fs::write call (module-level :: syntax)', () => {
        expect(generatedRust).toContain('fs::write(');
    });
    it('generates fs::read_to_string call', () => {
        expect(generatedRust).toContain('fs::read_to_string(');
    });
    it('generates .unwrap() method calls', () => {
        expect(generatedRust).toContain('.unwrap()');
    });
    it('generates write_file function with String params', () => {
        expect(generatedRust).toContain('fn write_file(');
        expect(generatedRust).toContain('String');
    });
    it('generates read_file function with String param', () => {
        expect(generatedRust).toContain('fn read_file(');
    });
    it('compiles with rustc', () => {
        const result = run({
            cmd: 'rustc',
            args: [
                '-A',
                'warnings',
                resolve(TMP, 'main.rs'),
                '-o',
                resolve(TMP, 'test_file_io'),
            ],
        });
        if (result.code !== 0) {
            console.error('rustc stderr:', result.stderr);
            console.error('Generated source:\n', readFileSync(resolve(TMP, 'main.rs'), 'utf8'));
        }
        expect(result.code).toBe(0);
    }, 60000);
    it('reads back written content', () => {
        const result = run({ cmd: resolve(TMP, 'test_file_io'), args: [] });
        if (result.code !== 0) {
            console.error('runtime stderr:', result.stderr);
        }
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('content=hello from tree-lang');
    });
});
//# sourceMappingURL=backend-rust-file-io.test.js.map