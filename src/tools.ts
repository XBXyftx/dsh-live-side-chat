/**
 * Model-facing tools of one side chat: read the main session's progress since
 * the snapshot, and (optionally) hand a discussion result back to the main
 * session as a queued follow-up turn.
 *
 * Both tools are registered inside the side-chat agent's own setup scope, so no
 * other agent can see or call them.
 * @module dsh-side-chat/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { PROGRESS_TOOL, REPORT_TOOL } from './protocol.ts'

/** Host callbacks one side-chat agent's tools bind to. */
export interface SideChatToolDeps {
  /** Render the main session's progress after this chat's snapshot. */
  readonly progress: () => Promise<string>
  /** Queue one report as a follow-up turn of the main session. */
  readonly report: (text: string) => Promise<{ readonly delivered: boolean; readonly detail: string }>
}

const PROGRESS_DESCRIPTION = 'Read what the main session has done since this side chat was created. '
  + 'Use it when the user asks about current progress, recent changes, or whether some work finished. '
  + 'It returns read-only facts from the main session log: user requests, assistant replies, tool calls, and the current todo list. '
  + 'Call it again whenever the user asks for fresh progress; the side-chat snapshot itself never updates.'

const REPORT_DESCRIPTION = 'Send one short message to the main session so its user sees the outcome of this side discussion. '
  + 'Call it ONLY when the user explicitly asks you to tell the main session, or when the outcome is something the main session must act on. '
  + 'Never use it for greetings, status pings, or your own conclusions the user has not confirmed. '
  + 'The message is queued behind the main session\'s current turn and never interrupts it.'

/**
 * Build the tools for one side chat.
 * @param deps - callbacks bound to that chat's main and side session ids.
 * @returns the tool definitions to register in the side-chat agent scope.
 */
export function createSideChatTools(deps: SideChatToolDeps) {
  const progress = defineTool({
    name: PROGRESS_TOOL,
    description: PROGRESS_DESCRIPTION,
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true, description: 'Rendered progress digest.' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: (value as { text: string }).text }],
    },
    async execute() {
      return { text: await deps.progress() }
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

  return [progress, report] as const
}
