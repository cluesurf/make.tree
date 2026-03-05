/**
 * Kotlin backend end-to-end test.
 *
 * Compiles stdlib-bool.tree to Kotlin, appends a main harness,
 * writes to a temp file, compiles with kotlinc, and verifies output.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync, } from 'fs';
import { resolve, dirname } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook } from '@/cast/kotlin';
const TEST_DIR = dirname(new URL(import.meta.url).pathname);
const MAKE_ROOT = resolve(TEST_DIR, '..', '..');
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-kotlin-run');
const require_ = createRequire(import.meta.url);
const treeParsePath = resolve(TEST_DIR, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileTreeToKotlin(name) {
    const file = resolve(TEST_DIR, name);
    const text = readFileSync(file, 'utf8');
    const lead = makeTree({ file: name, text });
    const rawCard = readCard({ tree: lead.tree, file: name });
    const card = expandFuse({ card: rawCard });
    const { book } = desugarCard({ card });
    return castBook({ book });
}
const MAIN_HARNESS = `

fun main() {
    val t: Any = Bool.True
    val f: Any = Bool.False

    fun printResult(name: String, v: Any) {
        when (v) {
            is Bool.True -> println("\$name=0")
            is Bool.False -> println("\$name=1")
        }
    }

    printResult("not_t", boolNot(t))
    printResult("not_f", boolNot(f))
    printResult("and_tt", boolAnd(t, t))
    printResult("and_tf", boolAnd(t, f))
    printResult("or_ff", boolOr(f, f))
    printResult("or_ft", boolOr(f, t))
    printResult("xor_tt", boolXor(t, t))
    printResult("xor_tf", boolXor(t, f))
    printResult("eq_tt", boolEq(t, t))
    printResult("eq_tf", boolEq(t, f))
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
describe('kotlin: E2E Bool compilation', () => {
    let generatedKotlin = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedKotlin = compileTreeToKotlin('stdlib-bool.tree');
        const fullSource = generatedKotlin + MAIN_HARNESS;
        writeFileSync(resolve(TMP, 'main.kt'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('generates sealed class for Bool', () => {
        expect(generatedKotlin).toContain('sealed class Bool');
    });
    it('generates object constructors', () => {
        expect(generatedKotlin).toContain('object True : Bool()');
        expect(generatedKotlin).toContain('object False : Bool()');
    });
    it('generates boolNot function', () => {
        expect(generatedKotlin).toContain('fun boolNot(');
    });
    it('uses when for pattern matching', () => {
        expect(generatedKotlin).toContain('when (');
    });
    it('compiles with kotlinc', () => {
        const result = run({
            cmd: 'kotlinc',
            args: [
                resolve(TMP, 'main.kt'),
                '-include-runtime',
                '-d',
                resolve(TMP, 'test_bool.jar'),
            ],
        });
        if (result.code !== 0) {
            console.error('kotlinc stderr:', result.stderr);
        }
        expect(result.code).toBe(0);
    }, 120000);
    it('not(true) = false', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('not_t=1');
    });
    it('not(false) = true', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('not_f=0');
    });
    it('and(t,t) = true', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('and_tt=0');
    });
    it('and(t,f) = false', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('and_tf=1');
    });
    it('or(f,f) = false', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('or_ff=1');
    });
    it('or(f,t) = true', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('or_ft=0');
    });
    it('xor(t,t) = false', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('xor_tt=1');
    });
    it('xor(t,f) = true', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('xor_tf=0');
    });
    it('eq(t,t) = true', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('eq_tt=0');
    });
    it('eq(t,f) = false', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_bool.jar')] });
        expect(result.stdout).toContain('eq_tf=1');
    });
});
//# sourceMappingURL=backend-kotlin-run.test.js.map