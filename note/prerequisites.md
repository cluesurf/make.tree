# Prerequisites

What to install before building HVM for each platform.

## All Platforms

```bash
brew install node
pnpm add -g tsx
```

## macOS

```bash
xcode-select --install
```

## iOS

Install the full Xcode app from the Mac App Store. Command Line Tools
alone are not enough (you need the iOS and simulator SDKs).

After installing or updating Xcode:

```bash
xcodebuild -runFirstLaunch
```

## Android

Install Android Studio from https://developer.android.com/studio.

Then install the NDK: open Android Studio > Settings > Languages &
Frameworks > Android SDK > SDK Tools > check "NDK (Side by side)" >
Apply.

Or from the command line:

```bash
sdkmanager "ndk;27.0.12077973"
```

The build script auto-detects the NDK at `~/Library/Android/sdk/ndk/`.
Set `ANDROID_NDK` if yours is elsewhere.

## WASM

```bash
brew install emscripten
brew install binaryen   # optional, for wasm-opt post-build step
```

## Linux

On a Linux machine:

```bash
# Ubuntu/Debian
sudo apt install clang

# Fedora/RHEL
sudo dnf install clang
```

From macOS via Docker:

```bash
docker build -t hvm-linux -f code/docker/linux.dockerfile .
docker run --rm \
  -v /path/to/fork-HVM4/clang:/src \
  -v $(pwd)/host/hvm/linux:/out \
  hvm-linux
```

See `code/docker/linux.dockerfile` for the image definition.

## Windows

Install one of:

- **clang-cl** (recommended): `winget install LLVM.LLVM`
- **MSVC**: Install Visual Studio 2022 Build Tools with C++ workload

Both need the MSVC `lib.exe` tool, which comes with Visual Studio Build
Tools.
