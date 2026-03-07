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

export type RoleEntry = {
  pattern: string
  miss: Array<string>
}

export type RoleRule = {
  name: string
  take: Array<RoleEntry>
}

export type RoleConfig = {
  rules: Array<RoleRule>
}

export type DeckEnv = {
  /** Project root directory (where deck.tree lives). */
  root: string
  /** Workspace package directories: name → absolute path. */
  workspaces: Map<string, string>
  /** Whether packages are installed (link/ exists). */
  installed: boolean
  /** Parsed role configuration from the role file. */
  role?: RoleConfig
  /** Compilation target for conditional platform resolution. */
  target?: string
}

/**
 * Discover the deck environment for a project.
 * Reads deck.tree, scans for workspaces, checks install state.
 * Parses the role file if the manifest has a `role` directive.
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

  // Read deck.tree manifest and look for role directive
  let role: RoleConfig | undefined
  const manifestPath = path.join(root, 'deck.tree')
  if (fs.existsSync(manifestPath)) {
    try {
      const text = fs.readFileSync(manifestPath, 'utf-8')
      const rolePath = readManifestField({ text, field: 'role' })
      if (rolePath) {
        role = loadRoleConfig({ root, rolePath })
      }
    } catch {
      // Ignore manifest read errors
    }
  }

  return { root, workspaces, installed, role }
}

/**
 * Determine which mill should process a file.
 * Checks role config first, falls back to path-based defaults.
 */
