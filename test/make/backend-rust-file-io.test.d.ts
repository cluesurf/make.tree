/**
 * Rust backend end-to-end test: File I/O.
 *
 * Compiles file-io-rust.tree to Rust. The .tree file uses `dock load`
 * to import std::fs and calls fs::write / fs::read_to_string with
 * .unwrap() for error handling. The compiled Rust is fully
 * self-contained (no external prelude needed).
 *
 * Tests: dock load → use statement, module-level function calls
 * (fs::write via :: syntax), method calls (.unwrap()), String
 * parameter types, String return type inference.
 */
export {};
