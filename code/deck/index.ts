/**
 * Package manager bridge: lets the compiler resolve package imports
 * through the deck.tree package manager's linking layout.
 *
 * The compiler knows about the package manager. The package manager
 * does not know about the compiler.
 *
 * Resolution order for `load @scope/name/path`:
 *   1. Workspace packages (local deck/ directory)
 *   2. Installed packages (link/ directory, deck.tree layout)
 *   3. Stdlib fallback (hardcoded base.tree/bind.tree)
 *
 * The deck.tree package manager installs packages into:
 *   link/.seed/@scope/name@version/   (flat store)
 *   link/@scope/name/                 (top-level symlinks)
 *
 * The compiler resolves `load @scope/name/code/foo` to:
 *   link/@scope/name/code/foo/base.tree
 *   or link/@scope/name/code/foo.tree
 */

import * as fs from 'fs'
import * as path from 'path'

export type DeckEnv = {
  /** Project root directory (where deck.tree lives). */
  root: string
  /** Workspace package directories: name → absolute path. */
  workspaces: Map<string, string>
  /** Whether packages are installed (link/ exists). */
  installed: boolean
}

/**
 * Discover the deck environment for a project.
 * Reads deck.tree, scans for workspaces, checks install state.
 */
export function discoverDeckEnv(input: { root: string }): DeckEnv {
  const { root } = input
  const workspaces = new Map<string, string>()

  // Scan for workspace packages in deck/ directory
  const deckDir = path.join(root, 'deck')
  if (fs.existsSync(deckDir)) {
    scanWorkspaces({ dir: deckDir, workspaces })
  }

  // Check if link/ directory exists (packages installed)
  const linkDir = path.join(root, 'link')
  const installed = fs.existsSync(linkDir)

  return { root, workspaces, installed }
}

/**
 * Scan a directory tree for deck.tree manifests (workspace packages).
 * Each directory containing a deck.tree file is a workspace package.
 */
function scanWorkspaces(input: {
  dir: string
  workspaces: Map<string, string>
}): void {
  const { dir, workspaces } = input

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const subdir = path.join(dir, entry.name)
    const manifest = path.join(subdir, 'deck.tree')
    if (fs.existsSync(manifest)) {
      // Read just the deck name from the manifest
      const name = readDeckName({ file: manifest })
      if (name) {
        workspaces.set(name, subdir)
      }
    }
    // Recurse one level deeper for nested workspaces
    scanWorkspaces({ dir: subdir, workspaces })
  }
}

/**
 * Read just the package name from a deck.tree manifest.
 * Lightweight: only reads the first `deck` line.
 */
function readDeckName(input: { file: string }): string | null {
  try {
    const text = fs.readFileSync(input.file, 'utf-8')
    const match = text.match(/^deck\s+(\S+)/m)
    return match ? match[1]! : null
  } catch {
    return null
  }
}

/**
 * Resolve a package import path to a real file on disk.
 *
 * Input: loadPath like "@cluesurf/base/code/math/add"
 * Output: absolute path to the .tree file, or null
 *
 * Resolution:
 *   1. Parse: scope="@cluesurf", pkg="base", rest="code/math/add"
 *   2. Check workspace: deck/base.tree/code/math/add/base.tree
 *   3. Check link dir: link/@cluesurf/base/code/math/add/base.tree
 *   4. Try .tree extension: .../code/math/add.tree
 */
export function resolvePackageFile(input: {
  loadPath: string
  env: DeckEnv
}): string | null {
  const { loadPath, env } = input

  // Parse: @scope/name/rest
  const parsed = parseLoadPath({ loadPath })
  if (!parsed) return null

  const { fullName, rest } = parsed

  // 1. Check workspace packages
  const wsDir = env.workspaces.get(fullName)
  if (wsDir) {
    return resolveInDir({ dir: wsDir, rest })
  }

  // 2. Check installed packages (link/ directory)
  if (env.installed) {
    const linkTarget = path.join(env.root, 'link', fullName)
    // Follow symlink to actual package directory
    let realDir: string
    try {
      realDir = fs.realpathSync(linkTarget)
    } catch {
      // Package not installed or symlink broken
      realDir = linkTarget
    }
    const result = resolveInDir({ dir: realDir, rest })
    if (result) return result
  }

  return null
}

/**
 * Parse a load path into scope, package name, and rest.
 *
 * "@cluesurf/base/code/math" → { fullName: "@cluesurf/base", rest: "code/math" }
 * "@cluesurf/base"           → { fullName: "@cluesurf/base", rest: "" }
 * "base/code/math"           → null (not a package path)
 */
function parseLoadPath(input: { loadPath: string }): {
  fullName: string
  rest: string
} | null {
  const { loadPath } = input

  if (!loadPath.startsWith('@')) return null

  // @scope/name or @scope/name/rest...
  const parts = loadPath.split('/')
  if (parts.length < 2) return null

  const scope = parts[0]!
  const name = parts[1]!
  const fullName = `${scope}/${name}`
  const rest = parts.slice(2).join('/')

  return { fullName, rest }
}

/**
 * Resolve a subpath within a package directory.
 *
 * Tries in order:
 *   1. dir/rest/base.tree (standard seed convention)
 *   2. dir/rest.tree (direct file)
 *   3. dir/rest/note.tree (package index)
 */
function resolveInDir(input: {
  dir: string
  rest: string
}): string | null {
  const { dir, rest } = input

  if (!rest) {
    // Loading the package itself: look for entry point
    const note = path.join(dir, 'note.tree')
    if (fs.existsSync(note)) return note
    const base = path.join(dir, 'base.tree')
    if (fs.existsSync(base)) return base
    return null
  }

  // Try dir/rest/base.tree (standard convention)
  const baseTree = path.join(dir, rest, 'base.tree')
  if (fs.existsSync(baseTree)) return baseTree

  // Try dir/rest.tree (direct file)
  const directTree = path.join(dir, `${rest}.tree`)
  if (fs.existsSync(directTree)) return directTree

  // Try dir/rest/note.tree (submodule index)
  const noteTree = path.join(dir, rest, 'note.tree')
  if (fs.existsSync(noteTree)) return noteTree

  return null
}

/**
 * Create a LoadEnv that uses the deck.tree package manager
 * for resolving package imports, while keeping filesystem
 * resolution for relative paths.
 */
export function createDeckLoadEnv(input: {
  env: DeckEnv
  parse: (input: { file: string; text: string }) => { tree: any } | null
}): {
  readFile: (path: string) => string
  resolvePath: (fromFile: string, loadPath: string) => string | null
  parse: (input: { file: string; text: string }) => { tree: any } | null
} {
  const { env, parse } = input

  return {
    readFile: (filePath: string) => fs.readFileSync(filePath, 'utf-8'),

    resolvePath: (fromFile: string, loadPath: string) => {
      // Package imports go through deck.tree resolution
      if (loadPath.startsWith('@')) {
        return resolvePackageFile({ loadPath, env })
      }

      // Relative imports use filesystem resolution
      const dir = path.dirname(fromFile)
      // Try dir/loadPath/base.tree first (seed convention)
      const baseTree = path.join(dir, loadPath, 'base.tree')
      if (fs.existsSync(baseTree)) return baseTree
      // Try dir/loadPath.tree
      const directTree = path.join(dir, `${loadPath}.tree`)
      if (fs.existsSync(directTree)) return directTree
      // Try dir/loadPath (exact path, already has extension)
      if (fs.existsSync(path.join(dir, loadPath))) return path.join(dir, loadPath)
      return null
    },

    parse,
  }
}
