

<h3 align='center'>flow.tree</h3>
<p align='center'>
  The Seed Runtime
</p>

<br/>

## Why

A compiler that produces code for five platforms is only half the story.
You also need something to load that code, run it, and keep it running
while you change it. Without a runtime layer, every edit means a full
rebuild, a restart, and lost state.

`flow.tree` is the runtime for `.tree` programs. It loads compiled
output, executes it, and hot-reloads changed files without restarting.
For the HVM target, it bridges JavaScript to HVM4 through WebAssembly,
marshaling values between the two worlds and interpreting the IO
protocol that lets pure HVM programs perform side effects.

The compiler (`make.tree`) and the runtime (`flow.tree`) are separate
packages by design. The compiler runs at build time and knows about
syntax, types, and code generation. The runtime runs at execution time
and knows about loading, evaluation, and IO. They connect through a
dependency injection boundary: the consumer passes compiler functions
into the runtime config, keeping both packages independent and
swappable.

## What It Does

- **Module loading and management**: Compiles a `.tree` project,
  tracks per-file state, and maintains a merged definition book across
  all loaded files.
- **Hot module reloading**: Watches the file system for changes,
  re-compiles only the changed file, swaps its definitions into the
  live book, and reports what changed. No full rebuild, no lost state.
- **HVM execution via WebAssembly**: Bridges to HVM4's C runtime
  through Emscripten, exposing term constructors, heap operations,
  evaluation, and symbol lookup as a typed TypeScript API.
- **Value marshaling**: Converts between JavaScript values (numbers,
  strings, booleans, lists) and HVM's binary term representation.
  Handles linked-list encoding for strings and lists, constructor
  tags, and a handle table for passing native JS objects through HVM.
- **IO interpretation**: Runs the IO protocol loop that lets pure HVM
  programs perform side effects. Normalizes a term, pattern-matches
  on IO/Done, IO/Call, and IO/Bind constructors, dispatches native
  primitives, and feeds results back as continuations.

## How It Works

```
.tree source --(make.tree)--> compiled output --(flow.tree)--> execution
```

The runtime accepts compiled output through injected callbacks. It does
not import the compiler directly. This means you can swap compilers,
mock compilation for tests, or run pre-compiled artifacts without the
compiler present.

For HVM programs, the execution loop follows the HigherOrderCO IO
model:

1. Normalize the program to a value (pure, possibly parallel)
2. Check if the value is an IO node (IO/Done or IO/Call)
3. If IO/Call: execute the native operation, apply the continuation
4. If IO/Done: return the final result
5. Repeat until done

This keeps the HVM reducer pure. Side effects happen outside reduction,
in a single-threaded interpreter loop that the runtime controls.

## Project Structure

```
code/
  runtime/
    index.ts    Runtime class (load, swap, watch, close)
    form.ts     Type definitions (RuntimeConfig, CompileOutput, etc.)
    swap.ts     Hot-swap logic for single file re-compilation
    watch.ts    File system watcher for HMR
  hvm/
    base.ts     HVM4 term layout constants and bit manipulation
    form.ts     HvmValue types (num, str, bool, list, handle, null)
    wasm/
      bind.ts     Typed wrapper around Emscripten WASM module (23 C functions)
      load.ts     WASM module loader
      marshal.ts  JS <-> HVM term conversion
      handle.ts   Handle table for native JS objects
      loop.ts     IO action interpreter (Done, Call, Bind)
```

## Getting Started

```bash
# Build the runtime (TypeScript -> JavaScript)
pnpm make

# Build in watch mode (auto-rebuild on changes)
pnpm scan

# Run tests
pnpm test

# Publish to npm
pnpm host
```

## Usage

```typescript
import { Runtime } from '@cluesurf/flow'
import { compile, compileText } from '@cluesurf/make'

const rt = new Runtime()

// Compile and load
const output = compile({ file: './main.tree' })
rt.load({ output })

// Get the merged definition book
rt.book()

// Hot-swap a file with new compiled output
const updated = compileText({ file: './math.tree', text: newSource })
rt.swap({ file: './math.tree', output: updated })

// Clean up
rt.close()
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
