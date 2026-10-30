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
import { z as zod } from 'zod';
/** Projection key of the live session digest. */
export const DIGEST_KEY = 'sideChatDigest';
/** Bound of one stored prompt, response, reply, argument summary, or failure. */
const LIMIT = {
    goal: 240,
    prompt: 160,
    response: 240,
    assistant: 400,
    target: 80,
    error: 240,
};
/** Default caps: small enough that every session can carry the fold. */
export const DEFAULT_LIMITS = {
    turns: 12,
    recentTools: 8,
    openTools: 6,
    todos: 12,
};
/** Clip one line to a character budget without cutting a surrogate pair. */
function clip(text, limit) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (normalized.length <= limit)
        return normalized;
    const head = normalized.slice(0, Math.max(0, limit - 1));
    return `${head.replace(/[\uD800-\uDBFF]$/, '')}…`;
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
/** Fields of a tool call's raw JSON arguments worth summarizing, in priority order. */
const TARGET_FIELDS = [
    'path', 'file_path', 'filePath', 'command', 'cmd', 'pattern', 'query', 'url', 'description', 'prompt', 'goal',
];
/**
 * Summarize one tool call's raw JSON argument string.
 * @param raw - `arguments` exactly as the model produced it.
 * @returns a bounded one-line target, or `''` when the arguments carry none of
 * the recognized fields or are not JSON.
 */
