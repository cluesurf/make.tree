/**
 * Native optional type tests.
 *
 * Verifies that `form maybe` maps to native optional types
 * across all backends instead of custom enum/class generation.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { expandFuse } from '@/fuse';
import { desugarCard } from '@/term/desugar';
import { castBook as castTs } from '@/cast/typescript';
import { castBook as castRust } from '@/cast/rust';
import { castBook as castKotlin } from '@/cast/kotlin';
import { castBook as castSwift } from '@/cast/swift';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
function compileFile(name) {
    const file = path.resolve(__dirname, name);
    const text = fs.readFileSync(file, 'utf8');
    const lead = makeTree({ file: name, text });
    const rawCard = readCard({ tree: lead.tree, file: name });
    const card = expandFuse({ card: rawCard });
    return desugarCard({ card });
}
const { book } = compileFile('optional-native.tree');
describe('typescript: native optional', () => {
    const ts = castTs({ book });
    it('does not generate a maybe type definition', () => {
        expect(ts).not.toContain('class Maybe');
        expect(ts).not.toContain('type Maybe');
    });
    it('emits null for make none', () => {
        expect(ts).toContain('null');
    });
    it('emits value directly for make some', () => {
        expect(ts).toContain('return x');
    });
    it('emits if !== null for fork case on maybe', () => {
        expect(ts).toContain('!== null');
    });
});
describe('rust: native optional', () => {
    const rs = castRust({ book });
    it('does not generate enum Maybe', () => {
        expect(rs).not.toContain('enum Maybe');
    });
    it('emits None for make none', () => {
        expect(rs).toContain('None');
    });
    it('emits Some(x) for make some', () => {
        expect(rs).toContain('Some(x)');
    });
    it('emits Option type for like maybe param', () => {
        expect(rs).toContain('Option<impl Clone>');
    });
    it('emits match with Some/None patterns', () => {
        expect(rs).toContain('Some(value)');
        expect(rs).toMatch(/match .* \{/);
    });
});
describe('kotlin: native optional', () => {
    const kt = castKotlin({ book });
    it('does not generate sealed class Maybe', () => {
        expect(kt).not.toContain('sealed class Maybe');
    });
    it('emits null for make none', () => {
        expect(kt).toContain('null');
    });
    it('emits value directly for make some', () => {
        expect(kt).toContain('return x');
    });
    it('emits if != null for fork case on maybe', () => {
        expect(kt).toContain('!= null');
    });
});
describe('swift: native optional', () => {
    const sw = castSwift({ book });
    it('does not generate enum Maybe', () => {
        expect(sw).not.toContain('enum Maybe');
    });
    it('emits nil for make none', () => {
        expect(sw).toContain('nil');
    });
    it('emits value directly for make some', () => {
        expect(sw).toContain('return x');
    });
    it('emits if let for fork case on maybe', () => {
        expect(sw).toContain('if let');
    });
});
//# sourceMappingURL=optional-native.test.js.map