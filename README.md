# Side Chat (`dsh-side-chat-plugin`)

> [中文](README.zh-CN.md) | English

A **Codex-style side chat** for DeepSeek Harness: open a temporary **read-only branch** of the current session in the right sidebar, ask "how is it going?" or "confirm that conclusion" while the main session keeps working, and destroy it by closing the tab.

It is related to, but not the same as, a fork:

- **Shared context** — creation copies the main session's completed turns into the side session (the same fork seed the session controller uses), so it knows what happened before.
- **Read-only** — the side session runs in the read-only sandbox mode (`sandbox/mode: read-only`), with approvals pinned to `never` and a tool guard on mutating tools. It can query, never write.
- **Temporary** — the side session is **hidden** from the left session list and lives only in the right sidebar. Closing the tab asks for confirmation and then destroys it (agent disposed, session files deleted).
- **Non-interrupting** — the main session keeps working. The side chat can read the main session's progress *after* its snapshot, and only hands a result back (as a **queued follow-up turn**) when you explicitly ask for it or it is genuinely necessary.

## Features

| Capability | Description |
|---|---|
| Sidebar entry | Adds a "Side chat" box to the right sidebar's guide page |
| `/btw` | Opens the side chat from the composer |
| Shared context | Seed cut at the main session's latest completed turn |
| Read-only | Sandbox mode + approval policy + tool guard (three layers) |
| Progress | `side_chat_progress` reads events after the snapshot: user requests, assistant replies, tool calls, todo list |
| Report back | `side_chat_report` queues a result into the main session; can be disabled in settings |
| Close confirmation | "Close this side chat?" dialog with "Don't ask again"; cancel reopens the tab |
| Destruction | Disposes the agent and removes the session's JSONL directory; success is verified through the persistence seam |

## Install

```sh
dsh plugin add dsh-side-chat-plugin
```

Or from a local checkout while developing:

```sh
dsh plugin add /absolute/path/to/dsh-side-chat
```

Refresh the Web page afterwards; the plugin card appears in Settings → Plugins.

## Usage

1. Select a session in the left sidebar (a side chat belongs to the **currently open** session).
2. Open the right sidebar and pick "Side chat" on the guide page, or type `/btw` in the composer.
3. Ask your question on the right. The side chat sees the main session's history up to creation time and can pull later progress with `side_chat_progress`.
4. To hand a conclusion over, ask it directly ("tell the main session this").
5. Close the tab → confirm → the side chat is destroyed.

## Settings

Right sidebar panel → "Side chat":

- **Allow messages to the main session** (on by default): when off, `side_chat_report` is refused and the side chat stays local.

Plugin-row configuration (override the `side-chat` row in a profile or `cordis.patch.yml`):

| Field | Default | Meaning |
|---|---|---|
| `readOnly` | `true` | Force the read-only sandbox in side chats |
| `allowReportToMain` | `true` (volatile) | Whether reporting back is allowed |
| `progressEventLimit` | `60` | Max events returned by one progress read |
| `preset` | `""` | Agent preset for side chats; empty inherits the main session's |
| `sessionsRoot` | `""` | Session storage root used for destruction; empty means `$DSH_HOME/sessions` |

## How it works

- **Host half** (`src/`) creates the hidden child with `ctx.agents.create({ seed, inheritedEventCount, meta: { origin: 'subagent', parentSession, isSeeded: true }, setup })`. The setup mounts the main session's preset, registers the read-only guard and the two tools, and appends `sandbox/mode`, `approval/policy`, `subagent/descriptor`.
  - The `subagent/descriptor` is required: the Web client refuses ordinary history reads for an `origin: 'subagent'` session, and only a descriptor-backed child can use the `subagent` history route.
  - The side chat uses its own composer because, once the child carries a subagent address, the built-in composer routes prompts through subagent delivery; the plugin instead sends messages straight into the child's inbox over its own Connection RPC channel.
- **Client half** (`client/client.js`) contributes two tab types (draft page and addressed conversation), a resource provider that retains the session, a `conversation.composer` chain entry that replaces the composer, a `shell.overlay` close dialog, the `/btw` client command, and the settings panel.
- **Transport**: an out-of-repo plugin cannot publish Typert Remote artifacts, and Connection's generic channel attributes its route to the service's own context, so the Host mounts its own authenticated `POST /side-chat/<endpoint>` route on the web server (`connection.requestRejection` enforces the Host/Origin and browser-credential fence). Plain JSON, owner only.

## Known limitations

- Confirmation happens **after** the close: the right sidebar exposes no close veto, so the dialog appears when the tab is already gone, and "Cancel" reopens the tab (brief close/reopen flash).
- Destruction depends on the JSONL session layout (`$DSH_HOME/sessions/<projectKey>/<sessionId>/`). With another persistence backend or a custom root, set `sessionsRoot`; every removal is verified with `sessionPersistence.stat()` and a failure is reported honestly in the dialog.
- After an application restart the old side-chat session stays on disk as a hidden session; a new `/btw` creates a fresh side chat and the old one is no longer reachable from the UI.
- Borrowing the subagent descriptor is an unsupported-but-stable interaction: a descriptor version bump upstream must be mirrored here. Baseline: dsh `0.2.1-rc.2` (commit `687f282e`).
- `sandbox/mode: read-only` guarantees writes fail; `bash` may still run read-only commands.
- The plugin requires `webServer` and `connection`, so it targets the Web/desktop deployments; a headless profile without a web server leaves the Host half inactive.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build    # emits lib/ for `dsh plugin add`
```

## License

MIT © 2026 XBXyftx