export function toolTarget(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return '';
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return '';
    const record = parsed;
    for (const field of TARGET_FIELDS) {
        const value = record[field];
        if (typeof value === 'string' && value.trim().length > 0)
            return clip(value, LIMIT.target);
    }
    return '';
}
/** Trim a growing array to its newest entries without mutating the input. */
function trail(items, limit) {
    return items.length <= limit ? items : items.slice(items.length - limit);
}
/** Replace the open turn when it belongs to the given turn number. */
function withOpenTurn(state, next) {
    return { ...state, openTurn: next };
}
/** Append one tool call to the session and open-turn trails. */
function appendTool(state, tool, limits) {
    const openTurn = state.openTurn === null
        ? null
        : { ...state.openTurn, tools: trail([...state.openTurn.tools, tool], limits.openTools) };
    return {
        ...state,
        openTurn,
        recentTools: trail([...state.recentTools, tool], limits.recentTools),
        counts: { ...state.counts, tools: state.counts.tools + 1 },
    };
}
/** Fold one committed session event into the digest. */
function applyEvent(state, event, limits) {
    switch (event.type) {
        case 'turn/start': {
            const openTurn = {
                turn: event.data.turn,
                prompt: '',
                steps: 0,
                lastAssistant: '',
                startedAt: event.time,
                tools: [],
                errors: 0,
            };
            return {
                ...withOpenTurn(state, openTurn),
                counts: { ...state.counts, turns: state.counts.turns + 1 },
                lastActivityAt: event.time,
            };
        }
        case 'user/message': {
            const source = event.data.source;
            if (source.kind !== 'user')
                return state;
            const text = textOf(event.data.content);
            if (text.length === 0)
                return state;
            const prompt = clip(text, LIMIT.prompt);
            const goal = state.goal.length > 0 ? state.goal : clip(text, LIMIT.goal);
            if (state.openTurn === null) {
                return { ...state, goal, lastActivityAt: event.time };
            }
            if (state.openTurn.prompt.length > 0) {
                return { ...state, goal, lastActivityAt: event.time };
            }
            return {
                ...withOpenTurn(state, { ...state.openTurn, prompt }),
                goal,
                lastActivityAt: event.time,
            };
        }
        case 'assistant/message': {
            const text = textOf(event.data.message.content);
            if (state.openTurn === null || text.length === 0) {
                return text.length === 0 ? state : { ...state, lastActivityAt: event.time };
            }
            const assistant = clip(text, LIMIT.assistant);
            return {
                ...withOpenTurn(state, {
                    ...state.openTurn,
                    lastAssistant: assistant,
                    steps: Math.max(state.openTurn.steps, event.data.step),
                }),
                lastActivityAt: event.time,
            };
        }
        case 'request/header': {
            const config = event.data.header.config;
            if (state.model?.provider === config.provider && state.model.model === config.model) {
                return { ...state, lastActivityAt: event.time };
            }
            return {
                ...state,
                model: { provider: config.provider, model: config.model },
                lastActivityAt: event.time,
            };
        }
        case 'step/start': {
            if (state.openTurn === null)
                return state;
            if (event.data.step <= state.openTurn.steps)
                return state;
            return {
                ...withOpenTurn(state, { ...state.openTurn, steps: event.data.step }),
                lastActivityAt: event.time,
            };
        }
        case 'tool/call': {
            const tool = {
                name: event.data.name,
                target: toolTarget(event.data.arguments),
            };
            return { ...appendTool(state, tool, limits), lastActivityAt: event.time };
        }
        case 'tool/result': {
            if (event.data.message.isError !== true)
                return { ...state, lastActivityAt: event.time };
            const reason = typeof event.data.error?.reason === 'string'
                ? event.data.error.reason
                : textOf(event.data.message.content);
            const failure = clip(reason.length > 0 ? reason : 'tool failed', LIMIT.error);
            const openTurn = state.openTurn === null
                ? null
                : { ...state.openTurn, errors: state.openTurn.errors + 1 };
            return {
                ...withOpenTurn(state, openTurn),
                lastError: failure,
                counts: { ...state.counts, errors: state.counts.errors + 1 },
                lastActivityAt: event.time,
            };
        }
        case 'todo/write': {
            const todos = [];
            for (const todo of event.data.todos.slice(0, limits.todos)) {
                todos.push({ content: clip(todo.content, LIMIT.prompt), status: todo.status });
            }
            return { ...state, todos, lastActivityAt: event.time };
        }
        case 'turn/end': {
            const openTurn = state.openTurn;
            if (openTurn === null) {
                return event.data.reason.kind === 'error' || event.data.reason.kind === 'aborted'
                    ? { ...state, lastActivityAt: event.time }
                    : { ...state, lastActivityAt: event.time };
            }
            const reason = event.data.reason;
            const turnError = reason.kind === 'error';
            const committed = {
                turn: openTurn.turn,
                prompt: openTurn.prompt,
                response: openTurn.lastAssistant,
                tools: openTurn.tools.length,
                errors: openTurn.errors,
            };
            return {
                ...state,
                turns: trail([...state.turns, committed], limits.turns),
                openTurn: null,
                lastError: turnError
                    ? clip(reason.error.message, LIMIT.error)
                    : state.lastError,
                counts: turnError
                    ? { ...state.counts, errors: state.counts.errors + 1 }
                    : state.counts,
                lastActivityAt: event.time,
            };
        }
        default:
            return state;
    }
}
/** Empty digest used before the first folded event and as the schema default. */
export function emptyDigest() {
    return {
        goal: '',
        turns: [],
        openTurn: null,
        todos: null,
        recentTools: [],
        model: null,
        lastError: null,
        counts: { turns: 0, tools: 0, errors: 0 },
        lastActivityAt: 0,
    };
}
/**
 * Fold implementation of the digest projection, exposed for tests.
 * @param limits - per-session caps to apply.
 * @returns a pure `apply` function over the digest state.
 */
export function digestFold(limits = DEFAULT_LIMITS) {
    return (state, event) => applyEvent(state, event, limits);
}
const toolSchema = zod.object({
    name: zod.string(),
    target: zod.string(),
});
const todoSchema = zod.object({
    content: zod.string(),
    status: zod.union([zod.literal('pending'), zod.literal('in_progress'), zod.literal('completed')]),
});
const turnSchema = zod.object({
    turn: zod.number(),
    prompt: zod.string(),
    response: zod.string(),
    tools: zod.number(),
    errors: zod.number(),
});
const modelSchema = zod.object({
    provider: zod.string(),
    model: zod.string(),
});
const openTurnSchema = zod.object({
    turn: zod.number(),
    prompt: zod.string(),
    steps: zod.number(),
    lastAssistant: zod.string(),
    startedAt: zod.number(),
    tools: zod.array(toolSchema),
    errors: zod.number(),
});
/** Wire and persisted-state schema of the digest. */
export const digestSchema = zod.object({
    goal: zod.string(),
    turns: zod.array(turnSchema),
    openTurn: zod.union([openTurnSchema, zod.null()]),
    todos: zod.union([zod.array(todoSchema), zod.null()]),
    recentTools: zod.array(toolSchema),
    model: zod.union([modelSchema, zod.null()]),
    lastError: zod.union([zod.string(), zod.null()]),
    counts: zod.object({
        turns: zod.number(),
        tools: zod.number(),
        errors: zod.number(),
    }),
    lastActivityAt: zod.number(),
});
/**
 * Build the projection definition for the digest.
 * @param limits - per-session caps to apply when folding.
 * @returns the definition to register on `ctx.sessionProjections`.
 */
