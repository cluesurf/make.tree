/**
 * Content hashing for incremental compilation.
 *
 * Uses SHA-256 truncated to 16 hex chars. This is sufficient for
 * change detection (not security) and keeps cache paths short.
 */

import { createHash } from 'crypto'

export function hashContent(input: { content: string }): string {
  return createHash('sha256')
    .update(input.content)
    .digest('hex')
    .slice(0, 16)
}
