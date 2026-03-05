/**
 * Fibonacci end-to-end demo:
 *   .tree file → parse → Surface AST → desugar → TypeScript codegen
 *
 * Reads fibonacci.tree, parses it with the @cluesurf/tree parser,
 * converts the tree AST to Surface AST, desugars to Core Terms,
 * and generates TypeScript output.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { readCard } from '@/read';
import { desugarCard } from '@/term/desugar';
import { castBook } from '@/cast/typescript';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load the @cluesurf/tree parser (not an npm dep, use path).
// Navigate from deck/term/deck/make.tree/test/make/ up to deck/tree/
const require_ = createRequire(import.meta.url);
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
// Read the .tree source file
const treeFile = path.resolve(__dirname, 'fibonacci.tree');
const source = fs.readFileSync(treeFile, 'utf8');
// Phase 0: Parse .tree text → Tree AST
const lead = makeTree({ file: 'fibonacci.tree', text: source });
if (!lead || !lead.tree) {
    console.error('Parse error:', lead);
    process.exit(1);
}
// Phase 1: Tree AST → Surface AST
const card = readCard({ tree: lead.tree, file: 'fibonacci.tree' });
// Phase 3: Surface AST → Core Terms
const { book } = desugarCard({ card });
// Phase 5: Core Terms → TypeScript
const ts = castBook({ book });
console.log('=== TreeCode Source ===\n');
console.log(source);
console.log('=== Surface AST (top-level names) ===\n');
for (const item of card.list) {
    if ('name' in item) {
        console.log(`  ${item.form}: ${item.name}`);
    }
}
console.log();
console.log('=== Core Terms (book entries) ===\n');
for (const [name] of book) {
    console.log(`  ${name}`);
}
console.log();
console.log('=== Generated TypeScript ===\n');
console.log(ts);
console.log();
//# sourceMappingURL=fibonacci.js.map