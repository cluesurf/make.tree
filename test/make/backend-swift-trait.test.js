/**
 * Swift backend trait/protocol end-to-end test.
 *
 * Compiles trait-test.tree to Swift, appends a main harness,
 * writes to a temp file, compiles with swiftc, and verifies output.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync, } from 'fs';
import { resolve, dirname } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook } from '@/cast/swift';
import { collectTraits } from '@/cast/trait';
const TEST_DIR = dirname(new URL(import.meta.url).pathname);
const MAKE_ROOT = resolve(TEST_DIR, '..', '..');
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-swift-trait');
const require_ = createRequire(import.meta.url);
const treeParsePath = resolve(TEST_DIR, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileTreeToSwift(name) {
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

let r = makeRed as! Color
let g = makeGreen as! Color

print("red=\\(r.toText())")
print("green=\\(g.toText())")
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
describe('swift: E2E trait/protocol compilation', () => {
    let generatedSwift = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedSwift = compileTreeToSwift('trait-test.tree');
        const fullSource = generatedSwift + MAIN_HARNESS;
        writeFileSync(resolve(TMP, 'main.swift'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('generates protocol definition', () => {
        expect(generatedSwift).toContain('protocol Printable');
        expect(generatedSwift).toContain('func toText(');
    });
    it('generates extension for Color', () => {
        expect(generatedSwift).toContain('extension Color: Printable');
    });
    it('generates enum Color', () => {
        expect(generatedSwift).toContain('enum Color');
        expect(generatedSwift).toContain('case red');
        expect(generatedSwift).toContain('case green');
        expect(generatedSwift).toContain('case blue');
    });
    it('does not emit toText as standalone function', () => {
        const lines = generatedSwift.split('\n');
        const standaloneFuncs = lines.filter(l => l.startsWith('func toText('));
        expect(standaloneFuncs.length).toBe(0);
    });
    it('emits makeRed and makeGreen as standalone constants', () => {
        expect(generatedSwift).toContain('let makeRed');
        expect(generatedSwift).toContain('let makeGreen');
    });
    it('compiles with swiftc', () => {
        const result = run({
            cmd: 'swiftc',
            args: [
                resolve(TMP, 'main.swift'),
                '-o',
                resolve(TMP, 'test_trait'),
            ],
        });
        if (result.code !== 0) {
            console.error('swiftc stderr:', result.stderr);
        }
        expect(result.code).toBe(0);
    }, 60000);
    it('to_text returns correct string for red', () => {
        const result = run({ cmd: resolve(TMP, 'test_trait'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('red=red');
    });
    it('to_text returns correct string for green', () => {
        const result = run({ cmd: resolve(TMP, 'test_trait'), args: [] });
        expect(result.stdout).toContain('green=green');
    });
});
//# sourceMappingURL=backend-swift-trait.test.js.map