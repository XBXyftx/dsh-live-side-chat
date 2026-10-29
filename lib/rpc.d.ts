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
import type { Context } from '@deepseek-ai/cordis';
import { type SideChatService } from './service.ts';
/**
 * Register the side-chat RPC route on the Host web server.
 * @param ctx - Host context carrying the web server and connection services.
 * @param service - the side-chat service every endpoint drives.
 * @returns the route disposer.
 */
export declare function registerSideChatRpc(ctx: Context, service: SideChatService): () => void;
