/**
 * The bounded live digest of one session, folded as a session projection.
 *
 * The side chat does not see the main session's log. It sees this digest: the
 * goal, a one-line summary of every recent turn, the open turn's prompt,
 * latest reply and recent tool calls, the standing todo list, and counters. The
 * fold is pure and synchronous because the projection framework drives it on
 * every committed event of every session; its state is plain JSON so the
 * persisted projection cache can rebuild it after a restart.
 *
 * A wire unit (not host-only) so the browser half renders the same facts the
 * model reads, from the Host-wide control stream, without opening the session.
 * @module dsh-side-chat/digest
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { SessionHeader, SessionLogOffset } from '@deepseek-ai/dsh-session';
import type { ZodType } from 'zod';
/** Projection key of the live session digest. */
export declare const DIGEST_KEY = "sideChatDigest";
/** One summarized tool invocation of the subject session. */
export interface DigestTool {
    /** Registered tool name. */
    readonly name: string;
    /** Best-effort one-line argument summary (path, command, pattern, query). */
    readonly target: string;
}
/** One settled turn of the subject session. */
export interface DigestTurn {
    /** Host-assigned turn number. */
    readonly turn: number;
    /** First human prompt of the turn, bounded. */
    readonly prompt: string;
    /** Final text-bearing assistant message of the turn, bounded. */
    readonly response: string;
    /** Number of tool calls the turn made. */
    readonly tools: number;
    /** Number of failed tool calls and turn-level failures in the turn. */
    readonly errors: number;
}
/** The turn the subject session is running right now, when it is open. */
export interface DigestOpenTurn {
    /** Turn number. */
    readonly turn: number;
    /** First human prompt of the turn, bounded. */
    readonly prompt: string;
    /** Highest step number reached. */
    readonly steps: number;
    /** Newest text-bearing assistant message of the turn, bounded. */
    readonly lastAssistant: string;
    /** Wall-clock time of the turn's `turn/start`. */
    readonly startedAt: number;
    /** Most recent tool calls of the turn, oldest first. */
    readonly tools: readonly DigestTool[];
    /** Failed calls observed in this turn. */
    readonly errors: number;
}
/** One standing todo item of the subject session. */
export interface DigestTodo {
    readonly content: string;
    readonly status: 'pending' | 'in_progress' | 'completed';
}
/** The provider/model pair a session last used for one model request. */
export interface DigestModel {
    readonly provider: string;
    readonly model: string;
}
/** Wire and fold state of the live session digest. */
export interface SessionDigest {
    /** First human prompt of the session, bounded; `''` before the first prompt. */
    readonly goal: string;
    /** Recent settled turns, oldest first. */
    readonly turns: readonly DigestTurn[];
    /** Open turn, or `null` between turns. */
    readonly openTurn: DigestOpenTurn | null;
    /** Latest whole todo list, or `null` when the session never wrote one. */
    readonly todos: readonly DigestTodo[] | null;
    /** Most recent tool calls across the session, oldest first. */
    readonly recentTools: readonly DigestTool[];
    /** Provider/model of the newest logged request, or `null` before the first one. */
    readonly model: DigestModel | null;
    /** Newest failure reason, bounded. */
    readonly lastError: string | null;
    /** Monotonic counters that survive the bounded arrays. */
    readonly counts: {
        readonly turns: number;
        readonly tools: number;
        readonly errors: number;
    };
    /** Wall-clock time of the newest folded event. */
    readonly lastActivityAt: number;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        /** Bounded live digest of one session; see {@link SessionDigest}. */
        sideChatDigest: SessionDigest;
    }
    interface SessionProjectionMap {
        /** Bounded live digest of one session; see {@link SessionDigest}. */
        sideChatDigest: SessionDigest;
    }
}
/** Per-session caps of the fold; deployments may widen the turn count. */
export interface DigestLimits {
    /** Settled turns retained per session. */
    readonly turns: number;
    /** Tool calls retained across the session. */
    readonly recentTools: number;
    /** Tool calls retained inside the open turn. */
    readonly openTools: number;
    /** Todo items retained from the latest whole list. */
    readonly todos: number;
}
/** Default caps: small enough that every session can carry the fold. */
export declare const DEFAULT_LIMITS: DigestLimits;
/**
 * Summarize one tool call's raw JSON argument string.
 * @param raw - `arguments` exactly as the model produced it.
 * @returns a bounded one-line target, or `''` when the arguments carry none of
 * the recognized fields or are not JSON.
 */
export declare function toolTarget(raw: string): string;
/** Empty digest used before the first folded event and as the schema default. */
export declare function emptyDigest(): SessionDigest;
/**
 * Fold implementation of the digest projection, exposed for tests.
 * @param limits - per-session caps to apply.
 * @returns a pure `apply` function over the digest state.
 */
export declare function digestFold(limits?: DigestLimits): (state: SessionDigest, event: SessionEvent) => SessionDigest;
/** Wire and persisted-state schema of the digest. */
export declare const digestSchema: ZodType<SessionDigest>;
/**
 * The digest projection with its client view present: the shape
 * `ctx.sessionProjections.register` accepts for a wire unit.
 */
export interface DigestProjectionDefinition {
    readonly key: typeof DIGEST_KEY;
    readonly stateSchema: ZodType<SessionDigest>;
    init(header: SessionHeader, inheritedEventCount: SessionLogOffset): SessionDigest;
    apply(state: SessionDigest, event: SessionEvent): SessionDigest;
    readonly wire: {
        readonly viewSchema: ZodType<SessionDigest>;
        view(state: SessionDigest): SessionDigest;
    };
    readonly stateVersion: number;
}
/**
 * Build the projection definition for the digest.
 * @param limits - per-session caps to apply when folding.
 * @returns the definition to register on `ctx.sessionProjections`.
 */
export declare function createDigestProjection(limits?: DigestLimits): DigestProjectionDefinition;
/** Facts about the subject session that are not part of the fold. */
export interface DigestFrame {
    /** Short label the model can refer to ("main session"). */
    readonly label: string;
    /** Absolute working directory of the subject session, when known. */
    readonly cwd?: string;
    /** Live agent status. */
    readonly running?: boolean;
    /** Whether the digest came from the live fold or from the last known state. */
    readonly live: boolean;
}
/**
 * Render one digest as the model-facing background block.
 * @param digest - folded digest of the subject session.
 * @param frame - identity and status facts outside the fold.
 * @returns the bounded text the side chat reads as runtime context.
 */
export declare function renderDigest(digest: SessionDigest, frame: DigestFrame): string;
