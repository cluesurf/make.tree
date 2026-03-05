/**
 * Rust backend end-to-end test: fork test (if/else conditionals).
 *
 * Compiles fork-test.tree to Rust. The .tree file uses `fork test`
 * with comparison operators (gt, eq, lt) to produce native if/else
 * statements in Rust.
 *
 * Tests: fork test → if/else, built-in binary ops → native operators,
 * nested conditionals, u64 return type inference.
 */
export {};