export function resolveMillName(input: {
  filePath: string
  env: DeckEnv
}): string {
  const { filePath, env } = input
  const basename = path.basename(filePath)

  // Hardcoded: deck.tree always uses the deck mill
  if (basename === 'deck.tree') return 'deck'
  // Hardcoded: note.tree always uses the note mill
  if (basename === 'note.tree') return 'note'

  // Check role config for pattern match
  if (env.role) {
    const matched = matchRole({ filePath, config: env.role })
    if (matched) return matched
  }

  // Path-based fallback
  const rel = path.relative(env.root, filePath)
  if (rel.startsWith('code/') || rel.startsWith('code\\')) return 'code'
  if (rel.startsWith('book/') || rel.startsWith('book\\')) return 'book'
  if (rel.startsWith('line/') || rel.startsWith('line\\')) return 'line'

  return 'code'
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
/**
 * Map compilation target to the platform directory name used in native/.
 */
const TARGET_PLATFORM: Record<string, string> = {
  typescript: 'node',
  rust: 'rust',
  kotlin: 'kotlin',
  swift: 'swift',
  hvm: 'hvm',
}

/** Known platform directory names under native/. */
const PLATFORM_NAMES = new Set(['node', 'rust', 'kotlin', 'swift', 'hvm', 'browser', 'javascript', 'shared'])

/**
 * Try to rewrite a rest path for conditional platform resolution.
 *
 * If the path contains `native/<platform>/...` and the target maps to
 * a different platform, returns the rewritten path. Otherwise null.
 *
 * Example: rest="code/native/node/file", target="rust"
 *   → "code/native/rust/file"
 */
export function rewritePlatformPath(input: { rest: string; target: string }): string | null {
  const { rest, target } = input
  const targetPlatform = TARGET_PLATFORM[target]
  if (!targetPlatform) return null

  // Match: .../native/<platform>/...
  const match = rest.match(/^(.*\/native\/)([^/]+)(\/.*)?$/)
  if (!match) return null

  const [, prefix, platform, suffix] = match
  if (!PLATFORM_NAMES.has(platform!)) return null
  if (platform === targetPlatform) return null
  if (platform === 'shared') return null

  return `${prefix}${targetPlatform}${suffix ?? ''}`
}

export function resolvePackageFile(input: {
  loadPath: string
  env: DeckEnv
}): string | null {
  const { loadPath, env } = input

  // Parse: @scope/name/rest
  const parsed = parseLoadPath({ loadPath })
  if (!parsed) return null

  const { fullName, rest } = parsed

  // Build list of rest paths to try: target platform first, then original
  const restPaths: string[] = []
  if (env.target && rest) {
    const rewritten = rewritePlatformPath({ rest, target: env.target })
    if (rewritten) restPaths.push(rewritten)
  }
  restPaths.push(rest)

  // 1. Check workspace packages
  const wsDir = env.workspaces.get(fullName)
  if (wsDir) {
    for (const r of restPaths) {
      const result = resolveInDir({ dir: wsDir, rest: r })
      if (result) return result
    }
    return null
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
    for (const r of restPaths) {
      const result = resolveInDir({ dir: realDir, rest: r })
      if (result) return result
    }
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
 *   1. dir/rest.tree (preferred: collapsed module file)
 *   2. dir/rest/base.tree (legacy: directory with base.tree entry)
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

  // Try dir/rest.tree (preferred convention)
  const directTree = path.join(dir, `${rest}.tree`)
  if (fs.existsSync(directTree)) return directTree

  // Try dir/rest/base.tree (legacy fallback)
  const baseTree = path.join(dir, rest, 'base.tree')
  if (fs.existsSync(baseTree)) return baseTree

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
  target?: string
}): {
  readFile: (path: string) => string
  resolvePath: (fromFile: string, loadPath: string) => string | null
  parse: (input: { file: string; text: string }) => { tree: any } | null
  resolveMillName: (filePath: string) => string
  target?: string
} {
  const { env, parse, target } = input
  if (target) env.target = target

  return {
    readFile: (filePath: string) => fs.readFileSync(filePath, 'utf-8'),

    resolvePath: (fromFile: string, loadPath: string) => {
      // Package imports go through deck.tree resolution
      if (loadPath.startsWith('@')) {
        return resolvePackageFile({ loadPath, env })
      }

      // Relative imports use filesystem resolution
      const dir = path.dirname(fromFile)

      // Build list of paths to try: target platform first, then original
      const paths = [loadPath]
      if (target) {
        const rewritten = rewritePlatformPath({ rest: loadPath, target })
        if (rewritten) paths.unshift(rewritten)
      }

      for (const lp of paths) {
        // Try dir/loadPath.tree first (preferred: flat file)
        const directTree = path.join(dir, `${lp}.tree`)
        if (fs.existsSync(directTree)) return directTree
        // Try dir/loadPath/base.tree (directory entry)
        const baseTree = path.join(dir, lp, 'base.tree')
        if (fs.existsSync(baseTree)) return baseTree
        // Try dir/loadPath/note.tree (submodule index)
        const noteTree = path.join(dir, lp, 'note.tree')
        if (fs.existsSync(noteTree)) return noteTree
        // Try dir/loadPath (exact path, already has extension)
        if (fs.existsSync(path.join(dir, lp))) return path.join(dir, lp)
      }
      return null
    },

    resolveMillName: (filePath: string) =>
      resolveMillName({ filePath, env }),

    parse,

    target,
  }
}

/**
 * Read a simple field value from a deck.tree manifest text.
 * Only reads top-level indented lines (2-space indent).
 */
function readManifestField(input: {
  text: string
  field: string
}): string | null {
  const { text, field } = input
  const prefix = `${field} `
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim()
    }
  }
  return null
}

/**
 * Load and parse a role file from disk.
 */
function loadRoleConfig(input: {
  root: string
  rolePath: string
}): RoleConfig | undefined {
  const { root, rolePath } = input

  // Try rolePath.tree, then rolePath/base.tree
  let file = path.resolve(root, `${rolePath}.tree`)
  if (!fs.existsSync(file)) {
    file = path.resolve(root, rolePath, 'base.tree')
    if (!fs.existsSync(file)) {
      file = path.resolve(root, rolePath)
      if (!fs.existsSync(file)) return undefined
    }
  }

  try {
    const text = fs.readFileSync(file, 'utf-8')
    return parseRoleText({ text, root })
  } catch {
    return undefined
  }
}

/**
 * Parse a role file text into a RoleConfig.
 */
