# Building the HVM Library

How to install prerequisites and build `libhvm` for each platform.

## Quick Start

```bash
cd deck/term/deck/make.tree

# Build all platforms
npx tsx code/make/hvm/build.ts

# Build one platform
npx tsx code/make/hvm/build.ts macos
npx tsx code/make/hvm/build.ts ios
npx tsx code/make/hvm/build.ts android
npx tsx code/make/hvm/build.ts wasm
npx tsx code/make/hvm/build.ts server
npx tsx code/make/hvm/build.ts windows

# Build multiple
npx tsx code/make/hvm/build.ts macos ios wasm
```

Output goes to `code/make/hvm/build/<platform>/`.

## Prerequisites (All Platforms)

### Node.js and tsx

All build scripts are TypeScript, run with `tsx`.

```bash
# Install Node.js (v18+)
# macOS
brew install node

# Linux (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# Windows
winget install OpenJS.NodeJS.LTS

# Install tsx globally (or use npx)
npm install -g tsx
```

### HVM4 Fork

The build scripts expect the HVM4 fork at `../../fork-HVM4/clang`
relative to `make.tree/`. If the fork is elsewhere, set `HVM_SRC`:

```bash
HVM_SRC=/path/to/fork-HVM4/clang npx tsx code/make/hvm/build.ts macos
```

## Platform: macOS

### Prerequisites

```bash
# Xcode Command Line Tools (includes clang, ar, lipo)
xcode-select --install

# Verify
clang --version
ar --version
```

That is all. macOS ships with everything needed.

### Build

```bash
npx tsx code/make/hvm/build.ts macos
```

### Options

| Env var      | Default       | Description                          |
| ------------ | ------------- | ------------------------------------ |
| `MACOS_ARCH` | `"universal"` | `"arm64"`, `"x86_64"`, `"universal"` |

```bash
# arm64 only (faster, smaller)
MACOS_ARCH=arm64 npx tsx code/make/hvm/build.ts macos
```

### Output

```
code/make/hvm/build/macos/libhvm.a   (~220KB arm64, ~440KB universal)
```

## Platform: iOS

### Prerequisites

```bash
# Full Xcode (not just Command Line Tools)
# Install from the Mac App Store, or:
xcode-select --install

# Verify iOS SDK is available
xcrun --sdk iphoneos --show-sdk-path
xcrun --sdk iphonesimulator --show-sdk-path
```

You need the full Xcode app (not just command line tools) because the
iOS and simulator SDKs are bundled with Xcode.

### Build

```bash
npx tsx code/make/hvm/build.ts ios
```

### Options

| Env var           | Default  | Description                      |
| ----------------- | -------- | -------------------------------- |
| `IOS_MIN_VERSION` | `"16.0"` | Minimum iOS deployment target    |
| `HEAP_CAP_BITS`   | `"30"`   | Heap size (2^30 = 8GB virtual)   |
| `MAX_THREADS`     | `"4"`    | Worker threads for normalization |

```bash
# Target older devices with smaller heap
HEAP_CAP_BITS=28 npx tsx code/make/hvm/build.ts ios
```

### Output

```
code/make/hvm/build/ios/HVM.xcframework/
```

Drop the `.xcframework` into an Xcode project. It contains both device
(arm64) and simulator (arm64) slices.

## Platform: Android

### Prerequisites

1. **Android NDK.** Install via Android Studio or command line:

```bash
# Via Android Studio:
# SDK Manager → SDK Tools → NDK (Side by side)

# Via command line (sdkmanager):
sdkmanager "ndk;27.0.12077973"

# Verify
ls ~/Library/Android/sdk/ndk/
```

The build script auto-detects the NDK at
`~/Library/Android/sdk/ndk/<version>`. If your NDK is elsewhere, set
`ANDROID_NDK`:

```bash
ANDROID_NDK=/path/to/ndk npx tsx code/make/hvm/build.ts android
```

### Build

```bash
npx tsx code/make/hvm/build.ts android
```

### Options

| Env var         | Default | Description                        |
| --------------- | ------- | ---------------------------------- |
| `ANDROID_NDK`   | auto    | Path to NDK root                   |
| `ANDROID_API`   | `"26"`  | Minimum API level (26 = Android 8) |
| `HEAP_CAP_BITS` | `"30"`  | Heap size (2^30 = 8GB virtual)     |
| `MAX_THREADS`   | `"4"`   | Worker threads                     |

### Output

```
code/make/hvm/build/android/
  arm64-v8a/libhvm.so
  x86_64/libhvm.so
```

Copy into your Android project at `app/src/main/jniLibs/`.

## Platform: WASM

### Prerequisites

1. **Emscripten SDK (emsdk):**

```bash
# Clone emsdk
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk

# Install and activate latest
./emsdk install latest
./emsdk activate latest

# Add to shell (add to ~/.zshrc or ~/.bashrc for persistence)
source ./emsdk_env.sh

# Verify
emcc --version
```

2. **wasm-opt (optional, for post-build optimization):**

