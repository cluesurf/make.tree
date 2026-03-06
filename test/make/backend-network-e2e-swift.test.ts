/**
 * Swift E2E network tests: compile Swift source, execute binary, verify output.
 *
 * Tests real HTTP (via URLSession) and TCP/UDP networking using Foundation
 * and Network framework (Darwin sockets for TCP/UDP).
 *
 * Skips if swiftc is not available.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-network-e2e-swift')

let hasSwiftc = false

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
  const check = run({ cmd: 'swiftc', args: ['--version'], cwd: '/' })
  hasSwiftc = check.code === 0
  if (hasSwiftc) {
    mkdirSync(TMP, { recursive: true })
  }
})

afterAll(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true })
  }
})

describe('swift E2E: HTTP GET via URLSession', () => {
  it('fetches httpbin.org/get and verifies response', () => {
    if (!hasSwiftc) return

    const src = `
import Foundation

let semaphore = DispatchSemaphore(value: 0)

let url = URL(string: "http://httpbin.org/get")!
var request = URLRequest(url: url)
request.httpMethod = "GET"
request.timeoutInterval = 10

let task = URLSession.shared.dataTask(with: request) { data, response, error in
    if let error = error {
        print("error=\\(error.localizedDescription)")
        semaphore.signal()
        return
    }
    guard let httpResponse = response as? HTTPURLResponse,
          let data = data,
          let body = String(data: data, encoding: .utf8) else {
        print("error=no_response")
        semaphore.signal()
        return
    }

    let status = httpResponse.statusCode
    let hasUrl = body.contains("\\"url\\"")

    print("status=\\(status)")
    print("has_url=\\(hasUrl)")
    print("body_length=\\(body.count)")
    semaphore.signal()
}
task.resume()
semaphore.wait()
`
    writeFileSync(resolve(TMP, 'http_get.swift'), src)

    const compile = run({
      cmd: 'swiftc',
      args: ['-suppress-warnings', resolve(TMP, 'http_get.swift'), '-o', resolve(TMP, 'http_get')],
    })
    if (compile.code !== 0) {
      console.error('swiftc stderr:', compile.stderr)
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
    expect(result.stdout).toContain('status=200')
    expect(result.stdout).toContain('has_url=true')
  }, 120_000)
})

describe('swift E2E: TCP echo roundtrip', () => {
  it('starts TCP server, connects client, echoes data', () => {
    if (!hasSwiftc) return

    const src = `
import Foundation

// Use BSD sockets for TCP echo test
let serverFd = socket(AF_INET, SOCK_STREAM, 0)
var optval: Int32 = 1
setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &optval, socklen_t(MemoryLayout<Int32>.size))

var serverAddr = sockaddr_in()
serverAddr.sin_family = sa_family_t(AF_INET)
serverAddr.sin_port = 0  // Let OS pick port
serverAddr.sin_addr.s_addr = inet_addr("127.0.0.1")

withUnsafePointer(to: &serverAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        bind(serverFd, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
    }
}

listen(serverFd, 1)

// Get assigned port
var boundAddr = sockaddr_in()
var boundLen = socklen_t(MemoryLayout<sockaddr_in>.size)
withUnsafeMutablePointer(to: &boundAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        getsockname(serverFd, sa, &boundLen)
    }
}
let port = Int(UInt16(bigEndian: boundAddr.sin_port))

// Server thread
let thread = Thread {
    var clientAddr = sockaddr_in()
    var clientLen = socklen_t(MemoryLayout<sockaddr_in>.size)
    let clientFd = withUnsafeMutablePointer(to: &clientAddr) { ptr in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
            accept(serverFd, sa, &clientLen)
        }
    }

    var buf = [UInt8](repeating: 0, count: 1024)
    let n = read(clientFd, &buf, 1024)
    let msg = "echo:" + String(bytes: buf[0..<n], encoding: .utf8)!
    msg.withCString { cstr in
        _ = write(clientFd, cstr, msg.utf8.count)
    }
    close(clientFd)
}
thread.start()

// Give server a moment
usleep(50000)

// Client
let clientFd = socket(AF_INET, SOCK_STREAM, 0)
var connectAddr = sockaddr_in()
connectAddr.sin_family = sa_family_t(AF_INET)
connectAddr.sin_port = UInt16(port).bigEndian
connectAddr.sin_addr.s_addr = inet_addr("127.0.0.1")

withUnsafePointer(to: &connectAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        connect(clientFd, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
    }
}

"hello".withCString { cstr in
    _ = write(clientFd, cstr, 5)
}

var recvBuf = [UInt8](repeating: 0, count: 1024)
let recvN = read(clientFd, &recvBuf, 1024)
let received = String(bytes: recvBuf[0..<recvN], encoding: .utf8)!
print("received=\\(received)")

close(clientFd)
close(serverFd)
`
    writeFileSync(resolve(TMP, 'tcp_echo.swift'), src)

    const compile = run({
      cmd: 'swiftc',
      args: ['-suppress-warnings', resolve(TMP, 'tcp_echo.swift'), '-o', resolve(TMP, 'tcp_echo')],
    })
    if (compile.code !== 0) {
      console.error('swiftc stderr:', compile.stderr)
    }
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'tcp_echo'),
      args: [],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('run stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello')
  }, 120_000)
})

describe('swift E2E: UDP echo roundtrip', () => {
  it('sends UDP datagram and gets echo back', () => {
    if (!hasSwiftc) return

    const src = `
import Foundation

// Server socket
let serverFd = socket(AF_INET, SOCK_DGRAM, 0)
var serverAddr = sockaddr_in()
serverAddr.sin_family = sa_family_t(AF_INET)
serverAddr.sin_port = 0
serverAddr.sin_addr.s_addr = inet_addr("127.0.0.1")

withUnsafePointer(to: &serverAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        bind(serverFd, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
    }
}

var boundAddr = sockaddr_in()
var boundLen = socklen_t(MemoryLayout<sockaddr_in>.size)
withUnsafeMutablePointer(to: &boundAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        getsockname(serverFd, sa, &boundLen)
    }
}
let serverPort = Int(UInt16(bigEndian: boundAddr.sin_port))

// Client socket
let clientFd = socket(AF_INET, SOCK_DGRAM, 0)
var clientAddr = sockaddr_in()
clientAddr.sin_family = sa_family_t(AF_INET)
clientAddr.sin_port = 0
clientAddr.sin_addr.s_addr = inet_addr("127.0.0.1")

withUnsafePointer(to: &clientAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        bind(clientFd, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
    }
}

// Send from client to server
var destAddr = sockaddr_in()
destAddr.sin_family = sa_family_t(AF_INET)
destAddr.sin_port = UInt16(serverPort).bigEndian
destAddr.sin_addr.s_addr = inet_addr("127.0.0.1")

let msg = "hello-udp"
msg.withCString { cstr in
    withUnsafePointer(to: &destAddr) { ptr in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
            sendto(clientFd, cstr, msg.utf8.count, 0, sa, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
}

// Server receives
var recvBuf = [UInt8](repeating: 0, count: 1024)
var srcAddr = sockaddr_in()
var srcLen = socklen_t(MemoryLayout<sockaddr_in>.size)
let n = withUnsafeMutablePointer(to: &srcAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        recvfrom(serverFd, &recvBuf, 1024, 0, sa, &srcLen)
    }
}

let echoMsg = "echo:" + String(bytes: recvBuf[0..<n], encoding: .utf8)!
echoMsg.withCString { cstr in
    withUnsafeMutablePointer(to: &srcAddr) { ptr in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
            sendto(serverFd, cstr, echoMsg.utf8.count, 0, sa, srcLen)
        }
    }
}

// Client receives echo
var echoBuf = [UInt8](repeating: 0, count: 1024)
var fromAddr = sockaddr_in()
var fromLen = socklen_t(MemoryLayout<sockaddr_in>.size)
let n2 = withUnsafeMutablePointer(to: &fromAddr) { ptr in
    ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
        recvfrom(clientFd, &echoBuf, 1024, 0, sa, &fromLen)
    }
}

let received = String(bytes: echoBuf[0..<n2], encoding: .utf8)!
print("received=\\(received)")

close(clientFd)
close(serverFd)
`
    writeFileSync(resolve(TMP, 'udp_echo.swift'), src)

    const compile = run({
      cmd: 'swiftc',
      args: ['-suppress-warnings', resolve(TMP, 'udp_echo.swift'), '-o', resolve(TMP, 'udp_echo')],
    })
    if (compile.code !== 0) {
      console.error('swiftc stderr:', compile.stderr)
    }
    expect(compile.code).toBe(0)

    const result = run({
      cmd: resolve(TMP, 'udp_echo'),
      args: [],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('run stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello-udp')
  }, 120_000)
})