function parseRoleText(input: {
  text: string
  root: string
}): RoleConfig {
  const { text, root } = input
  const lines = text.split('\n')
  const rules: Array<RoleRule> = []

  let i = 0
  while (i < lines.length) {
    const raw = lines[i]!
    const indent = raw.length - raw.trimStart().length
    const line = raw.trim()
    i++

    if (!line || line.startsWith('#')) continue

    // Skip load blocks
    if (line.startsWith('load ')) {
      while (i < lines.length) {
        const nextRaw = lines[i]!
        const nextIndent = nextRaw.length - nextRaw.trimStart().length
        const nextLine = nextRaw.trim()
        if (!nextLine || nextLine.startsWith('#')) { i++; continue }
        if (nextIndent <= indent) break
        i++
      }
      continue
    }

    if (line.startsWith('role ')) {
      const name = line.slice(5).trim()
      const take: Array<RoleEntry> = []

      while (i < lines.length) {
        const nextRaw = lines[i]!
        const nextIndent = nextRaw.length - nextRaw.trimStart().length
        const nextLine = nextRaw.trim()
        if (!nextLine || nextLine.startsWith('#')) { i++; continue }
        if (nextIndent <= indent) break

        if (nextLine.startsWith('take ')) {
          const pattern = expandTilde({
            pattern: nextLine.slice(5).trim(),
            root,
          })
          const missPatterns: Array<string> = []
          const takeIndent = nextIndent
          i++

          while (i < lines.length) {
            const missRaw = lines[i]!
            const missIndent = missRaw.length - missRaw.trimStart().length
            const missLine = missRaw.trim()
            if (!missLine || missLine.startsWith('#')) { i++; continue }
            if (missIndent <= takeIndent) break
            if (missLine.startsWith('miss ')) {
              missPatterns.push(
                expandTilde({
                  pattern: missLine.slice(5).trim(),
                  root,
                }),
              )
            }
            i++
          }

          take.push({ pattern, miss: missPatterns })
          continue
        }

        i++
      }

      rules.push({ name, take })
      continue
    }
  }

  return { rules }
}

/**
 * Match a file path against role rules.
 */
function matchRole(input: {
  filePath: string
  config: RoleConfig
}): string | null {
  for (const rule of input.config.rules) {
    for (const entry of rule.take) {
      if (globMatch({ pattern: entry.pattern, path: input.filePath })) {
        let excluded = false
        for (const miss of entry.miss) {
          if (globMatch({ pattern: miss, path: input.filePath })) {
            excluded = true
            break
          }
        }
        if (!excluded) return rule.name
      }
    }
  }
  return null
}

function expandTilde(input: {
  pattern: string
  root: string
}): string {
  if (input.pattern.startsWith('~/')) {
    return input.root + input.pattern.slice(1)
  }
  return input.pattern
}

function globMatch(input: {
  pattern: string
  path: string
}): boolean {
  const regex = globToRegex({ pattern: input.pattern })
  return regex.test(input.path)
}

function globToRegex(input: { pattern: string }): RegExp {
  let result = ''
  let i = 0
  const pat = input.pattern

  while (i < pat.length) {
    const ch = pat[i]!

    if (ch === '*') {
      if (pat[i + 1] === '*') {
        if (pat[i + 2] === '/') {
          result += '(?:.+/)?'
          i += 3
        } else {
          result += '.*'
          i += 2
        }
      } else {
        result += '[^/]*'
        i++
      }
    } else if (ch === '?') {
      result += '[^/]'
      i++
    } else if (ch === '{') {
      const end = pat.indexOf('}', i)
      if (end === -1) {
        result += '\\{'
        i++
      } else {
        const inner = pat.slice(i + 1, end)
        const alts = inner.split(',').map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        result += '(?:' + alts.join('|') + ')'
        i = end + 1
      }
    } else if ('.+^$|()\\'.includes(ch)) {
      result += '\\' + ch
      i++
    } else {
      result += ch
      i++
    }
  }

  return new RegExp('^' + result + '$')
}
