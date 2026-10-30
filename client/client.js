/**
 * Browser half of dsh-side-chat: the right-sidebar "side chat".
 *
 * It contributes two tab types — a draft page opened by the sidebar guide entry
 * and by `/btw`, and a conversation tab addressed by the side-chat session id —
 * plus a resource provider that retains that session, a composer that talks to
 * the Host over the plugin's private RPC channel, and the close confirmation
 * that destroys the session.
 *
 * The conversation tab starts on the shared empty hero with quick questions that
 * send over the same private RPC channel, and pins the main session's live
 * `sideChatDigest` projection in a compact status strip above the chat.
 *
 * Loaded as a ModuleLoader factory: no bundler, no imports beyond the platform
 * module table. Styling uses component-local <style> with `--dsw-*` tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-side-chat-plugin',
  factory(require) {
    const React = require('react')
    const ReactDOM = require('react-dom')
    const h = React.createElement

    const NS = 'side-chat'
    const TAB_ID = 'dsh-side-chat'
    const DRAFT_TAB_ID = 'dsh-side-chat/draft'
    const DRAFT_KIND = 'sidechat'
    const SESSION_KIND = 'sidechat-session'
    const RPC_CHANNEL = '/side-chat'
    const RESOURCE_PREFIX = 'dsh-resource://sidechat/session/'
    const STORAGE_KEY = 'dsh.side-chat.v1'
    const DIGEST_KEY = 'sideChatDigest'
    const PANEL_ID = 'side-chat'
    const NPM_URL = 'https://www.npmjs.com/package/dsh-side-chat-plugin'
    const GITHUB_URL = 'https://github.com/XBXyftx/dsh-side-chat'

    const zh = {
      'panel.label': '实时侧边对话',
      'page.title': '实时侧边对话',
      'page.subtitle': '与主会话实时同步进度：空会话起步，问到的是它此刻正在做的事，不会过时；只读、不打断，关闭即销毁。',
      'setting.title': '允许向主会话发送消息',
      'setting.desc': '开启后，侧边对话可以在你明确要求或确有必要时，把讨论结果作为后续轮次交给主会话；它不会打断主会话当前的工作。',
      'setting.loading': '正在读取配置…',
      'setting.unavailable': '设置服务当前不可用，无法在线修改。',
      'setting.saveFailed': '保存失败，请重试。',
      'author.title': '作者',
      'author.desc': '由 XBXyftx 开发，MIT 开源。',
      'tab.title': '侧边对话',
      'guide.title': '侧边对话',
      'guide.description': '实时同步主会话进度，随时提问，不会过时',
      'draft.creating': '正在为当前会话创建侧边对话…',
      'draft.failed': '创建侧边对话失败',
      'draft.retry': '重试',
      'draft.close': '关闭',
      'session.loading': '正在载入侧边对话…',
      'session.missing': '这个侧边对话已经结束。',
      'composer.placeholder': '问点什么，不会打断主会话…',
      'composer.send': '发送',
      'composer.stop': '停止',
      'composer.readonly': '只读',
      'composer.empty': '消息不能为空。',
      'composer.hint': 'Enter 发送 / Shift+Enter 换行',
      'model.loading': '正在读取模型…',
      'model.failed': '模型列表读取失败',
      'model.unknown': '默认模型',
      'model.title': '选择模型',
      'model.failedSwitch': '切换失败：{message}',
      'close.title': '关闭侧边聊天？',
      'close.description': '这个侧边聊天将被删除，且无法恢复。你确定吗？',
      'close.dontAsk': '不再询问',
      'close.cancel': '取消',
      'close.confirm': '关闭侧边聊天',
      'close.failed': '关闭失败',
      'status.disconnected': '未连接',
      'status.turn': '第 {n} 轮',
      'status.todos': '任务 {done}/{total}',
      'status.tool': '工具 {name}',
      'status.activity': '最近活动 {time}',
      'status.justNow': '刚刚',
      'status.secondsAgo': '{n} 秒前',
      'status.minutesAgo': '{n} 分钟前',
      'status.hoursAgo': '{n} 小时前',
      'status.daysAgo': '{n} 天前',
      'empty.title': '侧边对话',
      'empty.mainFallback': '主会话',
      'empty.connectedRunning': '已连接主会话「{title}」，它正在工作',
      'empty.connectedIdle': '已连接主会话「{title}」',
      'empty.hint': '这是一个全新的空会话，不会打断主会话。状态条显示它的实时进度；展开「背景摘要」可以看到侧边对话当前读到的内容。',
      'digest.toggle': '背景摘要',
      'digest.loading': '读取中…',
      'digest.failed': '读取失败，请重试。',
      'quick.progress': '现在进展到哪了？',
      'quick.files': '正在改哪些文件？',
      'quick.error': '刚才那个报错怎么回事？',
      'quick.failed': '发送失败：{message}',
    }
    const en = {
      'panel.label': 'Live Side Chat',
      'page.title': 'Live Side Chat',
      'page.subtitle': 'Follows the main session live: it starts empty, answers about what that session is doing right now, and never goes stale. Read-only, non-interrupting, destroyed on close.',
      'setting.title': 'Allow messages to the main session',
      'setting.desc': 'When on, a side chat may hand a confirmed result back to the main session as a queued follow-up turn — only when you ask for it or it is genuinely necessary. It never interrupts the current work.',
      'setting.loading': 'Reading configuration…',
      'setting.unavailable': 'The settings service is unavailable; this value cannot be edited here.',
      'setting.saveFailed': 'Saving failed. Try again.',
      'author.title': 'Author',
      'author.desc': 'Built by XBXyftx. MIT licensed.',
      'tab.title': 'Side chat',
      'guide.title': 'Side chat',
      'guide.description': 'Live main-session progress you can question any time',
      'draft.creating': 'Creating a side chat for this session…',
      'draft.failed': 'Could not create the side chat',
      'draft.retry': 'Retry',
      'draft.close': 'Close',
      'session.loading': 'Opening the side chat…',
      'session.missing': 'This side chat has ended.',
      'composer.placeholder': 'Ask something without interrupting the main session…',
      'composer.send': 'Send',
      'composer.stop': 'Stop',
      'composer.readonly': 'Read-only',
      'composer.empty': 'Message cannot be empty.',
      'composer.hint': 'Enter sends / Shift+Enter adds a line',
      'model.loading': 'Reading models…',
      'model.failed': 'Could not read the model list',
      'model.unknown': 'Default model',
      'model.title': 'Choose a model',
      'model.failedSwitch': 'Switch failed: {message}',
      'close.title': 'Close this side chat?',
      'close.description': 'The side chat will be deleted and cannot be recovered. Continue?',
      'close.dontAsk': "Don't ask again",
      'close.cancel': 'Cancel',
      'close.confirm': 'Close side chat',
      'close.failed': 'Close failed',
      'status.disconnected': 'Not connected',
      'status.turn': 'Turn {n}',
      'status.todos': 'Tasks {done}/{total}',
      'status.tool': 'Tool {name}',
      'status.activity': 'Last activity {time}',
      'status.justNow': 'just now',
      'status.secondsAgo': '{n}s ago',
      'status.minutesAgo': '{n}m ago',
      'status.hoursAgo': '{n}h ago',
      'status.daysAgo': '{n}d ago',
      'empty.title': 'Side chat',
      'empty.mainFallback': 'the main session',
      'empty.connectedRunning': 'Connected to 「{title}」, which is working',
      'empty.connectedIdle': 'Connected to 「{title}」',
      'empty.hint': 'This is a brand-new empty conversation and it never interrupts the main session. The strip above shows its live progress; expand "Background digest" to see exactly what this side chat reads.',
      'digest.toggle': 'Background digest',
      'digest.loading': 'Reading…',
      'digest.failed': 'Could not read it. Try again.',
      'quick.progress': 'What is the progress now?',
      'quick.files': 'Which files are being changed?',
      'quick.error': 'What was that error about?',
      'quick.failed': 'Send failed: {message}',
    }

    const color = {
      text: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      accent: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      idle: 'var(--dsw-alias-state-idle-primary)',
      running: 'var(--dsw-alias-state-success-primary)',
      muted: 'var(--dsw-alias-label-tertiary)',
    }

    /** Side-chat sessions this page knows, so the composer can claim only them. */
    const sideSessions = new Set()

    /** Local preferences: whether the close confirmation is a one-time question. */
    function readPrefs() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        const parsed = raw === null ? {} : JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function writePrefs(patch) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readPrefs(), ...patch }))
      } catch {
        // A blocked localStorage only loses the preference; the dialog still works.
      }
    }

    function parseAddress(address) {
      if (typeof address !== 'string' || !address.startsWith(RESOURCE_PREFIX)) return undefined
      const raw = address.slice(RESOURCE_PREFIX.length)
      if (raw.length === 0 || raw.includes('/') || raw.includes('?')) return undefined
      try {
        const id = decodeURIComponent(raw)
        return id.length === 0 ? undefined : id
      } catch {
        return undefined
      }
    }

    function addressOf(sessionId) {
      return `${RESOURCE_PREFIX}${encodeURIComponent(sessionId)}`
    }

    /** Whether a digest value means "no turn has happened yet". */
    function isDigestEmpty(digest) {
      if (digest === undefined || digest === null) return true
      const turns = Array.isArray(digest.turns) ? digest.turns : []
      return turns.length === 0 && (digest.openTurn ?? null) === null
    }

    /** Number of the open turn, or of the newest settled turn. */
    function digestTurnNumber(digest) {
      const open = digest?.openTurn ?? null
      if (open !== null && typeof open.turn === 'number') return open.turn
      const turns = Array.isArray(digest?.turns) ? digest.turns : []
      const last = turns.length === 0 ? undefined : turns[turns.length - 1]
      if (typeof last?.turn === 'number') return last.turn
      return typeof digest?.counts?.turns === 'number' ? digest.counts.turns : 0
    }

    /** Completed and total todo counts, absent when the session never wrote a list. */
    function digestTodoProgress(digest) {
      const todos = Array.isArray(digest?.todos) ? digest.todos : []
      if (todos.length === 0) return undefined
      let done = 0
      for (const todo of todos) {
        if (todo !== null && typeof todo === 'object' && todo.status === 'completed') done += 1
      }
      return { done, total: todos.length }
    }

    /** Newest tool name in the digest, preferring the open turn's calls. */
    function digestToolName(digest) {
      const openTools = Array.isArray(digest?.openTurn?.tools) ? digest.openTurn.tools : []
      const openLast = openTools.length === 0 ? undefined : openTools[openTools.length - 1]
      if (typeof openLast?.name === 'string' && openLast.name.length > 0) return openLast.name
      const recent = Array.isArray(digest?.recentTools) ? digest.recentTools : []
      const recentLast = recent.length === 0 ? undefined : recent[recent.length - 1]
      return typeof recentLast?.name === 'string' && recentLast.name.length > 0 ? recentLast.name : undefined
    }

    /** Collapse whitespace and clip one digest line for the compact strip. */
    function clipLine(text, limit) {
      if (typeof text !== 'string') return ''
      const normalized = text.replace(/\s+/g, ' ').trim()
      if (normalized.length <= limit) return normalized
      return `${normalized.slice(0, Math.max(0, limit - 1))}…`
    }

    /** Render one relative activity age with the namespace translator. */
    function relativeActivityAt(t, at) {
      if (typeof at !== 'number' || !Number.isFinite(at)) return ''
      const seconds = Math.max(0, Math.floor((Date.now() - at) / 1000))
      if (seconds < 5) return t('status.justNow')
      if (seconds < 60) return t('status.secondsAgo', { n: seconds })
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return t('status.minutesAgo', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('status.hoursAgo', { n: hours })
      return t('status.daysAgo', { n: Math.floor(hours / 24) })
    }

    function SideChatIcon({ size = 16 }) {
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
      h('path', { d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5z' }),
      h('path', { d: 'M8.5 8.5h7' }),
      h('path', { d: 'M8.5 11.5h4' }))
    }

    const STYLE_TEXT = `
      .dsh-side-chat-root { display:flex; flex-direction:column; height:100%; min-height:0; color:${color.text}; }
      .dsh-side-chat-body { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
      .dsh-side-chat-conversation { position:relative; flex:1 1 auto; min-height:0; display:flex; flex-direction:column; }
      .dsh-side-chat-status { flex:0 0 auto; display:flex; flex-direction:column; gap:2px; padding:6px 12px;
        border-bottom:1px solid ${color.border}; background:var(--dsw-alias-bg-layer-1); min-width:0;
        font-size:11px; line-height:1.45; color:${color.secondary}; }
      .dsh-side-chat-status-row { display:flex; align-items:center; gap:8px; min-width:0; }
      .dsh-side-chat-status-dot { flex:0 0 auto; width:7px; height:7px; border-radius:999px; background:${color.idle}; }
      .dsh-side-chat-status-dot.is-running { background:${color.running}; }
      .dsh-side-chat-status-title { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;
        white-space:nowrap; color:${color.text}; font-weight:600; }
      .dsh-side-chat-status-meta { flex:0 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;
        white-space:nowrap; }
      .dsh-side-chat-status-activity { flex:0 0 auto; margin-left:auto; white-space:nowrap; color:${color.muted}; }
      .dsh-side-chat-status-muted { flex:1 1 auto; min-width:0; color:${color.muted}; }
      .dsh-side-chat-status-prompt { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        color:${color.muted}; }
      .dsh-side-chat-center { flex:1 1 auto; display:flex; flex-direction:column; align-items:center; justify-content:center;
        gap:10px; padding:24px; text-align:center; font-size:13px; color:${color.secondary}; }
      .dsh-side-chat-center strong { color:${color.text}; font-size:14px; font-weight:600; }
      .dsh-side-chat-error { color:${color.error}; font-size:13px; line-height:1.5; max-width:420px; word-break:break-word; }
      .dsh-side-chat-actions { display:flex; gap:8px; margin-top:4px; }
      .dsh-side-chat-button { appearance:none; border:1px solid ${color.border}; border-radius:8px; background:transparent;
        color:${color.text}; padding:6px 12px; font-size:13px; cursor:pointer; }
      .dsh-side-chat-button:hover { background:color-mix(in srgb, ${color.text} 6%, transparent); }
      .dsh-side-chat-button[disabled] { opacity:.5; cursor:default; }
      .dsh-side-chat-button-primary { background:${color.accent}; border-color:${color.accent}; color:#fff; }
      .dsh-side-chat-button-danger { background:${color.error}; border-color:${color.error}; color:#fff; }
      /* In-flow spacer substituting the empty transcript, so the composer seat
         (position:sticky; bottom:0 inside dsh's scroll body) has something above
         it and therefore actually parks at the bottom. */
      .dsh-side-chat-views-empty { flex:1 0 auto; min-height:0; }
      /* Composer: same surface, corner radius, elevation and send circle as the
         main conversation composer (dsh ui-conversation InputBar). */
      .dsh-side-chat-composer { flex:0 0 auto; display:flex; flex-direction:column; gap:2px; width:100%;
        padding:0 var(--dsh-composer-side-clearance, 8px) 4px; box-sizing:border-box; }
      .dsh-side-chat-composer-card { box-sizing:border-box; display:flex; flex-direction:column; gap:12px;
        width:100%; max-width:var(--dsh-composer-card-max-width, 100%); margin:0 auto; padding:8px 8px 6px;
        border:0; border-radius:var(--dsw-radius-panel, 14px); background:var(--dsw-specific-input-major);
        box-shadow:var(--dsw-elevation-soft, 0 2px 8px rgba(0,0,0,.16));
        font-size:var(--dsh-content-font-size, 14px); line-height:calc(24px + var(--dsh-content-font-delta, 0px)); }
      .dsh-side-chat-composer-input { resize:none; box-sizing:border-box; margin:0; padding:0 10px 0 12px;
        border:0; background:transparent; outline:none; font:inherit; color:${color.text};
        min-height:24px; max-height:var(--dsh-composer-text-max-height, 336px); }
      .dsh-side-chat-composer-input::placeholder { color:${color.muted}; }
      .dsh-side-chat-composer-row { display:flex; align-items:center; justify-content:space-between; gap:8px;
        padding:0 0 0 12px; min-height:34px; }
      .dsh-side-chat-composer-meta { display:flex; align-items:center; gap:8px; min-width:0; font-size:12px;
        color:${color.secondary}; }
      /* Reads-only chip: the same pill geometry as dsh's permission/model chips
         in the main composer toolbar. */
      .dsh-side-chat-chip { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:999px;
        border:1px solid var(--dsw-alias-border-l2, ${color.border}); font-size:12px; line-height:18px;
        color:${color.secondary}; }
      .dsh-side-chat-composer-tools { display:flex; align-items:center; gap:8px; min-width:0; }
      .dsh-side-chat-model { display:inline-flex; align-items:center; gap:4px; max-width:180px; padding:2px 8px;
        border:1px solid var(--dsw-alias-border-l2, ${color.border}); border-radius:999px; background:transparent;
        font:inherit; font-size:12px; line-height:18px; color:${color.secondary}; cursor:pointer; }
      .dsh-side-chat-model:hover { background:color-mix(in srgb, ${color.text} 6%, transparent); color:${color.text}; }
      .dsh-side-chat-model-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dsh-side-chat-model-menu { position:fixed; z-index:80; display:flex; flex-direction:column; gap:2px;
        width:250px; max-height:280px; overflow-y:auto; padding:6px; box-sizing:border-box;
        border:1px solid var(--dsw-alias-border-l1, ${color.border}); border-radius:12px;
        background:var(--dsw-alias-bg-layer-2, ${color.surface}); color:${color.text};
        box-shadow:0 14px 36px rgba(0,0,0,.32); }
      .dsh-side-chat-model-group { padding:6px 8px 2px; font-size:11px; color:${color.muted}; }
      .dsh-side-chat-model-item { display:flex; align-items:center; gap:8px; width:100%; padding:6px 8px;
        border:0; border-radius:8px; background:transparent; color:${color.text}; font:inherit; font-size:13px;
        text-align:left; cursor:pointer; }
      .dsh-side-chat-model-item:hover { background:color-mix(in srgb, ${color.text} 8%, transparent); }
      .dsh-side-chat-model-item[aria-current="true"] { color:var(--dsw-alias-state-business-primary, ${color.accent}); }
      .dsh-side-chat-model-check { flex:none; width:14px; height:14px; }
      .dsh-side-chat-model-item-name { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis;
        white-space:nowrap; }
      .dsh-side-chat-model-item-id { flex:0 0 auto; font-size:11px; color:${color.muted}; }
      .dsh-side-chat-send { display:grid; place-items:center; flex:none; width:34px; height:34px; padding:0;
        border:0; border-radius:999px; background:var(--dsw-alias-button-info-fill, ${color.accent}); color:#fff;
        cursor:pointer; transition:background-color 100ms ease; }
      .dsh-side-chat-send:hover:not([disabled]) { background:var(--dsw-alias-button-info-hover, ${color.accent}); }
      .dsh-side-chat-send[disabled] { opacity:.4; cursor:default; }
      .dsh-side-chat-composer-hint { display:flex; justify-content:space-between; align-items:center; gap:8px;
        width:100%; max-width:var(--dsh-composer-card-max-width, 100%); margin:0 auto; padding:2px 4px 0;
        font-size:11px; color:${color.muted}; }
      .dsh-side-chat-error-inline { color:${color.error}; font-size:12px; }
      .dsh-side-chat-quick { display:flex; flex-direction:column; align-items:flex-end; gap:4px; min-width:0; }
      .dsh-side-chat-quick-row { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
      .dsh-side-chat-empty { position:absolute; inset:0 0 96px; display:flex; align-items:center; justify-content:center;
        padding:24px 18px; pointer-events:none; }
      .dsh-side-chat-empty-card { display:flex; flex-direction:column; align-items:center; gap:10px; max-width:420px;
        text-align:center; pointer-events:auto; }
      .dsh-side-chat-empty-title { font-size:14px; font-weight:600; color:${color.text}; }
      .dsh-side-chat-empty-line { display:flex; align-items:center; gap:7px; font-size:12.5px; color:${color.secondary}; }
      .dsh-side-chat-empty-hint { font-size:12px; line-height:1.5; color:${color.muted}; }
      .dsh-side-chat-digest-toggle { margin-left:auto; appearance:none; border:0; background:transparent; padding:0 2px;
        color:${color.muted}; font-size:11px; cursor:pointer; text-decoration:underline dotted; }
      .dsh-side-chat-digest-toggle:hover { color:${color.text}; }
      .dsh-side-chat-digest { max-height:210px; overflow:auto; margin:2px 0 0; padding:8px 10px; border-radius:8px;
        border:1px solid ${color.border}; background:var(--dsw-alias-bg-layer-2, ${color.surface});
        font-family:ui-monospace, SFMono-Regular, Menlo, monospace; font-size:11px; line-height:1.5;
        white-space:pre-wrap; word-break:break-word; color:${color.secondary}; }
      .dsh-side-chat-quick-chip { appearance:none; border:1px solid ${color.border}; border-radius:999px;
        background:transparent; color:${color.secondary}; padding:4px 10px; font-size:12px; line-height:1.3;
        white-space:nowrap; cursor:pointer; }
      .dsh-side-chat-quick-chip:hover { background:color-mix(in srgb, ${color.text} 6%, transparent); color:${color.text}; }
      .dsh-side-chat-quick-chip[disabled] { opacity:.5; cursor:default; }
      .dsh-side-chat-mask { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center;
        background:rgba(0,0,0,.42); padding:24px; }
      .dsh-side-chat-dialog { width:min(430px, 100%); border-radius:14px; border:1px solid ${color.border};
        background:${color.surface}; color:${color.text}; padding:20px 22px 16px; box-shadow:0 18px 48px rgba(0,0,0,.32);
        display:flex; flex-direction:column; gap:12px; }
      .dsh-side-chat-dialog h2 { margin:0; font-size:17px; font-weight:650; }
      .dsh-side-chat-dialog p { margin:0; font-size:13px; line-height:1.55; color:${color.secondary}; }
      .dsh-side-chat-check { display:flex; align-items:center; gap:8px; font-size:13px; color:${color.text}; cursor:pointer; }
      .dsh-side-chat-dialog-footer { display:flex; justify-content:flex-end; gap:10px; margin-top:4px; }
      .dsh-side-chat-page { display:flex; flex-direction:column; gap:16px; width:100%; max-width:760px;
        margin:0 auto; padding:28px 32px; box-sizing:border-box; color:${color.text}; overflow-y:auto; }
      .dsh-side-chat-card { display:flex; flex-direction:column; gap:14px; background:${color.surface};
        border:1px solid ${color.border}; border-radius:12px; padding:18px; }
      .dsh-side-chat-card-row { display:flex; align-items:center; gap:16px; justify-content:space-between; }
      .dsh-side-chat-card h2 { font-size:15px; font-weight:600; margin:0; }
      .dsh-side-chat-card p { font-size:13px; line-height:1.5; margin:6px 0 0; color:${color.secondary}; }
      .dsh-side-chat-link { color:${color.accent}; text-decoration:none; font-size:13px; }
    `

    async function callRpc(endpoint, payload) {
      try {
        const response = await fetch(`${RPC_CHANNEL}/${endpoint}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload === undefined ? {} : payload),
        })
        if (!response.ok) {
          return { ok: false, error: { code: `http-${response.status}`, message: `请求失败（HTTP ${response.status}）` } }
        }
        const data = await response.json()
        if (data !== null && typeof data === 'object' && typeof data.ok === 'boolean') return data
        return { ok: false, error: { code: 'side-chat/bad-response', message: 'Host 返回了无法识别的响应。' } }
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'side-chat/transport',
            message: error instanceof Error ? error.message : String(error),
          },
        }
      }
    }

    /** The client context, bound by `apply`; components call the RPC through it. */
    let ctxRef

    /** Pending close confirmations, rendered by the `shell.overlay` dialog. */
    const closeRequests = {
      value: null,
      listeners: new Set(),
      set(next) {
        closeRequests.value = next
        for (const listener of [...closeRequests.listeners]) listener()
      },
      subscribe(listener) {
        closeRequests.listeners.add(listener)
        return () => { closeRequests.listeners.delete(listener) }
      },
      getSnapshot() {
        return closeRequests.value
      },
    }

    /** Destroy one side chat on the Host. */
    async function destroySideChat(sessionId) {
      const result = await callRpc('destroy', { sessionId })
      if (!result.ok) return { ok: false, message: result.error.message }
      if (result.value && result.value.destroyed === true) return { ok: true }
      const reason = result.value && typeof result.value.reason === 'string' ? result.value.reason : ''
      return { ok: false, message: reason.length > 0 ? reason : '销毁未完成。' }
    }

    /** Re-open a closed side chat tab after the user cancelled the confirmation. */
    function reopenTab(ownerSessionId, address) {
      const service = ctxRef.sidebarRight
      if (typeof service.openResourceIn === 'function') {
        service.openResourceIn(ownerSessionId, address, { kind: SESSION_KIND })
        return
      }
      service.openResource(address, { kind: SESSION_KIND })
    }

    /** Ask the Host for a side chat, then focus its conversation tab. */
    async function openSideChat(mainSessionId, tab) {
      const created = await callRpc('create', { parentSessionId: mainSessionId })
      if (!created.ok) return { ok: false, message: created.error.message }
      const sessionId = created.value && created.value.sessionId
      if (typeof sessionId !== 'string') return { ok: false, message: 'Host 未返回侧边对话标识。' }
      sideSessions.add(sessionId)
      const address = addressOf(sessionId)
      if (tab !== undefined) tab.actions.openResource(address, { replaceTab: true })
      else ctxRef.sidebarRight.openResource(address, { kind: SESSION_KIND })
      return { ok: true, sessionId }
    }

    /** Page body of a side chat being created; it replaces itself with the conversation tab. */
    function DraftTab({ sessionId, useTabInfo, t }) {
      const { tab } = useTabInfo()
      const [state, setState] = React.useState({ status: 'creating' })
      const [attempt, setAttempt] = React.useState(0)
      React.useEffect(() => {
        let cancelled = false
        setState({ status: 'creating' })
        openSideChat(sessionId, tab).then(result => {
          if (cancelled || result.ok) return
          setState({ status: 'failed', message: result.message })
        }, error => {
          if (cancelled) return
          setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) })
        })
        return () => { cancelled = true }
      }, [sessionId, attempt])

      if (state.status === 'failed') {
        return h('div', { className: 'dsh-side-chat-root' },
          h('div', { className: 'dsh-side-chat-center' },
            h('strong', null, t('draft.failed')),
            h('div', { className: 'dsh-side-chat-error' }, state.message),
            h('div', { className: 'dsh-side-chat-actions' },
              h('button', { className: 'dsh-side-chat-button', onClick: () => setAttempt(value => value + 1) }, t('draft.retry')),
              h('button', { className: 'dsh-side-chat-button', onClick: () => tab.actions.close() }, t('draft.close')))))
      }
      return h('div', { className: 'dsh-side-chat-root' },
        h('div', { className: 'dsh-side-chat-center' },
          h('strong', null, t('tab.title')),
          h('div', null, t('draft.creating'))))
    }

    /**
     * Compact live status of the main session, read from that session's
     * `sideChatDigest` projection, with a collapsed panel showing the exact
     * background block the Host injects into this side chat.
     *
     * dsh hides ordinary runtime-context rows from the Chat transcript
     * (`isVisibleChatNode`), so this panel is how the user checks what the side
     * chat actually knows.
     */
    function SideChatStatus({ mainId, sessionId, useSessions, t }) {
      const running = useSessions(state => state.byId[mainId]?.running)
      const title = useSessions(state => state.byId[mainId]?.displayTitle)
      const digest = useSessions(state => state.projectionsBySession[mainId]?.values?.[DIGEST_KEY])
      const [panel, setPanel] = React.useState({ open: false, loading: false, text: null, failed: false })

      const toggle = React.useCallback(async () => {
        if (panel.open) { setPanel({ open: false, loading: false, text: null, failed: false }); return }
        setPanel({ open: true, loading: true, text: null, failed: false })
        const result = await callRpc('digest', { sessionId })
        if (!result.ok) { setPanel({ open: true, loading: false, text: null, failed: true }); return }
        const text = result.value && typeof result.value.text === 'string' ? result.value.text : ''
        setPanel({ open: true, loading: false, text, failed: false })
      }, [panel.open, sessionId])

      const toggleButton = sessionId === undefined ? null : h('button', {
        className: 'dsh-side-chat-digest-toggle',
        type: 'button',
        'data-dsh-side-chat-digest-toggle': '',
        onClick: () => { void toggle() },
      }, panel.open ? t('digest.toggle') + ' ▾' : t('digest.toggle') + ' ▸')

      const panelBody = panel.open
        ? h('pre', { className: 'dsh-side-chat-digest', 'data-dsh-side-chat-digest': '' },
          panel.loading ? t('digest.loading') : panel.failed ? t('digest.failed') : (panel.text === null ? '' : panel.text))
        : null

      if (digest === undefined || digest === null) {
        return h('div', { className: 'dsh-side-chat-status', 'data-dsh-side-chat-status': '' },
          h('div', { className: 'dsh-side-chat-status-row' },
            h('span', { className: 'dsh-side-chat-status-dot' }),
            h('span', { className: 'dsh-side-chat-status-muted' }, t('status.disconnected')),
            toggleButton),
          panelBody)
      }

      const turn = digestTurnNumber(digest)
      const todos = digestTodoProgress(digest)
      const tool = digestToolName(digest)
      const prompt = clipLine(digest?.openTurn?.prompt, 48)
      const at = typeof digest?.lastActivityAt === 'number' ? digest.lastActivityAt : undefined
      const meta = []
      if (turn > 0) meta.push(t('status.turn', { n: turn }))
      if (todos !== undefined) meta.push(t('status.todos', { done: todos.done, total: todos.total }))
      if (tool !== undefined) meta.push(t('status.tool', { name: tool }))

      return h('div', { className: 'dsh-side-chat-status', 'data-dsh-side-chat-status': '' },
        h('div', { className: 'dsh-side-chat-status-row' },
          h('span', {
            className: running === true ? 'dsh-side-chat-status-dot is-running' : 'dsh-side-chat-status-dot',
          }),
          title === undefined ? null : h('span', { className: 'dsh-side-chat-status-title' }, title),
          meta.length === 0 ? null : h('span', { className: 'dsh-side-chat-status-meta' }, meta.join(' · ')),
          at === undefined ? null : h('span', { className: 'dsh-side-chat-status-activity' },
            t('status.activity', { time: relativeActivityAt(t, at) })),
          toggleButton),
        prompt === '' ? null : h('div', { className: 'dsh-side-chat-status-prompt' }, prompt),
        panelBody)
    }

    /** The three questions offered by the empty side chat. */
    const QUICK_QUESTIONS = ['quick.progress', 'quick.files', 'quick.error']

    /**
     * Empty-side-chat greeting, overlaid on the still-empty transcript. It is
     * our own card rather than the shared blank hero because the workspace
     * chrome of that hero does not apply to a side chat, which is not a
     * workspace session.
     */
    function SideChatEmpty({ sessionId, mainTitle, running, t }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const ask = React.useCallback(async key => {
        if (busy) return
        setBusy(true)
        setError(null)
        const result = await callRpc('ask', { sessionId, text: t(key) })
        setBusy(false)
        if (!result.ok) setError(t('quick.failed', { message: result.error.message }))
      }, [busy, sessionId, t])
      const target = mainTitle === undefined || mainTitle === '' ? t('empty.mainFallback') : mainTitle
      return h('div', { className: 'dsh-side-chat-empty', 'data-dsh-side-chat-empty': '' },
        h('div', { className: 'dsh-side-chat-empty-card' },
          h('strong', { className: 'dsh-side-chat-empty-title' }, t('empty.title')),
          h('div', { className: 'dsh-side-chat-empty-line' },
            h('span', {
              className: running === true ? 'dsh-side-chat-status-dot is-running' : 'dsh-side-chat-status-dot',
            }),
            h('span', null, running === true
              ? t('empty.connectedRunning', { title: target })
              : t('empty.connectedIdle', { title: target }))),
          h('div', { className: 'dsh-side-chat-empty-hint' }, t('empty.hint')),
          h('div', { className: 'dsh-side-chat-quick-row' },
            ...QUICK_QUESTIONS.map(key => h('button', {
              key,
              className: 'dsh-side-chat-quick-chip',
              disabled: busy,
              onClick: () => { void ask(key) },
            }, t(key)))),
          error === null ? null : h('div', { className: 'dsh-side-chat-error-inline' }, error)))
    }

    /**
     * Conversation body: the live main-session status strip above the embedded
     * chat, plus our empty greeting while the side chat itself has no turn yet.
     * The shared blank hero is never used, so no workspace chrome leaks in.
     */
    function SideChatConversation({ sessionId, useSession, useSessions, renderFactorySlot, t }) {
      const mainId = useSession(snapshot => snapshot?.subagent?.address?.parentSessionId)
      const mainTitle = useSessions(state => (mainId === undefined ? undefined : state.byId[mainId]?.displayTitle))
      const mainRunning = useSessions(state => (mainId === undefined ? undefined : state.byId[mainId]?.running))
      const digest = useSessions(state => state.projectionsBySession[sessionId]?.values?.[DIGEST_KEY])
      const empty = isDigestEmpty(digest)
      return h('div', { className: 'dsh-side-chat-body' },
        h(SideChatStatus, { mainId, sessionId, useSessions, t }),
        h('div', { className: 'dsh-side-chat-conversation' },
          renderFactorySlot('conversation.content', {
            variant: 'embedded', phase: 'active', hero: false,
          }, { slots: { views: SideChatViews } }),
          empty
            ? h(SideChatEmpty, { sessionId, mainTitle, running: mainRunning, t })
            : null))
    }

    /**
     * Views position of the embedded conversation: an empty side chat renders a
     * flexible spacer so dsh's sticky composer seat has content above it and
     * parks at the bottom; otherwise the real Chat view renders.
     */
    function SideChatViews({ sessionId, useSessions, renderSlot }) {
      const digest = useSessions(state => state.projectionsBySession[sessionId]?.values?.[DIGEST_KEY])
      if (isDigestEmpty(digest)) return h('div', { className: 'dsh-side-chat-views-empty' })
      return renderSlot('conversation.session', { view: 'chat' })
    }

    /** Resource tab body: retains the side-chat session and hosts its conversation. */
    function SessionTab({ useTabInfo, useResource, SessionProvider, renderSlot, t }) {
      const { tab } = useTabInfo()
      const resource = useResource(tab.contentId)
      const sessionId = parseAddress(tab.contentId)
      if (sessionId !== undefined) sideSessions.add(sessionId)
      const value = resource.value
      if (value === undefined) {
        const missing = resource.status === 'failed'
        return h('div', { className: 'dsh-side-chat-root' },
          h('div', { className: 'dsh-side-chat-center' },
            h('strong', null, missing ? t('session.missing') : t('tab.title')),
            h('div', null, missing ? '' : t('session.loading'))))
      }
      return h('div', { className: 'dsh-side-chat-root' },
        h(SessionProvider, { session: value.reference, empty: () => null },
          renderSlot('sidechat.conversation', {})))
    }

    /**
     * Composer for side chats only. The built-in composer cannot drive this
     * session (it is a hidden subagent-classified child), so this chain entry
     * claims it and talks to the Host over the plugin's own RPC channel.
     */
    function selectSideChatComposer(owner) {
      if (owner === undefined || owner === null) return null
      return sideSessions.has(owner.sessionId) ? { sideChat: true } : null
    }

    /**
     * Model chip of the side-chat composer: shows the model the next request
     * will route to, and opens a picker listing every model this Host can
     * currently route. The choice is a Host-side selection ref, so it applies to
     * the next turn only and never touches the main session.
     */
    function SideChatModelChip({ sessionId, t }) {
      const [state, setState] = React.useState({ status: 'loading', current: null, models: [] })
      const [open, setOpen] = React.useState(false)
      const [anchor, setAnchor] = React.useState(null)
      const [error, setError] = React.useState(null)
      const chipRef = React.useRef(null)

      const load = React.useCallback(async () => {
        const result = await callRpc('models', { sessionId })
        if (!result.ok) { setState(prev => ({ ...prev, status: 'failed' })); return }
        const value = result.value || {}
        setState({ status: 'ready', current: value.current || null, models: Array.isArray(value.models) ? value.models : [] })
      }, [sessionId])

      React.useEffect(() => { void load() }, [load])

      React.useEffect(() => {
        if (!open) return undefined
        const onDown = event => {
          if (chipRef.current !== null && chipRef.current.contains(event.target)) return
          setOpen(false)
        }
        const onKey = event => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      const chosen = state.current === null
        ? undefined
        : state.models.find(item => item.provider === state.current.provider && item.model === state.current.model)
      const label = state.status === 'loading'
        ? t('model.loading')
        : state.status === 'failed'
          ? t('model.failed')
          : (chosen === undefined ? (state.current === null ? t('model.unknown') : state.current.model) : chosen.name)

      const toggle = () => {
        if (open) { setOpen(false); return }
        const rect = chipRef.current === null ? null : chipRef.current.getBoundingClientRect()
        if (rect !== null) setAnchor({ bottom: Math.max(8, window.innerHeight - rect.top + 8), right: Math.max(8, window.innerWidth - rect.right) })
        setOpen(true)
        void load()
      }

      const pick = async item => {
        setError(null)
        const result = await callRpc('select-model', { sessionId, provider: item.provider, model: item.model })
        if (!result.ok) { setError(t('model.failedSwitch', { message: result.error.message })); return }
        setOpen(false)
        await load()
      }

      const grouped = []
      for (const item of state.models) {
        const last = grouped[grouped.length - 1]
        if (last !== undefined && last.providerName === item.providerName) last.models.push(item)
        else grouped.push({ providerName: item.providerName, models: [item] })
      }

      const menu = open && anchor !== null
        ? ReactDOM.createPortal(h('div', {
          className: 'dsh-side-chat-model-menu',
          'data-dsh-side-chat-model-menu': '',
          style: { bottom: anchor.bottom, right: anchor.right },
          role: 'menu',
          'aria-label': t('model.title'),
        },
        state.status === 'loading' ? h('div', { className: 'dsh-side-chat-model-group' }, t('model.loading')) : null,
        state.status === 'failed' ? h('div', { className: 'dsh-side-chat-model-group' }, t('model.failed')) : null,
        ...grouped.flatMap(group => [
          h('div', { key: `g-${group.providerName}`, className: 'dsh-side-chat-model-group' }, group.providerName),
          ...group.models.map(item => {
            const active = state.current !== null
              && state.current.provider === item.provider && state.current.model === item.model
            return h('button', {
              key: `${item.provider}/${item.model}`,
              type: 'button',
              role: 'menuitemradio',
              'aria-current': active ? 'true' : 'false',
              className: 'dsh-side-chat-model-item',
              onClick: () => { void pick(item) },
            },
            h('span', { className: 'dsh-side-chat-model-check' }, active
              ? h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
                h('path', { d: 'M3.5 8.5l3 3 6-7', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }))
              : null),
            h('span', { className: 'dsh-side-chat-model-item-name' }, item.name),
            item.name === item.model ? null : h('span', { className: 'dsh-side-chat-model-item-id' }, item.model))
          }),
        ])), document.body)
        : null

      return h('div', { style: { display: 'inline-flex' }, ref: chipRef },
        h('button', {
          type: 'button',
          className: 'dsh-side-chat-model',
          'data-dsh-side-chat-model': '',
          title: t('model.title'),
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          onClick: toggle,
        },
        h('span', { className: 'dsh-side-chat-model-name' }, label),
        h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true },
          h('path', { d: 'M4 6.5l4 4 4-4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))),
        menu,
        error === null ? null : h('div', { className: 'dsh-side-chat-error-inline', style: { position: 'absolute', bottom: '100%' } }, error))
    }

    function SideChatComposer({ sessionId, session, t }) {
      const [value, setValue] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const running = session !== undefined && session !== null && session.running === true

      const send = React.useCallback(async () => {
        const text = value.trim()
        if (text.length === 0) { setError(t('composer.empty')); return }
        if (busy) return
        setBusy(true)
        setError(null)
        const result = await callRpc('ask', { sessionId, text })
        setBusy(false)
        if (result.ok) setValue('')
        else setError(result.error.message)
      }, [busy, sessionId, t, value])

      const stop = React.useCallback(async () => {
        const result = await callRpc('interrupt', { sessionId })
        if (!result.ok) setError(result.error.message)
      }, [sessionId])

      const onKeyDown = event => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          void send()
        }
      }

      // Same glyph geometry as dsh's primary send button (ui-conversation InputBar).
      const sendGlyph = h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('path', {
          d: 'M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z',
          fill: 'currentColor',
        }))
      const stopGlyph = h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 3, y: 3, width: 10, height: 10, rx: 3, fill: 'currentColor' }))

      const toolbar = h('div', { className: 'dsh-side-chat-composer-row' },
        h('div', { className: 'dsh-side-chat-composer-meta' },
          h('span', { className: 'dsh-side-chat-chip' }, t('composer.readonly'))),
        h('div', { className: 'dsh-side-chat-composer-tools' },
          h(SideChatModelChip, { sessionId, t }),
          running
            ? h('button', {
              type: 'button',
              className: 'dsh-side-chat-send',
              'aria-label': t('composer.stop'),
              title: t('composer.stop'),
              'data-dsh-side-chat-send': '',
              onClick: () => { void stop() },
            }, stopGlyph)
            : h('button', {
              type: 'button',
              className: 'dsh-side-chat-send',
              'aria-label': t('composer.send'),
              title: t('composer.send'),
              'data-dsh-side-chat-send': '',
              disabled: busy || value.trim().length === 0,
              onClick: () => { void send() },
            }, sendGlyph)))

      return h('div', { className: 'dsh-side-chat-composer' },
        h('div', { className: 'dsh-side-chat-composer-card' },
          h('textarea', {
            className: 'dsh-side-chat-composer-input',
            rows: 1,
            value,
            placeholder: t('composer.placeholder'),
            'data-dsh-side-chat-input': '',
            onChange: event => setValue(event.target.value),
            onKeyDown,
          }),
          toolbar),
        error === null ? null : h('div', { className: 'dsh-side-chat-error-inline' }, error),
        h('div', { className: 'dsh-side-chat-composer-hint' },
          h('span', null, t('composer.hint'))))
    }

    /** The close confirmation dialog, mounted on the frame-wide overlay seat. */
    function CloseConfirmDialog({ t }) {
      const request = React.useSyncExternalStore(
        React.useCallback(listener => closeRequests.subscribe(listener), []),
        React.useCallback(() => closeRequests.getSnapshot(), []),
        React.useCallback(() => closeRequests.getSnapshot(), []))
      const [dontAsk, setDontAsk] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      React.useEffect(() => {
        if (request === null) return
        setDontAsk(false)
        setError(null)
        setBusy(false)
      }, [request])

      if (request === null) return null
      const cancel = () => {
        if (busy) return
        closeRequests.set(null)
        reopenTab(request.ownerSessionId, request.address)
      }
      const confirm = async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        if (dontAsk) writePrefs({ skipCloseConfirm: true })
        const result = await destroySideChat(request.sideId)
        setBusy(false)
        if (result.ok) closeRequests.set(null)
        else setError(result.message)
      }
      return h('div', {
        className: 'dsh-side-chat-mask',
        onMouseDown: event => { if (event.target === event.currentTarget) cancel() },
      },
      h('div', { className: 'dsh-side-chat-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': t('close.title') },
        h('h2', null, t('close.title')),
        h('p', null, t('close.description')),
        h('label', { className: 'dsh-side-chat-check' },
          h('input', { type: 'checkbox', checked: dontAsk, onChange: event => setDontAsk(event.target.checked) }),
          t('close.dontAsk')),
        error === null ? null : h('div', { className: 'dsh-side-chat-error' }, `${t('close.failed')}：${error}`),
        h('div', { className: 'dsh-side-chat-dialog-footer' },
          h('button', { className: 'dsh-side-chat-button', disabled: busy, onClick: cancel }, t('close.cancel')),
          h('button', {
            className: 'dsh-side-chat-button dsh-side-chat-button-danger',
            disabled: busy,
            onClick: () => { void confirm() },
          }, t('close.confirm')))))
    }

    /** Settings page contribution: the one Host policy a user can change here. */
    function SettingsPage({ form, t }) {
      const snapshot = React.useSyncExternalStore(
        React.useCallback(listener => form.subscribe(listener), [form]),
        React.useCallback(() => form.getSnapshot(), [form]),
        React.useCallback(() => form.getSnapshot(), [form]))
      const [saving, setSaving] = React.useState(false)
      const [saveFailed, setSaveFailed] = React.useState(false)
      const ready = snapshot.status === 'ready'
      const allowed = Boolean(snapshot.value && snapshot.value.allowReportToMain)
      const hint = snapshot.status === 'loading'
        ? t('setting.loading')
        : snapshot.status === 'unavailable'
          ? t('setting.unavailable')
          : saveFailed ? t('setting.saveFailed') : t('setting.desc')
      const toggle = async () => {
        if (!ready || saving) return
        setSaving(true)
        setSaveFailed(false)
        try {
          const accepted = await form.set('allowReportToMain', !allowed)
          if (!accepted) setSaveFailed(true)
        } catch {
          setSaveFailed(true)
        } finally {
          setSaving(false)
        }
      }
      return h('div', { className: 'dsh-side-chat-page' },
        h('div', null,
          h('h1', { style: { fontSize: 22, fontWeight: 650, margin: 0 } }, t('page.title')),
          h('p', { style: { fontSize: 14, lineHeight: 1.5, marginTop: 6, color: color.secondary } }, t('page.subtitle'))),
        h('section', { className: 'dsh-side-chat-card' },
          h('div', { className: 'dsh-side-chat-card-row' },
            h('div', null,
              h('h2', null, t('setting.title')),
              h('p', { style: saveFailed ? { color: color.error } : undefined }, hint)),
            h('input', {
              type: 'checkbox', checked: allowed, disabled: !ready || saving,
              'aria-label': t('setting.title'),
              onChange: () => { void toggle() },
              style: { width: 18, height: 18, accentColor: color.accent, cursor: ready ? 'pointer' : 'default' },
            }))),
        h('section', { className: 'dsh-side-chat-card' },
          h('div', { className: 'dsh-side-chat-card-row' },
            h('div', null,
              h('h2', null, t('author.title')),
              h('p', null, t('author.desc'))),
            h('div', { style: { display: 'flex', gap: 14 } },
              h('a', { href: NPM_URL, target: '_blank', rel: 'noreferrer', className: 'dsh-side-chat-link' }, 'npm'),
              h('a', { href: GITHUB_URL, target: '_blank', rel: 'noreferrer', className: 'dsh-side-chat-link' }, 'GitHub')))))
    }

    return {
      inject: [
        'slots', 'locale', 'configForms', 'sessions', 'resources',
        'sidebarRight', 'sidebarRightTabs', 'commandUi',
      ],
      apply(ctx) {
        ctxRef = ctx
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-side-chat: dictionaries')

        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.dshSideChat = ''
          style.textContent = STYLE_TEXT
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'dsh-side-chat: styles')

        // Resource: retain the side-chat session for as long as its tab lives.
        ctx.effect(() => ctx.resources.register({
          protocol: 'sidechat',
          async *open(address, { signal }) {
            const sessionId = parseAddress(address)
            if (sessionId === undefined) throw new Error(`dsh-side-chat: invalid address "${address}"`)
            if (signal.aborted) return
            let reference
            try {
              reference = ctx.sessions.retain(sessionId, { source: 'sideChat', signal })
            } catch (error) {
              yield { ok: false, error: { code: 'side-chat/unavailable', message: error instanceof Error ? error.message : String(error) } }
              return
            }
            sideSessions.add(sessionId)
            try {
              yield { ok: true, value: { reference } }
              await new Promise(resolve => {
                if (signal.aborted) { resolve() ; return }
                signal.addEventListener('abort', () => resolve(), { once: true })
              })
            } finally {
              reference.release()
            }
          },
        }), 'dsh-side-chat: resource provider')

        // Tab types: the draft page and the addressed conversation.
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: DRAFT_TAB_ID,
          kind: DRAFT_KIND,
          priority: 'extension',
          title: () => t('tab.title'),
          guide: [{
            id: 'new',
            order: 40,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: SideChatIcon,
          }],
        }), 'dsh-side-chat: draft tab type')
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: SESSION_KIND,
          priority: 'extension',
          keepMounted: true,
          patterns: [`${RESOURCE_PREFIX}**`],
          canOpen: address => parseAddress(address) !== undefined,
          title: () => t('tab.title'),
        }), 'dsh-side-chat: conversation tab type')

        // Bodies.
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: DRAFT_TAB_ID,
          locale: NS,
        }, DraftTab)), 'dsh-side-chat: draft body')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
          children: { 'sidechat.conversation': { kind: 'single', scope: 'session' } },
        }, SessionTab)), 'dsh-side-chat: conversation body')
        ctx.effect(() => ctx.slots.inject('sidechat.conversation', () => ctx.slots.register({
          name: 'sidechat.conversation',
          locale: NS,
        }, SideChatConversation)), 'dsh-side-chat: conversation content')

        // Composer: claim it for side-chat sessions only, ahead of ui-subagent's selector.
        ctx.effect(() => ctx.slots.inject('conversation.composer', () => ctx.slots.register({
          name: 'conversation.composer',
          priority: -20,
          locale: NS,
          select: selectSideChatComposer,
        }, SideChatComposer)), 'dsh-side-chat: composer')

        // Close confirmation: destroy on close, offer to reopen on cancel.
        ctx.effect(() => {
          const service = ctx.sidebarRight
          if (typeof service.registerCloseHandler !== 'function') {
            console.warn('dsh-side-chat: sidebarRight.registerCloseHandler is unavailable; closing a side chat will not confirm or destroy it')
            return () => {}
          }
          return service.registerCloseHandler(SESSION_KIND, (ownerSessionId, tab) => {
            const sessionId = parseAddress(tab.contentId)
            if (sessionId === undefined) return
            if (readPrefs().skipCloseConfirm === true) {
              void destroySideChat(sessionId)
              return
            }
            closeRequests.set({ ownerSessionId, sideId: sessionId, address: tab.contentId })
          })
        }, 'dsh-side-chat: close handler')
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-side-chat-close',
          locale: NS,
        }, CloseConfirmDialog)), 'dsh-side-chat: close dialog')

        // `/btw` opens the draft tab for the invoking session.
        ctx.effect(() => ctx.commandUi.register({
          name: 'btw',
          label: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: SideChatIcon,
          available: () => true,
          ui: {
            kind: 'action',
            run: () => { ctx.sidebarRight.openTab(DRAFT_KIND, { preferNewPane: true }) },
          },
        }), 'dsh-side-chat: /btw command')

        // Settings page: the report-to-main policy.
        const form = ctx.configForms.get(PANEL_ID)
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 6,
          label: () => t('panel.label'),
          locale: NS,
        }, SideChatIcon)), 'dsh-side-chat: settings entry')
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          inject: () => ({ t, form }),
        }, SettingsPage)), 'dsh-side-chat: settings page')
      },
    }
  },
})
