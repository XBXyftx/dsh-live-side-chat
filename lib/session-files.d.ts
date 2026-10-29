/**
 * On-disk removal of a destroyed side chat.
 *
 * dsh has no session-deletion API: the persistence seam only creates, opens,
 * flushes, stats, and lists. A side chat must truly disappear, so after its
 * agent is disposed this module removes the session directory the JSONL backend
 * owns. The layout is `<root>/<projectKey>/<encodeSegment(sessionId)>/…`; our
 * ids contain only `[a-z0-9-]`, which the segment encoder leaves unchanged, so
 * the session directory is named exactly by the session id and can be found by
 * scanning the project directories instead of re-implementing the encoder.
 *
 * The removal is verified by the caller through `sessionPersistence.stat()`; a
 * surviving artifact is reported as a failed destruction, never as success.
 * @module dsh-side-chat/session-files
 */
/** Resolve the session storage root the way the shipped JSONL bundle does. */
export declare function resolveSessionsRoot(configured: string): string;
/**
 * Remove the directory holding one session's log and lock file.
 *
 * Only called after the owning agent was disposed, and only for a session id
 * this plugin minted; anything else is refused so a caller bug cannot delete an
 * unrelated session.
 * @param root - session storage root from {@link resolveSessionsRoot}.
 * @param sessionId - side-chat session id to remove.
 * @returns absolute paths actually removed (empty when the session never materialized).
 */
export declare function removeSessionArtifacts(root: string, sessionId: string): Promise<readonly string[]>;
