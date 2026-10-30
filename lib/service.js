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
import { randomUUID } from 'node:crypto';
import { createUserMessage } from '@deepseek-ai/dsh-llm/message';
import { DIGEST_KEY, renderDigest, toolTarget, } from "./digest.js";
import { DESCRIPTOR_LABEL, DESCRIPTOR_PROVIDER, HISTORY_TOOL, MUTATING_TOOLS, SIDE_SESSION_PREFIX, STATUS_TOOL, isSideChatSessionId, } from "./protocol.js";
import { removeSessionArtifacts, resolveSessionsRoot } from "./session-files.js";
import { createSideChatTools } from "./tools.js";
/** Why a side chat could not be created or driven, with a user-facing message. */
export class SideChatError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'SideChatError';
    }
}
function asSessionId(value) {
    return value;
}
/** Join the text blocks of one model content array. */
function textOf(content) {
    if (!Array.isArray(content))
        return '';
    const parts = [];
    for (const block of content) {
        if (typeof block !== 'object' || block === null)
            continue;
        const candidate = block;
        if (candidate.type === 'text' && typeof candidate.text === 'string')
            parts.push(candidate.text);
    }
    return parts.join('\n').trim();
}
/** One rendered log line of the main session for the history tool. */
function describeEvent(event) {
    switch (event.type) {
        case 'user/message': {
            const source = event.data.source;
            if (source.kind !== 'user')
                return undefined;
            const text = textOf(event.data.content);
            return text.length === 0 ? undefined : `用户请求：${text}`;
        }
        case 'assistant/message': {
            const text = textOf(event.data.message.content);
            return text.length === 0 ? undefined : `助手回复：${text}`;
        }
        case 'tool/call': {
            const target = toolTarget(event.data.arguments);
            return target.length === 0 ? `调用工具：${event.data.name}` : `调用工具：${event.data.name}(${target})`;
        }
        case 'tool/result': {
            if (event.data.message.isError !== true)
                return undefined;
            const reason = typeof event.data.error?.reason === 'string'
                ? event.data.error.reason
                : textOf(event.data.message.content);
            return reason.length === 0 ? '工具失败' : `工具失败：${reason}`;
        }
        case 'todo/write': {
            const todos = event.data.todos;
            if (todos.length === 0)
                return undefined;
            return `任务清单：${todos.map(todo => `[${todo.status}] ${todo.content}`).join('; ')}`;
        }
        case 'turn/end': {
            const kind = event.data.reason.kind;
            return kind === undefined ? undefined : `本轮结束：${String(kind)}`;
        }
        default:
            return undefined;
    }
}
const SIDE_CHAT_SYSTEM_SECTION = [
    'You are a read-only side chat of another session that keeps working while you talk to the user.',
    'You did NOT inherit that session\'s history: your conversation starts empty on purpose.',
    'What you know about the main session comes from the "Main session live digest" runtime context block,',
    'which is regenerated on every step from a bounded fold: the goal, one line per recent turn, the turn',
    'that is open right now, its latest reply and recent tool calls, the todo list, and counters.',
    'That block is a DIGEST, not the log. It omits tool results, file contents, and most intermediate steps,',
    'and its earlier-turn lines are one-line summaries. Never claim that work is done, that a file was',
    'changed, or that an error was fixed based only on the digest.',
    `Before answering anything about actual changes, current step details, or an error message, call the ${HISTORY_TOOL} tool`,
    'and read the relevant turn; call the status tool when you need the freshest state instead of the snapshot',
    'captured at your previous step. If the digest or a tool result does not contain the answer, say so plainly',
    'instead of guessing.',
    'Answer the user\'s questions about the work, clarify ideas, and check facts with read-only tools; never',
    'modify files or start long-running work. Never interrupt the main session.',
    'Only when the user explicitly asks you to tell the main session, or the outcome is something the main',
    'session must act on, hand the result over with the report tool. Otherwise keep the discussion here.',
].join(' ');
/** Trim a growing list to its newest entries. */
function trail(items, limit) {
    return items.length <= limit ? items : items.slice(items.length - limit);
}
/** Clip one rendered log line to keep a bounded tool result readable. */
function clipLine(text, limit) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}
/**
 * Owns every live side chat: creation, driving, live-digest context, bounded log
 * reads, reporting, and destruction.
 */
