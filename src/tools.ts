/**
 * Model-facing tools of one side chat: read the main session's live digest,
 * query its log for the details the digest leaves out, and (optionally) hand a
 * discussion result back to the main session as a queued follow-up turn.
 *
 * All three are registered inside the side-chat agent's own setup scope, so no
 * other agent can see or call them.
 * @module dsh-side-chat/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { HISTORY_TOOL, REPORT_TOOL, STATUS_TOOL } from './protocol.ts'

/** Host callbacks one side-chat agent's tools bind to. */
export interface SideChatToolDeps {
  /** Render the main session's current digest and status. */
  readonly status: () => Promise<string>
  /** Read part of the main session's log. */
  readonly history: (query: SideChatHistoryQuery) => Promise<string>
  /** Queue one report as a follow-up turn of the main session. */
  readonly report: (text: string) => Promise<{ readonly delivered: boolean; readonly detail: string }>
}

/** One bounded read of the main session's log. */
export interface SideChatHistoryQuery {
  /** Restrict to one turn number. */
  readonly turn?: number
  /** Restrict to events whose text contains this literal (case-insensitive). */
  readonly contains?: string
  /** Maximum rendered lines; the host clamps it. */
  readonly limit?: number
}

const STATUS_DESCRIPTION = 'Read the main session\'s current state: its goal, the turn it is running right now, '
  + 'its latest reply, recent tool calls, the todo list, and counters. Use it when the user asks how the work is going, '
  + 'whether something finished, or what the main session is doing at this moment. '
  + 'The background block injected into your context is a bounded digest of the same fold; call this tool when you need '
  + 'the freshest reading rather than the one captured at your previous step.'

const HISTORY_DESCRIPTION = 'Read details from the main session\'s log that the background digest left out. '
  + 'Filter by `turn` (one turn number from the digest) and/or `contains` (a literal word such as a file name or error text). '
  + 'Use it to check what was actually done, which files changed, or the exact wording of a failure — never infer those from the digest.'

const REPORT_DESCRIPTION = 'Send one short message to the main session so its user sees the outcome of this side discussion. '
  + 'Call it ONLY when the user explicitly asks you to tell the main session, or when the outcome is something the main session must act on. '
  + 'Never use it for greetings, status pings, or your own conclusions the user has not confirmed. '
  + 'The message is queued behind the main session\'s current turn and never interrupts it.'

/** One string-valued tool result: a rendered text block. */
function textOutput(description: string) {
  return {
    schema: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        text: { type: 'string' as const, required: true as const, description },
      },
    },
    render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: (value as { text: string }).text }],
  }
}

/**
 * Build the tools for one side chat.
 * @param deps - callbacks bound to that chat's main and side session ids.
 * @returns the tool definitions to register in the side-chat agent scope.
 */
export function createSideChatTools(deps: SideChatToolDeps) {
  const status = defineTool({
    name: STATUS_TOOL,
    description: STATUS_DESCRIPTION,
    parameters: {},
    output: textOutput('Rendered main-session digest and status.'),
    async execute() {
      return { text: await deps.status() }
    },
  })

  const history = defineTool({
    name: HISTORY_TOOL,
    description: HISTORY_DESCRIPTION,
    parameters: {
      turn: {
        type: 'number',
        description: 'Restrict the read to this turn number, as listed in the digest.',
      },
      contains: {
        type: 'string',
        description: 'Restrict the read to events whose text contains this literal (case-insensitive).',
      },
      limit: {
        type: 'number',
        description: 'Maximum rendered lines. The host clamps it.',
      },
    },
    output: textOutput('Rendered log lines of the main session.'),
    async execute(args) {
      const query = args as { turn?: unknown; contains?: unknown; limit?: unknown }
      return {
        text: await deps.history({
          ...(typeof query.turn === 'number' ? { turn: query.turn } : {}),
          ...(typeof query.contains === 'string' ? { contains: query.contains } : {}),
          ...(typeof query.limit === 'number' ? { limit: query.limit } : {}),
        }),
      }
    },
  })

  const report = defineTool({
    name: REPORT_TOOL,
    description: REPORT_DESCRIPTION,
    parameters: {
      text: {
        type: 'string',
        required: true,
        description: 'The message to queue for the main session. Short, concrete, and in the user\'s language.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          delivered: { type: 'boolean', required: true, description: 'Whether the message was queued.' },
          detail: { type: 'string', required: true, description: 'Delivery outcome in the user\'s language.' },
        },
      },
      render: (_args, value) => {
        const outcome = value as { delivered: boolean; detail: string }
        return [{ type: 'text', text: outcome.detail }]
      },
    },
    async execute(args) {
      const { text } = args as { text: string }
      return await deps.report(text)
    },
  })

  return [status, history, report] as const
}