export function createDigestProjection(limits = DEFAULT_LIMITS) {
    const fold = digestFold(limits);
    return {
        key: DIGEST_KEY,
        stateSchema: digestSchema,
        init: (_header, _inheritedEventCount) => emptyDigest(),
        apply: (state, event) => fold(state, event),
        wire: {
            viewSchema: digestSchema,
            // The fold returns a new object only when it changed, so the framework's
            // identity comparison suppresses publication across unrelated events.
            view: state => state,
        },
        stateVersion: 2,
    };
}
/** Compact one todo list into `completed/total` plus the in-progress item. */
function todoLine(todos) {
    if (todos === null || todos.length === 0)
        return undefined;
    const completed = todos.filter(todo => todo.status === 'completed').length;
    const active = todos.find(todo => todo.status === 'in_progress');
    const head = `${String(completed)}/${String(todos.length)} done`;
    return active === undefined ? head : `${head}; in progress: ${active.content}`;
}
/**
 * Render one digest as the model-facing background block.
 * @param digest - folded digest of the subject session.
 * @param frame - identity and status facts outside the fold.
 * @returns the bounded text the side chat reads as runtime context.
 */
export function renderDigest(digest, frame) {
    const lines = [];
    const status = frame.running === undefined ? 'unknown' : frame.running ? 'running' : 'idle';
    lines.push(`${frame.label} (${status}${frame.live ? '' : ', last known state'})`);
    if (frame.cwd !== undefined)
        lines.push(`Working directory: ${frame.cwd}`);
    if (digest.goal.length > 0)
        lines.push(`Goal: ${digest.goal}`);
    lines.push(`Turns: ${String(digest.counts.turns)}; tool calls: ${String(digest.counts.tools)}; failures: ${String(digest.counts.errors)}`);
    const open = digest.openTurn;
    if (open === null) {
        lines.push('Current turn: none open (the session is between turns).');
    }
    else {
        lines.push(`Current turn: #${String(open.turn)} (step ${String(open.steps)}), started at ${new Date(open.startedAt).toISOString()}`);
        if (open.prompt.length > 0)
            lines.push(`  User asked: ${open.prompt}`);
        if (open.lastAssistant.length > 0)
            lines.push(`  Latest reply: ${open.lastAssistant}`);
        if (open.tools.length > 0) {
            lines.push(`  Recent tool calls: ${open.tools.map(tool => tool.target.length > 0 ? `${tool.name}(${tool.target})` : tool.name).join(', ')}`);
        }
    }
    const todos = todoLine(digest.todos);
    if (todos !== undefined)
        lines.push(`Todo list: ${todos}`);
    if (digest.turns.length > 0) {
        lines.push('Earlier turns (newest last):');
        for (const turn of digest.turns) {
            const prompt = turn.prompt.length > 0 ? turn.prompt : '(no prompt)';
            const response = turn.response.length > 0 ? turn.response : '(no reply text)';
            const failures = turn.errors > 0 ? `, ${String(turn.errors)} failures` : '';
            lines.push(`  #${String(turn.turn)} asked: ${prompt} → replied: ${response} (${String(turn.tools)} tool calls${failures})`);
        }
    }
    if (digest.recentTools.length > 0) {
        lines.push(`Last tool calls: ${digest.recentTools.map(tool => tool.target.length > 0 ? `${tool.name}(${tool.target})` : tool.name).join(', ')}`);
    }
    if (digest.lastError !== null)
        lines.push(`Last failure: ${digest.lastError}`);
    if (digest.lastActivityAt > 0)
        lines.push(`Last activity: ${new Date(digest.lastActivityAt).toISOString()}`);
    return lines.join('\n');
}
