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
 * Tools that can change files or leave work running after the call returns.
 * A read-only side chat denies these by name: the sandbox already refuses the
 * write, but the call would otherwise still run, burn tokens, and leave the
 * model to discover the refusal the hard way.
 *
 * Shell executors are deliberately absent. `bash`/`pwsh` run plenty of
 * read-only commands (`ls`, `git log`, `wc -l`), and the read-only sandbox is
 * the component that owns file effects — denying the executor by name blocked
 * legitimate queries while the sandbox already said no to the writes.
 * `terminal`/`terminal_write` stay here because they open a persistent shell
 * that outlives the call; `job_*` stay because they spawn unmetered work.
 *
 * `run_code` is absent for the same reason as the shell executors: under a PTC
 * preset it is the only transport a model may call directly.
 */
export const MUTATING_TOOLS: readonly string[] = [
  'write',
  'edit',
  'multi_edit',
  'str_replace_editor',
  'apply_patch',
  'terminal',
  'terminal_write',
  'job_start',
  'job_cancel',
]

/** One-shot shell executors: allowed, because the sandbox owns their file effects. */
export const SHELL_TOOLS: readonly string[] = ['bash', 'pwsh']

/** Name of the sandbox-escalation argument both shell executors and `run_code` accept. */
const ESCALATION_ARGUMENT = 'sandbox_permissions'

/** Answer for the read-only guard: `undefined` allows the call, a string denies it. */
export function readOnlyDenial(
  name: string,
  args: unknown,
  options: { readonly allowShell?: boolean } = {},
): string | undefined {
  const allowShell = options.allowShell ?? true
  if (MUTATING_TOOLS.includes(name)) {
    return '侧边对话是只读的：不要修改文件或启动后台任务。请改用只读工具，或把结论汇报给用户。'
  }
  if (SHELL_TOOLS.includes(name) && !allowShell) {
    return '侧边对话当前禁止执行 shell 命令（配置 allowShellQueries: false）。请改用只读工具查询。'
  }
  if (typeof args !== 'object' || args === null) return undefined
  const record = args as Record<string, unknown>
  if (SHELL_TOOLS.includes(name) || name === 'run_code' || name === 'terminal') {
    if (record.run_in_background === true) {
      return '侧边对话是只读的：不要启动后台任务。命令可以同步执行；需要长时间运行的工作请交给主会话。'
    }
    if (record[ESCALATION_ARGUMENT] !== undefined) {
      return '侧边对话是只读的：不能申请更高的沙箱权限。请在只读范围内查询，或把结论汇报给用户。'
    }
  }
  return undefined
}

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
