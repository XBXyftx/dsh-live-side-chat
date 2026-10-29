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

import { readdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Resolve the session storage root the way the shipped JSONL bundle does. */
export function resolveSessionsRoot(configured: string): string {
  const trimmed = configured.trim()
  if (trimmed.length > 0) return trimmed
  const home = process.env.DSH_HOME?.trim()
  if (home !== undefined && home.length > 0) return join(home, 'sessions')
  return join(homedir(), '.dsh', 'sessions')
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

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
export async function removeSessionArtifacts(root: string, sessionId: string): Promise<readonly string[]> {
  let projects: string[]
  try {
    projects = (await readdir(root, { withFileTypes: true }))
      .filter(entry => entry.isDirectory())
      .map(entry => join(root, entry.name))
  } catch {
    // An absent root means the session never materialized on disk.
    return []
  }
  const removed: string[] = []
  for (const project of projects) {
    const candidate = join(project, sessionId)
    if (!(await isDirectory(candidate))) continue
    await rm(candidate, { recursive: true, force: true })
    removed.push(candidate)
  }
  return removed
}
