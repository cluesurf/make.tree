

<h3 align='center'>mesh.tree</h3>
<p align='center'>
  The Seed Compiler and Runtime
</p>

<br/>

## Why

Building software for multiple platforms today means rewriting the same
logic in different languages, or accepting the trade-offs of a single
runtime. Rust gives you performance but not mobile. TypeScript gives you
reach but not native speed. Swift and Kotlin lock you into their
ecosystems. You end up maintaining parallel codebases that drift apart
over time.

`mesh.tree` is the compiler and runtime for the Seed language. It
compiles `.tree` source to **Rust, TypeScript, Kotlin, Swift, and
HVM**, producing idiomatic native code for each target. Not a
lowest-common-denominator abstraction, but output that looks like it
was written by hand for that platform.

The name "mesh" comes from weaving. The compiler is the loom that
weaves `.tree` source into native code across platforms. The runtime
is the fabric that holds it together at execution time, managing
definitions, hot-swapping changes, and bridging to HVM for pure
parallel computation.

The key insight is splitting work by what each target does best.
Platform-specific code (file I/O, networking, UI) compiles to Rust,
TypeScript, Kotlin, or Swift where those ecosystems have mature
libraries. Pure computation (hashing, tree transforms, symbolic math)
can target [HVM](https://github.com/HigherOrderCO/HVM), which runs
lambda calculus on interaction nets for automatic parallelism across
GPUs and multi-core CPUs.

## What It Does

### Compiler

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
- **Async/await**: `wait true` on tasks and calls compiles to native
  async for each platform (`async fn`/`.await` in Rust,
  `async function`/`await` in TS, `suspend fun` in Kotlin,
  `func ... async` in Swift, IO continuations in HVM).
- **Closures/HOF**: Function-typed parameters (`like task`) compile to
  `impl Fn(A) -> B` in Rust, native lambdas elsewhere.

### Runtime

- **Definition management**: Loads compiled output, maintains a merged
  book of all definitions across files.
- **Hot-swap**: Receives re-compiled output for a changed file, diffs
  the definitions, removes old ones, inserts new ones. No full rebuild.
- **HVM execution**: Bridges to HVM4 through WebAssembly, marshaling
  values between JavaScript and HVM's binary term representation.
- **IO interpretation**: Runs the IO protocol loop that lets pure HVM
  programs perform side effects. Normalizes terms, dispatches native
  primitives, feeds results back as continuations.

## How It Works

### Compilation

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

### Execution (HVM)

```
compiled HVM code -> load into runtime -> normalize -> IO loop -> result
```

The runtime receives compiled output. For HVM programs, it normalizes
terms (pure, possibly parallel), then interprets IO nodes: IO/Call
dispatches a native operation and applies the continuation, IO/Done
returns the final result.

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
  runtime/    Definition management, hot-swap
  hvm/        HVM WASM bridge, value marshaling, IO loop
test/         Unit tests, backend E2E tests, stdlib tests
```

## Getting Started

```bash
# Build (TypeScript -> JavaScript)
pnpm make

# Build in watch mode (auto-rebuild on changes)
pnpm scan

# Run the full test suite (615+ tests)
pnpm test

# Run tests in watch mode (re-runs on file changes)
pnpm test:watch

# Lint the codebase
pnpm lint

# Publish to npm
pnpm host
```

## Part of the Seed Ecosystem

`mesh.tree` is one package in the Seed ecosystem:

| Package   | Purpose                                   |
| --------- | ----------------------------------------- |
| seed.tree | Entrypoint                                |
| mesh.tree | Compiler + runtime (this package)         |
| deck.tree | Package manager                           |
| case.tree | Environment types in tree code            |
| base.tree | Stdlib (all tree code definitions)        |

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
