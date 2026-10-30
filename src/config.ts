/**
 * Deployment configuration for the side-chat plugin. Every value a deployment
 * may want to differ is a schema field; the loader validates it at load time
 * and fails loudly on invalid input.
 * @module dsh-side-chat/config
 */

import Schema from '@deepseek-ai/schemastery'

/** Validated deployment configuration. */
export interface SideChatConfig {
  /** Lock every side chat to the read-only sandbox mode. On by default. */
  readonly readOnly: boolean
  /**
   * Let the side chat send a discussion result to its main session. On by
   * default; the tool description still limits it to explicit user requests or
   * genuinely necessary reports. Declared volatile so the settings form can
   * edit it on the running Host.
   */
  readonly allowReportToMain: boolean
  /**
   * Inject the main session's live digest as background context on every side
   * chat step. Turning it off leaves only the on-demand status tool.
   */
  readonly liveContext: boolean
  /** Settled main-session turns the digest retains. */
  readonly digestTurns: number
  /** Largest number of main-session log lines one history read returns. */
  readonly historyEventLimit: number
  /** Agent preset for side chats; an empty value inherits the main session's preset. */
  readonly preset: string
  /**
   * Session storage root used only to delete a destroyed side chat's files.
   * Empty means `$DSH_HOME/sessions` (then `~/.dsh/sessions`).
   */
  readonly sessionsRoot: string
}

/** Schemastery schema for the plugin row's `config` block. */
export const Config = Schema.object({
  readOnly: Schema.boolean().default(true),
  allowReportToMain: Schema.boolean().default(true).volatile(),
  liveContext: Schema.boolean().default(true),
  digestTurns: Schema.number().min(4).max(60).default(12),
  historyEventLimit: Schema.number().min(5).max(200).default(40),
  preset: Schema.string().default(''),
  sessionsRoot: Schema.string().default(''),
})

/** Runtime config: the volatile field arrives as a stable readable reference. */
export interface ResolvedSideChatConfig extends Omit<SideChatConfig, 'allowReportToMain'> {
  readonly allowReportToMain: { get(): boolean }
}
