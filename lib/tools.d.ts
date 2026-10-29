/**
 * Model-facing tools of one side chat: read the main session's progress since
 * the snapshot, and (optionally) hand a discussion result back to the main
 * session as a queued follow-up turn.
 *
 * Both tools are registered inside the side-chat agent's own setup scope, so no
 * other agent can see or call them.
 * @module dsh-side-chat/tools
 */
/** Host callbacks one side-chat agent's tools bind to. */
export interface SideChatToolDeps {
    /** Render the main session's progress after this chat's snapshot. */
    readonly progress: () => Promise<string>;
    /** Queue one report as a follow-up turn of the main session. */
    readonly report: (text: string) => Promise<{
        readonly delivered: boolean;
        readonly detail: string;
    }>;
}
/**
 * Build the tools for one side chat.
 * @param deps - callbacks bound to that chat's main and side session ids.
 * @returns the tool definitions to register in the side-chat agent scope.
 */
export declare function createSideChatTools(deps: SideChatToolDeps): readonly [import("@deepseek-ai/dsh-tools").ToolDefinition, import("@deepseek-ai/dsh-tools").ToolDefinition];
