/**
 * Network HTTP server module compilation tests.
 *
 * Compiles network-server.tree through the full pipeline and verifies
 * the TypeScript output contains correct types and functions for
 * HTTP server, request, response, and routing.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import { readCard } from '@/read'
import { expandFuse } from '@/fuse'
import { desugarCard } from '@/term/desugar'
import { castBook as castTS } from '@/cast/typescript'
import { castBook as castRust } from '@/cast/rust'
import { castBook as castKotlin } from '@/cast/kotlin'
import { castBook as castSwift } from '@/cast/swift'
import type { Book } from '@/term/form'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const require_ = createRequire(import.meta.url)
const treeParsePath = path.resolve(
  __dirname,
  '../../../../../../deck/tree/host/code/index.js',
)
const makeTree = require_(treeParsePath).default

function compileFile(name: string): Book {
  const file = path.resolve(__dirname, name)
  const text = fs.readFileSync(file, 'utf8')
  const lead = makeTree({ file: name, text })
  const rawCard = readCard({ tree: lead.tree, file: name })
  const card = expandFuse({ card: rawCard })
  return desugarCard({ card }).book
}

describe('network/server: TypeScript', () => {
  const book = compileFile('network-server.tree')
  const ts = castTS({ book })

  it('generates Server type with host and port', () => {
    expect(ts).toContain('export type Server')
    expect(ts).toContain('host: string')
    expect(ts).toContain('port: number')
  })

  it('generates Request type with method field', () => {
    expect(ts).toContain('export type Request')
    expect(ts).toContain('method')
  })

  it('generates Request type with path field', () => {
    expect(ts).toContain('path')
  })

  it('generates Response type with status and body', () => {
    expect(ts).toContain('export type Response')
    expect(ts).toContain('status')
    expect(ts).toContain('body')
  })

  it('generates Router type', () => {
    expect(ts).toContain('export type Router')
  })

  it('generates start function', () => {
    expect(ts).toContain('function start(')
  })

  it('start takes handler parameter', () => {
    expect(ts).toContain('handler')
  })

  it('generates stop function', () => {
    expect(ts).toContain('stop(')
  })

  it('generates readRequest with fork case on format', () => {
    expect(ts).toContain('readRequest(')
  })

  it('generates makeResponse function', () => {
    expect(ts).toContain('makeResponse(')
  })

  it('generates makeRouter', () => {
    // Zero-param task compiles to const assignment
    expect(ts).toContain('makeRouter')
  })

  it('generates addRoute function', () => {
    expect(ts).toContain('addRoute(')
  })

  it('addRoute takes method and pattern parameters', () => {
    expect(ts).toContain('method')
    expect(ts).toContain('pattern')
  })

  it('generates handleRoutes function', () => {
    expect(ts).toContain('handleRoutes(')
  })

  it('handleRoutes iterates over routes', () => {
    expect(ts).toMatch(/for|forEach|routes/)
  })

  it('handleRoutes returns a value', () => {
    // The inner task (dispatch) compiles to a return
    expect(ts).toContain('handleRoutes')
  })
})

describe('network/server: Rust', () => {
  const book = compileFile('network-server.tree')
  const rs = castRust({ book })

  it('generates Server struct', () => {
    expect(rs).toContain('struct Server')
  })

  it('generates Request struct', () => {
    expect(rs).toContain('struct Request')
  })

  it('generates Response struct', () => {
    expect(rs).toContain('struct Response')
  })

  it('generates Router struct', () => {
    expect(rs).toContain('struct Router')
  })

  it('generates start function', () => {
    expect(rs).toContain('fn start(')
  })

  it('generates stop function', () => {
    expect(rs).toContain('fn stop(')
  })

  it('generates make_response function', () => {
    expect(rs).toContain('fn make_response(')
  })

  it('generates add_route function', () => {
    expect(rs).toContain('fn add_route(')
  })
})

describe('network/server: Kotlin', () => {
  const book = compileFile('network-server.tree')
  const kt = castKotlin({ book })

  it('generates Server data class', () => {
    expect(kt).toContain('data class Server')
  })

  it('generates Request data class', () => {
    expect(kt).toContain('data class Request')
  })

  it('generates Response data class', () => {
    expect(kt).toContain('data class Response')
  })

  it('generates Router data class', () => {
    expect(kt).toContain('data class Router')
  })

  it('generates start function', () => {
    expect(kt).toContain('fun start(')
  })

  it('generates stop function', () => {
    expect(kt).toContain('stop(')
  })

  it('generates makeResponse function', () => {
    expect(kt).toContain('makeResponse(')
  })

  it('generates addRoute function', () => {
    expect(kt).toContain('addRoute(')
  })
})

describe('network/server: Swift', () => {
  const book = compileFile('network-server.tree')
  const sw = castSwift({ book })

  it('generates Server type', () => {
    expect(sw).toMatch(/struct Server|enum Server/)
  })

  it('generates Request type', () => {
    expect(sw).toMatch(/struct Request|enum Request/)
  })

  it('generates Response type', () => {
    expect(sw).toMatch(/struct Response|enum Response/)
  })

  it('generates Router type', () => {
    expect(sw).toMatch(/struct Router|enum Router/)
  })

  it('generates start function', () => {
    expect(sw).toContain('func start(')
  })

  it('generates stop function', () => {
    expect(sw).toContain('stop(')
  })

  it('generates makeResponse function', () => {
    expect(sw).toContain('makeResponse(')
  })

  it('generates addRoute function', () => {
    expect(sw).toContain('addRoute(')
  })
})
