/**
 * Rust backend end-to-end test: Fibonacci with Nat type.
 *
 * Compiles nat-fib.tree to Rust, appends a main() harness,
 * writes to a temp file, compiles with rustc, and verifies output.
 *
 * Tests: recursive ADT (Nat with Box<Nat> field), pattern matching
 * with field destructuring, recursive function calls, and
 * constructor creation with Box::new().
 */
export {};
