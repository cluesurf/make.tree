# HVM Bridge Usage Guide

flow.tree provides bridge code that connects the HVM runtime to each
target platform. The bridge handles loading compiled HVM artifacts,
converting native values to/from HVM terms, and running the IO loop
for side effects.

## File Structure

```
code/hvm/
  base.ts           Tag constants, bit layout, term helpers
  form.ts           Value types shared across platforms
  wasm/
    bind.ts         Typed wrappers around Emscripten cwrap calls
    load.ts         WASM module loader
    marshal.ts      JS value <-> HVM term conversion
    handle.ts       Handle table for native JS objects
    loop.ts         IO action interpreter
  ios/
    bind.swift      Swift wrapper around C API (hvm_lib.h)
    marshal.swift   Swift value <-> HVM term conversion
    handle.swift    Handle table for native Swift objects
    loop.swift      IO action interpreter
  android/
    bind.kt         JNI external function declarations
    bind.c          JNI native method implementations
    marshal.kt      Kotlin value <-> HVM term conversion
    handle.kt       Handle table for native Kotlin objects
    handle.c        JNI global ref management
    loop.kt         IO action interpreter
  server/
    bind.rs         FFI extern declarations and safe wrappers
    marshal.rs      Rust value <-> HVM term conversion
    handle.rs       Thread-safe handle table (Arc + Mutex)
    loop.rs         IO action interpreter
    mod.rs          Module root
```

## WASM (TypeScript)

### Loading the Runtime

```ts
import { load } from './code/hvm/wasm/load'

const api = await load({
  moduleFn: () => import('./host/hvm/wasm/hvm.mjs'),
})
```

The `load` function takes an Emscripten module factory and returns a
typed `HvmApi`. The `moduleFn` is a dynamic import that points to
the compiled WASM glue code (built by make.tree).

You can pass `overrides` to customize Emscripten behavior:

```ts
const api = await load({
  moduleFn: () => import('./host/hvm/wasm/hvm.mjs'),
  overrides: {
    locateFile: (path: string) => `/assets/${path}`,
  },
})
```

### Initializing HVM

```ts
api.init({ threads: 1, debug: false, silent: true, steps: 0 })
```

Call `init` before any other API method. `threads` controls worker
count (WASM is usually single-threaded). `steps` limits reduction
steps (0 = unlimited).

### Loading a Program

```ts
const result = api.prepareText({
  srcPath: 'main.hvm',
  srcText: '@main = 42',
})

if (!result.success) {
  throw new Error('Parse failed')
}

const mainRef = api.termNewRef(result.mainId)
```

`prepareText` parses HVM source into the runtime's book. It returns
the main definition's ID, which you use to create a REF term.

### Evaluating a Term

```ts
const normalized = api.normalize(mainRef)
```

`normalize` reduces a term to strong normal form. For head reduction
only (enough to see the outermost constructor), use `wnf` instead.

### Reading Results

Use `fromTerm` to convert an HVM term back to a JS value:

```ts
import { fromTerm } from './code/hvm/wasm/marshal'

const value = fromTerm({ ctx: marshalCtx, term: normalized })
// value = { kind: 'num', value: 42 }
```

### Setting Up the Marshal Context

The marshal context needs well-known constructor IDs. Resolve these
after loading your program:

```ts
import { HandleTable } from './code/hvm/wasm/handle'

const marshalCtx = {
  api,
  handles: new HandleTable(),
  ids: {
    boolTrue: api.tableFind({ name: 'True' }),
    boolFalse: api.tableFind({ name: 'False' }),
    listCons: api.tableFind({ name: 'CON' }),
    listNil: api.tableFind({ name: 'NIL' }),
    stringCons: api.tableFind({ name: 'CHR_CONS' }),
    stringNil: api.tableFind({ name: 'CHR_NIL' }),
  },
}
```

The exact constructor names depend on your HVM program's definitions.
`CON`/`NIL` are HVM's built-in list constructors. Adjust names to
match your source.

### Converting JS Values to HVM Terms

Use `toTerm` to send values into HVM:

```ts
import { toTerm } from './code/hvm/wasm/marshal'
import { hvmNum, hvmStr, hvmList } from './code/hvm/form'

const num = toTerm({ ctx: marshalCtx, value: hvmNum(42) })
const str = toTerm({ ctx: marshalCtx, value: hvmStr('hello') })
const list = toTerm({
  ctx: marshalCtx,
  value: hvmList([hvmNum(1), hvmNum(2), hvmNum(3)]),
})
```

### Running IO Programs

Programs that perform side effects use the IO protocol. The `runIo`
function interprets IO actions:

