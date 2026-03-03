/**
 * Node.js code generation from Core Terms.
 *
 * Wraps the generic TypeScript backend with Node.js-specific features:
 *   - Import statements for Node.js built-in modules
 *   - Platform binding resolution for case/node/ implementations
 *   - async/await support for `wait true` tasks (future)
 *
 * The base TypeScript backend stays generic (browser-compatible).
 * This variant adds Node.js platform-specific behavior.
 */

import { castBook as castBookBase } from './typescript'
import type { DockLoad } from './typescript'
import type { Book } from '@/term/form'

export type { DockLoad }

export function castBook(input: { book: Book; dock?: DockLoad[] }): string {
  return castBookBase({ book: input.book, dock: input.dock })
}
