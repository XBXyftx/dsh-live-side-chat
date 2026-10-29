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

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle, AgentSetup } from '@deepseek-ai/dsh-agent'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'
import { createUserMessage } from '@deepseek-ai/dsh-llm/message'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { SessionLogOffset, SessionSeq } from '@deepseek-ai/dsh-session'
import { buildForkSeed } from '@deepseek-ai/dsh-session/fork'
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
// Type-only edges that publish the session-event and projection declarations
// this module reads and appends.
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-tool-todo'
import type {} from '@deepseek-ai/dsh-user-approval'
import type { ResolvedSideChatConfig } from './config.ts'
import {
  DESCRIPTOR_LABEL, DESCRIPTOR_PROVIDER, MUTATING_TOOLS, SIDE_SESSION_PREFIX, isSideChatSessionId,
} from './protocol.ts'
import { removeSessionArtifacts, resolveSessionsRoot } from './session-files.ts'
import { createSideChatTools } from './tools.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** A side chat handed a discussion result back to its main session. */
    'side-chat': { kind: 'side-chat' } & ContextFormed
  }
}

/** One live side chat this Host knows about, keyed by its child session id. */
interface SideChatEntry {
  readonly mainSessionId: SessionId
  readonly childSessionId: SessionId
  handle: AgentHandle
}

/** Destruction outcome reported to the client. */
export interface DestroyResult {
  readonly destroyed: boolean
  /** Absolute session directories removed from disk. */
  readonly removed: readonly string[]
  /** Why destruction did not complete, when it did not. */
  readonly reason?: string
}

/** Why a side chat could not be created or driven, with a user-facing message. */
export class SideChatError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'SideChatError'
  }
}

function asSessionId(value: string): SessionId {
  return value as SessionId
}

/**
 * Boundary of the most recent completed turn, copied from the session
 * controller's fork path: the last `turn/end`, extended through events that
 * cannot open new work.
 */
function latestCompletedPrefixBoundary(events: readonly SessionEvent[]): number | undefined {
  const lastTurnEnd = events.findLast(event => event.type === 'turn/end')
  if (lastTurnEnd === undefined) return undefined
  let boundary = lastTurnEnd.seq
  for (const next of events.slice(boundary + 1)) {
    if (next.type === 'turn/start'
      || (next.type === 'user/message' && next.surfaceOp === 'append')
      || next.type === 'agent/inbox/spliced') break
    boundary = next.seq
  }
  return boundary
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { type: 'text'; text: string } =>
      typeof block === 'object' && block !== null
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string')
    .map(block => block.text)
    .join('\n')
}

/** One rendered progress line for the main session. */
function describeEvent(event: SessionEvent): string | undefined {
  switch (event.type) {
    case 'user/message': {
      const source = event.data.source as { kind?: unknown }
      if (source.kind !== 'user') return undefined
      const text = textOf(event.data.content)
      return text.length === 0 ? undefined : `用户请求：${text}`
    }
    case 'assistant/message': {
      const text = textOf(event.data.message.content)
      return text.length === 0 ? undefined : `助手回复：${text}`
    }
    case 'tool/call':
      return `调用工具：${event.data.name}`
    case 'tool/result':
      return event.data.message.isError === true ? '工具失败' : undefined
    case 'todo/write': {
      const todos = event.data.todos as readonly { content: string; status: string }[]
      if (todos.length === 0) return undefined
      return `任务清单：${todos.map(todo => `[${todo.status}] ${todo.content}`).join('; ')}`
    }
    case 'turn/end': {
      const kind = (event.data.reason as { kind?: unknown }).kind
      return kind === undefined ? undefined : `本轮结束：${String(kind)}`
    }
    default:
      return undefined
  }
}

const SIDE_CHAT_SYSTEM_SECTION = [
  'You are a read-only side chat of another session that is still working.',
  'You share that session\'s history up to the moment this side chat was created.',
  'Answer the user\'s questions about the work, clarify ideas, and check facts with read-only tools; never modify files or start long-running work.',
  'The main session keeps working while you talk; its progress after the snapshot is available through the progress tool.',
  'Only when the user explicitly asks you to tell the main session, or the outcome is something the main session must act on, hand the result over with the report tool. Never interrupt the main session otherwise.',
].join(' ')

