/**
 * Rust backend end-to-end test: trait methods with extra parameters.
 *
 * Tests trait methods beyond the simple &self-only pattern:
 * - Methods with &self plus additional typed parameters
 * - Methods without self (static methods)
 * - Methods with &self plus two extra parameters
 * - Multiple trait impls with varied method signatures
 *
 * Tests: trait method codegen, param types in impl blocks,
 * static method codegen (no &self), multi-param methods.
 */
export {};