```ts
import { runIo } from './code/hvm/wasm/loop'

const ioCtx = {
  marshal: marshalCtx,
  ids: {
    ioDone: api.tableFind({ name: 'IO.done' }),
    ioCall: api.tableFind({ name: 'IO.call' }),
    ioBind: api.tableFind({ name: 'IO.bind' }),
  },
  prims: new Map([
    ['print', ({ ctx, arg }) => {
      const value = fromTerm({ ctx, term: arg })
      console.log(value)
      return hvmNull()
    }],
    ['read_file', ({ ctx, arg }) => {
      const path = fromTerm({ ctx, term: arg })
      if (path.kind !== 'str') throw new Error('Expected string')
      const content = fs.readFileSync(path.value, 'utf-8')
      return hvmStr(content)
    }],
  ]),
}

const result = runIo({ ctx: ioCtx, term: mainRef })
```

The `prims` map registers native functions that HVM can call. Each
handler receives the marshal context and an HVM term argument, and
returns an `HvmValue`.

### Handle Table

For native objects that can't be serialized into HVM terms (DOM nodes,
sockets, database connections), use the handle table:

```ts
const handles = marshalCtx.handles

// Store a native object
const id = handles.register(document.getElementById('app'))

// Pass the handle ID into HVM as a number
const term = toTerm({ ctx: marshalCtx, value: hvmHandle(id) })

// Later, in a native prim handler, retrieve it
const elem = handles.get(id) as HTMLElement
```

HVM sees handles as opaque numbers. The bridge code maps those
numbers back to real objects.

### Cleanup

```ts
api.free()
marshalCtx.handles.clear()
```

Call `free` when done to release HVM's heap memory.

## Value Types

All platforms share the same value type structure:

| Kind | TypeScript | Swift | Kotlin | Rust |
|------|-----------|-------|--------|------|
| num | `{ kind: 'num', value: number }` | `.num(UInt32)` | `Num(value: Int)` | `Num(u32)` |
| str | `{ kind: 'str', value: string }` | `.str(String)` | `Str(value: String)` | `Str(String)` |
| bool | `{ kind: 'bool', value: boolean }` | `.bool(Bool)` | `Bool(value: Boolean)` | `Bool(bool)` |
| list | `{ kind: 'list', value: [...] }` | `.list([HvmValue])` | `List(value: List<HvmValue>)` | `List(Vec<HvmValue>)` |
| handle | `{ kind: 'handle', id: number }` | `.handle(UInt32)` | `Handle(id: Int)` | `Handle(u32)` |
| null | `{ kind: 'null' }` | `.null` | `Null` | `Null` |

## iOS (Swift)

The iOS bridge follows the same pattern. Import the HVM C module via
`module.modulemap`:

```swift
import HVM

let api = HvmApi()
api.initialize(input: InitInput(threads: 1))

var mainId: UInt32 = 0
let result = api.prepareText(input: PrepareTextInput(
  srcPath: "main.hvm",
  srcText: "@main = 42"
))

let mainRef = api.termNewRef(result.mainId)
let normalized = api.normalize(mainRef)
```

Marshaling and IO work identically to WASM. See `ios/marshal.swift`
and `ios/loop.swift`.

## Android (Kotlin + JNI)

The Android bridge uses JNI. Load the native library first:

```kotlin
System.loadLibrary("hvm")

HvmNative.init(threads = 1u, debug = false, silent = true, steps = 0)
val (mainId, ok) = HvmNative.prepareText("main.hvm", "@main = 42")
val mainRef = HvmNative.termNewRef(mainId)
val result = HvmNative.normalize(mainRef)
```

The `bind.c` file implements JNI native methods that call the HVM C
API. The `handle.c` file manages JNI global refs to prevent Kotlin
objects from being garbage collected while HVM holds references.

## Server (Rust)

The server bridge uses `extern "C"` FFI:

```rust
use flow::hvm::server::{HvmApi, InitInput};

let api = HvmApi::new();
api.init(InitInput { threads: 1, debug: false, silent: true, steps: 0 });

let (main_id, ok) = api.prepare_text("main.hvm", "@main = 42");
let main_ref = api.term_new_ref(main_id);
let result = api.normalize(main_ref);
```

The Rust handle table uses `Arc<dyn Any + Send + Sync>` wrapped in a
`Mutex` for thread safety.

## IO Protocol

All platforms implement the same IO protocol. HVM programs produce
IO action terms:

```
IO.done(value)           -- return a value, end the IO chain
IO.call(name, arg, cont) -- call native prim `name` with `arg`,
                            pass result to continuation `cont`
IO.bind(action, cont)    -- run `action`, pass result to `cont`
```

The bridge's `runIo` function pattern-matches on these constructors
in a loop. When it encounters `IO.call`, it looks up the primitive
name in the dispatch table, runs the native function, converts the
result to an HVM term, and feeds it to the continuation.

## Build Artifacts

The bridge code expects compiled artifacts in `./host/hvm/<platform>/`:

- `host/hvm/wasm/hvm.mjs` + `hvm.wasm`: Emscripten WASM build
- `host/hvm/ios/libhvm.a` + `hvm_lib.h`: iOS static library
- `host/hvm/android/libhvm.so` + `hvm_lib.h`: Android shared library
- `host/hvm/linux/libhvm.a` + `hvm_lib.h`: Linux/macOS/Windows
  static library

These are produced by make.tree's build scripts. Set
`HVM_OUTPUT_PATH` to customize the output location.
