/**
 * Browser E2E WebSocket tests: start a WebSocket echo server using `ws`,
 * serve an HTML page that connects, sends messages, and verifies responses.
 *
 * Skips if Playwright is not available or browser binary is missing.
 */

import { createServer, type Server } from 'http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { WebSocketServer } from 'ws'

let hasPlaywright = false
let server: Server
let results: Record<string, unknown> = {}

function buildHtml(port: number): string {
  return `<!DOCTYPE html>
<html>
<head><title>Seed Browser WebSocket E2E</title></head>
<body>
<script>
async function runTests() {
  const results = {};

  // Test 1: connect, send, receive echo
  try {
    const ws = new WebSocket("ws://127.0.0.1:${port}");

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    results.connected = true;
    results.readyState = ws.readyState;

    // Send single message and get echo
    const echo1 = await new Promise((resolve, reject) => {
      ws.onmessage = (e) => resolve(e.data);
      ws.onerror = reject;
      ws.send("hello");
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    results.echo1 = echo1;

    // Send second message
    const echo2 = await new Promise((resolve, reject) => {
      ws.onmessage = (e) => resolve(e.data);
      ws.onerror = reject;
      ws.send("world");
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    results.echo2 = echo2;

    // Close with code
    const closeCode = await new Promise((resolve, reject) => {
      ws.onclose = (e) => resolve(e.code);
      ws.onerror = reject;
      ws.close(1000);
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    results.closeCode = closeCode;
    results.closedState = ws.readyState;
  } catch (e) {
    results.wsError = e.message;
  }

  // Test 2: connection refused
  try {
    const wsBad = new WebSocket("ws://127.0.0.1:1/should-fail");
    await new Promise((resolve, reject) => {
      wsBad.onopen = () => reject(new Error("should not connect"));
      wsBad.onerror = resolve;
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    results.connectionRefused = true;
  } catch (e) {
    results.connectionRefused = false;
    results.connectionRefusedError = e.message;
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
    console.warn('Playwright not installed, skipping browser WebSocket E2E tests')
    return
  }

  let port = 0

  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      const addr = server.address()
      const p = addr && typeof addr === 'object' ? addr.port : 0
      res.end(buildHtml(p))
    })

    const wss = new WebSocketServer({ server })

    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        ws.send(`echo:${data}`)
      })
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

describe('browser E2E: WebSocket connect', () => {
  it('connects to server', () => {
    if (!hasPlaywright) return
    expect(results.connected).toBe(true)
    expect(results.readyState).toBe(1) // WebSocket.OPEN
  })
})

describe('browser E2E: WebSocket send/receive', () => {
  it('echoes messages back', () => {
    if (!hasPlaywright) return
    expect(results.echo1).toBe('echo:hello')
    expect(results.echo2).toBe('echo:world')
  })
})

describe('browser E2E: WebSocket close', () => {
  it('closes with code 1000', () => {
    if (!hasPlaywright) return
    expect(results.closeCode).toBe(1000)
    expect(results.closedState).toBe(3) // WebSocket.CLOSED
  })
})

describe('browser E2E: WebSocket error', () => {
  it('handles connection refused', () => {
    if (!hasPlaywright) return
    expect(results.connectionRefused).toBe(true)
  })
})
