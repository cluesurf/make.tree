/**
 * Browser E2E process (Web Worker) tests: spawn workers, send messages,
 * read responses, terminate, and run one-shot workers.
 *
 * Uses Blob URLs to create inline workers without separate files.
 * Skips if Playwright is not available or browser binary is missing.
 */

import { createServer, type Server } from 'http'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

let hasPlaywright = false
let server: Server
let results: Record<string, unknown> = {}

const HTML = `<!DOCTYPE html>
<html>
<head><title>Seed Browser Process E2E</title></head>
<body>
<script>
function makeWorkerUrl(code) {
  const blob = new Blob([code], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}

async function runTests() {
  const results = {};

  // ── spawn + write + read (echo worker) ──
  try {
    const echoCode = \`
      self.onmessage = (e) => {
        self.postMessage("echo:" + e.data);
      };
    \`;
    const url = makeWorkerUrl(echoCode);
    const worker = new Worker(url);

    // Send message and get echo
    const echo = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(e);
      worker.postMessage("hello");
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    results.echoMessage = echo;

    // Send second message
    const echo2 = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => resolve(e.data);
      worker.onerror = (e) => reject(e);
      worker.postMessage("world");
      setTimeout(() => reject(new Error("timeout")), 5000);
    });
    results.echoMessage2 = echo2;

    worker.terminate();
    URL.revokeObjectURL(url);
    results.spawnSuccess = true;
  } catch (e) {
    results.spawnError = e.message;
    results.spawnSuccess = false;
  }

  // ── run (one-shot worker) ──
  try {
    const runCode = \`
      self.onmessage = (e) => {
        const result = "computed:" + e.data.toUpperCase();
        self.postMessage(result);
      };
    \`;
    const url = makeWorkerUrl(runCode);
    const worker = new Worker(url);

    const result = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        worker.terminate();
        resolve(e.data);
      };
      worker.onerror = (e) => {
        worker.terminate();
        reject(e);
      };
      worker.postMessage("seed");
      setTimeout(() => reject(new Error("timeout")), 5000);
    });

    results.runResult = result;
    URL.revokeObjectURL(url);
  } catch (e) {
    results.runError = e.message;
  }

  // ── stop (terminate) ──
  try {
    const longCode = \`
      setInterval(() => {
        self.postMessage("tick");
      }, 10);
    \`;
    const url = makeWorkerUrl(longCode);
    const worker = new Worker(url);

    // Wait for first tick
    await new Promise((resolve, reject) => {
      worker.onmessage = resolve;
      worker.onerror = reject;
      setTimeout(() => reject(new Error("timeout")), 5000);
    });

    worker.terminate();

    // Verify no more messages after terminate
    let gotMessage = false;
    worker.onmessage = () => { gotMessage = true; };
    await new Promise(resolve => setTimeout(resolve, 100));
    results.terminated = !gotMessage;
    URL.revokeObjectURL(url);
  } catch (e) {
    results.terminateError = e.message;
  }

  // ── wait (worker self-exits) ──
  try {
    const exitCode = \`
      self.postMessage({ type: "exit", code: 0 });
      self.close();
    \`;
    const url = makeWorkerUrl(exitCode);
    const worker = new Worker(url);

    const exitData = await new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data && e.data.type === "exit") {
          resolve(e.data);
        }
      };
      worker.onerror = reject;
      setTimeout(() => reject(new Error("timeout")), 5000);
    });

    results.waitExitCode = exitData.code;
    results.waitExitType = exitData.type;
    URL.revokeObjectURL(url);
  } catch (e) {
    results.waitError = e.message;
  }

  // ── error handling (worker with syntax error) ──
  try {
    const badCode = \`
      this is not valid javascript!!!
    \`;
    const url = makeWorkerUrl(badCode);
    const worker = new Worker(url);

    await new Promise((resolve, reject) => {
      worker.onmessage = () => reject(new Error("should not get message"));
      worker.onerror = (e) => {
        e.preventDefault();
        resolve(e);
      };
      setTimeout(() => reject(new Error("timeout")), 5000);
    });

    results.errorCaught = true;
    worker.terminate();
    URL.revokeObjectURL(url);
  } catch (e) {
    results.errorCaught = false;
    results.errorCaughtError = e.message;
  }

  // ── pipe (worker to worker via MessageChannel) ──
  try {
    const producerCode = \`
      self.onmessage = (e) => {
        if (e.data && e.data.type === "start") {
          const port = e.ports[0];
          port.postMessage("from-producer");
        }
      };
    \`;
    const consumerCode = \`
      self.onmessage = (e) => {
        if (e.data && e.data.type === "start") {
          const port = e.ports[0];
          port.onmessage = (msg) => {
            self.postMessage("received:" + msg.data);
          };
        }
      };
    \`;

    const url1 = makeWorkerUrl(producerCode);
    const url2 = makeWorkerUrl(consumerCode);
    const producer = new Worker(url1);
    const consumer = new Worker(url2);

    const channel = new MessageChannel();

    const pipeResult = await new Promise((resolve, reject) => {
      consumer.onmessage = (e) => resolve(e.data);
      consumer.onerror = reject;

      consumer.postMessage({ type: "start" }, [channel.port1]);
      producer.postMessage({ type: "start" }, [channel.port2]);

      setTimeout(() => reject(new Error("timeout")), 5000);
    });

    results.pipeResult = pipeResult;
    producer.terminate();
    consumer.terminate();
    URL.revokeObjectURL(url1);
    URL.revokeObjectURL(url2);
  } catch (e) {
    results.pipeError = e.message;
  }

  // ── current process info ──
  try {
    results.currentPathname = location.pathname;
    results.currentHref = location.href.length > 0;
    results.currentOnline = navigator.onLine;
  } catch (e) {
    results.currentError = e.message;
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
    console.warn('Playwright not installed, skipping browser process E2E tests')
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

describe('browser E2E: process spawn + message passing', () => {
  it('spawns worker and echoes messages', () => {
    if (!hasPlaywright) return
    expect(results.spawnSuccess).toBe(true)
    expect(results.echoMessage).toBe('echo:hello')
    expect(results.echoMessage2).toBe('echo:world')
  })
})

describe('browser E2E: process run (one-shot)', () => {
  it('runs worker and gets computed result', () => {
    if (!hasPlaywright) return
    expect(results.runResult).toBe('computed:SEED')
  })
})

describe('browser E2E: process stop (terminate)', () => {
  it('terminates worker and stops messages', () => {
    if (!hasPlaywright) return
    expect(results.terminated).toBe(true)
  })
})

describe('browser E2E: process wait (self-exit)', () => {
  it('receives exit signal from worker', () => {
    if (!hasPlaywright) return
    expect(results.waitExitCode).toBe(0)
    expect(results.waitExitType).toBe('exit')
  })
})

describe('browser E2E: process error handling', () => {
  it('catches worker script errors', () => {
    if (!hasPlaywright) return
    expect(results.errorCaught).toBe(true)
  })
})

describe('browser E2E: process pipe (MessageChannel)', () => {
  it('pipes data from producer worker to consumer worker', () => {
    if (!hasPlaywright) return
    expect(results.pipeResult).toBe('received:from-producer')
  })
})

describe('browser E2E: current process info', () => {
  it('reports current page info', () => {
    if (!hasPlaywright) return
    expect(results.currentPathname).toBe('/')
    expect(results.currentHref).toBe(true)
    expect(results.currentOnline).toBe(true)
  })
})
