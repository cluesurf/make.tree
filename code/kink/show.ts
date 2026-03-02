/**
 * Error formatter matching @cluesurf/kink tree-code style.
 *
 * Uses the same keyword format as kink.js (bind, site, call) with
 * chalk.js coloring via @cluesurf/show. Adds source snippets with
 * underline markers for compiler errors.
 *
 * Example output (without colors):
 *
 *   kink <type mismatch>
 *     code <0012>
 *     host <@cluesurf/term>
 *     site <code/math.tree:5:10>
 *       |
 *     5 |   back call add, loan x, text <hello>
 *       |                          ^^^^^^^^^^^^
 *     bind need, <u64>
 *     bind have, <text>
 *     bind note, <parameter `b` of `add` requires u64>
 */

import type { Kink } from '@/kink/form'
import type { Site } from '@/kink/site'

/** File loader function type (reads source file lines). */
export type LoadFn = (link: string) => string[] | undefined

/** Optional tint function for colored output. */
export type TintFn = (text: string, opts: TintOpts) => string

export type TintOpts = {
  bold?: boolean
  tone?: string
}

/** Color constants matching kink.js tree/make.ts. */
const R: TintOpts = { tone: 'red' }
const RB: TintOpts = { bold: true, tone: 'red' }
const W: TintOpts = { tone: 'white' }
const WB: TintOpts = { tone: 'whiteBright' }
const H: TintOpts = { tone: 'blackBright' }
const C: TintOpts = { tone: 'cyan' }
const M: TintOpts = { tone: 'magenta' }

/** No-op tint for plain text output. */
function plainTint(text: string): string {
  return text
}

const HOST = '@cluesurf/term'

/** Format a single error into a readable string. */
export function showKink(input: { kink: Kink, load?: LoadFn, tint?: TintFn }): string {
  const { kink } = input
  const t = input.tint ?? plainTint
  const lines: string[] = []

  // Header: kink <error message>
  const formText = showKinkForm(kink.form)
  lines.push(
    `${t('kink', R)} ${t('<', H)}${t(formText, RB)}${t('>', H)}`,
  )

  // Code
  const code = kinkCode(kink)
  lines.push(
    `  ${t('code', H)} ${t('<', H)}${t(code, C)}${t('>', H)}`,
  )

  // Host
  lines.push(
    `  ${t('host', H)} ${t(HOST, H)}`,
  )

  // Site: file:line:col
  const siteText = showSite(kink.site)
  lines.push(
    `  ${t('site', H)} ${t('<', H)}${t(siteText, WB)}${t('>', H)}`,
  )

  // Source snippet (if file loader provided)
  if (input.load) {
    const snap = showSnap(kink.site, input.load, t)
    if (snap) {
      lines.push(snap)
    }
  }

  // Message
  lines.push(
    `  ${t('bind', H)} ${t('note', W)}${t(', <', H)}${t(kink.text, M)}${t('>', H)}`,
  )

  // Extra fields as bind entries
  const rest = showKinkRest(kink, t)
  for (const line of rest) {
    lines.push(line)
  }

  return lines.join('\n')
}

/** Format multiple errors. */
export function showKinkList(input: { list: Kink[], load?: LoadFn, tint?: TintFn }): string {
  return input.list.map(k => showKink({ kink: k, load: input.load, tint: input.tint })).join('\n\n')
}

/** Format a site as "file:line:col". */
export function showSite(site: Site): string {
  if (site.form === 'brew-site') return '<generated>'
  return `${site.link}:${site.base.line}:${site.base.mark}`
}

/** Format an error form name for display. */
function showKinkForm(form: string): string {
  return form.replace(/-/g, ' ')
}

/** Map error form to a numeric code string. */
function kinkCode(kink: Kink): string {
  const codes: Record<string, string> = {
    'tree-bad-indent': '0001',
    'tree-bad-char': '0002',
    'mill-bad-keyword': '0003',
    'mill-miss-field': '0004',
    'mill-bad-sift': '0005',
    'mill-bad-rule': '0006',
    'name-miss': '0007',
    'name-double': '0008',
    'load-circle': '0009',
    'desugar-bad': '0010',
    'type-mismatch': '0011',
    'type-miss-arm': '0012',
    'type-hole-miss': '0013',
    'pure-bad': '0014',
    'emit-bad': '0015',
  }
  return codes[kink.form] ?? '0000'
}

