# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.2.0] - 2026-10-30

### Added

- `sideChatDigest` session projection (`src/digest.ts`): a pure incremental fold over every session's events, bounded per session to the goal, settled turns, the open turn, the latest todo list, recent tool calls, the last error, monotonic counters and `lastActivityAt`; every string is clipped and every array is capped.
- Live runtime context: the side chat re-reads the main session's digest synchronously on every step through `systemPrompt.context({ name: 'side-chat:main-digest', order: 220, text: ... })` and renders it as a "Main session live digest (partial; verify any detail with the side_chat_main_history or side_chat_main_status tool before asserting it)" block.
- `side-chat:role` prompt discipline: the section now states that the digest is partial, that it is not the log, and that the model must call the read-only tools before asserting that work is done, a file changed, or an error was fixed.
- Read-only tools registered only inside side-chat agents: `side_chat_main_status` (freshest digest plus running/idle) and `side_chat_main_history` (filter by `turn` and/or `contains`, bounded, returns real log lines).
- Live status strip above the conversation: main-session title, running/idle dot, turn number, todo progress, newest tool, relative last-activity time and the open turn's prompt.
- Collapsed "Background digest" panel in the status strip: expands the exact background block the model reads, served by the new `/side-chat/digest` RPC endpoint and rendered by the same function as the injection.
- Plugin-owned greeting card for the empty conversation (the connected main session plus three quick questions) instead of dsh's shared blank hero.
- Configuration fields `liveContext` (default `true`), `digestTurns` (default `12`, 4–60) and `historyEventLimit` (default `40`, 5–200).
- Runtime dependencies `@deepseek-ai/dsh-session-projection` and `zod` (peer and dev).

### Changed

- The side chat is no longer a fork: the child session is created with no `seed` and no `isSeeded`, so the tab opens as a genuinely empty conversation.
- The side chat learns about the main session from the live digest instead of inherited history, so work that happened after the side chat was created is visible; the digest is explicitly partial and the model must verify details before asserting them.
- The injected digest is not visible in the Chat transcript because dsh hides ordinary runtime-context rows (`isVisibleChatNode` excludes `kind === 'context'` unless the row carries tool changes); the strip's "Background digest" panel is the supported way to inspect it.
- Restart recovery: the digest is persisted by the projection cache, so a restarted Host restores the side chat and its digest panel.
- Everything else is unchanged by the redesign: two entry points (right-sidebar guide entry and `/btw`), the custom composer, close confirmation with "Don't ask again" / "Cancel" / "Close side chat", real destruction (agent disposed, session directory removed and verified), three-layer read-only enforcement, the settings page with the report-to-main switch, and Web/desktop-only activation.

### Removed

- Fork seeding (`seed`, `inheritedEventCount`, `isSeeded`) and the main session's inherited history.
- The limitation that a side chat could not be created before the main session completed a turn.
- The `side_chat_progress` tool.
- The `progressEventLimit` configuration field.

### Fixed

- Mid-task questions are answered from live state (current turn, current command, todo progress) instead of a snapshot cut at creation time, which could never see work that happened afterwards.
- A restart restores the side chat and its digest panel from the persisted projection instead of leaving the old side chat as an unreachable hidden session on disk.
- The empty side chat shows the plugin's own greeting card instead of dsh's shared blank hero, whose workspace chrome does not apply to a side chat.
- The composer sits at the bottom of the panel and follows the main conversation composer's chrome: the same elevated rounded card (`--dsw-specific-input-major` + soft elevation), a `只读` pill, and a 34px circular send button on `--dsw-alias-button-info-fill` with the arrow glyph, so the send affordance is legible in both themes. Previously the empty side chat parked the composer at the top (dsh's sticky composer seat had no content above it) and used an almost unreadable custom-accent button.

## [0.1.0] - 2026-10-29

### Added

- Codex-style side chat in the right sidebar: a hidden, read-only child session seeded from the main session's latest completed turn.
- Two entry points: a right-sidebar guide box and the `/btw` composer command.
- Embedded conversation view with the plugin's own composer, driven over a private Connection RPC channel.
- Read-only enforcement in three layers: `sandbox/mode: read-only`, `approval/policy: never`, and a `tools` guard on mutating tools.
- `side_chat_progress` (reads the main session's events after the snapshot) and `side_chat_report` (queues a result into the main session as a follow-up turn) model tools.
- Close confirmation dialog with "don't ask again", cancel-to-reopen, and real destruction (agent disposed, session directory removed and verified).
- Settings panel with the "allow messages to the main session" switch.
