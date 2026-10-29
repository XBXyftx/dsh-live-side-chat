/**
 * Host half of the side chat: create a hidden, read-only child session seeded
 * from the invoking session's completed turns, drive it from the sidebar, report
 * progress on demand, and destroy it completely when the user closes the tab.
 *
 * The child is a session with no generic routing: it is hidden from the left
 * list, never prompted through the session-controller RPC, and only reachable
 * through this service. It carries a `subagent/descriptor` because the web
 * client refuses history reads for an origin-`subagent` session without one.
 * @module dsh-side-chat/service
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
import type { ResolvedSideChatConfig } from './config.ts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /** A side chat handed a discussion result back to its main session. */
        'side-chat': {
            kind: 'side-chat';
        } & ContextFormed;
    }
}
/** Destruction outcome reported to the client. */
export interface DestroyResult {
    readonly destroyed: boolean;
    /** Absolute session directories removed from disk. */
    readonly removed: readonly string[];
    /** Why destruction did not complete, when it did not. */
    readonly reason?: string;
}
/** Why a side chat could not be created or driven, with a user-facing message. */
export declare class SideChatError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
/**
 * Owns every live side chat: creation, driving, progress reads, reporting, and
 * destruction.
 */
export declare class SideChatService {
    private readonly ctx;
    private readonly config;
    private readonly entries;
    private readonly byMain;
    constructor(ctx: Context, config: ResolvedSideChatConfig);
    /**
     * Return this session's live side chat, creating one from its completed turns
     * when none exists.
     * @param mainSessionId - session the sidebar belongs to.
     * @returns the side-chat session id.
     */
    create(mainSessionId: string): Promise<{
        sessionId: string;
    }>;
    private createFromObservation;
    /** Read the preset recorded on the main session, when projection data allows. */
    private presetOf;
    /**
     * Resolve the composition for a side chat: the same preset mechanism the
     * session controller uses, expressed through the public preset service.
     */
    private compose;
    /**
     * Register the side chat's own prompt section, tools, read-only guard, and
     * durable policy markers inside its agent scope.
     */
    private composeSideChat;
    /**
     * Accept one sidebar message into the side chat's own inbox.
     * @param childSessionId - side-chat session id.
     * @param text - user text.
     */
    ask(childSessionId: string, text: string): Promise<void>;
    /** Abort the side chat's current turn without discarding queued input. */
    interrupt(childSessionId: string): void;
    /**
     * Destroy one side chat: dispose its agent, then delete its on-disk session
     * and verify the removal through the persistence seam.
     * @param childSessionId - side-chat session id.
     */
    destroy(childSessionId: string): Promise<DestroyResult>;
    /** Disposed by the plugin effect: tear down every live side chat. */
    disposeAll(): Promise<void>;
    /** Resolve a live side-chat agent, resuming it after an application restart. */
    private ensureLive;
    private requireAgent;
    /**
     * Render the main session's progress after this side chat's snapshot.
     * @param childSessionId - side-chat session id (its seed cut is the boundary).
     */
    private progressText;
    /** Read the persisted parent session of one side chat. */
    private parentOf;
    /**
     * Queue one user-confirmed result as a follow-up turn of the main session.
     * The message is delivered only to a live main agent; this service never
     * resumes a cold main session behind the user's back.
     */
    private reportToMain;
}
