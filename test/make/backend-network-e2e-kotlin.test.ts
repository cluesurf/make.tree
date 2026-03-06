/**
 * Kotlin E2E network tests: compile Kotlin source, execute JAR, verify output.
 *
 * Tests real HTTP and TCP/UDP networking using java.net stdlib.
 *
 * Skips if kotlinc is not available.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-network-e2e-kotlin')

let hasKotlinc = false

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
  const check = run({ cmd: 'kotlinc', args: ['-version'], cwd: '/' })
  hasKotlinc = check.code === 0
  if (hasKotlinc) {
    mkdirSync(TMP, { recursive: true })
  }
})

afterAll(() => {
  if (existsSync(TMP)) {
    rmSync(TMP, { recursive: true })
  }
})

describe('kotlin E2E: HTTP GET via HttpURLConnection', () => {
  it('fetches httpbin.org/get and verifies response', () => {
    if (!hasKotlinc) return

    const src = `
import java.net.HttpURLConnection
import java.net.URL

fun main() {
    val url = URL("http://httpbin.org/get")
    val conn = url.openConnection() as HttpURLConnection
    conn.requestMethod = "GET"
    conn.connectTimeout = 10000
    conn.readTimeout = 10000

    val status = conn.responseCode
    val body = conn.inputStream.bufferedReader().readText()
    val hasUrl = body.contains("\\"url\\"")

    println("status=\${status}")
    println("has_url=\${hasUrl}")
    println("body_length=\${body.length}")
    conn.disconnect()
}
`
    writeFileSync(resolve(TMP, 'HttpGet.kt'), src)

    const compile = run({
      cmd: 'kotlinc',
      args: [resolve(TMP, 'HttpGet.kt'), '-include-runtime', '-d', resolve(TMP, 'http_get.jar')],
      timeout: 120_000,
    })
    if (compile.code !== 0) {
      console.error('kotlinc stderr:', compile.stderr)
    }
    expect(compile.code).toBe(0)

    const result = run({
      cmd: 'java',
      args: ['-jar', resolve(TMP, 'http_get.jar')],
      timeout: 15_000,
    })
    if (result.code !== 0) {
      console.error('java stderr:', result.stderr)
    }
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('status=200')
    expect(result.stdout).toContain('has_url=true')
  }, 180_000)
})

describe('kotlin E2E: TCP echo roundtrip', () => {
  it('starts TCP server, connects client, echoes data', () => {
    if (!hasKotlinc) return

    const src = `
import java.net.ServerSocket
import java.net.Socket

fun main() {
    val server = ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))
    val port = server.localPort

    val thread = Thread {
        val client = server.accept()
        val input = client.getInputStream()
        val output = client.getOutputStream()
        val buf = ByteArray(1024)
        val n = input.read(buf)
        val msg = "echo:" + String(buf, 0, n)
        output.write(msg.toByteArray())
        output.flush()
        client.close()
    }
    thread.start()

    val client = Socket("127.0.0.1", port)
    client.getOutputStream().write("hello".toByteArray())
    client.getOutputStream().flush()

    val buf = ByteArray(1024)
    val n = client.getInputStream().read(buf)
    val received = String(buf, 0, n)
    println("received=\${received}")

    client.close()
    thread.join()
    server.close()
}
`
    writeFileSync(resolve(TMP, 'TcpEcho.kt'), src)

    const compile = run({
      cmd: 'kotlinc',
      args: [resolve(TMP, 'TcpEcho.kt'), '-include-runtime', '-d', resolve(TMP, 'tcp_echo.jar')],
      timeout: 120_000,
    })
    expect(compile.code).toBe(0)

    const result = run({
      cmd: 'java',
      args: ['-jar', resolve(TMP, 'tcp_echo.jar')],
      timeout: 15_000,
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello')
  }, 180_000)
})

describe('kotlin E2E: UDP echo roundtrip', () => {
  it('sends UDP datagram and gets echo back', () => {
    if (!hasKotlinc) return

    const src = `
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

fun main() {
    val server = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))
    val serverPort = server.localPort

    val client = DatagramSocket(0, InetAddress.getByName("127.0.0.1"))

    // Send from client to server
    val sendData = "hello-udp".toByteArray()
    val sendPacket = DatagramPacket(sendData, sendData.size, InetAddress.getByName("127.0.0.1"), serverPort)
    client.send(sendPacket)

    // Server receives and echoes
    val recvBuf = ByteArray(1024)
    val recvPacket = DatagramPacket(recvBuf, recvBuf.size)
    server.receive(recvPacket)
    val msg = "echo:" + String(recvPacket.data, 0, recvPacket.length)
    val replyData = msg.toByteArray()
    val replyPacket = DatagramPacket(replyData, replyData.size, recvPacket.address, recvPacket.port)
    server.send(replyPacket)

    // Client receives echo
    val echoBuf = ByteArray(1024)
    val echoPacket = DatagramPacket(echoBuf, echoBuf.size)
    client.receive(echoPacket)
    val received = String(echoPacket.data, 0, echoPacket.length)
    println("received=\${received}")

    client.close()
    server.close()
}
`
    writeFileSync(resolve(TMP, 'UdpEcho.kt'), src)

    const compile = run({
      cmd: 'kotlinc',
      args: [resolve(TMP, 'UdpEcho.kt'), '-include-runtime', '-d', resolve(TMP, 'udp_echo.jar')],
      timeout: 120_000,
    })
    expect(compile.code).toBe(0)

    const result = run({
      cmd: 'java',
      args: ['-jar', resolve(TMP, 'udp_echo.jar')],
      timeout: 15_000,
    })
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('received=echo:hello-udp')
  }, 180_000)
})
