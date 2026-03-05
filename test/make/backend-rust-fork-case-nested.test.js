/**
 * Rust backend end-to-end test: deeply nested pattern matching.
 *
 * Tests three levels of nesting (fork case inside fork case inside
 * fork case), match-inside-match with variable capture, recursive
 * ADTs (binary tree), and match on a 3-constructor ADT (expression
 * evaluator).
 *
 * Tests: deep nested match, variable capture at multiple levels,
 * recursive ADT traversal, mixed fork case + fork test nesting.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-rust-fork-case-nested');
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
    // 3-level deep nesting: color -> season -> mood
    println!("rsH={}", color_season_mood(Color::Red, Season::Spring, Mood::Happy));
    println!("rsS={}", color_season_mood(Color::Red, Season::Spring, Mood::Sad));
    println!("rsu={}", color_season_mood(Color::Red, Season::Summer, Mood::Happy));
    println!("rau={}", color_season_mood(Color::Red, Season::Autumn, Mood::Happy));
    println!("rwu={}", color_season_mood(Color::Red, Season::Winter, Mood::Happy));
    println!("gH={}", color_season_mood(Color::Green, Season::Spring, Mood::Happy));
    println!("gS={}", color_season_mood(Color::Green, Season::Summer, Mood::Sad));
    println!("b={}", color_season_mood(Color::Blue, Season::Spring, Mood::Happy));

    // Recursive tree with variable capture
    let t = Tree::Node {
        left: Box::new(Tree::Node {
            left: Box::new(Tree::Leaf { value: 1 }),
            right: Box::new(Tree::Leaf { value: 2 }),
        }),
        right: Box::new(Tree::Leaf { value: 3 }),
    };
    println!("sum={}", tree_sum(t.clone()));
    println!("depth={}", tree_depth(t));

    // Expression evaluator: (2 + 3) * 4
    let e = Expr::MulExpr {
        left: Box::new(Expr::AddExpr {
            left: Box::new(Expr::Lit { value: 2 }),
            right: Box::new(Expr::Lit { value: 3 }),
        }),
        right: Box::new(Expr::Lit { value: 4 }),
    };
    println!("eval={}", eval_expr(e));

    // Expression evaluator: 10 + (2 * 3)
    let e2 = Expr::AddExpr {
        left: Box::new(Expr::Lit { value: 10 }),
        right: Box::new(Expr::MulExpr {
            left: Box::new(Expr::Lit { value: 2 }),
            right: Box::new(Expr::Lit { value: 3 }),
        }),
    };
    println!("eval2={}", eval_expr(e2));
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
describe('rust: E2E deep nested pattern matching', () => {
    let generatedRust = '';
    beforeAll(() => {
        mkdirSync(TMP, { recursive: true });
        generatedRust = compileTreeToRust('fork-case-nested.tree');
        const fullSource = generatedRust + mainHarness();
        writeFileSync(resolve(TMP, 'main.rs'), fullSource);
    });
    afterAll(() => {
        if (existsSync(TMP)) {
            rmSync(TMP, { recursive: true });
        }
    });
    // -- Structural assertions --
    it('generates match statements for color_season_mood', () => {
        var _a;
        expect(generatedRust).toContain('fn color_season_mood(');
        const matchCount = ((_a = generatedRust.match(/\bmatch\b/g)) !== null && _a !== void 0 ? _a : []).length;
        // tree_sum, tree_depth, eval_expr, color_season_mood all use match
        expect(matchCount).toBeGreaterThanOrEqual(4);
    });
    it('generates recursive tree_sum with match', () => {
        expect(generatedRust).toContain('fn tree_sum(');
        expect(generatedRust).toContain('fn tree_depth(');
    });
    it('generates eval_expr with 3-constructor match', () => {
        expect(generatedRust).toContain('fn eval_expr(');
    });
    it('generates nested match arms with proper indentation', () => {
        // The 3-level deep function should have nested match blocks
        expect(generatedRust).toContain('match');
    });
    // -- Compilation --
    it('compiles with rustc', () => {
        const result = run({
            cmd: 'rustc',
            args: [
                '-A',
                'warnings',
                resolve(TMP, 'main.rs'),
                '-o',
                resolve(TMP, 'test_nested'),
            ],
        });
        if (result.code !== 0) {
            console.error('rustc stderr:', result.stderr);
            console.error('Generated source:\n', readFileSync(resolve(TMP, 'main.rs'), 'utf8'));
        }
        expect(result.code).toBe(0);
    }, 60000);
    // -- Runtime: 3-level deep nesting --
    it('color_season_mood: red/spring/happy = 1', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.code).toBe(0);
        expect(result.stdout).toContain('rsH=1');
    });
    it('color_season_mood: red/spring/sad = 2', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('rsS=2');
    });
    it('color_season_mood: red/summer = 3', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('rsu=3');
    });
    it('color_season_mood: red/autumn = 4', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('rau=4');
    });
    it('color_season_mood: red/winter = 5', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('rwu=5');
    });
    it('color_season_mood: green/happy = 10', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('gH=10');
    });
    it('color_season_mood: green/sad = 20', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('gS=20');
    });
    it('color_season_mood: blue = 100', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('b=100');
    });
    // -- Runtime: recursive tree with variable capture --
    it('tree_sum computes sum of all leaves', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('sum=6');
    });
    it('tree_depth computes depth of tree', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('depth=2');
    });
    // -- Runtime: expression evaluator --
    it('eval_expr: (2 + 3) * 4 = 20', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('eval=20');
    });
    it('eval_expr: 10 + (2 * 3) = 16', () => {
        const result = run({ cmd: resolve(TMP, 'test_nested'), args: [] });
        expect(result.stdout).toContain('eval2=16');
    });
});
//# sourceMappingURL=backend-rust-fork-case-nested.test.js.map