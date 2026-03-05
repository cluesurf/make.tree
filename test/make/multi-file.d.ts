/**
 * Multi-file end-to-end demo:
 *   math.tree loads nat.tree → parse → loadBook → TypeScript codegen
 *
 * Reads math.tree which has `load ./nat`, recursively loads nat.tree,
 * merges all definitions, and generates TypeScript output.
 */
export {};
