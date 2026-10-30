/**
 * Host half of the side chat: a hidden, read-only conversation that opens empty
 * and follows another session's work live.
 *
 * A side chat is NOT a fork. It starts with no inherited history, so its tab
 * opens as an empty conversation, and it learns about the main session through
 * two channels instead: the bounded live digest of that session (folded by this
 * plugin as a session projection, injected as runtime context on every step)
 * and read-only tools for the details the digest leaves out. It reports back
 * only when the user asks for it. Closing the tab destroys the session.
 *
 * The child carries a `subagent/descriptor` because the web client refuses
 * history reads for an origin-`subagent` session without one.
 * @module dsh-side-chat/service
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ModelSelection } from '@deepseek-ai/dsh-agent';
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
/** One selectable model of the Host's live LLM registry. */
export interface SideChatModel {
    readonly provider: string;
    readonly model: string;
    /** Provider-owned display name. */
    readonly name: string;
    /** Provider display name, for grouping in a picker. */
    readonly providerName: string;
}
/** Current model of one side chat plus everything selectable. */
export interface SideChatModelState {
    /** Selection applied to the next request: the pending choice or the last routed model. */
    readonly current: ModelSelection | null;
    /** Every currently routable model, grouped by provider order. */
    readonly models: readonly SideChatModel[];
}
/**
 * Owns every live side chat: creation, driving, live-digest context, bounded log
 * reads, reporting, and destruction.
 */
export declare class SideChatService {
    private readonly ctx;
    private readonly config;
    private readonly entries;
    private readonly byMain;
    /** Last digest read from a main session's log while that session was not live. */
    private readonly fallbacks;
    /** Model chosen for a side chat whose agent is not live yet; consumed on resume. */
    private readonly pendingModels;
    constructor(ctx: Context, config: ResolvedSideChatConfig);
    /**
     * Return this session's live side chat, creating an empty one when none exists.
     * @param mainSessionId - session the sidebar belongs to.
     * @returns the side-chat session id and its main session id.
     */
    create(mainSessionId: string): Promise<{
        sessionId: string;
        mainSessionId: string;
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
     * Register the side chat's own prompt guidance, live main-session digest,
     * tools, read-only guard, and durable policy markers inside its agent scope.
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
    /**
     * Every model this Host can currently route, plus the side chat's current
     * selection, for the composer's model chip.
     * @param childSessionId - side-chat session id.
     */
    modelState(childSessionId: string): Promise<SideChatModelState>;
    /**
     * Route the next side-chat request to another model.
     * @param childSessionId - side-chat session id.
     * @param selection - requested provider/model pair.
     * @returns the selection the Host resolved and installed.
     */
    selectModel(childSessionId: string, selection: {
        provider: string;
        model: string;
    }): Promise<{
        selected: ModelSelection;
    }>;
    /** Read the side chat's own digest, carrying its last routed model. */
    private readDigestOf;
    /** Enumerate the Host's routable models, tolerating per-provider failures. */
    private listModels;
    private requireAgent;
    /** Resolve the main session id of one side chat from memory, then from its log. */
    private mainOf;
    /**
     * Read the main session's digest: from the live fold when that session is
     * live, otherwise from the last digest read from its log.
     */
    private readDigest;
    /**
     * Render the runtime-context block injected into the side chat on every step.
     * @param mainSessionId - subject session.
     * @param cwd - subject working directory captured at creation.
     */
    private mainContextText;
    /**
     * Render the exact background block this side chat sees right now, so the
     * user can inspect what the model reads. Same function the prompt context
     * provider uses, so the panel cannot drift from the injection.
     * @param childSessionId - side-chat session id.
     */
    contextPreview(childSessionId: string): Promise<string>;
    /** Prepend the digest of a fallback observation so a cold read still answers. */
    private refreshFallback;
    /**
     * Render the freshest reading of the main session for the status tool.
     * @param childSessionId - side-chat session id.
     */
    private statusText;
    /**
     * Render a bounded slice of the main session's log for the history tool.
     * @param childSessionId - side-chat session id.
     * @param query - turn and/or literal filters.
     */
    private historyText;
    /**
     * Queue one user-confirmed result as a follow-up turn of the main session.
     * The message is delivered only to a live main agent; this service never
     * resumes a cold main session behind the user's back.
     */
    private reportToMain;
}
