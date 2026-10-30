/**
 * Shared vocabulary for the side-chat plugin: the RPC channel, the resource
 * address the web client opens, the durable marker on a side-chat session, and
 * the mutating tools a read-only side chat must never call.
 *
 * Pure data plus pure helpers, so it is unit-testable without a Host.
 * @module dsh-side-chat/protocol
 */

/** Stable implementation identity, also the client tab-type id and locale namespace. */
export const PLUGIN_ID = 'dsh-side-chat'

/** Logical Connection RPC channel owned by the Host half. */
export const RPC_CHANNEL = '/side-chat'

/** Resource protocol the client registers for one side-chat conversation tab. */
export const RESOURCE_PROTOCOL = 'sidechat'

/** Address prefix for one side-chat conversation, keyed by the side session id. */
export const RESOURCE_PREFIX = `dsh-resource://${RESOURCE_PROTOCOL}/session/`

/** Prefix of every session id this plugin creates; the startup sweep relies on it. */
export const SIDE_SESSION_PREFIX = 'session-side-chat-'

/** Descriptor provider name recorded on each side-chat session. */
export const DESCRIPTOR_PROVIDER = 'side-chat'

/** Durable creation label recorded on each side-chat session. */
export const DESCRIPTOR_LABEL = 'Side chat'

/** Messages the side chat may send to its main session carry this source kind. */
export const MAIN_MESSAGE_KIND = 'side-chat'

/** Names of model-facing tools registered only inside a side-chat agent. */
export const STATUS_TOOL = 'side_chat_main_status'
export const HISTORY_TOOL = 'side_chat_main_history'
export const REPORT_TOOL = 'side_chat_report'

/**
 * Tools that can mutate the workspace or spawn unmetered work. A read-only side
 * chat denies them by name in addition to its sandbox mode, because a sandbox
 * refuses the write while the tool itself still runs (and can burn tokens).
 */
export const MUTATING_TOOLS: readonly string[] = [
  'write',
  'edit',
  'multi_edit',
  'str_replace_editor',
  'apply_patch',
  'bash',
  'pwsh',
  'run_code',
  'terminal',
  'terminal_write',
  'job_start',
  'job_cancel',
]

/** Compose the sidebar resource address of one side chat. */
export function sideChatAddress(sessionId: string): string {
  return `${RESOURCE_PREFIX}${encodeURIComponent(sessionId)}`
}

/**
 * Parse one sidebar resource address.
 * @param address - possible `dsh-resource://sidechat/session/<id>` address.
 * @returns the encoded session id, or `undefined` for any other address.
 */
export function parseSideChatAddress(address: string): string | undefined {
  if (!address.startsWith(RESOURCE_PREFIX)) return undefined
  const raw = address.slice(RESOURCE_PREFIX.length)
  if (raw.length === 0 || raw.includes('/') || raw.includes('?') || raw.includes('#')) return undefined
  try {
    const id = decodeURIComponent(raw)
    return id.length === 0 ? undefined : id
  } catch {
    return undefined
  }
}

/** Whether a session id was minted by this plugin. */
export function isSideChatSessionId(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(SIDE_SESSION_PREFIX)
}
