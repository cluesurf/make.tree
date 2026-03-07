/**
 * Browser E2E platform tests (phase 2): clipboard, observers, URL,
 * matchMedia, requestAnimationFrame, visibility, and history APIs.
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
<head><title>Seed Browser Platform 2 E2E</title></head>
<body>
<div id="observed" style="width:100px;height:100px;"></div>
<script>
async function runTests() {
  const results = {};

  // ── clipboard ──
  try {
    await navigator.clipboard.writeText("seed-clipboard-test");
    const text = await navigator.clipboard.readText();
    results.clipboardWrite = true;
    results.clipboardRead = text;
  } catch (e) {
    results.clipboardError = e.message;
    results.clipboardWrite = false;
  }

  // ── URL constructor ──
  try {
    const u = new URL("https://example.com:8080/path?q=1#hash");
    results.urlHostname = u.hostname;
    results.urlPort = u.port;
    results.urlPathname = u.pathname;
    results.urlSearch = u.search;
    results.urlHash = u.hash;
  } catch (e) {
    results.urlError = e.message;
  }

  // ── URLSearchParams ──
  try {
    const params = new URLSearchParams("a=1&b=2&a=3");
    results.paramsGet = params.get("a");
    results.paramsGetAll = params.getAll("a").length;
    results.paramsHas = params.has("b");
    results.paramsString = params.toString().length > 0;
  } catch (e) {
    results.paramsError = e.message;
  }

  // ── visibility ──
  try {
    results.visibilityState = document.visibilityState;
    results.hidden = document.hidden;
  } catch (e) {
    results.visibilityError = e.message;
  }

  // ── matchMedia ──
  try {
    const mq = window.matchMedia("(min-width: 1px)");
    results.matchMediaMatches = mq.matches;
    results.matchMediaMedia = mq.media;
  } catch (e) {
    results.matchMediaError = e.message;
  }

  // ── requestAnimationFrame ──
  try {
    const rafResult = await new Promise((resolve, reject) => {
      requestAnimationFrame((timestamp) => {
        resolve(typeof timestamp === "number" && timestamp >= 0);
      });
      setTimeout(() => reject(new Error("raf timeout")), 5000);
    });
    results.rafFired = rafResult;
  } catch (e) {
    results.rafError = e.message;
  }

  // ── history ──
  try {
    const initialLength = history.length;
    history.pushState({ page: 1 }, "", "?page=1");
    results.historyPushed = history.length >= initialLength;
    results.historyState = history.state?.page;
    history.replaceState({ page: 2 }, "", "?page=2");
    results.historyReplaced = history.state?.page;
    // clean up
    history.back();
  } catch (e) {
    results.historyError = e.message;
  }

  // ── IntersectionObserver ──
  try {
    const ioResult = await new Promise((resolve, reject) => {
      const el = document.getElementById("observed");
      const observer = new IntersectionObserver((entries) => {
        observer.disconnect();
        resolve(entries.length > 0);
      });
      observer.observe(el);
      setTimeout(() => reject(new Error("io timeout")), 5000);
    });
    results.intersectionObserved = ioResult;
  } catch (e) {
    results.intersectionError = e.message;
  }

  // ── ResizeObserver ──
  try {
    const roResult = await new Promise((resolve, reject) => {
      const el = document.getElementById("observed");
      const observer = new ResizeObserver((entries) => {
        observer.disconnect();
        resolve(entries.length > 0 && entries[0].contentRect.width > 0);
      });
      observer.observe(el);
      setTimeout(() => reject(new Error("ro timeout")), 5000);
    });
    results.resizeObserved = roResult;
  } catch (e) {
    results.resizeError = e.message;
  }

  // ── MutationObserver ──
  try {
    const moResult = await new Promise((resolve, reject) => {
      const el = document.getElementById("observed");
      const observer = new MutationObserver((mutations) => {
        observer.disconnect();
        resolve(mutations.length > 0);
      });
      observer.observe(el, { attributes: true });
      el.setAttribute("data-mutated", "true");
      setTimeout(() => reject(new Error("mo timeout")), 5000);
    });
    results.mutationObserved = moResult;
  } catch (e) {
    results.mutationError = e.message;
  }

  // ── navigator.onLine ──
  try {
    results.onLine = navigator.onLine;
  } catch (e) {
    results.onLineError = e.message;
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
    console.warn('Playwright not installed, skipping browser platform-2 E2E tests')
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

  // Grant clipboard permissions for the test
  const context = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await context.newPage()
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

describe('browser E2E: clipboard API', () => {
  it('writes and reads clipboard text', () => {
    if (!hasPlaywright) return
    expect(results.clipboardWrite).toBe(true)
    expect(results.clipboardRead).toBe('seed-clipboard-test')
  })
})

describe('browser E2E: URL constructor', () => {
  it('parses URL components', () => {
    if (!hasPlaywright) return
    expect(results.urlHostname).toBe('example.com')
    expect(results.urlPort).toBe('8080')
    expect(results.urlPathname).toBe('/path')
    expect(results.urlSearch).toBe('?q=1')
    expect(results.urlHash).toBe('#hash')
  })
})

describe('browser E2E: URLSearchParams', () => {
  it('parses and queries params', () => {
    if (!hasPlaywright) return
    expect(results.paramsGet).toBe('1')
    expect(results.paramsGetAll).toBe(2)
    expect(results.paramsHas).toBe(true)
    expect(results.paramsString).toBe(true)
  })
})

describe('browser E2E: visibility', () => {
  it('reports visibility state', () => {
    if (!hasPlaywright) return
    // Headless Chromium may report "hidden" or "visible"
    expect(['visible', 'hidden']).toContain(results.visibilityState)
    expect(typeof results.hidden).toBe('boolean')
  })
})

describe('browser E2E: matchMedia', () => {
  it('evaluates media query', () => {
    if (!hasPlaywright) return
    expect(results.matchMediaMatches).toBe(true)
    expect(results.matchMediaMedia).toBe('(min-width: 1px)')
  })
})

describe('browser E2E: requestAnimationFrame', () => {
  it('fires callback with timestamp', () => {
    if (!hasPlaywright) return
    expect(results.rafFired).toBe(true)
  })
})

describe('browser E2E: history API', () => {
  it('pushState and replaceState work', () => {
    if (!hasPlaywright) return
    expect(results.historyPushed).toBe(true)
    expect(results.historyState).toBe(1)
    expect(results.historyReplaced).toBe(2)
  })
})

describe('browser E2E: IntersectionObserver', () => {
  it('observes element intersection', () => {
    if (!hasPlaywright) return
    expect(results.intersectionObserved).toBe(true)
  })
})

describe('browser E2E: ResizeObserver', () => {
  it('observes element size', () => {
    if (!hasPlaywright) return
    expect(results.resizeObserved).toBe(true)
  })
})

describe('browser E2E: MutationObserver', () => {
  it('observes attribute mutation', () => {
    if (!hasPlaywright) return
    expect(results.mutationObserved).toBe(true)
  })
})

describe('browser E2E: navigator.onLine', () => {
  it('reports online status', () => {
    if (!hasPlaywright) return
    expect(results.onLine).toBe(true)
  })
})