/**
 * Owns every live side chat: creation, driving, progress reads, reporting, and
 * destruction.
 */
export class SideChatService {
  private readonly entries = new Map<string, SideChatEntry>()
  private readonly byMain = new Map<string, SessionId>()

  constructor(
    private readonly ctx: Context,
    private readonly config: ResolvedSideChatConfig,
  ) {}

  /**
   * Return this session's live side chat, creating one from its completed turns
   * when none exists.
   * @param mainSessionId - session the sidebar belongs to.
   * @returns the side-chat session id.
   */
  async create(mainSessionId: string): Promise<{ sessionId: string }> {
    const mainId = asSessionId(mainSessionId)
    const existing = this.byMain.get(mainSessionId)
    if (existing !== undefined && this.ctx.agents.get(existing) !== undefined) {
      return { sessionId: existing }
    }
    const observation = await this.ctx.sessionQuery.observeSession(mainId, { projectionMode: 'all' })
    try {
      return await this.createFromObservation(observation)
    } finally {
      observation[Symbol.dispose]()
    }
  }

  private async createFromObservation(observation: SessionObservation): Promise<{ sessionId: string }> {
    const boundary = latestCompletedPrefixBoundary(observation.events)
    if (boundary === undefined) {
      throw new SideChatError('no-completed-turn', '主会话还没有完成一轮，暂时无法创建侧边对话。')
    }
    const presetId = this.config.preset.trim().length > 0
      ? this.config.preset.trim()
      : this.presetOf(observation)
    const composition = await this.compose(presetId)
    const childId = asSessionId(`${SIDE_SESSION_PREFIX}${randomUUID()}`)
    const model = this.ctx.get('agentDefaultModel')?.currentSelection()
    const seed = buildForkSeed(observation.events, SessionSeq(boundary))
    const cwd = observation.header.cwd
    const mainSessionId = observation.header.id
    const handle = await this.ctx.agents.create({
      sessionId: childId,
      seed,
      inheritedEventCount: SessionLogOffset(boundary + 1),
      meta: {
        ...(cwd === undefined ? {} : { cwd }),
        parentSession: mainSessionId,
        isSeeded: true,
        origin: 'subagent',
        ...(composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
      },
      ...(model === undefined
        ? {}
        : { agentOptions: { provider: model.provider, model: model.model } }),
      setup: composition.setup,
    })
    this.entries.set(childId, { mainSessionId, childSessionId: childId, handle })
    this.byMain.set(mainSessionId, childId)
    return { sessionId: childId }
  }

  /** Read the preset recorded on the main session, when projection data allows. */
  private presetOf(observation: SessionObservation): string | undefined {
    const projected = observation.projections?.values.agentPreset
    return typeof projected === 'string' ? projected : observation.header.agentPreset
  }

  /**
   * Resolve the composition for a side chat: the same preset mechanism the
   * session controller uses, expressed through the public preset service.
   */
  private async compose(presetId: string | undefined): Promise<{
    readonly agentPreset?: string
    readonly setup: AgentSetup
  }> {
    const presets = this.ctx.get('agentPresets')
    let resolvedId: string | undefined
    if (presets !== undefined) {
      resolvedId = (await presets.resolve(presetId)).id
    }
    const setup: AgentSetup = async (agentCtx, agent) => {
      if (presets !== undefined && resolvedId !== undefined) {
        await presets.mount(agentCtx, resolvedId)
      }
      this.composeSideChat(agentCtx, agent)
    }
    return {
      ...(resolvedId === undefined ? {} : { agentPreset: resolvedId }),
      setup,
    }
  }

  /**
   * Register the side chat's own prompt section, tools, read-only guard, and
   * durable policy markers inside its agent scope.
   */
  private composeSideChat(agentCtx: Context, agent: Agent): void {
    agentCtx.systemPrompt.section({
      name: 'side-chat:role',
      order: 250,
      text: SIDE_CHAT_SYSTEM_SECTION,
    })
    if (this.config.readOnly) {
      agentCtx.tools.guard(exec => (MUTATING_TOOLS.includes(exec.name)
        ? '侧边对话是只读的：不要修改文件或启动后台任务。请改用只读工具，或把结论汇报给用户。'
        : undefined))
    }
    const tools = createSideChatTools({
      progress: async () => await this.progressText(agent.id),
      report: async text => await this.reportToMain(agent.id, text),
    })
    for (const tool of tools) agentCtx.tools.register(tool)
    if (this.config.readOnly) {
      agent.session.append('sandbox/mode', { mode: 'read-only' })
      agent.session.append('approval/policy', { policy: 'never', source: 'delegation' })
    }
    agent.session.append('subagent/descriptor', {
      version: 3,
      mode: 'one-shot',
      provider: DESCRIPTOR_PROVIDER,
      label: DESCRIPTOR_LABEL,
    })
  }

  /**
   * Accept one sidebar message into the side chat's own inbox.
   * @param childSessionId - side-chat session id.
   * @param text - user text.
   */
  async ask(childSessionId: string, text: string): Promise<void> {
    const trimmed = text.trim()
    if (trimmed.length === 0) throw new SideChatError('empty-message', '消息不能为空。')
    const agent = await this.ensureLive(childSessionId)
    agent.followup(createUserMessage({
      content: [{ type: 'text', text: trimmed }],
      source: { kind: 'user' },
    }))
    await this.ctx.sessions.flush(agent.session)
  }

  /** Abort the side chat's current turn without discarding queued input. */
  interrupt(childSessionId: string): void {
    this.requireAgent(childSessionId).cancel({ kind: 'user' }, { keepInbox: true })
  }

  /**
   * Destroy one side chat: dispose its agent, then delete its on-disk session
   * and verify the removal through the persistence seam.
   * @param childSessionId - side-chat session id.
   */
  async destroy(childSessionId: string): Promise<DestroyResult> {
    if (!isSideChatSessionId(childSessionId)) {
      throw new SideChatError('not-a-side-chat', '只能销毁本插件创建的侧边对话。')
    }
    const id = asSessionId(childSessionId)
    const entry = this.entries.get(childSessionId)
    if (entry !== undefined) await entry.handle.dispose()
    if (this.ctx.agents.get(id) !== undefined) {
      return {
        destroyed: false,
        removed: [],
        reason: '侧边对话的 Agent 仍处于运行状态，本次未删除任何文件。',
      }
    }
    const root = resolveSessionsRoot(this.config.sessionsRoot)
    const removed = await removeSessionArtifacts(root, childSessionId)
    const persistence = this.ctx.get('sessionPersistence')
    const stillStored = persistence === undefined ? undefined : await persistence.stat(id)
    this.entries.delete(childSessionId)
    const mainId = entry?.mainSessionId
    if (mainId !== undefined && this.byMain.get(mainId) === id) this.byMain.delete(mainId)
    if (stillStored !== undefined) {
      return {
        destroyed: false,
        removed,
        reason: `会话文件未能删除（${removed.length} 个目录已移除）。`,
      }
    }
    return { destroyed: true, removed }
  }

  /** Disposed by the plugin effect: tear down every live side chat. */
  async disposeAll(): Promise<void> {
    for (const entry of [...this.entries.values()]) {
      try {
        await entry.handle.dispose()
      } catch (error) {
        console.error(`dsh-side-chat: failed to dispose side chat ${entry.childSessionId}:`, error)
      }
    }
    this.entries.clear()
    this.byMain.clear()
  }

  /** Resolve a live side-chat agent, resuming it after an application restart. */
  private async ensureLive(childSessionId: string): Promise<Agent> {
    const live = this.ctx.agents.get(asSessionId(childSessionId))
    if (live !== undefined) return live
    if (!isSideChatSessionId(childSessionId)) {
      throw new SideChatError('not-a-side-chat', '只能向本插件创建的侧边对话发送消息。')
    }
    const observation = await this.ctx.sessionQuery.observeSession(asSessionId(childSessionId), { projectionMode: 'all' })
    let presetId: string | undefined
    try {
      presetId = this.presetOf(observation)
    } finally {
      observation[Symbol.dispose]()
    }
    const composition = await this.compose(presetId)
    const model = this.ctx.get('agentDefaultModel')?.currentSelection()
    const handle = await this.ctx.agents.resume({
      resumeSessionId: asSessionId(childSessionId),
      ...(model === undefined
        ? {}
        : { agentOptions: { provider: model.provider, model: model.model } }),
      setup: composition.setup,
    })
    const header = handle.agent.session.header
    const mainSessionId = header.parentSession
    if (mainSessionId === undefined) {
      await handle.dispose()
      throw new SideChatError('not-a-side-chat', '侧边对话缺少父会话记录，无法继续。')
    }
    this.entries.set(childSessionId, { mainSessionId, childSessionId: asSessionId(childSessionId), handle })
    this.byMain.set(mainSessionId, asSessionId(childSessionId))
    return handle.agent
  }

  private requireAgent(childSessionId: string): Agent {
    const agent = this.ctx.agents.get(asSessionId(childSessionId))
    if (agent === undefined) {
      throw new SideChatError('not-live', '侧边对话当前没有在运行。')
    }
    return agent
  }

  /**
   * Render the main session's progress after this side chat's snapshot.
   * @param childSessionId - side-chat session id (its seed cut is the boundary).
   */
  private async progressText(childSessionId: string): Promise<string> {
    const entry = this.entries.get(childSessionId)
    const mainSessionId = entry?.mainSessionId ?? await this.parentOf(childSessionId)
    if (mainSessionId === undefined) return '无法确定主会话，无法读取进度。'
    const childObservation = await this.ctx.sessionQuery.observeSession(asSessionId(childSessionId))
    let cutoff: number
    try {
      cutoff = Number(childObservation.inheritedEventCount) - 1
    } finally {
      childObservation[Symbol.dispose]()
    }
    const mainObservation = await this.ctx.sessionQuery.observeSession(mainSessionId)
    let lines: string[]
    try {
      const events = mainObservation.events.filter(event => event.seq > cutoff)
      const described: string[] = []
      for (const event of events) {
        const line = describeEvent(event)
        if (line !== undefined) described.push(line)
      }
      lines = described.slice(-this.config.progressEventLimit)
      if (described.length > lines.length) {
        lines.unshift(`（仅显示最近 ${lines.length} 条）`)
      }
      if (lines.length === 0) return '主会话自创建侧边对话以来没有新的进展。'
      const running = this.ctx.agents.get(mainSessionId)?.status ?? 'idle'
      return [`主会话当前状态：${running}`, ...lines].join('\n')
    } finally {
      mainObservation[Symbol.dispose]()
    }
  }

  /** Read the persisted parent session of one side chat. */
  private async parentOf(childSessionId: string): Promise<SessionId | undefined> {
    const observation = await this.ctx.sessionQuery.observeSession(asSessionId(childSessionId))
    try {
      return observation.header.parentSession
    } finally {
      observation[Symbol.dispose]()
    }
  }

  /**
   * Queue one user-confirmed result as a follow-up turn of the main session.
   * The message is delivered only to a live main agent; this service never
   * resumes a cold main session behind the user's back.
   */
  private async reportToMain(childSessionId: string, text: string): Promise<{ delivered: boolean; detail: string }> {
    const trimmed = text.trim()
    if (trimmed.length === 0) return { delivered: false, detail: '汇报内容为空，未发送。' }
    if (!this.config.allowReportToMain.get()) {
      return { delivered: false, detail: '设置中已关闭“允许侧边对话向主会话发送消息”，本次未发送。' }
    }
    const entry = this.entries.get(childSessionId)
    const mainSessionId = entry?.mainSessionId ?? await this.parentOf(childSessionId)
    if (mainSessionId === undefined) return { delivered: false, detail: '找不到主会话，未发送。' }
    const main = this.ctx.agents.get(mainSessionId)
    if (main === undefined) return { delivered: false, detail: '主会话当前不在运行，未发送。' }
    const archived = this.ctx.get('workspaceRegistry')?.archivedSessionIds
    if (archived?.includes(mainSessionId) === true) {
      return { delivered: false, detail: '主会话已归档，未发送。' }
    }
    main.followup(createUserMessage({
      content: [{ type: 'text', text: trimmed }],
      source: { kind: 'side-chat', form: 'notice', summary: 'Side chat result' },
    }))
    await this.ctx.sessions.flush(main.session)
    return { delivered: true, detail: '已排入主会话的后续轮次，不会打断它当前的工作。' }
  }
}
