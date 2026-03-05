/**
 * Rust backend end-to-end test: halt kink (error propagation).
 *
 * Compiles file-io-halt.tree to Rust. The .tree file uses `halt kink`
 * on call sites to propagate errors. The compiled Rust should use the
 * `?` operator, `Result<T, E>` return types, and `Ok(..)` wrapping.
 *
 * Tests: halt kink → ? operator, Result return type inference,
 * Ok() wrapping of final return values.
 */
export {};
