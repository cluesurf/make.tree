/**
 * Node.js backend end-to-end test: File I/O.
 *
 * Compiles file-io-node.tree to JavaScript via the Node.js backend.
 * The .tree file uses `dock load` to import node:fs, making the
 * compiled output fully self-contained (no external prelude needed).
 *
 * Tests: dock load → import emission, method calls on imported
 * modules (fs.writeFileSync, fs.readFileSync), String parameters.
 */
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync, readFileSync, } from 'fs';
import { resolve, dirname } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook } from '@/cast/node';
const TEST_DIR = dirname(new URL(import.meta.url).pathname);
const MAKE_ROOT = resolve(TEST_DIR, '..', '..');
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-node-file-io');
const require_ = createRequire(import.meta.url);
const treeParsePath = resolve(TEST_DIR, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileTreeToJS(name) {
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
function mainDriver(tmpDir) {
    const testFile = resolve(tmpDir, 'test.txt').replace(/\\/g, '/');
    return `

const _path = "${testFile}"
const _content = "hello from tree-lang"
writeFile(_path, _content)
const _result = readFile(_path)
console.log("content=" + _result)
`;
}
function run(input) {
    var _a, _b, _c, _d;
    try {
        const stdout = execFileSync(input.cmd, input.args, {
            cwd: (_a = input.cwd) !== null && _a !== void 0 ? _a : TMP,
            encoding: 'utf-8',
            timeout: 30000,
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
describe('node: E2E File I/O (dock load)', () => {
    let generatedJS = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        const result = compileTreeToJS('file-io-node.tree');
        generatedJS = result.code;
        const fullSource = generatedJS + mainDriver(TMP);
        writeFileSync(resolve(TMP, 'main.mjs'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('emits import from dock load', () => {
        expect(generatedJS).toContain("import fs from 'node:fs'");
    });
    it('generates writeFile with fs.writeFileSync call', () => {
        expect(generatedJS).toContain('function writeFile(');
        expect(generatedJS).toContain('fs.writeFileSync');
    });
    it('generates readFile with fs.readFileSync call', () => {
        expect(generatedJS).toContain('function readFile(');
        expect(generatedJS).toContain('fs.readFileSync');
    });
    it('runs with node and reads back written content', () => {
        const result = run({
            cmd: 'node',
            args: [resolve(TMP, 'main.mjs')],
        });
        if (result.code !== 0) {
            console.error('node stderr:', result.stderr);
            console.error('Generated source:\n', readFileSync(resolve(TMP, 'main.mjs'), 'utf8'));
        }
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('content=hello from tree-lang');
    });
});
//# sourceMappingURL=backend-node-file-io.test.js.map