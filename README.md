# Live Side Chat (`dsh-live-side-chat`)

> [中文](README.zh-CN.md) | English

A **Codex-style side chat** for DeepSeek Harness: open a temporary **empty** conversation in the right sidebar that follows the current session's work live, ask "how is it going?" or "confirm that conclusion" while the main session keeps working, and destroy it by closing the tab.

It is **not** a fork. It never copies the main session's history; it runs empty and reads a live digest instead:

- **Empty start** — the child session is created with no `seed` and no `isSeeded`, so the tab opens as a genuinely empty conversation. It can be created at any time; it no longer waits for the main session to complete a turn.
- **Live digest, not a log copy** — the side chat learns about the main session from the plugin's own bounded `sideChatDigest` session projection, re-read as runtime context on every step. Work that happened *after* the side chat was created is visible; the digest is partial by design, so the model verifies details with the read-only tools before asserting them.
- **Read-only** — the side session runs in the read-only sandbox mode (`sandbox/mode: read-only`), with approvals pinned to `never` and a tool guard on mutating tools. It can query, never write.
- **Temporary** — the side session is **hidden** from the left session list and lives only in the right sidebar. Closing the tab asks for confirmation and then destroys it (agent disposed, session files deleted).
- **Non-interrupting** — the main session keeps working. The side chat reads the main session's live progress at any time, and only hands a result back (as a **queued follow-up turn**) when you explicitly ask for it or it is genuinely necessary.

## Features

| Capability | Description |
|---|---|
| Sidebar entry | Adds a "Side chat" box to the right sidebar's guide page |
| `/btw` | Opens the side chat from the composer |
| Empty start | The child session opens with no inherited history, so the tab is a real empty conversation |
| Live digest | `sideChatDigest` projection: goal, one line per settled turn, the open turn, todos, recent tools, counters — bounded and clipped |
| Live context | Re-read and injected as runtime context on every step, so work after creation is visible |
| Status strip | Main-session title, running/idle dot, turn number, todo progress, newest tool, relative activity, open-turn prompt |
| Background digest | Collapsed panel in the strip; expands the exact block the model reads (same renderer as the injection) |
| Empty greeting | Plugin-owned card naming the connected main session, plus three quick questions |
| Composer | Anchored at the bottom of the panel and reusing the main conversation composer chrome: the same elevated rounded card, a read-only pill and a 34px circular send button |
| Model chip | Shows the model the next turn will use and opens a picker over every model the Host can route (grouped by provider); the switch applies from the next turn only, and the main session is never touched |
| Read-only tools | `side_chat_main_status` (freshest digest + running/idle) and `side_chat_main_history` (`turn` / `contains` filters, bounded, real log lines) |
| Report back | `side_chat_report` queues a result into the main session; can be disabled in settings |
| Close confirmation | "Close this side chat?" dialog with "Don't ask again"; cancel reopens the tab |
| Destruction | Disposes the agent and removes the session's JSONL directory; success is verified through the persistence seam |

## Install

```sh
dsh plugin add dsh-live-side-chat
```

Or from a local checkout while developing:

```sh
dsh plugin add /absolute/path/to/dsh-side-chat
```

Refresh the Web page afterwards; the plugin card appears in Settings → Plugins.

## Usage

1. Select a session in the left sidebar (a side chat belongs to the **currently open** session).
2. Open the right sidebar and pick "Side chat" on the guide page, or type `/btw` in the composer.
3. The tab opens as an empty conversation with a live status strip above it: the main session's title, a running/idle dot, the turn number, todo progress, the newest tool, the relative last-activity time and the open turn's prompt.
4. Ask your question on the right. The side chat re-reads the main session's digest on every step, so work that happened after it was opened is visible; it verifies details with `side_chat_main_status` / `side_chat_main_history`.
5. To inspect what it knows, expand "Background digest" in the strip: it shows the exact block the model reads.
6. To hand a conclusion over, ask it directly ("tell the main session this").
7. Close the tab → confirm → the side chat is destroyed.

## Settings

Right sidebar panel → "Side chat":

- **Allow messages to the main session** (on by default): when off, `side_chat_report` is refused and the side chat stays local.

Plugin-row configuration (override the `side-chat` row in a profile or `cordis.patch.yml`):

| Field | Default | Meaning |
|---|---|---|
| `readOnly` | `true` | Force the read-only sandbox in side chats |
| `allowReportToMain` | `true` (volatile) | Whether reporting back is allowed; editable in the settings panel |
| `liveContext` | `true` | Inject the main session's digest as runtime context on every step; off leaves only the on-demand status tool |
| `digestTurns` | `12` (4–60) | Settled main-session turns the digest retains |
| `historyEventLimit` | `40` (5–200) | Largest number of main-session log lines one history read returns |
| `preset` | `""` | Agent preset for side chats; empty inherits the main session's preset |
| `sessionsRoot` | `""` | Session storage root used only for destruction; empty means `$DSH_HOME/sessions` |

