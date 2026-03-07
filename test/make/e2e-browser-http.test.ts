/**
 * Browser E2E HTTP tests: start a mock API server, serve an HTML page
 * that uses fetch() to call the API, verify results in Vitest.
 *
 * Skips if Playwright is not available or browser binary is missing.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let hasPlaywright = false
let server: Server
let results: Record<string, unknown> = {}

function handleApi(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url ?? ''

  if (url === '/api/echo' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ message: 'hello' }))
    return true
  }

  if (url === '/api/echo' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
    })
    return true
  }

  if (url === '/api/headers') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Custom-Response': 'from-server',
    })
    res.end(JSON.stringify({
      'x-custom-header': req.headers['x-custom-header'] ?? null,
      'content-type': req.headers['content-type'] ?? null,
    }))
    return true
  }

  if (url === '/api/not-found') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
    return true
  }

  return false
}

function buildHtml(port: number): string {
  return `<!DOCTYPE html>
<html>
<head><title>Seed Browser HTTP E2E</title></head>
<body>
<script>
async function runTests() {
  const base = "http://127.0.0.1:${port}";
  const results = {};

  // GET request
  try {
    const res = await fetch(base + "/api/echo");
    const json = await res.json();
    results.getMessage = json.message;
    results.getStatus = res.status;
    results.getOk = res.ok;
  } catch (e) {
    results.getError = e.message;
  }

  // POST request with JSON body
  try {
    const res = await fetch(base + "/api/echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "seed", version: 1 }),
    });
    const json = await res.json();
    results.postName = json.name;
    results.postVersion = json.version;
    results.postStatus = res.status;
  } catch (e) {
    results.postError = e.message;
  }

  // Custom headers
  try {
    const res = await fetch(base + "/api/headers", {
      headers: { "X-Custom-Header": "test-value" },
    });
    const json = await res.json();
    results.sentHeader = json["x-custom-header"];
    results.responseHeader = res.headers.get("X-Custom-Response");
  } catch (e) {
    results.headersError = e.message;
  }

  // Response as text
  try {
    const res = await fetch(base + "/api/echo");
    const text = await res.text();
    results.textResponse = typeof text === "string" && text.length > 0;
  } catch (e) {
    results.textError = e.message;
  }

  // 404 response
  try {
    const res = await fetch(base + "/api/not-found");
    results.notFoundStatus = res.status;
    results.notFoundOk = res.ok;
  } catch (e) {
    results.notFoundError = e.message;
  }

  // Network error (connection refused on unused port)
  try {
    await fetch("http://127.0.0.1:1/should-fail");
    results.networkError = false;
  } catch (e) {
    results.networkError = true;
  }

  document.title = "DONE";
  window.__seedResults = results;
}
runTests();
</script>
</body>
</html>`
}

beforeAll(async () => {
  let chromium: typeof import('playwright').chromium
  try {
    const pw = await import('playwright')
    chromium = pw.chromium
  } catch {
    console.warn('Playwright not installed, skipping browser HTTP E2E tests')
    return
  }

  let port = 0

  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      if (handleApi(req, res)) return
      res.writeHead(200, { 'Content-Type': 'text/html' })
      const addr = server.address()
      const p = addr && typeof addr === 'object' ? addr.port : 0
      res.end(buildHtml(p))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (addr && typeof addr === 'object') {
        port = addr.port
        hasPlaywright = true
      }
      resolve()
    })
  })

  if (!hasPlaywright) return

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

describe('browser E2E: HTTP GET', () => {
  it('fetches JSON and returns correct status', () => {
    if (!hasPlaywright) return
    expect(results.getMessage).toBe('hello')
    expect(results.getStatus).toBe(200)
    expect(results.getOk).toBe(true)
  })
})

describe('browser E2E: HTTP POST', () => {
  it('sends JSON body and receives it back', () => {
    if (!hasPlaywright) return
    expect(results.postName).toBe('seed')
    expect(results.postVersion).toBe(1)
    expect(results.postStatus).toBe(200)
  })
})

describe('browser E2E: HTTP headers', () => {
  it('sends and receives custom headers', () => {
    if (!hasPlaywright) return
    expect(results.sentHeader).toBe('test-value')
    expect(results.responseHeader).toBe('from-server')
  })
})

describe('browser E2E: HTTP response as text', () => {
  it('reads response body as text', () => {
    if (!hasPlaywright) return
    expect(results.textResponse).toBe(true)
  })
})

describe('browser E2E: HTTP error handling', () => {
  it('handles 404 status', () => {
    if (!hasPlaywright) return
    expect(results.notFoundStatus).toBe(404)
    expect(results.notFoundOk).toBe(false)
  })

  it('handles network error', () => {
    if (!hasPlaywright) return
    expect(results.networkError).toBe(true)
  })
})
