/**
 * Rust E2E network tests: compile Rust source, execute binary, verify output.
 *
 * Tests real TCP/UDP networking using Rust's std::net.
 * HTTP is done as raw HTTP/1.1 over TcpStream (no external crates).
 *
 * Skips if rustc is not available.
 */

import { execFileSync } from 'child_process'
import {
  mkdirSync,
  existsSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { resolve, dirname } from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const TEST_DIR = dirname(new URL(import.meta.url).pathname)
const MAKE_ROOT = resolve(TEST_DIR, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-network-e2e-rust')

let hasRustc = false

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
      timeout: input.timeout ?? 120_000,
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

beforeAll(() => {
  const check = run({ cmd: 'rustc', args: ['--version'], cwd: '/' })
  hasRustc = check.code === 0
  if (hasRustc) {
    mkdirSync(TMP, { recursive: true })
  }
})

afterAll(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true })
  }
})

describe('rust E2E: raw HTTP GET over TcpStream', () => {
  it('fetches httpbin.org/get via raw HTTP/1.1', () => {
    if (!hasRustc) return

    const src = `
use std::io::{Read, Write};
use std::net::TcpStream;

fn main() {
    let mut stream = TcpStream::connect("httpbin.org:80").unwrap();
    let request = "GET /get HTTP/1.1\\r\\nHost: httpbin.org\\r\\nConnection: close\\r\\n\\r\\n";
    stream.write_all(request.as_bytes()).unwrap();

    let mut response = String::new();
    stream.read_to_string(&mut response).unwrap();

    let first_line = response.lines().next().unwrap_or("");
    let has_200 = first_line.contains("200");
    let has_url = response.contains("\\"url\\"");

    println!("has_200={}", has_200);
    println!("has_url={}", has_url);
    println!("body_length={}", response.len());
}
`
    writeFileSync(resolve(TMP, 'http_get.rs'), src)

    const compile = run({
      cmd: 'rustc',
      args: ['-A', 'warnings', resolve(TMP, 'http_get.rs'), '-o', resolve(TMP, 'http_get')],
    })
    if (compile.code !== 0) {
      console.error('rustc stderr:', compile.stderr)
    }
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'http_get'),
      args: [],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('run stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('has_200=true')
    expect(result.stdout).toContain('has_url=true')
  }, 60_000)
})

describe('rust E2E: TCP echo roundtrip', () => {
  it('starts TCP server, connects client, echoes data', () => {
    if (!hasRustc) return

    const src = `
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

fn main() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();

    let handle = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let mut buf = [0u8; 1024];
        let n = stream.read(&mut buf).unwrap();
        let msg = format!("echo:{}", std::str::from_utf8(&buf[..n]).unwrap());
        stream.write_all(msg.as_bytes()).unwrap();
    });

    let mut client = TcpStream::connect(format!("127.0.0.1:{}", port)).unwrap();
    client.write_all(b"hello").unwrap();

    let mut buf = [0u8; 1024];
    let n = client.read(&mut buf).unwrap();
    let received = std::str::from_utf8(&buf[..n]).unwrap();
    println!("received={}", received);

    handle.join().unwrap();
}
`
    writeFileSync(resolve(TMP, 'tcp_echo.rs'), src)

    const compile = run({
      cmd: 'rustc',
      args: ['-A', 'warnings', resolve(TMP, 'tcp_echo.rs'), '-o', resolve(TMP, 'tcp_echo')],
    })
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'tcp_echo'),
      args: [],
      timeout: 15_000,
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello')
  }, 60_000)
})

describe('rust E2E: UDP echo roundtrip', () => {
  it('sends UDP datagram and gets echo back', () => {
    if (!hasRustc) return

    const src = `
use std::net::UdpSocket;

fn main() {
    let server = UdpSocket::bind("127.0.0.1:0").unwrap();
    let server_port = server.local_addr().unwrap().port();

    let client = UdpSocket::bind("127.0.0.1:0").unwrap();
    client.send_to(b"hello-udp", format!("127.0.0.1:{}", server_port)).unwrap();

    let mut buf = [0u8; 1024];
    let (n, src_addr) = server.recv_from(&mut buf).unwrap();
    let msg = format!("echo:{}", std::str::from_utf8(&buf[..n]).unwrap());
    server.send_to(msg.as_bytes(), src_addr).unwrap();

    let (n2, _) = client.recv_from(&mut buf).unwrap();
    let received = std::str::from_utf8(&buf[..n2]).unwrap();
    println!("received={}", received);
}
`
    writeFileSync(resolve(TMP, 'udp_echo.rs'), src)

    const compile = run({
      cmd: 'rustc',
      args: ['-A', 'warnings', resolve(TMP, 'udp_echo.rs'), '-o', resolve(TMP, 'udp_echo')],
    })
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'udp_echo'),
      args: [],
      timeout: 15_000,
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello-udp')
  }, 60_000)
})
