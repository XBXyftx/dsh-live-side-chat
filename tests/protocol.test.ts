import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MUTATING_TOOLS, RESOURCE_PREFIX, SIDE_SESSION_PREFIX, isSideChatSessionId, parseSideChatAddress, sideChatAddress,
} from '../src/protocol.ts'

test('address round-trips the session id', () => {
  const id = `${SIDE_SESSION_PREFIX}3f1c2a4e-0000-4000-8000-123456789abc`
  const address = sideChatAddress(id)
  assert.equal(address, `${RESOURCE_PREFIX}${id}`)
  assert.equal(parseSideChatAddress(address), id)
})

test('foreign or malformed addresses are rejected', () => {
  assert.equal(parseSideChatAddress('dsh-resource://file/session/s1/tmp/a.txt'), undefined)
  assert.equal(parseSideChatAddress(`${RESOURCE_PREFIX}`), undefined)
  assert.equal(parseSideChatAddress(`${RESOURCE_PREFIX}a/b`), undefined)
  assert.equal(parseSideChatAddress(`${RESOURCE_PREFIX}a?x=1`), undefined)
  assert.equal(parseSideChatAddress(''), undefined)
})

test('an encoded id is decoded once', () => {
  assert.equal(parseSideChatAddress(`${RESOURCE_PREFIX}session-side-chat-a%20b`), 'session-side-chat-a b')
  assert.equal(parseSideChatAddress(`${RESOURCE_PREFIX}%E0%A4%A`), undefined)
})

test('only ids minted by this plugin are side chats', () => {
  assert.equal(isSideChatSessionId(`${SIDE_SESSION_PREFIX}abc`), true)
  assert.equal(isSideChatSessionId('session-abc'), false)
  assert.equal(isSideChatSessionId(undefined), false)
  assert.equal(isSideChatSessionId(42), false)
})

test('the read-only guard covers the expected mutating tools', () => {
  for (const name of ['write', 'edit', 'str_replace_editor', 'apply_patch']) {
    assert.ok(MUTATING_TOOLS.includes(name), `${name} must be denied in a read-only side chat`)
  }
  assert.ok(!MUTATING_TOOLS.includes('read'))
  assert.ok(!MUTATING_TOOLS.includes('grep'))
})

test('the guard never blocks the PTC transport', () => {
  // A PTC preset exposes only `run_code`; denying it would deny every tool in
  // the side chat. Nested calls to real mutators stay denied by this guard.
  assert.ok(!MUTATING_TOOLS.includes('run_code'))
})
