/**
 * Browser E2E platform tests: serve an HTML page, open it with Playwright,
 * verify that browser APIs (storage, crypto, DOM, clock, environment) work.
 *
 * Skips if playwright is not available or browser binary is missing.
 */

import { createServer, type Server } from 'http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let hasPlaywright = false
let server: Server
let results: Record<string, unknown> = {}

const HTML = `<!DOCTYPE html>
<html>
<head><title>Seed Browser E2E</title></head>
<body>
<div id="root"></div>
<script>
async function runTests() {
  const results = {};

  // ── storage ──
  try {
    localStorage.setItem("seed-key", "seed-value");
    results.storageSet = "ok";
    results.storageGet = localStorage.getItem("seed-key");
    results.storageLength = localStorage.length > 0;
    localStorage.removeItem("seed-key");
    results.storageRemoved = localStorage.getItem("seed-key") === null;
    localStorage.setItem("a", "1");
    localStorage.setItem("b", "2");
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      keys.push(localStorage.key(i));
    }
    results.storageKeys = keys.length >= 2;
    localStorage.clear();
    results.storageClear = localStorage.length === 0;

    sessionStorage.setItem("ss-key", "ss-value");
    results.sessionGet = sessionStorage.getItem("ss-key");
    sessionStorage.clear();
  } catch (e) {
    results.storageError = e.message;
  }

  // ── crypto ──
  try {
    const data = new TextEncoder().encode("hello");
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    results.sha256 = hex;

    const random = crypto.getRandomValues(new Uint8Array(16));
    results.randomLength = random.length;
    results.randomNotZero = random.some(b => b !== 0);
  } catch (e) {
    results.cryptoError = e.message;
  }

  // ── DOM ──
  try {
    const root = document.querySelector("#root");
    results.queryRoot = root !== null;

    const el = document.createElement("span");
    el.setAttribute("data-test", "hello");
    results.getAttribute = el.getAttribute("data-test");

    el.textContent = "test text";
    results.getText = el.textContent;

    root.appendChild(el);
    results.appendChild = root.children.length === 1;

    el.classList.add("active");
    results.addClass = el.classList.contains("active");
    el.classList.remove("active");
    results.removeClass = !el.classList.contains("active");

    const all = document.querySelectorAll("#root span");
    results.queryAll = Array.from(all).length;

    let clicked = false;
    const handler = () => { clicked = true; };
    el.addEventListener("click", handler);
    el.click();
    results.listener = clicked;
    el.removeEventListener("click", handler);

    el.remove();
    results.removeEl = root.children.length === 0;
  } catch (e) {
    results.domError = e.message;
  }

  // ── clock ──
  try {
    const before = Date.now();
    await new Promise(resolve => setTimeout(resolve, 50));
    const after = Date.now();
    results.clockElapsed = after - before >= 40;
    results.perfNow = performance.now() > 0;
  } catch (e) {
    results.clockError = e.message;
  }

  // ── environment ──
  try {
    results.userAgent = navigator.userAgent.length > 0;
    results.language = navigator.language.length > 0;
    results.platform = navigator.platform !== undefined;
    results.url = location.href.length > 0;
    results.online = typeof navigator.onLine === "boolean";
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
  } catch (err) {
    console.warn('Playwright not installed, skipping browser E2E tests:', (err as Error).message)
    return
  }

  // start HTTP server
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

  // launch browser, run all tests in one page load, collect results
  let browser
  try {
    browser = await chromium.launch({ headless: true })
  } catch (err) {
    console.warn('Browser binary not available, skipping browser E2E tests:', (err as Error).message)
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

describe('browser E2E: storage API', () => {
  it('localStorage set/get/remove/clear/keys', () => {
    if (!hasPlaywright) return
    expect(results.storageSet).toBe('ok')
    expect(results.storageGet).toBe('seed-value')
    expect(results.storageLength).toBe(true)
    expect(results.storageRemoved).toBe(true)
    expect(results.storageKeys).toBe(true)
    expect(results.storageClear).toBe(true)
    expect(results.sessionGet).toBe('ss-value')
  })
})

describe('browser E2E: crypto API', () => {
  it('SHA-256 digest and random bytes', () => {
    if (!hasPlaywright) return
    expect(results.sha256).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
    expect(results.randomLength).toBe(16)
    expect(results.randomNotZero).toBe(true)
  })
})

describe('browser E2E: DOM API', () => {
  it('query, create, attribute, text, append, class, remove', () => {
    if (!hasPlaywright) return
    expect(results.queryRoot).toBe(true)
    expect(results.getAttribute).toBe('hello')
    expect(results.getText).toBe('test text')
    expect(results.appendChild).toBe(true)
    expect(results.addClass).toBe(true)
    expect(results.removeClass).toBe(true)
    expect(results.queryAll).toBe(1)
    expect(results.listener).toBe(true)
    expect(results.removeEl).toBe(true)
  })
})

describe('browser E2E: clock API', () => {
  it('setTimeout delay and performance.now', () => {
    if (!hasPlaywright) return
    expect(results.clockElapsed).toBe(true)
    expect(results.perfNow).toBe(true)
  })
})

describe('browser E2E: environment API', () => {
  it('navigator and location properties', () => {
    if (!hasPlaywright) return
    expect(results.userAgent).toBe(true)
    expect(results.language).toBe(true)
    expect(results.platform).toBe(true)
    expect(results.url).toBe(true)
    expect(results.online).toBe(true)
  })
})
