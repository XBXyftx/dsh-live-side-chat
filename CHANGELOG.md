# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- Codex-style side chat in the right sidebar: a hidden, read-only child session seeded from the main session's latest completed turn.
- Two entry points: a right-sidebar guide box and the `/btw` composer command.
- Embedded conversation view with the plugin's own composer, driven over a private Connection RPC channel.
- Read-only enforcement in three layers: `sandbox/mode: read-only`, `approval/policy: never`, and a `tools` guard on mutating tools.
- `side_chat_progress` (reads the main session's events after the snapshot) and `side_chat_report` (queues a result into the main session as a follow-up turn) model tools.
- Close confirmation dialog with "don't ask again", cancel-to-reopen, and real destruction (agent disposed, session directory removed and verified).
- Settings panel with the "allow messages to the main session" switch.
