# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.4.2] - 2026-10-30

### Fixed

- Tool calls failed in every session whose preset presents tools as PTC (`run_code` only): the read-only guard denied
  `run_code` by name, and under such a preset that is the only tool a model may call directly, so asking the side chat
  to check progress produced a stream of "the side chat is read-only" denials while the model retried. `run_code` is no
  longer on the deny list; mutating tools reached from inside a program still hit the same guard on the same agent
  scope, and the program body still runs under the session's read-only sandbox policy.

## [0.4.1] - 2026-10-30

### Added

- Settings page gained the two pieces the previous plugin already had: a **version card** that checks the npm registry
  automatically when the page opens (plus a manual "check for updates" button, showing `up to date` / `update available`
  with the npm link) and a **blog link** next to npm/GitHub.
- The installed version is read from the bundle registry (`remote.pluginManager.listBundles()`), so a published bump
  shows up without rebuilding the client; a constant only covers a registry read that fails.

## [0.4.0] - 2026-10-30

### Changed

- **Renamed the package to `dsh-live-side-chat`** (npm and the GitHub repository). The old `dsh-side-chat-plugin` line is
  deprecated and points here; nothing else about the plugin changed. The name now carries the `live` signal next to the
  `side chat` words, which is what the plugin actually does and how it can be found; `dsh-side-chat` alone was already
  taken on npm and crowded in search results.
- Display name, behaviour, config fields, RPC endpoints and the model chip are unchanged from 0.3.0.

## [0.3.0] - 2026-10-30

### Added

- Model chip in the composer: shows the model the side chat's next request will use, and opens a picker with every model this Host can currently route (grouped by provider). The choice is Host-side state (`/side-chat/models`, `/side-chat/select-model`) and applies from the next turn without touching the main session.
- `sideChatDigest` now records the provider/model of the newest logged request (`request/header`), so the chip also reflects what actually ran. Projection `stateVersion` 1 → 2.
- Selecting a model on a side chat whose agent is not live yet records the choice and applies it when the side chat resumes on its next message.

### Changed

- Display name is now **Live Side Chat / 实时侧边对话** (left global panel, settings page, README titles) and the guide entry/subtitle describe the advantage explicitly: live progress that never goes stale, empty start, read-only, non-interrupting.
- The composer's model picker can fail per model: a provider-side rejection is surfaced in the conversation instead of being hidden.

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
