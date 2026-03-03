<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

<h3 align='center'>make.tree</h3>
<p align='center'>
  The TermTree Compiler Library<br/>
  <small>(WIP)</small>
</p>

<br/>
<br/>
<br/>

## Overview

The `make.tree` project is a multi-target compiler for the `.tree`
language, part of the TermTree ecosystem. It takes `.tree` source files
and compiles them to Rust, TypeScript, Kotlin, Swift, and HVM.

The core type system is based on the Calculus of Constructions with
self-types, inspired by Victor Taelin's work on
[HVM](https://github.com/HigherOrderCO/HVM). Rather than building
algebraic data types and pattern matching as primitives, the compiler
represents them through self-types (`Slf`, `Ins`) and lambda encodings.
This gives a minimal core calculus (just lambda, application, pi types,
and self-types) that can express inductive types, dependent elimination,
and proofs without special-cased inductive constructs. The surface
language desugars `form` (ADT definitions), `fork case` (pattern
matches), and `mask`/`wear` (traits/impls) into this small core, then
each backend translates the core terms into idiomatic target code.

## Backends

Each backend aims to produce output that is idiomatic and performant
for its target environment, not just correct.

- **Rust**: Concrete enums and structs, zero-cost pattern matching,
  `Result<T, E>` with `?` for error propagation, ownership-aware
  codegen. The goal is output that looks like hand-written Rust, with
  proper struct field access, trait impl blocks, and no unnecessary
  allocations.
- **TypeScript**: Flat `const` bindings instead of nested closures,
  numeric constructor tags for O(1) switch dispatch, self-tail-call
  optimization into `while` loops, and `for...of` loop emission for
  iteration.
- **Kotlin**: Native `when` expressions for pattern matching, data
  classes for constructors, interface-based trait dispatch.
- **Swift**: Enums with associated values, protocol-based traits,
  native pattern matching.
- **HVM**: Pure computation-heavy workloads can be delegated to HVM,
  which compiles lambda calculus terms into interaction nets. Interaction
  nets evaluate through local graph rewrites rather than global copying,
  giving optimal sharing of subterms. This means pure functional code
  (recursive tree traversals, symbolic computation, proof normalization)
  can run with automatic parallelism on GPUs and multi-core CPUs, since
  independent redexes reduce simultaneously without synchronization.

The split is intentional. Platform-specific work (file I/O, networking,
UI) goes through Rust, TypeScript, Kotlin, or Swift where those
ecosystems have mature libraries. Pure computation (hashing, tree
transforms, mathematical operations) can target HVM for massively
parallel evaluation.

## Purpose

The goal is to write code once in `.tree` and compile it to native code
for each platform, with performance as a first-class concern at every
stage. The compiler handles:

- **Type checking**: Calculus of Constructions with self-types. Types are
  first-class terms. ADTs are encoded via self-types, not built-in
  inductive types.
- **Code generation**: Produces idiomatic output for each backend.
- **Pattern matching**: ADTs with exhaustive match compilation.
- **Trait system**: Masks (traits), wear (impl), and suit (blanket impl).
- **Error handling**: `halt` for panics, `halt kink` for `?` propagation.
- **Logging**: 6 log levels (`dive`, `hint`, `show`, `tell`, `kink`, `bust`).
- **Tail call optimization**: Self-recursive tail calls become loops.

## Pipeline

```
.tree source
  -> parse
  -> Surface AST
  -> macro expand
  -> Core Terms
  -> backend codegen
```

## Structure

```
code/read/       Reader: tree parse output -> Surface AST
code/fuse/       Macro expansion (fuse/tree)
code/term/       Core Terms, desugar, type checker
code/cast/       Backend code generators (rust, typescript, kotlin, swift, hvm)
code/kink/       Error types and display
test/            Tests (unit, backend E2E, stdlib)
```

## Development

See [prerequisites](note/prerequisites.md) for platform prerequisites
(Xcode, Android NDK, Emscripten, Docker).

Can run tests with:

```bash
pnpm test
```

## License

Copyright 2021-2026+ <a href='https://clue.surf'>ClueSurf</a>

Licensed under the Apache License, Version 2.0 (the "License"); you may
not use this file except in compliance with the License. You may obtain
a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## ClueSurf

Made by [ClueSurf](https://clue.surf), meditating on the universe ¤.
Follow the work on [YouTube](https://youtube.com/@cluesurf),
[X](https://x.com/cluesurf),
[Instagram](https://instagram.com/cluesurf),
[Substack](https://cluesurf.substack.com),
[Facebook](https://facebook.com/cluesurf), and
[LinkedIn](https://linkedin.com/company/cluesurf), and browse more of
our open-source work here on [GitHub](https://github.com/cluesurf).
