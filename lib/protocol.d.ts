/**
 * Shared vocabulary for the side-chat plugin: the RPC channel, the resource
 * address the web client opens, the durable marker on a side-chat session, and
 * the mutating tools a read-only side chat must never call.
 *
 * Pure data plus pure helpers, so it is unit-testable without a Host.
 * @module dsh-side-chat/protocol
 */
/** Stable implementation identity, also the client tab-type id and locale namespace. */
export declare const PLUGIN_ID = "dsh-side-chat";
/** Logical Connection RPC channel owned by the Host half. */
export declare const RPC_CHANNEL = "/side-chat";
/** Resource protocol the client registers for one side-chat conversation tab. */
export declare const RESOURCE_PROTOCOL = "sidechat";
/** Address prefix for one side-chat conversation, keyed by the side session id. */
export declare const RESOURCE_PREFIX = "dsh-resource://sidechat/session/";
/** Prefix of every session id this plugin creates; the startup sweep relies on it. */
export declare const SIDE_SESSION_PREFIX = "session-side-chat-";
/** Descriptor provider name recorded on each side-chat session. */
export declare const DESCRIPTOR_PROVIDER = "side-chat";
/** Durable creation label recorded on each side-chat session. */
export declare const DESCRIPTOR_LABEL = "Side chat";
/** Messages the side chat may send to its main session carry this source kind. */
export declare const MAIN_MESSAGE_KIND = "side-chat";
/** Names of model-facing tools registered only inside a side-chat agent. */
export declare const PROGRESS_TOOL = "side_chat_progress";
export declare const REPORT_TOOL = "side_chat_report";
/**
 * Tools that can mutate the workspace or spawn unmetered work. A read-only side
 * chat denies them by name in addition to its sandbox mode, because a sandbox
 * refuses the write while the tool itself still runs (and can burn tokens).
 */
export declare const MUTATING_TOOLS: readonly string[];
/** Compose the sidebar resource address of one side chat. */
export declare function sideChatAddress(sessionId: string): string;
/**
 * Parse one sidebar resource address.
 * @param address - possible `dsh-resource://sidechat/session/<id>` address.
 * @returns the encoded session id, or `undefined` for any other address.
 */
export declare function parseSideChatAddress(address: string): string | undefined;
/** Whether a session id was minted by this plugin. */
export declare function isSideChatSessionId(value: unknown): boolean;
