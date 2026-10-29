/**
 * dsh-side-chat: a Codex-style side chat inside the right sidebar.
 *
 * The Host half creates a hidden, read-only child session seeded from the
 * invoking session's completed turns, exposes it to the browser half over a
 * private Connection RPC channel, gives the side chat read-only progress and
 * report tools, and destroys the session when the user closes the tab.
 *
 * The browser half ships as `./client` (a ModuleLoader factory) and owns the
 * guide entry, the `/btw` command, the sidebar tab, and the close confirmation.
 * @module dsh-side-chat
 */
import { Config } from "./config.js";
import { registerSideChatRpc } from "./rpc.js";
import { SideChatService } from "./service.js";
export const name = 'side-chat';
/**
 * Services that must exist for the sidebar to create and drive a side chat.
 * `connection` and `webServer` are part of the dependency set because Connection
 * attributes its web route to the context that reads the service, so the plugin
 * root itself must own both (a runtime `ctx.inject` child does not).
 */
export const inject = ['agents', 'sessions', 'sessionQuery', 'tools', 'systemPrompt', 'connection', 'webServer'];
export { Config };
export { SIDE_SESSION_PREFIX, PLUGIN_ID, RPC_CHANNEL, RESOURCE_PREFIX } from "./protocol.js";
/**
 * Mount the Host half.
 * @param ctx - Host context.
 * @param config - validated deployment configuration.
 */
export function apply(ctx, config) {
    const service = new SideChatService(ctx, config);
    ctx.effect(() => () => service.disposeAll(), 'dsh-side-chat: dispose live side chats');
    ctx.effect(() => registerSideChatRpc(ctx, service), 'dsh-side-chat: rpc channel');
}
