/**
 * Browser half of dsh-session-markdown-export.
 *
 * Adds one row to a Session's "..." menu in the sidebar. The row fetches the
 * host's Markdown route and hands the bytes to the browser download manager,
 * so the exported file opens in any Markdown reader with its reasoning and
 * tool-call sections already collapsible.
 *
 * @module dsh-session-markdown-export/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-markdown-export',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'session-markdown-export'

    const zh = {
      'menu.export': '导出为 Markdown',
      'notice.failed': '导出会话失败',
      'notice.dismiss': '关闭',
    }
    const en = {
      'menu.export': 'Export as Markdown',
      'notice.failed': 'Session export failed',
      'notice.dismiss': 'Dismiss',
    }

    const CSS = `
.dsh-sme-row{display:flex;align-items:center;width:100%;min-height:28px;padding:4px 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;text-align:left;cursor:pointer;white-space:nowrap}
.dsh-sme-row:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)}
.dsh-sme-row:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dsh-sme-row[data-separator='true']{margin-top:4px;border-top:1px solid var(--dsw-alias-border-l1);border-top-left-radius:0;border-top-right-radius:0;padding-top:6px}
.dsh-sme-notice{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;display:flex;align-items:flex-start;gap:12px;max-width:min(520px,calc(100vw - 32px));padding:10px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-overlay);box-shadow:0 8px 24px rgba(0,0,0,.18);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;pointer-events:auto}
.dsh-sme-notice[hidden]{display:none}
.dsh-sme-notice-text{flex:1;min-width:0;word-break:break-word}
.dsh-sme-notice-close{border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;padding:0}
.dsh-sme-notice-close:hover{color:var(--dsw-alias-label-primary)}
`

    /** A tiny observable holding the latest export failure. */
    function createNoticeStore() {
      let value = null
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        show: (message) => {
          value = { message, at: Date.now() }
          emit()
        },
        clear: () => {
          value = null
          emit()
        },
      }
    }

    /** Browser IANA zone, used so every timestamp matches the reader's clock. */
    function timeZone() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      } catch {
        return 'UTC'
      }
    }

    /** Two-digit padding for filename stamps. */
    function pad(value) {
      return String(value).padStart(2, '0')
    }

    /** Local `YYYYMMDD-HHmm` stamp. */
    function stampNow(date = new Date()) {
      return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
    }

    /** Collapse a Session title into a portable file name. */
    function filenameFor(title, sessionId) {
      const base = String(title ?? '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
      const tail = String(sessionId ?? '').replace(/^session-/, '').slice(0, 8)
      const name = base.length > 0 ? base : 'session'
      return tail.length > 0 ? `${name}_${stampNow()}_${tail}.md` : `${name}_${stampNow()}.md`
    }

    /** Hand a Blob to the browser download manager without leaving the page. */
    function saveBlob(blob, filename) {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.rel = 'noopener'
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    }

    /** Read one export failure from a response body without trusting its shape. */
    function failureDetail(status, text) {
      try {
        const body = JSON.parse(text)
        if (body && typeof body === 'object' && typeof body.message === 'string') return `${status}: ${body.message}`
      } catch {
        /* not JSON */
      }
      return `${status}${text ? `: ${text.slice(0, 240)}` : ''}`
    }

    /** Fetch the Markdown document and save it, surfacing any failure. */
    async function downloadMarkdown({ sessionId, title, lang, notices, t }) {
      const params = new URLSearchParams({
        sessionId,
        lang,
        tz: timeZone(),
      })
      let response
      try {
        response = await fetch(`api/session.markdown-export?${params.toString()}`, {
          headers: { accept: 'text/markdown' },
          signal: AbortSignal.timeout(60_000),
        })
      } catch (error) {
        notices.show(`${t('notice.failed')}：${error instanceof Error ? error.message : String(error)}`)
        return
      }
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        notices.show(`${t('notice.failed')}：${failureDetail(response.status, text)}`)
        return
      }
      const markdown = await response.text()
      saveBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), filenameFor(title, sessionId))
    }

    /** One row in a Session's "..." menu. */
    function ExportMenuItem(props) {
      const { sessionId, displayTitle, useMenuOpenState, download, t } = props
      const setMenuOpen = useMenuOpenState()[1]
      return h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'dsh-sme-row',
          'data-separator': 'true',
          onClick: () => {
            setMenuOpen(false)
            download(sessionId, displayTitle)
          },
        },
        t('menu.export'),
      )
    }

    /** Transient failure notice in the frame overlay layer. */
    function ExportNotice(props) {
      const { useExportNotice, clearNotice, t } = props
      const notice = useExportNotice((value) => value)
      React.useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => clearNotice(), 10_000)
        return () => clearTimeout(timer)
      }, [notice, clearNotice])
      return h(
        'div',
        { className: 'dsh-sme-notice', role: 'status', 'aria-live': 'polite', hidden: !notice },
        h('style', null, CSS),
        h('span', { className: 'dsh-sme-notice-text' }, notice?.message ?? ''),
        h(
          'button',
          { type: 'button', className: 'dsh-sme-notice-close', onClick: () => clearNotice() },
          t('notice.dismiss'),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const notices = createNoticeStore()

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-markdown-export: dictionaries')

        const resolveLang = () => {
          try {
            const snapshot = ctx.locale.getLocale()
            const id = snapshot && typeof snapshot === 'object'
              ? String(snapshot.id ?? snapshot.locale ?? snapshot.language ?? '')
              : String(snapshot ?? '')
            if (id.toLowerCase().startsWith('en')) return 'en'
            if (id.length > 0) return 'zh'
          } catch {
            /* fall through to the browser preference */
          }
          return typeof navigator !== 'undefined' && String(navigator.language ?? '').toLowerCase().startsWith('en') ? 'en' : 'zh'
        }

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'session-markdown-export.export',
              order: 500,
              locale: NS,
              inject: () => ({
                download: (sessionId, displayTitle) => {
                  void downloadMarkdown({
                    sessionId,
                    title: displayTitle,
                    lang: resolveLang(),
                    notices,
                    t: (key) => {
                      const dictionary = resolveLang() === 'en' ? en : zh
                      return dictionary[key] ?? key
                    },
                  })
                },
              }),
            },
            ExportMenuItem,
          ),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'session-markdown-export.notice',
              order: 100,
              locale: NS,
              inject: () => ({
                hooks: { exportNotice: notices },
                clearNotice: () => notices.clear(),
              }),
            },
            ExportNotice,
          ),
        )
      },
    }
  },
})
