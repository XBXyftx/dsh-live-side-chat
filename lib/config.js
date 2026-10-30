/**
 * Deployment configuration for the side-chat plugin. Every value a deployment
 * may want to differ is a schema field; the loader validates it at load time
 * and fails loudly on invalid input.
 * @module dsh-side-chat/config
 */
import Schema from '@deepseek-ai/schemastery';
/** Schemastery schema for the plugin row's `config` block. */
export const Config = Schema.object({
    readOnly: Schema.boolean().default(true),
    allowReportToMain: Schema.boolean().default(true).volatile(),
    liveContext: Schema.boolean().default(true),
    digestTurns: Schema.number().min(4).max(60).default(12),
    historyEventLimit: Schema.number().min(5).max(200).default(40),
    preset: Schema.string().default(''),
    sessionsRoot: Schema.string().default(''),
});