export class SideChatService {
    ctx;
    config;
    entries = new Map();
    byMain = new Map();
    /** Last digest read from a main session's log while that session was not live. */
    fallbacks = new Map();
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
    }
    /**
     * Return this session's live side chat, creating an empty one when none exists.
     * @param mainSessionId - session the sidebar belongs to.
     * @returns the side-chat session id and its main session id.
     */
    async create(mainSessionId) {
        const mainId = asSessionId(mainSessionId);
        const existing = this.byMain.get(mainSessionId);
        if (existing !== undefined && this.ctx.agents.get(existing) !== undefined) {
            return { sessionId: existing, mainSessionId };
        }
        const observation = await this.ctx.sessionQuery.observeSession(mainId, { projectionMode: 'all' });
        try {
            const digest = observation.projections?.values.sideChatDigest;
            if (digest !== undefined)
                this.fallbacks.set(mainSessionId, digest);
            return await this.createFromObservation(observation);
        }
        finally {
            observation[Symbol.dispose]();
        }
    }
    async createFromObservation(observation) {
        const cwd = observation.header.cwd;
        if (cwd === undefined) {
            throw new SideChatError('no-workspace', '主会话没有工作目录，暂时无法创建侧边对话。');
        }
        const mainSessionId = observation.header.id;
        const childId = asSessionId(`${SIDE_SESSION_PREFIX}${randomUUID()}`);
        const presetId = this.presetOf(observation);
        const subject = {
            childSessionId: childId,
            mainSessionId,
            cwd,
            ...(presetId === undefined ? {} : { presetId }),
        };
        const composition = await this.compose(subject);
        const model = this.ctx.get('agentDefaultModel')?.currentSelection();
        // No `seed` and no `isSeeded`: the conversation must open empty. The child
        // only carries lineage (`parentSession`) so the sidebar can address it.
        const handle = await this.ctx.agents.create({
            sessionId: childId,
            meta: {
                cwd,
                parentSession: mainSessionId,
                origin: 'subagent',
                ...(composition.agentPreset === undefined ? {} : { agentPreset: composition.agentPreset }),
            },
            ...(model === undefined
                ? {}
                : { agentOptions: { provider: model.provider, model: model.model } }),
            setup: composition.setup,
        });
        this.entries.set(childId, { mainSessionId, childSessionId: childId, handle });
        this.byMain.set(mainSessionId, childId);
        return { sessionId: childId, mainSessionId };
    }
    /** Read the preset recorded on the main session, when projection data allows. */
    presetOf(observation) {
        const projected = observation.projections?.values.agentPreset;
        if (typeof projected === 'string')
            return projected;
        return observation.header.agentPreset;
    }
    /**
     * Resolve the composition for a side chat: the same preset mechanism the
     * session controller uses, expressed through the public preset service.
     */
    async compose(subject) {
        const presets = this.ctx.get('agentPresets');
        const presetId = this.config.preset.trim().length > 0 ? this.config.preset.trim() : subject.presetId;
        let resolvedId;
        if (presets !== undefined) {
            resolvedId = (await presets.resolve(presetId)).id;
        }
        const setup = async (agentCtx, agent) => {
            if (presets !== undefined && resolvedId !== undefined) {
                await presets.mount(agentCtx, resolvedId);
            }
            this.composeSideChat(agentCtx, agent, subject);
        };
        return {
            ...(resolvedId === undefined ? {} : { agentPreset: resolvedId }),
            setup,
        };
    }
    /**
     * Register the side chat's own prompt guidance, live main-session digest,
     * tools, read-only guard, and durable policy markers inside its agent scope.
     */
    composeSideChat(agentCtx, agent, subject) {
        agentCtx.systemPrompt.section({
            name: 'side-chat:role',
            order: 250,
            text: SIDE_CHAT_SYSTEM_SECTION,
        });
        if (this.config.liveContext) {
            agentCtx.systemPrompt.context({
                name: 'side-chat:main-digest',
                order: 220,
                // Resolved synchronously on every step and admission refresh: this is
                // what makes the side chat see work that happened after its last turn.
                text: () => this.mainContextText(subject.mainSessionId, subject.cwd),
            });
        }
        if (this.config.readOnly) {
            agentCtx.tools.guard(exec => (MUTATING_TOOLS.includes(exec.name)
                ? '侧边对话是只读的：不要修改文件或启动后台任务。请改用只读工具，或把结论汇报给用户。'
                : undefined));
        }
        const tools = createSideChatTools({
            status: async () => await this.statusText(subject.childSessionId),
            history: async (query) => await this.historyText(subject.childSessionId, query),
            report: async (text) => await this.reportToMain(subject.childSessionId, text),
        });
        for (const tool of tools)
            agentCtx.tools.register(tool);
        if (this.config.readOnly) {
            agent.session.append('sandbox/mode', { mode: 'read-only' });
            agent.session.append('approval/policy', { policy: 'never', source: 'delegation' });
        }
        agent.session.append('subagent/descriptor', {
            version: 3,
            mode: 'one-shot',
            provider: DESCRIPTOR_PROVIDER,
            label: DESCRIPTOR_LABEL,
        });
    }
    /**
     * Accept one sidebar message into the side chat's own inbox.
     * @param childSessionId - side-chat session id.
     * @param text - user text.
     */
    async ask(childSessionId, text) {
        const trimmed = text.trim();
        if (trimmed.length === 0)
            throw new SideChatError('empty-message', '消息不能为空。');
        const agent = await this.ensureLive(childSessionId);
        agent.followup(createUserMessage({
            content: [{ type: 'text', text: trimmed }],
            source: { kind: 'user' },
        }));
        await this.ctx.sessions.flush(agent.session);
    }
    /** Abort the side chat's current turn without discarding queued input. */
    interrupt(childSessionId) {
        this.requireAgent(childSessionId).cancel({ kind: 'user' }, { keepInbox: true });
    }
    /**
     * Destroy one side chat: dispose its agent, then delete its on-disk session
     * and verify the removal through the persistence seam.
     * @param childSessionId - side-chat session id.
     */
    async destroy(childSessionId) {
        if (!isSideChatSessionId(childSessionId)) {
            throw new SideChatError('not-a-side-chat', '只能销毁本插件创建的侧边对话。');
        }
        const id = asSessionId(childSessionId);
        const entry = this.entries.get(childSessionId);
        if (entry !== undefined)
            await entry.handle.dispose();
        if (this.ctx.agents.get(id) !== undefined) {
            return {
                destroyed: false,
                removed: [],
                reason: '侧边对话的 Agent 仍处于运行状态，本次未删除任何文件。',
            };
        }
        const root = resolveSessionsRoot(this.config.sessionsRoot);
        const removed = await removeSessionArtifacts(root, childSessionId);
        const persistence = this.ctx.get('sessionPersistence');
        const stillStored = persistence === undefined ? undefined : await persistence.stat(id);
        this.entries.delete(childSessionId);
        const mainId = entry?.mainSessionId;
        if (mainId !== undefined && this.byMain.get(mainId) === id) {
            this.byMain.delete(mainId);
            this.fallbacks.delete(mainId);
        }
        if (stillStored !== undefined) {
            return {
                destroyed: false,
                removed,
                reason: `会话文件未能删除（${removed.length} 个目录已移除）。`,
            };
        }
        return { destroyed: true, removed };
    }
    /** Disposed by the plugin effect: tear down every live side chat. */
    async disposeAll() {
        for (const entry of [...this.entries.values()]) {
            try {
                await entry.handle.dispose();
            }
            catch (error) {
                console.error(`dsh-side-chat: failed to dispose side chat ${entry.childSessionId}:`, error);
            }
        }
        this.entries.clear();
        this.byMain.clear();
        this.fallbacks.clear();
    }
    /** Resolve a live side-chat agent, resuming it after an application restart. */
    async ensureLive(childSessionId) {
        const live = this.ctx.agents.get(asSessionId(childSessionId));
        if (live !== undefined)
            return live;
        if (!isSideChatSessionId(childSessionId)) {
            throw new SideChatError('not-a-side-chat', '只能向本插件创建的侧边对话发送消息。');
        }
        const observation = await this.ctx.sessionQuery.observeSession(asSessionId(childSessionId), { projectionMode: 'all' });
        let mainSessionId;
        let subject;
        try {
            mainSessionId = observation.header.parentSession;
            if (mainSessionId === undefined) {
                throw new SideChatError('not-a-side-chat', '侧边对话缺少父会话记录，无法继续。');
            }
            const presetId = this.presetOf(observation);
            subject = {
                childSessionId: asSessionId(childSessionId),
                mainSessionId,
                ...(observation.header.cwd === undefined ? {} : { cwd: observation.header.cwd }),
                ...(presetId === undefined ? {} : { presetId }),
            };
        }
        finally {
            observation[Symbol.dispose]();
        }
        const composition = await this.compose(subject);
        const model = this.ctx.get('agentDefaultModel')?.currentSelection();
        const handle = await this.ctx.agents.resume({
            resumeSessionId: asSessionId(childSessionId),
            ...(model === undefined
                ? {}
                : { agentOptions: { provider: model.provider, model: model.model } }),
            setup: composition.setup,
        });
        this.entries.set(childSessionId, { mainSessionId, childSessionId: asSessionId(childSessionId), handle });
        this.byMain.set(mainSessionId, asSessionId(childSessionId));
        return handle.agent;
    }
    requireAgent(childSessionId) {
        const agent = this.ctx.agents.get(asSessionId(childSessionId));
        if (agent === undefined) {
            throw new SideChatError('not-live', '侧边对话当前没有在运行。');
        }
        return agent;
    }
    /** Resolve the main session id of one side chat from memory, then from its log. */
    async mainOf(childSessionId) {
        const entry = this.entries.get(childSessionId);
        if (entry !== undefined)
            return entry.mainSessionId;
        const observation = await this.ctx.sessionQuery.observeSession(asSessionId(childSessionId), { projectionMode: 'none' });
        try {
            return observation.header.parentSession;
        }
        finally {
            observation[Symbol.dispose]();
        }
    }
    /**
     * Read the main session's digest: from the live fold when that session is
     * live, otherwise from the last digest read from its log.
     */
    readDigest(mainSessionId) {
        const session = this.ctx.sessions.get(mainSessionId);
        if (session !== undefined) {
            const digest = this.ctx.sessionProjections.stateOf(session, DIGEST_KEY);
            if (digest !== undefined) {
                const agent = this.ctx.agents.get(mainSessionId);
                return {
                    digest,
                    live: true,
                    ...(agent === undefined ? {} : { running: agent.status === 'running' }),
                };
            }
        }
        const fallback = this.fallbacks.get(mainSessionId);
        if (fallback === undefined)
            return undefined;
        return { digest: fallback, live: false };
    }
    /**
     * Render the runtime-context block injected into the side chat on every step.
     * @param mainSessionId - subject session.
     * @param cwd - subject working directory captured at creation.
     */
    mainContextText(mainSessionId, cwd) {
        const read = this.readDigest(mainSessionId);
        const header = `Main session live digest (partial; verify any detail with the ${HISTORY_TOOL} or ${STATUS_TOOL} tool before asserting it):`;
        if (read === undefined) {
            return [
                header,
                'This session is not live right now, so no live digest is available.',
                `Read its log with the ${HISTORY_TOOL} tool before answering anything about its progress.`,
            ].join('\n');
        }
        const frame = {
            label: 'Main session',
            ...(cwd === undefined ? {} : { cwd }),
            ...(read.running === undefined ? {} : { running: read.running }),
            live: read.live,
        };
        return `${header}\n${renderDigest(read.digest, frame)}`;
    }
    /**
     * Render the exact background block this side chat sees right now, so the
     * user can inspect what the model reads. Same function the prompt context
     * provider uses, so the panel cannot drift from the injection.
     * @param childSessionId - side-chat session id.
     */
    async contextPreview(childSessionId) {
        const mainSessionId = await this.mainOf(childSessionId);
        if (mainSessionId === undefined)
            return '找不到主会话，暂时没有背景摘要。';
        const cwd = this.ctx.sessions.get(mainSessionId)?.header.cwd;
        return this.mainContextText(mainSessionId, cwd);
    }
    /** Prepend the digest of a fallback observation so a cold read still answers. */
    async refreshFallback(mainSessionId) {
        const observation = await this.ctx.sessionQuery.observeSession(mainSessionId, { projectionMode: 'all' });
        try {
            const digest = observation.projections?.values.sideChatDigest;
            if (digest !== undefined)
                this.fallbacks.set(mainSessionId, digest);
            return digest;
        }
        finally {
            observation[Symbol.dispose]();
        }
    }
    /**
     * Render the freshest reading of the main session for the status tool.
     * @param childSessionId - side-chat session id.
     */
    async statusText(childSessionId) {
        const mainSessionId = await this.mainOf(childSessionId);
        if (mainSessionId === undefined)
            return '找不到主会话，无法读取状态。';
        const read = this.readDigest(mainSessionId);
        const frame = { label: 'Main session', live: true };
        if (read !== undefined) {
            frame.live = read.live;
            return renderDigest(read.digest, {
                ...frame,
                ...(read.running === undefined ? {} : { running: read.running }),
            });
        }
        const digest = await this.refreshFallback(mainSessionId);
        if (digest === undefined)
            return '主会话当前不在运行，也没有可读的历史摘要。';
        return renderDigest(digest, { ...frame, live: false });
    }
    /**
     * Render a bounded slice of the main session's log for the history tool.
     * @param childSessionId - side-chat session id.
     * @param query - turn and/or literal filters.
     */
    async historyText(childSessionId, query) {
        const mainSessionId = await this.mainOf(childSessionId);
        if (mainSessionId === undefined)
            return '找不到主会话，无法读取历史。';
        const limit = Math.min(Math.max(1, Math.trunc(query.limit ?? this.config.historyEventLimit)), this.config.historyEventLimit);
        const observation = await this.ctx.sessionQuery.observeSession(mainSessionId, { projectionMode: 'none' });
        let lines;
        try {
            const contains = query.contains === undefined ? undefined : query.contains.trim().toLowerCase();
            let currentTurn = 0;
            const matched = [];
            for (const event of observation.events) {
                if (event.type === 'turn/start') {
                    currentTurn = event.data.turn;
                    continue;
                }
                const text = describeEvent(event);
                if (text === undefined)
                    continue;
                if (query.turn !== undefined && currentTurn !== query.turn)
                    continue;
                if (contains !== undefined && contains.length > 0 && !text.toLowerCase().includes(contains))
                    continue;
                matched.push({ turn: currentTurn, text });
            }
            lines = trail(matched, limit).map(line => clipLine(`[第 ${String(line.turn)} 轮] ${line.text}`, 700));
            if (lines.length === 0) {
                const scope = query.turn === undefined ? '' : `第 ${String(query.turn)} 轮中`;
                const needle = contains === undefined ? '' : `包含“${contains}”的`;
                return `主会话${scope}没有${needle}可读的记录。`;
            }
            if (matched.length > lines.length)
                lines.unshift(`（仅显示最近 ${String(lines.length)} 条，共 ${String(matched.length)} 条匹配）`);
        }
        finally {
            observation[Symbol.dispose]();
        }
        const status = this.ctx.agents.get(mainSessionId)?.status ?? '未知';
        const digest = this.readDigest(mainSessionId);
        const head = [
            `主会话日志（第 ${String(digest?.digest.counts.turns ?? 0)} 轮，当前状态：${status === 'running' ? '运行中' : status === 'idle' ? '空闲' : status}）`,
            '这些是真实记录，不是摘要；但只包含与筛选条件匹配的行。',
        ];
        return [...head, ...lines].join('\n');
    }
    /**
     * Queue one user-confirmed result as a follow-up turn of the main session.
     * The message is delivered only to a live main agent; this service never
     * resumes a cold main session behind the user's back.
     */
    async reportToMain(childSessionId, text) {
        const trimmed = text.trim();
        if (trimmed.length === 0)
            return { delivered: false, detail: '汇报内容为空，未发送。' };
        if (!this.config.allowReportToMain.get()) {
            return { delivered: false, detail: '设置中已关闭“允许侧边对话向主会话发送消息”，本次未发送。' };
        }
        const mainSessionId = await this.mainOf(childSessionId);
        if (mainSessionId === undefined)
            return { delivered: false, detail: '找不到主会话，未发送。' };
        const main = this.ctx.agents.get(mainSessionId);
        if (main === undefined)
            return { delivered: false, detail: '主会话当前不在运行，未发送。' };
        const archived = this.ctx.get('workspaceRegistry')?.archivedSessionIds;
        if (archived?.includes(mainSessionId) === true) {
            return { delivered: false, detail: '主会话已归档，未发送。' };
        }
        main.followup(createUserMessage({
            content: [{ type: 'text', text: trimmed }],
            source: { kind: 'side-chat', form: 'notice', summary: 'Side chat result' },
        }));
        await this.ctx.sessions.flush(main.session);
        return { delivered: true, detail: '已排入主会话的后续轮次，不会打断它当前的工作。' };
    }
}
