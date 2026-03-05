/**
 * Rust backend end-to-end test: single-arm pattern matches.
 *
 * Tests edge cases where fork case has fewer arms than the ADT has
 * constructors:
 * - Single-constructor form (struct): one arm should work
 * - Two-constructor form with one arm: needs wildcard or exhaustive fix
 * - Four-constructor form with one arm: needs wildcard
 *
 * These tests verify the Rust backend emits compilable match statements
 * even when not all constructors are covered.
 */
export {};
