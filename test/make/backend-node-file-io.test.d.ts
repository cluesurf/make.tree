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
export {};
