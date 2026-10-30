/**
 * The client-facing RPC channel of the side chat.
 *
 * An out-of-repo plugin cannot publish generated Typert Remote artifacts, and
 * Connection's generic channel registry attributes its web route to the
 * service's own context, so this plugin mounts its channel directly on the web
 * server: one authenticated `POST /side-chat/<endpoint>` route, owner peers
 * only (Connection applies the Host/Origin and browser-credential fence before
 * the handler runs), plain JSON in and out. Every payload is validated here —
 * nothing arriving on the wire is trusted.
 * @module dsh-side-chat/rpc
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { RPC_CHANNEL } from './protocol.ts'
import { SideChatError, type DestroyResult, type SideChatService } from './service.ts'

/** Largest request body one endpoint accepts. */
const MAX_BODY_BYTES = 64 * 1024

/** Structural slice of the web server route registry this plugin uses. */
interface WebServerLike {
  register(route: {
    readonly kind: 'prefix'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

/** Structural slice of the Connection admission check. */
interface ConnectionLike {
  requestRejection(request: { readonly headers: unknown }): 401 | 403 | undefined
}

type RpcResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const

function fail(code: string, message: string): RpcResult {
  return { ok: false, error: { code, message } }
}

function readString(payload: unknown, field: string): string {
  if (typeof payload !== 'object' || payload === null) {
    throw new SideChatError('bad-request', `缺少 ${field}。`)
  }
  const value = (payload as Record<string, unknown>)[field]
  if (typeof value !== 'string' || value.length === 0) {
    throw new SideChatError('bad-request', `${field} 必须是非空字符串。`)
  }
  return value
}

/** Read one JSON request body within the size cap. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new SideChatError('body-too-large', '请求体过大。')
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim().length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new SideChatError('bad-json', '请求体不是合法 JSON。')
  }
}

/** Resolve the endpoint name from `/side-chat/<endpoint>`. */
function endpointOf(requestUrl: string | undefined): string | undefined {
  if (requestUrl === undefined) return undefined
  let pathname: string
  try {
    pathname = new URL(requestUrl, 'http://localhost').pathname
  } catch {
    return undefined
  }
  if (!pathname.startsWith(`${RPC_CHANNEL}/`)) return undefined
  const endpoint = pathname.slice(RPC_CHANNEL.length + 1)
  if (endpoint.length === 0 || endpoint.includes('/')) return undefined
  return endpoint
}

async function dispatch(service: SideChatService, endpoint: string, payload: unknown): Promise<RpcResult> {
  switch (endpoint) {
    case 'create': {
      const created = await service.create(readString(payload, 'parentSessionId'))
      return { ok: true, value: created }
    }
    case 'ask': {
      await service.ask(readString(payload, 'sessionId'), readString(payload, 'text'))
      return { ok: true, value: { accepted: true } }
    }
    case 'models': {
      const state = await service.modelState(readString(payload, 'sessionId'))
      return { ok: true, value: state }
    }
    case 'select-model': {
      const result = await service.selectModel(readString(payload, 'sessionId'), {
        provider: readString(payload, 'provider'),
        model: readString(payload, 'model'),
      })
      return { ok: true, value: result }
    }
    case 'digest': {
      const text = await service.contextPreview(readString(payload, 'sessionId'))
      return { ok: true, value: { text } }
    }
    case 'interrupt': {
      service.interrupt(readString(payload, 'sessionId'))
      return { ok: true, value: { interrupted: true } }
    }
    case 'destroy': {
      const result: DestroyResult = await service.destroy(readString(payload, 'sessionId'))
      return { ok: true, value: result }
    }
    default:
      return fail('unknown-endpoint', `未知的侧边对话请求：${endpoint}`)
  }
}

/**
 * Register the side-chat RPC route on the Host web server.
 * @param ctx - Host context carrying the web server and connection services.
 * @param service - the side-chat service every endpoint drives.
 * @returns the route disposer.
 */
export function registerSideChatRpc(ctx: Context, service: SideChatService): () => void {
  const webServer = (ctx as unknown as { webServer?: WebServerLike }).webServer
  const connection = (ctx as unknown as { connection?: ConnectionLike }).connection
  if (webServer === undefined || connection === undefined) {
    throw new Error('dsh-side-chat: connection/webServer are missing; the sidebar cannot reach the Host')
  }
  return webServer.register({
    kind: 'prefix',
    path: RPC_CHANNEL,
    handler: async (req, res) => {
      const rejection = connection.requestRejection({ headers: req.headers })
      if (rejection !== undefined) {
        res.writeHead(rejection)
        res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
        return
      }
      if (req.method !== 'POST') {
        res.writeHead(405)
        res.end()
        return
      }
      const endpoint = endpointOf(req.url)
      if (endpoint === undefined) {
        res.writeHead(404, JSON_HEADERS)
        res.end(JSON.stringify(fail('unknown-endpoint', '未知的侧边对话请求。')))
        return
      }
      let result: RpcResult
      try {
        result = await dispatch(service, endpoint, await readJsonBody(req))
      } catch (error) {
        if (error instanceof SideChatError) result = fail(error.code, error.message)
        else result = fail('side-chat/internal', error instanceof Error ? error.message : String(error))
      }
      res.writeHead(200, JSON_HEADERS)
      res.end(JSON.stringify(result))
    },
  })
}
