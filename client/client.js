/**
 * Browser half of dsh-side-chat: the right-sidebar "side chat".
 *
 * It contributes two tab types — a draft page opened by the sidebar guide entry
 * and by `/btw`, and a conversation tab addressed by the side-chat session id —
 * plus a resource provider that retains that session, a composer that talks to
 * the Host over the plugin's private RPC channel, and the close confirmation
 * that destroys the session.
 *
 * Loaded as a ModuleLoader factory: no bundler, no imports beyond the platform
 * module table. Styling uses component-local <style> with `--dsw-*` tokens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-side-chat-plugin',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'side-chat'
    const TAB_ID = 'dsh-side-chat'
    const DRAFT_TAB_ID = 'dsh-side-chat/draft'
    const DRAFT_KIND = 'sidechat'
    const SESSION_KIND = 'sidechat-session'
    const RPC_CHANNEL = '/side-chat'
    const RESOURCE_PREFIX = 'dsh-resource://sidechat/session/'
    const STORAGE_KEY = 'dsh.side-chat.v1'
    const PANEL_ID = 'side-chat'
    const NPM_URL = 'https://www.npmjs.com/package/dsh-side-chat-plugin'
    const GITHUB_URL = 'https://github.com/XBXyftx/dsh-side-chat'

    const zh = {
      'panel.label': '侧边对话',
      'page.title': '侧边对话',
      'page.subtitle': 'Codex 风格的临时只读分支：在右侧向另一条对话询问当前工作的进展，关闭即销毁。',
      'setting.title': '允许向主会话发送消息',
      'setting.desc': '开启后，侧边对话可以在你明确要求或确有必要时，把讨论结果作为后续轮次交给主会话；它不会打断主会话当前的工作。',
      'setting.loading': '正在读取配置…',
      'setting.unavailable': '设置服务当前不可用，无法在线修改。',
      'setting.saveFailed': '保存失败，请重试。',
      'author.title': '作者',
      'author.desc': '由 XBXyftx 开发，MIT 开源。',
      'tab.title': '侧边对话',
      'guide.title': '侧边对话',
      'guide.description': '向一条只读的临时分支提问',
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
      'close.title': '关闭侧边聊天？',
      'close.description': '这个侧边聊天将被删除，且无法恢复。你确定吗？',
      'close.dontAsk': '不再询问',
      'close.cancel': '取消',
      'close.confirm': '关闭侧边聊天',
      'close.failed': '关闭失败',
    }
    const en = {
      'panel.label': 'Side Chat',
      'page.title': 'Side Chat',
      'page.subtitle': 'A Codex-style temporary read-only branch: ask about the current work in the right sidebar. Closing destroys it.',
      'setting.title': 'Allow messages to the main session',
      'setting.desc': 'When on, a side chat may hand a confirmed result back to the main session as a queued follow-up turn — only when you ask for it or it is genuinely necessary. It never interrupts the current work.',
      'setting.loading': 'Reading configuration…',
      'setting.unavailable': 'The settings service is unavailable; this value cannot be edited here.',
      'setting.saveFailed': 'Saving failed. Try again.',
      'author.title': 'Author',
      'author.desc': 'Built by XBXyftx. MIT licensed.',
      'tab.title': 'Side chat',
      'guide.title': 'Side chat',
      'guide.description': 'Ask a read-only temporary branch',
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
      'close.title': 'Close this side chat?',
      'close.description': 'The side chat will be deleted and cannot be recovered. Continue?',
      'close.dontAsk': "Don't ask again",
      'close.cancel': 'Cancel',
      'close.confirm': 'Close side chat',
      'close.failed': 'Close failed',
    }

    const color = {
      text: 'var(--dsw-alias-label-primary)',
      secondary: 'var(--dsw-alias-label-secondary)',
      border: 'var(--dsw-alias-border-l1)',
      surface: 'var(--dsw-alias-bg-layer-1)',
      accent: 'var(--dsw-alias-brand-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
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
      .dsh-side-chat-composer { flex:0 0 auto; border-top:1px solid ${color.border}; padding:10px 12px 12px;
        display:flex; flex-direction:column; gap:8px; background:var(--dsw-alias-bg-layer-1); }
      .dsh-side-chat-composer-row { display:flex; align-items:flex-end; gap:8px; }
      .dsh-side-chat-input { flex:1 1 auto; resize:none; min-height:38px; max-height:160px; box-sizing:border-box;
        border:1px solid ${color.border}; border-radius:10px; padding:9px 11px; font:inherit; font-size:13px;
        line-height:1.45; color:${color.text}; background:transparent; outline:none; }
      .dsh-side-chat-input:focus { border-color:${color.accent}; }
      .dsh-side-chat-hint { display:flex; justify-content:space-between; align-items:center; gap:8px;
        font-size:11px; color:${color.secondary}; }
      .dsh-side-chat-badge { border:1px solid ${color.border}; border-radius:999px; padding:1px 8px; font-size:11px; }
      .dsh-side-chat-error-inline { color:${color.error}; font-size:12px; }
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

    /** Conversation body rendered inside the retained session provider. */
    function SideChatConversation({ renderFactorySlot }) {
      return h('div', { className: 'dsh-side-chat-body' },
        renderFactorySlot('conversation.content', {
          variant: 'embedded', phase: 'active', hero: false,
        }, { slots: { views: FixedChatView } }))
    }

    function FixedChatView(props) {
      return props.renderSlot('conversation.session', { view: 'chat' })
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

      return h('div', { className: 'dsh-side-chat-composer' },
        h('div', { className: 'dsh-side-chat-composer-row' },
          h('textarea', {
            className: 'dsh-side-chat-input',
            rows: 1,
            value,
            placeholder: t('composer.placeholder'),
            onChange: event => setValue(event.target.value),
            onKeyDown,
          }),
          running
            ? h('button', { className: 'dsh-side-chat-button', onClick: () => { void stop() } }, t('composer.stop'))
            : h('button', {
              className: 'dsh-side-chat-button dsh-side-chat-button-primary',
              disabled: busy || value.trim().length === 0,
              onClick: () => { void send() },
            }, t('composer.send'))),
        error === null ? null : h('div', { className: 'dsh-side-chat-error-inline' }, error),
        h('div', { className: 'dsh-side-chat-hint' },
          h('span', { className: 'dsh-side-chat-badge' }, t('composer.readonly')),
          h('span', null, 'Enter 发送 / Shift+Enter 换行')))
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