/** Extract extra display fields from specific error types. */
function showKinkRest(kink: Kink, t: TintFn): string[] {
  const lines: string[] = []
  const k = kink as Record<string, unknown>

  if (k['need'] && k['have']) {
    lines.push(
      `  ${t('bind', H)} ${t('need', W)}${t(', <', H)}${t(String(k['need']), M)}${t('>', H)}`,
    )
    lines.push(
      `  ${t('bind', H)} ${t('have', W)}${t(', <', H)}${t(String(k['have']), M)}${t('>', H)}`,
    )
  }

  if (k['name'] && kink.form !== 'mill-bad-keyword') {
    lines.push(
      `  ${t('bind', H)} ${t('name', W)}${t(', <', H)}${t(String(k['name']), M)}${t('>', H)}`,
    )
  }

  if (k['path'] && Array.isArray(k['path'])) {
    const path = (k['path'] as string[]).join(' -> ')
    lines.push(
      `  ${t('bind', H)} ${t('path', W)}${t(', <', H)}${t(path, M)}${t('>', H)}`,
    )
  }

  if (k['rule']) {
    lines.push(
      `  ${t('bind', H)} ${t('rule', W)}${t(', <', H)}${t(String(k['rule']), M)}${t('>', H)}`,
    )
  }

  if (k['surf']) {
    lines.push(
      `  ${t('bind', H)} ${t('surf', W)}${t(', <', H)}${t(String(k['surf']), M)}${t('>', H)}`,
    )
  }

  if (k['call']) {
    lines.push(
      `  ${t('bind', H)} ${t('call', W)}${t(', <', H)}${t(String(k['call']), M)}${t('>', H)}`,
    )
  }

  if (k['term'] && kink.form === 'type-mismatch') {
    lines.push(
      `  ${t('bind', H)} ${t('term', W)}${t(', <', H)}${t(String(k['term']), M)}${t('>', H)}`,
    )
  }

  if (k['fill']) {
    lines.push(
      `  ${t('bind', H)} ${t('fill', W)}${t(', <', H)}${t(String(k['fill']), M)}${t('>', H)}`,
    )
  }

  if (k['arms'] && Array.isArray(k['arms'])) {
    for (const arm of k['arms'] as string[]) {
      lines.push(
        `  ${t('bind', H)} ${t('arm', W)}${t(', <', H)}${t(arm, M)}${t('>', H)}`,
      )
    }
  }

  if (k['prev']) {
    const prev = k['prev'] as Site
    const prevText = showSite(prev)
    lines.push(
      `  ${t('bind', H)} ${t('prev', W)}${t(', <', H)}${t(prevText, M)}${t('>', H)}`,
    )
  }

  return lines
}

/**
 * Render a source snippet with underline markers.
 *
 * Example output:
 *     |
 *   5 |   back call add, loan x, text <hello>
 *     |                          ^^^^^^^^^^^^
 */
function showSnap(site: Site, load: LoadFn, t: TintFn): string | undefined {
  if (site.form === 'brew-site') return undefined
  const lines = load(site.link)
  if (!lines) return undefined

  const lineIdx = site.base.line - 1
  if (lineIdx < 0 || lineIdx >= lines.length) return undefined

  const srcLine = lines[lineIdx]
  if (!srcLine) return undefined

  const lineNum = String(site.base.line)
  const pad = ' '.repeat(lineNum.length + 2)

  const markBase = Math.max(0, site.base.mark - 1)
  const markHead = site.head.line === site.base.line
    ? Math.max(markBase + 1, site.head.mark - 1)
    : srcLine.length

  const under =
    ' '.repeat(markBase) + '^'.repeat(markHead - markBase)

  const result = [
    `${pad}${t('|', H)}`,
    `  ${t(lineNum, H)} ${t('|', H)} ${srcLine}`,
    `${pad}${t('|', H)} ${t(under, RB)}`,
  ]

  return result.join('\n')
}
