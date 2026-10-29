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
import type { Context } from '@deepseek-ai/cordis';
import { Config, type ResolvedSideChatConfig, type SideChatConfig } from './config.ts';
export declare const name = "side-chat";
/**
 * Services that must exist for the sidebar to create and drive a side chat.
 * `connection` and `webServer` are part of the dependency set because Connection
 * attributes its web route to the context that reads the service, so the plugin
 * root itself must own both (a runtime `ctx.inject` child does not).
 */
export declare const inject: string[];
export { Config };
export type { SideChatConfig };
export { SIDE_SESSION_PREFIX, PLUGIN_ID, RPC_CHANNEL, RESOURCE_PREFIX } from './protocol.ts';
/**
 * Mount the Host half.
 * @param ctx - Host context.
 * @param config - validated deployment configuration.
 */
export declare function apply(ctx: Context, config: ResolvedSideChatConfig): void;
