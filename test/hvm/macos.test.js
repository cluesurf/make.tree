// macos.test.ts - Build libhvm.a for macOS, link a test program, verify output.
import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
const TEST_DIR = dirname(new URL(import.meta.url).pathname);
const MAKE_ROOT = resolve(TEST_DIR, '..', '..');
const HVM_SRC = resolve(MAKE_ROOT, '..', '..', '..', 'fork-HVM4', 'clang');
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-macos');
const VERIFY_C = resolve(TEST_DIR, 'verify.c');
const CLANG = '/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang';
const LIBTOOL = '/usr/bin/libtool';
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
describe('macOS build', () => {
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    it('compiles lib.c to object file', () => {
        const result = run({
            cmd: CLANG,
            args: ['-O2', '-c', 'lib.c', '-o', resolve(TMP, 'hvm.o')],
            cwd: HVM_SRC,
        });
        expect(result.code).toBe(0);
    }, 30000);
    it('creates libhvm.a', () => {
        const result = run({
            cmd: LIBTOOL,
            args: [
                '-static',
                '-o',
                resolve(TMP, 'libhvm.a'),
                resolve(TMP, 'hvm.o'),
            ],
        });
        expect(result.code).toBe(0);
        expect(existsSync(resolve(TMP, 'libhvm.a'))).toBe(true);
    });
    it('compiles and links verify.c', () => {
        const result = run({
            cmd: CLANG,
            args: [
                '-O2',
                VERIFY_C,
                '-L',
                TMP,
                '-lhvm',
                '-lpthread',
                '-o',
                resolve(TMP, 'verify'),
            ],
        });
        expect(result.code).toBe(0);
    }, 30000);
    it('runs verify and gets tag=30 val=42', () => {
        const result = run({
            cmd: resolve(TMP, 'verify'),
            args: [],
        });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('tag=30');
        expect(result.stdout).toContain('val=42');
    });
});
//# sourceMappingURL=macos.test.js.map