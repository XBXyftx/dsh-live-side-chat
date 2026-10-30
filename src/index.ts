/**
 * dsh-side-chat: a Codex-style side chat inside the right sidebar.
 *
 * The Host half creates a hidden, read-only child session that opens EMPTY, so
 * the user can ask about the current work without interrupting it. The child
 * learns about its main session through the plugin's bounded live digest fold
 * (injected as runtime context on every step) and two read-only tools; it
 * reports back only when asked, and closing the tab destroys it.
 *
 * The browser half ships as `./client` (a ModuleLoader factory) and owns the
 * guide entry, the `/btw` command, the sidebar tab, the live status strip, and
 * the close confirmation.
 * @module dsh-side-chat
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, type ResolvedSideChatConfig, type SideChatConfig } from './config.ts'
import { createDigestProjection } from './digest.ts'
import { registerSideChatRpc } from './rpc.ts'
import { SideChatService } from './service.ts'

export const name = 'side-chat'

/**
 * Services that must exist for the sidebar to create and drive a side chat.
 * `connection` and `webServer` are part of the dependency set because Connection
 * attributes its web route to the context that reads the service, so the plugin
 * root itself must own both (a runtime `ctx.inject` child does not).
 * `sessionProjections` carries the live digest the side chat reads, and `llm`
 * enumerates and validates the models its composer can switch to.
 */
export const inject = [
  'agents', 'sessions', 'sessionQuery', 'sessionProjections', 'tools', 'systemPrompt', 'llm',
  'connection', 'webServer',
]

export { Config }
export type { SideChatConfig }
export { DIGEST_KEY, type SessionDigest } from './digest.ts'
export { SIDE_SESSION_PREFIX, PLUGIN_ID, RPC_CHANNEL, RESOURCE_PREFIX } from './protocol.ts'

/**
 * Mount the Host half.
 * @param ctx - Host context.
 * @param config - validated deployment configuration.
 */
export function apply(ctx: Context, config: ResolvedSideChatConfig): void {
  // The digest is a session projection so it is folded incrementally by the
  // framework, persisted by the projection cache, and pushed to the browser by
  // the Host-wide control stream — one mechanism for the model and the strip.
  ctx.sessionProjections.register(createDigestProjection({ turns: config.digestTurns, recentTools: 8, openTools: 6, todos: 12 }))
  const service = new SideChatService(ctx, config)
  ctx.effect(() => () => service.disposeAll(), 'dsh-side-chat: dispose live side chats')
  ctx.effect(() => registerSideChatRpc(ctx, service), 'dsh-side-chat: rpc channel')
}