```bash
# macOS
brew install binaryen

# Linux
sudo apt install binaryen

# Verify
wasm-opt --version
```

If `wasm-opt` is not installed, the build still succeeds. The
optimization step is skipped.

### Build

```bash
npx tsx code/make/hvm/build.ts wasm
```

### Options

| Env var         | Default | Description                     |
| --------------- | ------- | ------------------------------- |
| `HEAP_CAP_BITS` | `"26"`  | Heap size (2^26 = 512MB virtual) |

### Output

```
code/make/hvm/build/wasm/
  hvm.mjs          (JS glue module)
  hvm.wasm         (WASM binary, ~50-70KB)
  hvm.opt.wasm     (optimized, if wasm-opt available)
```

## Platform: Server (Linux)

### Prerequisites

```bash
# Ubuntu/Debian
sudo apt install clang

# Fedora/RHEL
sudo dnf install clang

# macOS (already installed with Xcode tools)
clang --version

# Verify
clang --version
ar --version
```

### Build

```bash
npx tsx code/make/hvm/build.ts server
```

### Options

| Env var         | Default  | Description                         |
| --------------- | -------- | ----------------------------------- |
| `CC`            | `clang`  | C compiler (`clang`, `gcc`)         |
| `HEAP_CAP_BITS` | `"38"`   | Heap size (2^38 = 256GB virtual)    |
| `MAX_THREADS`   | `"64"`   | Worker threads for normalization    |

```bash
# Use gcc instead
CC=gcc npx tsx code/make/hvm/build.ts server

# Smaller heap for constrained environments
HEAP_CAP_BITS=32 MAX_THREADS=8 npx tsx code/make/hvm/build.ts server
```

### Output

```
code/make/hvm/build/server/libhvm.a   (~220KB)
```

Link into your application:

```bash
clang -O2 my_app.c -L code/make/hvm/build/server -lhvm -lpthread -ldl -lm -o my_app
```

## Platform: Windows

### Prerequisites

**Option A: clang-cl (recommended).** LLVM's MSVC-compatible compiler.
Supports all C11 features HVM4 uses.

```powershell
# Via Visual Studio Installer:
# Install "C++ Clang tools for Windows" workload

# Or via winget:
winget install LLVM.LLVM

# Or via chocolatey:
choco install llvm

# Verify
clang-cl --version
```

**Option B: MSVC (cl.exe).** Requires Visual Studio 2022 17.5+ with
`/std:c17` for C11 atomics support.

```powershell
# Install Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# Open "Developer Command Prompt" or "Developer PowerShell"
# to get cl.exe in PATH

# Verify
cl
```

Both options require the MSVC `lib.exe` tool for creating static
libraries. It comes with Visual Studio Build Tools.

### Build

```bash
npx tsx code/make/hvm/build.ts windows
```

### Options

| Env var         | Default      | Description                         |
| --------------- | ------------ | ----------------------------------- |
| `CC`            | `"clang-cl"` | Compiler (`"clang-cl"` or `"cl"`)   |
| `HEAP_CAP_BITS` | `"38"`       | Heap size (2^38 = 256GB virtual)    |
| `MAX_THREADS`   | `"64"`       | Worker threads                      |
| `BUILD_DLL`     | `"0"`        | Set `"1"` to also build `hvm.dll`   |

```powershell
# Use MSVC
$env:CC="cl"; npx tsx code/make/hvm/build.ts windows

# Build DLL too
$env:BUILD_DLL="1"; npx tsx code/make/hvm/build.ts windows
```

### Output

```
code/make/hvm/build/windows/
  hvm.lib    (static library)
  hvm.dll    (shared library, if BUILD_DLL=1)
```

## Troubleshooting

### "Cannot find fork-HVM4"

The build scripts look for the fork at `../../fork-HVM4/clang` relative
to `make.tree/`. If it is elsewhere:

```bash
HVM_SRC=/absolute/path/to/clang npx tsx code/make/hvm/build.ts macos
```

### "lib.c: No such file"

The fork needs the `add-lib-entry-point` branch (PR 5) merged. Check
that `clang/lib.c` and `clang/hvm_lib.h` exist in the fork.

### "Cannot find Android NDK"

Set the `ANDROID_NDK` env var to point to the NDK root:

```bash
ANDROID_NDK=$HOME/Library/Android/sdk/ndk/27.0.12077973 npx tsx code/make/hvm/build.ts android
```

### "emcc: command not found"

Source the emsdk environment before building WASM:

```bash
source /path/to/emsdk/emsdk_env.sh
npx tsx code/make/hvm/build.ts wasm
```

### "mmap fails / Memory allocation failed"

Reduce `HEAP_CAP_BITS`. The default (38) reserves 256GB of virtual
address space. Mobile and constrained systems need smaller values:

| Environment     | Suggested `HEAP_CAP_BITS` |
| --------------- | ------------------------- |
| Server (64GB+)  | 38 (default)              |
| Desktop         | 34-38                     |
| Mobile (iOS)    | 28-30                     |
| Mobile (Android)| 28-30                     |
| WASM            | 24-26                     |
