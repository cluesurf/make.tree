/**
 * Source location tracking for error reporting and debugging.
 *
 * Every AST node (both Surface and Core) carries a Site so errors
 * always point back to the original .tree source file.
 */

/** A position in a source file (line and column, 1-indexed). */
export type Slot = {
  line: number
  mark: number
}

/** A location in source. Either a real file location or a generated sentinel. */
export type Site = BrewSite | CardSite

/** A generated/synthetic site with no real source location. */
export type BrewSite = {
  form: 'brew-site'
}

/** A real source file location with file path and start/end positions. */
export type CardSite = {
  form: 'card-site'
  link: string
  base: Slot
  head: Slot
}

/** A range of source text with the actual text content. */
export type SiteText = {
  site: Site
  text: string
}

/** Create a CardSite from file path and positions. */
export function makeSite(input: {
  link: string
  base: Slot
  head: Slot
}): CardSite {
  return {
    form: 'card-site',
    link: input.link,
    base: input.base,
    head: input.head,
  }
}

/** Create a Site that spans two CardSites. */
export function joinSite(input: { base: CardSite, head: CardSite }): CardSite {
  return {
    form: 'card-site',
    link: input.base.link,
    base: input.base.base,
    head: input.head.head,
  }
}

/** A "no location" sentinel for generated nodes. */
export const VOID_SITE: BrewSite = {
  form: 'brew-site',
}

/** Check if a Site is the brew sentinel. */
export function testBrewSite(site: Site): site is BrewSite {
  return site.form === 'brew-site'
}

/** Check if a Site is a real card site. */
export function testCardSite(site: Site): site is CardSite {
  return site.form === 'card-site'
}
