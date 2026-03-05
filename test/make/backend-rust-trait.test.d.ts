/**
 * Rust backend end-to-end test: Traits (mask/wear/suit).
 *
 * Compiles trait-test.tree to Rust, appends a main() harness,
 * writes to a temp file, compiles with rustc, and verifies output.
 *
 * Tests: trait definition, impl block, &self parameter, match on
 * self inside impl, standalone functions remain outside impl.
 */
export {};
