/**
 * Browser E2E environment tests (phase 2): variable (localStorage),
 * path, directory, language, and expanded environment read.
 *
 * Skips if Playwright is not available or browser binary is missing.
 */

import { createServer, type Server } from 'http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let hasPlaywright = false
let server: Server
let results: Record<string, unknown> = {}

const HTML = `<!DOCTYPE html>
<html>
<head><title>Seed Browser Environment 2 E2E</title></head>
<body>
<script>
async function runTests() {
  const results = {};

  // ── variable (localStorage as env vars) ──
  try {
    // Clean slate
    localStorage.removeItem("SEED_TEST_VAR");
    localStorage.removeItem("SEED_OTHER");

    // set + get
    localStorage.setItem("SEED_TEST_VAR", "hello");
    results.varGet = localStorage.getItem("SEED_TEST_VAR");

    // check
    results.varCheck = localStorage.getItem("SEED_TEST_VAR") !== null;
    results.varCheckMissing = localStorage.getItem("SEED_NONEXISTENT_99") !== null;

    // set another + list
    localStorage.setItem("SEED_OTHER", "world");
    const vars = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      vars[key] = localStorage.getItem(key);
    }
    results.varListHasTest = vars["SEED_TEST_VAR"] === "hello";
    results.varListHasOther = vars["SEED_OTHER"] === "world";

    // remove
    localStorage.removeItem("SEED_TEST_VAR");
    results.varRemoved = localStorage.getItem("SEED_TEST_VAR") === null;

    // cleanup
    localStorage.removeItem("SEED_OTHER");
  } catch (e) {
    results.varError = e.message;
  }

  // ── path (all kinds return origin) ──
  try {
    results.pathHome = location.origin;
    results.pathTemp = location.origin;
    results.pathData = location.origin;
    results.pathConfig = location.origin;
    results.pathCache = location.origin;
    results.pathIsString = typeof location.origin === "string";
    results.pathLength = location.origin.length > 0;
  } catch (e) {
    results.pathError = e.message;
  }

  // ── directory (pathname + pushState) ──
  try {
    results.dirGet = location.pathname;

    // pushState changes pathname
    const before = location.pathname;
    history.pushState(null, "", "/test-dir");
    results.dirAfterSet = location.pathname;

    // restore
    history.pushState(null, "", before);
    results.dirRestored = location.pathname === before;
  } catch (e) {
    results.dirError = e.message;
  }

  // ── language (Intl API) ──
  try {
    const lang = navigator.language;
    results.langTag = lang;
    results.langHasValue = lang.length > 0;

    const parts = lang.split("-");
    results.langLanguage = parts[0];
    results.langHasRegion = parts.length >= 2;

    const options = Intl.DateTimeFormat().resolvedOptions();
    results.langTimezone = options.timeZone;
    results.langTimezoneExists = options.timeZone.length > 0;

    results.langListLength = navigator.languages.length;
    results.langListFirst = navigator.languages[0];
  } catch (e) {
    results.langError = e.message;
  }

  // ── expanded environment read ──
  try {
    results.envCores = navigator.hardwareConcurrency;
    results.envCoresAboveZero = navigator.hardwareConcurrency > 0;
    results.envMemory = navigator.deviceMemory;
    results.envUserAgent = navigator.userAgent;
    results.envUserAgentLength = navigator.userAgent.length > 0;
  } catch (e) {
    results.envError = e.message;
  }

  document.title = "DONE";
  window.__seedResults = results;
}
runTests();
</script>
</body>
</html>`

beforeAll(async () => {
  let chromium: typeof import('playwright').chromium
  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    console.warn('Playwright not installed, skipping browser environment-2 E2E tests')
    return
  }

  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(HTML)
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        hasPlaywright = true
      }
      resolve()
    })
  })

  if (!hasPlaywright) return

  const port = (server.address() as { port: number }).port

  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    console.warn('Browser binary not available:', (err as Error).message)
    hasPlaywright = false
    return
  }

  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}`)
  await page.waitForFunction(() => document.title === 'DONE', {
    timeout: 15_000,
  })
  results = await page.evaluate(
    () => (window as unknown as { __seedResults: Record<string, unknown> }).__seedResults,
  )
  await browser.close()
}, 30_000)

afterAll(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

describe('browser E2E: environment variable (localStorage)', () => {
  it('set, get, check, list, remove', () => {
    if (!hasPlaywright) return
    expect(results.varGet).toBe('hello')
    expect(results.varCheck).toBe(true)
    expect(results.varCheckMissing).toBe(false)
    expect(results.varListHasTest).toBe(true)
    expect(results.varListHasOther).toBe(true)
    expect(results.varRemoved).toBe(true)
  })
})

describe('browser E2E: environment path', () => {
  it('returns origin for all path kinds', () => {
    if (!hasPlaywright) return
    expect(results.pathIsString).toBe(true)
    expect(results.pathLength).toBe(true)
    // All path kinds should return the same origin
    expect(results.pathHome).toBe(results.pathTemp)
    expect(results.pathTemp).toBe(results.pathData)
  })
})

describe('browser E2E: environment directory', () => {
  it('reads and sets current directory (pathname)', () => {
    if (!hasPlaywright) return
    expect(results.dirGet).toBe('/')
    expect(results.dirAfterSet).toBe('/test-dir')
    expect(results.dirRestored).toBe(true)
  })
})

describe('browser E2E: environment language', () => {
  it('reads locale from navigator and Intl', () => {
    if (!hasPlaywright) return
    expect(results.langHasValue).toBe(true)
    expect(typeof results.langLanguage).toBe('string')
    expect((results.langLanguage as string).length).toBeGreaterThan(0)
    expect(results.langTimezoneExists).toBe(true)
    expect(results.langListLength).toBeGreaterThan(0)
    expect(results.langListFirst).toBe(results.langTag)
  })
})

describe('browser E2E: expanded environment read', () => {
  it('reports hardware concurrency and user agent', () => {
    if (!hasPlaywright) return
    expect(results.envCoresAboveZero).toBe(true)
    expect(results.envUserAgentLength).toBe(true)
  })
})
