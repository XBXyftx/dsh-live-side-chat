/**
 * Deployment configuration for the side-chat plugin. Every value a deployment
 * may want to differ is a schema field; the loader validates it at load time
 * and fails loudly on invalid input.
 * @module dsh-side-chat/config
 */
import Schema from '@deepseek-ai/schemastery';
/** Validated deployment configuration. */
export interface SideChatConfig {
    /** Lock every side chat to the read-only sandbox mode. On by default. */
    readonly readOnly: boolean;
    /**
     * Let the side chat send a discussion result to its main session. On by
     * default; the tool description still limits it to explicit user requests or
     * genuinely necessary reports. Declared volatile so the settings form can
     * edit it on the running Host.
     */
    readonly allowReportToMain: boolean;
    /** Largest number of main-session events one progress read returns. */
    readonly progressEventLimit: number;
    /** Agent preset for side chats; an empty value inherits the main session's preset. */
    readonly preset: string;
    /**
     * Session storage root used only to delete a destroyed side chat's files.
     * Empty means `$DSH_HOME/sessions` (then `~/.dsh/sessions`).
     */
    readonly sessionsRoot: string;
}
/** Schemastery schema for the plugin row's `config` block. */
export declare const Config: Schema<Schemastery.ObjectS<NoInfer<{
    readOnly: Schema<boolean, boolean, "defined">;
    allowReportToMain: Schema<boolean, boolean, "volatile-defined">;
    progressEventLimit: Schema<number, number, "defined">;
    preset: Schema<string, string, "defined">;
    sessionsRoot: Schema<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    readOnly: Schema<boolean, boolean, "defined">;
    allowReportToMain: Schema<boolean, boolean, "volatile-defined">;
    progressEventLimit: Schema<number, number, "defined">;
    preset: Schema<string, string, "defined">;
    sessionsRoot: Schema<string, string, "defined">;
}>>, "plain">;
/** Runtime config: the volatile field arrives as a stable readable reference. */
export interface ResolvedSideChatConfig extends Omit<SideChatConfig, 'allowReportToMain'> {
    readonly allowReportToMain: {
        get(): boolean;
    };
}
