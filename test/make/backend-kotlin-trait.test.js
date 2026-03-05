/**
 * Kotlin backend trait/interface end-to-end test.
 *
 * Compiles trait-test.tree to Kotlin, appends a main harness,
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
import { collectTraits } from '@/cast/trait';
const TEST_DIR = dirname(new URL(import.meta.url).pathname);
const MAKE_ROOT = resolve(TEST_DIR, '..', '..');
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-kotlin-trait');
const require_ = createRequire(import.meta.url);
const treeParsePath = resolve(TEST_DIR, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileTreeToKotlin(name) {
    const file = resolve(TEST_DIR, name);
    const text = readFileSync(file, 'utf8');
    const lead = makeTree({ file: name, text });
    const rawCard = readCard({ tree: lead.tree, file: name });
    const card = expandFuse({ card: rawCard });
    const traits = collectTraits({ card });
    const { book } = desugarCard({ card });
    return castBook({ book, traits });
}
const MAIN_HARNESS = `

fun main() {
    val r = makeRed as Color
    val g = makeGreen as Color

    println("red=\${r.toText()}")
    println("green=\${g.toText()}")
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
describe('kotlin: E2E trait/interface compilation', () => {
    let generatedKotlin = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedKotlin = compileTreeToKotlin('trait-test.tree');
        const fullSource = generatedKotlin + MAIN_HARNESS;
        writeFileSync(resolve(TMP, 'main.kt'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('generates interface definition', () => {
        expect(generatedKotlin).toContain('interface Printable');
        expect(generatedKotlin).toContain('fun toText(');
    });
    it('generates sealed class with interface conformance', () => {
        expect(generatedKotlin).toContain('sealed class Color : Printable');
    });
    it('generates enum cases', () => {
        expect(generatedKotlin).toContain('object Red : Color()');
        expect(generatedKotlin).toContain('object Green : Color()');
        expect(generatedKotlin).toContain('object Blue : Color()');
    });
    it('generates override method', () => {
        expect(generatedKotlin).toContain('override fun toText(');
    });
    it('does not emit toText as standalone function', () => {
        const lines = generatedKotlin.split('\n');
        const standaloneFuncs = lines.filter(l => l.startsWith('fun toText('));
        expect(standaloneFuncs.length).toBe(0);
    });
    it('emits makeRed and makeGreen as standalone constants', () => {
        expect(generatedKotlin).toContain('val makeRed');
        expect(generatedKotlin).toContain('val makeGreen');
    });
    it('compiles with kotlinc', () => {
        const result = run({
            cmd: 'kotlinc',
            args: [
                resolve(TMP, 'main.kt'),
                '-include-runtime',
                '-d',
                resolve(TMP, 'test_trait.jar'),
            ],
        });
        if (result.code !== 0) {
            console.error('kotlinc stderr:', result.stderr);
        }
        expect(result.code).toBe(0);
    }, 120000);
    it('toText returns correct string for red', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_trait.jar')] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('red=red');
    });
    it('toText returns correct string for green', () => {
        const result = run({ cmd: 'java', args: ['-jar', resolve(TMP, 'test_trait.jar')] });
        expect(result.stdout).toContain('green=green');
    });
});
//# sourceMappingURL=backend-kotlin-trait.test.js.map