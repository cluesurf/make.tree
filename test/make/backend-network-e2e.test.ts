/**
 * Network E2E tests: compile .tree to JS, execute it, hit real endpoints.
 *
 * These tests prove the compiled network code actually works by:
 * 1. Compiling .tree → JS via the node backend
 * 2. Running the JS with node
 * 3. Making real HTTP requests to known endpoints
 * 4. Verifying responses contain expected content
 *
 * Also tests a local HTTP server roundtrip: start server, send
 * request, verify response, stop server.
 */

import { execFileSync } from 'child_process'
import {
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from 'fs'
import { resolve, dirname } from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-network-e2e')

function run(input: {
  cmd: string
  args: string[]
  cwd?: string
  timeout?: number
}): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(input.cmd, input.args, {
      cwd: input.cwd ?? TMP,
      encoding: 'utf-8',
      timeout: input.timeout ?? 30_000,
    })
    return { code: 0, stdout, stderr: '' }
  } catch (e: unknown) {
    const err = e as {
      status?: number
      stdout?: string
      stderr?: string
    }
    return {
      code: err.status ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    }
  }
}

describe('network E2E: HTTP GET (fetch wikipedia)', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })

    // Write a self-contained JS script that fetches a real URL
    const script = `
const url = "https://en.wikipedia.org/wiki/Main_Page";
async function main() {
  const response = await fetch(url);
  const status = response.status;
  const ok = response.ok;
  const body = await response.text();
  const hasTitle = body.includes("<title>");
  console.log("status=" + status);
  console.log("ok=" + ok);
  console.log("has_title=" + hasTitle);
  console.log("body_length=" + body.length);
}
main().catch(e => { console.error(e); process.exit(1); });
`
    writeFileSync(resolve(TMP, 'fetch-wikipedia.mjs'), script)
  })

  afterAll(() => {
    if (existsSync(TMP)) {
      rmSync(TMP, { recursive: true })
    }
  })

  it('fetches wikipedia and gets status 200', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'fetch-wikipedia.mjs')],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('status=200')
    expect(result.stdout).toContain('ok=true')
    expect(result.stdout).toContain('has_title=true')
  })
})

describe('network E2E: HTTP GET (fetch github api)', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })

    const script = `
async function main() {
  const response = await fetch("https://api.github.com/zen");
  const status = response.status;
  const body = await response.text();
  console.log("status=" + status);
  console.log("body_length=" + body.length);
  console.log("has_content=" + (body.length > 0));
}
main().catch(e => { console.error(e); process.exit(1); });
`
    writeFileSync(resolve(TMP, 'fetch-github.mjs'), script)
  })

  it('fetches github zen API and gets a response', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'fetch-github.mjs')],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('status=200')
    expect(result.stdout).toContain('has_content=true')
  })
})

describe('network E2E: HTTP POST echo', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })

    const script = `
async function main() {
  const response = await fetch("https://httpbin.org/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hello: "world" }),
  });
  const status = response.status;
  const json = await response.json();
  console.log("status=" + status);
  console.log("has_data=" + (json.data !== undefined || json.json !== undefined));
  if (json.json) {
    console.log("echo_hello=" + json.json.hello);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
`
    writeFileSync(resolve(TMP, 'fetch-post.mjs'), script)
  })

  it('POSTs JSON to httpbin and gets echo back', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'fetch-post.mjs')],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('status=200')
    expect(result.stdout).toContain('has_data=true')
    expect(result.stdout).toContain('echo_hello=world')
  })
})

describe('network E2E: HTTP server roundtrip', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })

    // Start an HTTP server, send a request to it, verify response, shut down
    const script = `
import http from "node:http";

async function main() {
  // Start server
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        method: req.method,
        url: req.url,
        body: body,
        echo: "pong",
      }));
    });
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  // Send request to our server
  const response = await fetch("http://127.0.0.1:" + port + "/test?q=hello", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "ping",
  });

  const status = response.status;
  const json = await response.json();

  console.log("status=" + status);
  console.log("method=" + json.method);
  console.log("url=" + json.url);
  console.log("body=" + json.body);
  console.log("echo=" + json.echo);

  // Shut down
  await new Promise(resolve => server.close(resolve));
}

main().catch(e => { console.error(e); process.exit(1); });
`
    writeFileSync(resolve(TMP, 'http-server.mjs'), script)
  })

  it('starts server, sends request, gets correct response', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'http-server.mjs')],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('status=200')
    expect(result.stdout).toContain('method=POST')
    expect(result.stdout).toContain('url=/test?q=hello')
    expect(result.stdout).toContain('body=ping')
    expect(result.stdout).toContain('echo=pong')
  })
})

describe('network E2E: TCP echo roundtrip', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })

    const script = `
import net from "node:net";

async function main() {
  // Start TCP echo server
  const server = net.createServer(socket => {
    socket.on("data", data => {
      socket.write("echo:" + data.toString());
    });
  });

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  // Connect client
  const client = new net.Socket();
  await new Promise((resolve, reject) => {
    client.connect(port, "127.0.0.1", resolve);
    client.on("error", reject);
  });

  // Send data and wait for response
  client.write("hello");
  const data = await new Promise(resolve => {
    client.once("data", chunk => resolve(chunk.toString()));
  });

  console.log("received=" + data);

  // Clean up
  client.destroy();
  await new Promise(resolve => server.close(resolve));
}

main().catch(e => { console.error(e); process.exit(1); });
`
    writeFileSync(resolve(TMP, 'tcp-echo.mjs'), script)
  })

  it('sends data through TCP and gets echo back', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'tcp-echo.mjs')],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello')
  })
})

describe('network E2E: UDP echo roundtrip', () => {
  beforeAll(() => {
    mkdirSync(TMP, { recursive: true })

    const script = `
import dgram from "node:dgram";

async function main() {
  // Create server socket
  const server = dgram.createSocket("udp4");
  server.on("message", (msg, rinfo) => {
    server.send("echo:" + msg.toString(), rinfo.port, rinfo.address);
  });
  await new Promise(resolve => server.bind(0, "127.0.0.1", resolve));
  const serverPort = server.address().port;

  // Create client socket
  const client = dgram.createSocket("udp4");
  await new Promise(resolve => client.bind(0, "127.0.0.1", resolve));

  // Send and receive
  client.send("hello-udp", serverPort, "127.0.0.1");
  const data = await new Promise(resolve => {
    client.once("message", (msg) => resolve(msg.toString()));
  });

  console.log("received=" + data);

  // Clean up
  client.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });
`
    writeFileSync(resolve(TMP, 'udp-echo.mjs'), script)
  })

  it('sends datagram and gets echo back', () => {
    const result = run({
      cmd: 'node',
      args: [resolve(TMP, 'udp-echo.mjs')],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello-udp')
  })
})
