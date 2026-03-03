

<h3 align='center'>make.tree</h3>
<p align='center'>
  The TermTree Compiler
</p>

<br/>

## Why

Building software for multiple platforms today means rewriting the same
logic in different languages, or accepting the trade-offs of a single
runtime. Rust gives you performance but not mobile. TypeScript gives you
reach but not native speed. Swift and Kotlin lock you into their
ecosystems. You end up maintaining parallel codebases that drift apart
over time.

`make.tree` is a compiler for the `.tree` language that solves this by
compiling a single source to **Rust, TypeScript, Kotlin, Swift, and
HVM**. You write your logic once. The compiler produces idiomatic,
native code for each target, not a lowest-common-denominator
abstraction, but output that looks like it was written by hand for that
platform.

The key insight is splitting work by what each target does best.
Platform-specific code (file I/O, networking, UI) compiles to Rust,
TypeScript, Kotlin, or Swift where those ecosystems have mature
libraries. Pure computation (hashing, tree transforms, symbolic math)
can target [HVM](https://github.com/HigherOrderCO/HVM), which runs
lambda calculus on interaction nets for automatic parallelism across
GPUs and multi-core CPUs.

## What It Does

- **Multi-target compilation**: One `.tree` source compiles to five
  backends, each producing idiomatic output for its platform.
- **Dependent type checking**: Based on the Calculus of Constructions
  with self-types. Types are first-class values, enabling proofs and
  precise specifications alongside regular code.
- **Algebraic data types and pattern matching**: Define types with
  `form`, match on them with `fork case`. The compiler checks
  exhaustiveness.
- **Trait system**: Interfaces (`mask`), implementations (`wear`), and
  blanket implementations (`suit`) for polymorphic dispatch.
- **Error propagation**: `halt` for panics, `halt kink` for recoverable
  errors with `?`-style short-circuit propagation.
- **Tail call optimization**: Self-recursive tail calls compile to loops
  automatically.
- **Cross-platform standard library**: Abstract interfaces for file I/O,
  HTTP, crypto, and more, with platform-specific implementations
  selected at compile time.

## How It Works

```
.tree source -> parse -> surface AST -> macro expand -> core terms -> backend codegen
```

The surface language provides familiar constructs: data types, functions,
pattern matching, traits. The compiler desugars these into a small core
calculus (lambda, application, pi types, self-types), type-checks the
core terms, then hands them to the target backend for code generation.

Each backend translates core terms into the idioms of its target. Rust
gets concrete enums with `match`. TypeScript gets `switch` dispatch with
`while`-loop TCO. Kotlin gets `when` expressions with data classes.
Swift gets enums with associated values and protocols.

## Example

```
form nat
  case zero
  case succ
    link pred

task fib
  take n, like nat
  fork case, read n
    hook zero
      back mark 0
    hook succ, base pred
      fork case, read pred
        hook zero
          back mark 1
        hook succ, base pp
          save a
            call fib
              bind n, read pred
          save b
            call fib
              bind n, read pp
          back call add
            bind a, read a
            bind b, read b
```

This compiles to native Rust enums with `match`, TypeScript `switch`
statements, Kotlin `when` expressions, Swift `switch` with associated
values, or HVM interaction nets, depending on the target.

## Project Structure

```
code/
  read/       Parser (tree syntax -> surface AST)
  fuse/       Macro expansion
  term/       Core terms, desugaring, type checker
  cast/       Backend code generators (rust, typescript, kotlin, swift, hvm)
  kink/       Error types and display
test/         Unit tests, backend E2E tests, stdlib tests
```

## Getting Started

Run the test suite:

```bash
pnpm test
```

See [prerequisites](note/prerequisites.md) for platform-specific setup
(Xcode, Android NDK, Emscripten, Docker).

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