## How it works

```text
main session (the session you are working in)
    │  every committed event → pure incremental fold (bounded)
    ▼
sideChatDigest (session projection, persisted by the projection cache)
    ├── runtime context, re-read on every step ──▶ the side chat's model
    └── Host-wide control stream ───────────────▶ right-sidebar status strip
```

- **One fold, three consumers** — the digest is a regular `sideChatDigest` session projection (`src/digest.ts`): the framework folds it incrementally on every committed event, the projection cache persists it, and the Host-wide control stream pushes it to the browser, so the model, the status strip and restart recovery read the same state.
- **Bounded by construction** — per session it keeps the first human prompt (`goal`), recent settled turns (prompt, final reply, tool count, error count; `digestTurns`, 4–60), the open turn (prompt, steps, latest assistant text, recent tool calls, error count, start time), the latest whole todo list, recent tool calls, the last error, monotonic counters and `lastActivityAt`. Every string is clipped and every array is capped.
- **Injected as live context** — the side chat registers `systemPrompt.context({ name: 'side-chat:main-digest', order: 220, text: () => ... })`, which re-reads the main session's digest synchronously on every step and renders it as a "Main session live digest (partial; verify any detail with the side_chat_main_history or side_chat_main_status tool before asserting it)" block. Work that happened after the side chat was created is visible; a fork could never show that.
- **Prompt discipline** — the `side-chat:role` prompt section states that the digest is partial and is not the log, and that the model must call the read-only tools before asserting that work is done, that a file changed, or that an error was fixed.
- **Host half** (`src/`) creates the hidden child with `ctx.agents.create(...)`, passing no `seed` and no `isSeeded`, so its conversation opens empty. Its `setup` mounts the main session's preset, registers the role prompt, the digest context, the three tools and the read-only guard, and appends `sandbox/mode`, `approval/policy` and `subagent/descriptor`.
  - The `subagent/descriptor` is required: the Web client refuses ordinary history reads for an `origin: 'subagent'` session, and only a descriptor-backed child can use the `subagent` history route.
  - The side chat uses its own composer because, once the child carries a subagent address, the built-in composer routes prompts through subagent delivery; the plugin instead sends messages straight into the child's inbox over its own Connection RPC channel.
- **Client half** (`client/client.js`) contributes two tab types (draft page and addressed conversation), a resource provider that retains the session, the live status strip with the "Background digest" panel, the plugin-owned empty greeting (instead of dsh's shared blank hero, whose workspace chrome does not apply to a side chat), a `conversation.composer` chain entry that replaces the composer, a `shell.overlay` close dialog, the `/btw` client command, and the settings panel.
- **Transport** — an out-of-repo plugin cannot publish Typert Remote artifacts, and Connection's generic channel attributes its route to the service's own context, so the Host mounts its own authenticated `POST /side-chat/<endpoint>` route on the web server (`create`, `ask`, `digest`, `interrupt`, `destroy`; `connection.requestRejection` enforces the Host/Origin and browser-credential fence). Plain JSON, owner only.
- **Restart recovery** — the digest is persisted by the projection cache, so a restarted Host restores the side chat and its digest panel.

## Why the digest is not in the transcript

dsh deliberately hides ordinary runtime-context rows from the Chat transcript: `isVisibleChatNode` in ui-chat excludes `kind === 'context'` unless the row carries tool changes. The digest is injected as exactly such a context row, so it does **not** appear in the conversation.

The **Background digest** panel in the status strip is the supported way for a user to inspect it: it is served by the `/side-chat/digest` RPC endpoint and rendered by the same function as the injection, so the panel cannot drift from what the model reads. The rendered snapshots do accumulate in the side chat's own history (dsh appends rather than replaces), but only while the side chat itself runs.

## Known limitations

- A crashed or force-quit Host can leave an already-destroyed-pending side-chat session on disk: nothing sweeps hidden `session-side-chat-*` directories at startup, so a stale one stays until it is removed manually.
- Confirmation happens **after** the close: the right sidebar exposes no close veto, so the dialog appears when the tab is already gone, and "Cancel" reopens the tab (brief close/reopen flash).
- The digest is a bounded summary, not the log: strings are clipped, arrays are capped, earlier turns are one line each, and it omits tool results, file contents and most intermediate steps. Details must come from the read-only tools.
- Destruction depends on the JSONL session layout (`$DSH_HOME/sessions/<projectKey>/<sessionId>/`). With another persistence backend or a custom root, set `sessionsRoot`; every removal is verified with `sessionPersistence.stat()` and a failure is reported honestly in the dialog.
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
