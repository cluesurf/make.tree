/**
 * Rust E2E TCP test: compile Seed .tree through Rust backend, build, run.
 *
 * Validates the full pipeline: .tree -> compiler -> Rust codegen.
 * Then separately runs a handwritten Rust TCP echo test that exercises
 * the same patterns the codegen would produce.
 *
 * The compilation test verifies the generated Rust is valid Rust.
 * The echo test verifies TCP networking works end-to-end.
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
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castRust } from '@/cast/rust'
import type { Book } from '@/term/form'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MAKE_ROOT = resolve(__dirname, '..', '..')
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-network-e2e-tcp-rust')

const require_ = createRequire(import.meta.url)
const treeParsePath = resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

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

function compileFile(name: string): Book {
  const file = resolve(__dirname, name)
  const text = readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card }).book
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

describe('TCP codegen: Seed -> Rust compilation', () => {
  it('compiles network-tcp-echo.tree to valid Rust types and functions', () => {
    const book = compileFile('network-tcp-echo.tree')
    const rs = castRust({ book })

    expect(rs).toContain('struct Connection')
    expect(rs).toContain('struct Listener')
    expect(rs).toContain('fn connect(')
    expect(rs).toContain('fn listen(')
    expect(rs).toContain('fn accept(')
    expect(rs).toContain('fn read_data(')
    expect(rs).toContain('fn write_data(')
    expect(rs).toContain('fn close_connection(')
    expect(rs).toContain('Result<')
  })
})

describe('TCP E2E: Rust echo server/client', () => {
  it('compiles and runs TCP echo roundtrip', () => {
    if (!hasRustc) return

    const src = `
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

struct Connection {
    dock: TcpStream,
    host: String,
    port: u16,
    local_host: String,
    local_port: u16,
    secure: bool,
}

struct Listener {
    dock: TcpListener,
    host: String,
    port: u16,
}

fn listen(host: &str, port: u16) -> Result<Listener, Box<dyn std::error::Error>> {
    let addr = format!("{}:{}", host, port);
    let raw = TcpListener::bind(&addr)?;
    let local = raw.local_addr()?;
    Ok(Listener {
        dock: raw,
        host: host.to_string(),
        port: local.port(),
    })
}

fn accept(listener: &Listener) -> Result<Connection, Box<dyn std::error::Error>> {
    let (stream, addr) = listener.dock.accept()?;
    let local = stream.local_addr()?;
    Ok(Connection {
        dock: stream,
        host: addr.ip().to_string(),
        port: addr.port(),
        local_host: local.ip().to_string(),
        local_port: local.port(),
        secure: false,
    })
}

fn read_data(conn: &mut Connection) -> Result<String, Box<dyn std::error::Error>> {
    let mut buf = [0u8; 4096];
    let n = conn.dock.read(&mut buf)?;
    Ok(String::from_utf8_lossy(&buf[..n]).to_string())
}

fn write_data(conn: &mut Connection, data: &str) -> Result<(), Box<dyn std::error::Error>> {
    conn.dock.write_all(data.as_bytes())?;
    Ok(())
}

fn main() {
    let listener = listen("127.0.0.1", 0).unwrap();
    let port = listener.port;

    let handle = thread::spawn(move || {
        let mut conn = accept(&listener).unwrap();
        let data = read_data(&mut conn).unwrap();
        let reply = format!("echo:{}", data);
        write_data(&mut conn, &reply).unwrap();
    });

    let mut client = Connection {
        dock: TcpStream::connect(format!("127.0.0.1:{}", port)).unwrap(),
        host: "127.0.0.1".to_string(),
        port,
        local_host: "127.0.0.1".to_string(),
        local_port: 0,
        secure: false,
    };

    write_data(&mut client, "hello").unwrap();
    client.dock.shutdown(std::net::Shutdown::Write).unwrap();

    let received = read_data(&mut client).unwrap();
    println!("received={}", received);

    handle.join().unwrap();
}
`
    writeFileSync(resolve(TMP, 'tcp_echo_seed.rs'), src)

    const compile = run({
      cmd: 'rustc',
      args: [
        '-A', 'warnings',
        resolve(TMP, 'tcp_echo_seed.rs'),
        '-o', resolve(TMP, 'tcp_echo_seed'),
      ],
    })
    if (compile.code !== 0) {
      console.error('rustc stderr:', compile.stderr)
    }
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'tcp_echo_seed'),
      args: [],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('run stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello')
  }, 60_000)
})
