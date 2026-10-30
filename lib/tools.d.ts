/**
 * Model-facing tools of one side chat: read the main session's live digest,
 * query its log for the details the digest leaves out, and (optionally) hand a
 * discussion result back to the main session as a queued follow-up turn.
 *
 * All three are registered inside the side-chat agent's own setup scope, so no
 * other agent can see or call them.
 * @module dsh-side-chat/tools
 */
/** Host callbacks one side-chat agent's tools bind to. */
export interface SideChatToolDeps {
    /** Render the main session's current digest and status. */
    readonly status: () => Promise<string>;
    /** Read part of the main session's log. */
    readonly history: (query: SideChatHistoryQuery) => Promise<string>;
    /** Queue one report as a follow-up turn of the main session. */
    readonly report: (text: string) => Promise<{
        readonly delivered: boolean;
        readonly detail: string;
    }>;
}
/** One bounded read of the main session's log. */
export interface SideChatHistoryQuery {
    /** Restrict to one turn number. */
    readonly turn?: number;
    /** Restrict to events whose text contains this literal (case-insensitive). */
    readonly contains?: string;
    /** Maximum rendered lines; the host clamps it. */
    readonly limit?: number;
}
/**
 * Build the tools for one side chat.
 * @param deps - callbacks bound to that chat's main and side session ids.
 * @returns the tool definitions to register in the side-chat agent scope.
 */
export declare function createSideChatTools(deps: SideChatToolDeps): readonly [import("@deepseek-ai/dsh-tools").ToolDefinition, import("@deepseek-ai/dsh-tools").ToolDefinition, import("@deepseek-ai/dsh-tools").ToolDefinition];
