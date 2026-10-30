/**
 * Unit tests of the bounded session digest fold and its renderer.
 *
 * The fold is pure, so these tests drive it with hand-built events: no Host, no
 * session service, no model.
 * @module dsh-side-chat/tests/digest
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import {
  DEFAULT_LIMITS, DIGEST_KEY, createDigestProjection, digestFold, digestSchema, emptyDigest,
  renderDigest, toolTarget, type SessionDigest,
} from '../src/digest.ts'

let nextSeq = 0
let nextTime = 1_700_000_000_000

function event<T extends string>(type: T, data: unknown): SessionEvent {
  return { type, seq: nextSeq++, time: nextTime++, data } as unknown as SessionEvent
}

function user(text: string) {
  return event('user/message', {
    id: `m-${String(nextSeq)}`, role: 'user', source: { kind: 'user' },
    content: [{ type: 'text', text }],
  })
}

function assistant(text: string, step = 1) {
  return event('assistant/message', {
    turn: 1, step,
    message: { id: `a-${String(nextSeq)}`, role: 'assistant', content: [{ type: 'text', text }] },
    stream: [],
  })
}

function toolCall(name: string, args: unknown) {
  return event('tool/call', { turn: 1, step: 1, callId: `c-${String(nextSeq)}`, name, arguments: JSON.stringify(args) })
}

function toolResult(isError: boolean, reason?: string) {
  return event('tool/result', {
    turn: 1,
    step: 1,
    message: { id: `r-${String(nextSeq)}`, role: 'tool', callId: 'c', content: [{ type: 'text', text: 'out' }], isError },
    ...(reason === undefined ? {} : { error: { name: 'E', code: 'X', reason } }),
  })
}

function todoWrite(todos: { content: string; status: 'pending' | 'in_progress' | 'completed' }[]) {
  return event('todo/write', { todos })
}

function foldAll(events: readonly SessionEvent[], limits = DEFAULT_LIMITS): SessionDigest {
  const fold = digestFold(limits)
  return events.reduce<SessionDigest>((state, entry) => fold(state, entry), emptyDigest())
}

describe('digest fold', () => {
  it('starts empty and ignores events it does not model', () => {
    const digest = foldAll([])
    assert.deepEqual(digest, emptyDigest())
    const unaffected = digestFold()(digest, event('step/start', { turn: 1, step: 1 }))
    assert.equal(unaffected, digest, 'an unrelated event must preserve the state reference')
  })

  it('records the goal from the first human prompt', () => {
    const digest = foldAll([
      event('turn/start', { turn: 1 }),
      user('修复登录 bug'),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
      event('turn/start', { turn: 2 }),
      user('顺便加个测试'),
      event('turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ])
    assert.equal(digest.goal, '修复登录 bug')
    assert.equal(digest.turns.length, 2)
    assert.equal(digest.turns[1]?.prompt, '顺便加个测试')
  })

  it('tracks the open turn while it runs', () => {
    const digest = foldAll([
      event('turn/start', { turn: 3 }),
      user('跑一下测试'),
      assistant('先看看现有测试'),
      toolCall('bash', { command: 'npm test' }),
    ])
    const open = digest.openTurn
    assert.ok(open !== null)
    assert.equal(open.turn, 3)
    assert.equal(open.prompt, '跑一下测试')
    assert.equal(open.lastAssistant, '先看看现有测试')
    assert.deepEqual(open.tools, [{ name: 'bash', target: 'npm test' }])
    assert.equal(digest.counts.turns, 1, 'turn/start counts the turn')
    assert.equal(digest.counts.tools, 1)
  })

  it('commits a settled turn and clears the open slot', () => {
    const digest = foldAll([
      event('turn/start', { turn: 1 }),
      user('改一下配置'),
      assistant('改好了，改的是 a.yml'),
      toolCall('edit', { path: 'a.yml' }),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    assert.equal(digest.openTurn, null)
    assert.deepEqual(digest.turns, [
      { turn: 1, prompt: '改一下配置', response: '改好了，改的是 a.yml', tools: 1, errors: 0 },
    ])
  })

  it('counts failures and keeps the newest failure reason', () => {
    const digest = foldAll([
      event('turn/start', { turn: 1 }),
      toolResult(true, 'command not found'),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    assert.equal(digest.counts.errors, 1)
    assert.equal(digest.lastError, 'command not found')
    assert.equal(digest.turns[0]?.errors, 1)
  })

  it('records a turn-level error reason', () => {
    const digest = foldAll([
      event('turn/start', { turn: 1 }),
      event('turn/end', { turn: 1, reason: { kind: 'error', error: { message: '模型超时', code: 'TIMEOUT' } } }),
    ])
    assert.equal(digest.lastError, '模型超时')
    assert.equal(digest.counts.errors, 1)
  })

  it('keeps only the configured number of settled turns', () => {
    const events: SessionEvent[] = []
    for (let turn = 1; turn <= 10; turn += 1) {
      events.push(event('turn/start', { turn }))
      events.push(user(`请求 ${String(turn)}`))
      events.push(event('turn/end', { turn, reason: { kind: 'completed' } }))
    }
    const digest = foldAll(events, { ...DEFAULT_LIMITS, turns: 3 })
    assert.equal(digest.turns.length, 3)
    assert.deepEqual(digest.turns.map(turn => turn.turn), [8, 9, 10])
    assert.equal(digest.counts.turns, 10, 'the counter survives the bounded array')
  })

  it('replaces the todo list instead of appending to it', () => {
    const digest = foldAll([
      todoWrite([{ content: 'A', status: 'pending' }, { content: 'B', status: 'in_progress' }]),
      todoWrite([{ content: 'A', status: 'completed' }]),
    ])
    assert.deepEqual(digest.todos, [{ content: 'A', status: 'completed' }])
  })

  it('records the provider/model of the newest routed request', () => {
    const digest = foldAll([
      event('request/header', { reason: 'initial', header: { config: { provider: 'cd', model: 'deepseek-flash' } } }),
      event('turn/start', { turn: 1 }),
      user('问一句'),
    ])
    assert.deepEqual(digest.model, { provider: 'cd', model: 'deepseek-flash' })
    const same = event('request/header', { reason: 'change', header: { config: { provider: 'cd', model: 'deepseek-flash' } } })
    const folded = digestFold()(digest, same)
    assert.notEqual(folded.model, undefined)
    assert.deepEqual(folded.model, { provider: 'cd', model: 'deepseek-flash' })
  })

  it('replaces the model when a later request routes elsewhere', () => {
    const digest = foldAll([
      event('request/header', { reason: 'initial', header: { config: { provider: 'cd', model: 'deepseek-flash' } } }),
      event('request/header', { reason: 'change', header: { config: { provider: 'cd', model: 'gpt-6-astra' } } }),
    ])
    assert.deepEqual(digest.model, { provider: 'cd', model: 'gpt-6-astra' })
  })

  it('bounds every retained string', () => {
    const digest = foldAll([
      event('turn/start', { turn: 1 }),
      user('长'.repeat(2000)),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    assert.ok(digest.goal.length <= 240)
    assert.ok((digest.turns[0]?.prompt.length ?? 0) <= 160)
  })

  it('produces state that its own schema accepts', () => {
    const digest = foldAll([
      event('turn/start', { turn: 1 }),
      user('hello'),
      assistant('world'),
      toolCall('bash', { command: 'ls' }),
      toolResult(true, 'boom'),
      todoWrite([{ content: 'A', status: 'completed' }]),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])
    assert.deepEqual(digestSchema.parse(JSON.parse(JSON.stringify(digest))), digest)
  })
})

describe('tool target', () => {
  it('prefers the meaningful argument field', () => {
    assert.equal(toolTarget('{"path":"src/a.ts","content":"x"}'), 'src/a.ts')
    assert.equal(toolTarget('{"command":"npm test"}'), 'npm test')
  })

  it('degrades to an empty target for unhelpful or invalid arguments', () => {
    assert.equal(toolTarget('not json'), '')
    assert.equal(toolTarget('{"content":"only content"}'), '')
  })
})

describe('renderer', () => {
  it('names the open turn, the todo progress, and the settled turns', () => {
    const digest = foldAll([
      event('turn/start', { turn: 1 }),
      user('第一轮请求'),
      assistant('第一轮结论'),
      event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
      event('turn/start', { turn: 2 }),
      user('第二轮请求'),
      assistant('正在处理'),
      toolCall('bash', { command: 'npm test' }),
      todoWrite([{ content: 'A', status: 'completed' }, { content: 'B', status: 'in_progress' }]),
    ])
    const text = renderDigest(digest, { label: 'Main session', running: true, live: true, cwd: '/w' })
    assert.match(text, /Main session \(running\)/)
    assert.match(text, /Goal: 第一轮请求/)
    assert.match(text, /Current turn: #2/)
    assert.match(text, /Latest reply: 正在处理/)
    assert.match(text, /bash\(npm test\)/)
    assert.match(text, /1\/2 done; in progress: B/)
    assert.match(text, /#1 asked: 第一轮请求 → replied: 第一轮结论/)
  })

  it('says the session is between turns when nothing is open', () => {
    const text = renderDigest(emptyDigest(), { label: 'Main session', live: false })
    assert.match(text, /last known state/)
    assert.match(text, /Current turn: none open/)
  })

  it('exposes one stable projection key', () => {
    const projection = createDigestProjection()
    assert.equal(projection.key, DIGEST_KEY)
    assert.equal(projection.stateVersion, 2)
    const state = projection.init({} as never, 0 as never)
    assert.deepEqual(projection.wire.view(state), emptyDigest())
  })
})
