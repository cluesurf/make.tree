/**
 * Kotlin E2E platform tests: compile Kotlin source, execute JAR, verify output.
 *
 * Tests file I/O, text operations, clock, cryptography, and process management
 * using the same JVM APIs that base.tree/code/native/kotlin/ wraps.
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
const TMP = resolve(MAKE_ROOT, 'tmp', 'test-e2e-kotlin-platform')

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

function compile(input: {
  name: string
  src: string
}): { code: number; stdout: string; stderr: string } {
  const srcPath = resolve(TMP, `${input.name}.kt`)
  const jarPath = resolve(TMP, `${input.name}.jar`)
  writeFileSync(srcPath, input.src)

  const comp = run({
    cmd: 'kotlinc',
    args: [srcPath, '-include-runtime', '-d', jarPath],
    timeout: 120_000,
  })
  if (comp.code !== 0) {
    return comp
  }

  return run({
    cmd: 'java',
    args: ['-jar', jarPath],
    timeout: 30_000,
  })
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

describe('kotlin E2E: file I/O', () => {
  it('writes, reads, appends, copies, tests, and removes files', () => {
    if (!hasKotlinc) return

    const src = `
import java.io.File
import java.nio.file.Files
import java.nio.file.Paths
import java.nio.file.StandardCopyOption

fun main() {
    val dir = System.getProperty("java.io.tmpdir") + "/seed-kt-file-test"
    File(dir).mkdirs()

    val path = dir + "/hello.txt"

    // write
    File(path).writeText("hello world", Charsets.UTF_8)
    println("write=ok")

    // read
    val content = File(path).readText(Charsets.UTF_8)
    println("read=\${content}")

    // append
    File(path).appendText(" appended", Charsets.UTF_8)
    val after = File(path).readText(Charsets.UTF_8)
    println("append=\${after}")

    // copy
    val copyPath = dir + "/hello-copy.txt"
    Files.copy(Paths.get(path), Paths.get(copyPath), StandardCopyOption.REPLACE_EXISTING)
    println("copy_exists=\${Files.exists(Paths.get(copyPath))}")

    // test
    println("is_file=\${Files.isRegularFile(Paths.get(path))}")
    println("is_dir=\${Files.isDirectory(Paths.get(dir))}")
    println("exists=\${Files.exists(Paths.get(path))}")

    // list directory
    val entries = File(dir).list()?.toList() ?: emptyList()
    println("list_count=\${entries.size}")

    // move
    val movePath = dir + "/hello-moved.txt"
    Files.move(Paths.get(copyPath), Paths.get(movePath), StandardCopyOption.REPLACE_EXISTING)
    println("move_exists=\${Files.exists(Paths.get(movePath))}")
    println("move_source_gone=\${!Files.exists(Paths.get(copyPath))}")

    // remove
    Files.deleteIfExists(Paths.get(path))
    Files.deleteIfExists(Paths.get(movePath))
    println("removed=\${!Files.exists(Paths.get(path))}")

    // cleanup
    File(dir).deleteRecursively()
}
`
    const result = compile({ name: 'FileOps', src })
    if (result.code !== 0) console.error('stderr:', result.stderr)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('write=ok')
    expect(result.stdout).toContain('read=hello world')
    expect(result.stdout).toContain('append=hello world appended')
    expect(result.stdout).toContain('copy_exists=true')
    expect(result.stdout).toContain('is_file=true')
    expect(result.stdout).toContain('is_dir=true')
    expect(result.stdout).toContain('exists=true')
    expect(result.stdout).toContain('list_count=2')
    expect(result.stdout).toContain('move_exists=true')
    expect(result.stdout).toContain('move_source_gone=true')
    expect(result.stdout).toContain('removed=true')
  }, 180_000)
})

describe('kotlin E2E: text operations', () => {
  it('performs string manipulation', () => {
    if (!hasKotlinc) return

    const src = `
fun main() {
    val s = "Hello, World!"
    println("length=\${s.length}")
    println("upper=\${s.uppercase()}")
    println("lower=\${s.lowercase()}")
    println("trim=\${"  hi  ".trim()}")
    println("starts=\${s.startsWith("Hello")}")
    println("ends=\${s.endsWith("World!")}")
    println("contains=\${s.contains("World")}")
    println("indexOf=\${s.indexOf("World")}")
    println("slice=\${s.substring(0, 5)}")
    println("replace=\${s.replace("World", "Kotlin")}")
    println("replaceFirst=\${s.replaceFirst("l", "L")}")
    println("split=\${s.split(", ").size}")
    println("join=\${listOf("a", "b", "c").joinToString("-")}")
}
`
    const result = compile({ name: 'TextOps', src })
    if (result.code !== 0) console.error('stderr:', result.stderr)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('length=13')
    expect(result.stdout).toContain('upper=HELLO, WORLD!')
    expect(result.stdout).toContain('lower=hello, world!')
    expect(result.stdout).toContain('trim=hi')
    expect(result.stdout).toContain('starts=true')
    expect(result.stdout).toContain('ends=true')
    expect(result.stdout).toContain('contains=true')
    expect(result.stdout).toContain('indexOf=7')
    expect(result.stdout).toContain('slice=Hello')
    expect(result.stdout).toContain('replace=Hello, Kotlin!')
    expect(result.stdout).toContain('replaceFirst=HeLlo, World!')
    expect(result.stdout).toContain('split=2')
    expect(result.stdout).toContain('join=a-b-c')
  }, 180_000)
})

describe('kotlin E2E: clock', () => {
  it('gets current time and sleeps', () => {
    if (!hasKotlinc) return

    const src = `
fun main() {
    val before = System.currentTimeMillis()
    Thread.sleep(100)
    val after = System.currentTimeMillis()
    val elapsed = after - before
    println("before_positive=\${before > 0}")
    println("elapsed_ok=\${elapsed >= 80}")
    val nano = System.nanoTime()
    println("nano_positive=\${nano > 0}")
}
`
    const result = compile({ name: 'ClockOps', src })
    if (result.code !== 0) console.error('stderr:', result.stderr)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('before_positive=true')
    expect(result.stdout).toContain('elapsed_ok=true')
    expect(result.stdout).toContain('nano_positive=true')
  }, 180_000)
})

describe('kotlin E2E: cryptography', () => {
  it('computes SHA-256 digest and generates random bytes', () => {
    if (!hasKotlinc) return

    const src = `
import java.security.MessageDigest
import java.security.SecureRandom

fun main() {
    // SHA-256 of "hello"
    val md = MessageDigest.getInstance("SHA-256")
    val bytes = md.digest("hello".toByteArray(Charsets.UTF_8))
    val hex = bytes.joinToString("") { "%02x".format(it) }
    println("sha256=\${hex}")

    // random bytes
    val random = ByteArray(16)
    SecureRandom().nextBytes(random)
    println("random_length=\${random.size}")
    println("random_not_zero=\${random.any { it.toInt() != 0 }}")
}
`
    const result = compile({ name: 'CryptoOps', src })
    if (result.code !== 0) console.error('stderr:', result.stderr)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(
      'sha256=2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
    expect(result.stdout).toContain('random_length=16')
    expect(result.stdout).toContain('random_not_zero=true')
  }, 180_000)
})

describe('kotlin E2E: process', () => {
  it('runs a subprocess and captures output', () => {
    if (!hasKotlinc) return

    const src = `
fun main() {
    val pb = ProcessBuilder(listOf("echo", "seed-test-output"))
    pb.redirectErrorStream(false)
    val proc = pb.start()
    val stdout = proc.inputStream.bufferedReader().readText().trim()
    val stderr = proc.errorStream.bufferedReader().readText()
    proc.waitFor()
    val code = proc.exitValue()
    println("code=\${code}")
    println("stdout=\${stdout}")
    println("stderr_empty=\${stderr.isEmpty()}")
}
`
    const result = compile({ name: 'ProcessOps', src })
    if (result.code !== 0) console.error('stderr:', result.stderr)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('code=0')
    expect(result.stdout).toContain('stdout=seed-test-output')
    expect(result.stdout).toContain('stderr_empty=true')
  }, 180_000)
})

describe('kotlin E2E: HTTP send', () => {
  it('sends GET request via java.net.http.HttpClient', () => {
    if (!hasKotlinc) return

    const src = `
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration

fun main() {
    val client = HttpClient.newBuilder()
        .followRedirects(HttpClient.Redirect.ALWAYS)
        .connectTimeout(Duration.ofMillis(10000))
        .build()
    val request = HttpRequest.newBuilder()
        .uri(URI.create("http://httpbin.org/get"))
        .method("GET", HttpRequest.BodyPublishers.noBody())
        .timeout(Duration.ofMillis(10000))
        .build()
    val response = client.send(request, HttpResponse.BodyHandlers.ofString())
    println("status=\${response.statusCode()}")
    println("has_url=\${response.body().contains("\\"url\\"")}")
    println("ok=\${response.statusCode() in 200..299}")
}
`
    const result = compile({ name: 'HttpSend', src })
    if (result.code !== 0) console.error('stderr:', result.stderr)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('status=200')
    expect(result.stdout).toContain('has_url=true')
    expect(result.stdout).toContain('ok=true')
  }, 180_000)
})
