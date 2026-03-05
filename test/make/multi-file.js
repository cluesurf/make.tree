/**
 * Multi-file end-to-end demo:
 *   math.tree loads nat.tree → parse → loadBook → TypeScript codegen
 *
 * Reads math.tree which has `load ./nat`, recursively loads nat.tree,
 * merges all definitions, and generates TypeScript output.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { loadBook } from '@/load';
import { castBook } from '@/cast/typescript';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load the @cluesurf/tree parser (not an npm dep, use path).
const require_ = createRequire(import.meta.url);
const treeParsePath = path.resolve(__dirname, '../../../../../../deck/tree/host/code/index.js');
const makeTree = require_(treeParsePath).default;
const result = loadBook({
    file: path.resolve(__dirname, 'math.tree'),
    env: {
        readFile: p => fs.readFileSync(p, 'utf8'),
        resolvePath: (fromFile, loadPath) => {
            const dir = path.dirname(fromFile);
            const direct = path.resolve(dir, loadPath + '.tree');
            if (fs.existsSync(direct))
                return direct;
            const index = path.resolve(dir, loadPath, 'note.tree');
            if (fs.existsSync(index))
                return index;
            return null;
        },
        parse: input => makeTree(input),
    },
});
const ts = castBook({ book: result.book });
console.log('=== Files loaded ===\n');
for (const f of result.files) {
    console.log('  ' + path.relative(__dirname, f));
}
console.log('\n=== Generated TypeScript ===\n');
console.log(ts);
//# sourceMappingURL=multi-file.js.map