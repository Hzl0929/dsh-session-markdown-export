/**
 * Host half of dsh-session-markdown-export.
 *
 * Registers one authenticated download route on Connection. The browser menu
 * item navigates to it, and the route reads the session log directly through
 * `sessionQuery`, so cold, archived and live sessions all export the same way.
 *
 * @module dsh-session-markdown-export
 */

import { normalizeOptions, renderSessionMarkdown } from './lib/render.js'

/**
 * Exact download route; the browser addresses it document-relative.
 *
 * Kept distinct from DSH's built-in export route `/api/session.markdown`
 * (`@deepseek-ai/dsh-session-log-export`): Connection rejects a second
 * registration of the same exact Fetch route, which would fail one of the two
 * plugins depending on load order.
 */
export const MARKDOWN_ROUTE = '/api/session.markdown-export'

/** Services this plugin cannot work without. */
export const inject = ['connection', 'sessionQuery']

const SESSION_ID_PATTERN = /^session-[A-Za-z0-9_-]{1,120}$/

/**
 * Register the download route for the lifetime of the plugin.
 *
 * @param ctx - host context carrying Connection and Session query services.
 */
export function apply(ctx) {
  const dispose = ctx.connection.fetch.register({
    path: MARKDOWN_ROUTE,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleDownload(ctx, request),
  })
  ctx.effect(() => dispose, 'session-markdown-export: download route')
}

/**
 * Answer one download request.
 *
 * @param ctx - host context.
 * @param request - the authenticated fetch request.
 * @returns the Markdown document, or a JSON error.
 */
async function handleDownload(ctx, request) {
  const url = new URL(request.url, 'http://localhost')
  const sessionId = url.searchParams.get('sessionId') ?? ''
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return jsonResponse(400, { error: 'invalid-session-id', message: `unexpected session id: ${sessionId.slice(0, 80)}` })
  }

  const options = optionsOf(url.searchParams)

  let log
  try {
    log = await ctx.sessionQuery.readSession(sessionId)
  } catch (error) {
    return jsonResponse(404, { error: 'session-unreadable', message: messageOf(error) })
  }

  const surface = await ctx.sessionQuery.readSurface(sessionId).catch(() => undefined)
  const title = await ctx.sessionQuery.readTitle(sessionId).then((snapshot) => snapshot?.title).catch(() => undefined)

  let markdown
  try {
    markdown = renderSessionMarkdown({ log, surface, title, exportedAt: Date.now(), options })
  } catch (error) {
    return jsonResponse(500, { error: 'render-failed', message: messageOf(error) })
  }

  return new Response(markdown, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${sessionId}.md"`,
      'cache-control': 'no-store',
    },
  })
}

function optionsOf(searchParams) {
  const defaults = normalizeOptions({})
  const boolean = (name, fallback) => {
    const raw = searchParams.get(name)
    if (raw === null) return fallback
    return raw === '1' || raw === 'true'
  }
  return normalizeOptions({
    lang: searchParams.get('lang') ?? defaults.lang,
    timeZone: searchParams.get('tz') ?? defaults.timeZone,
    toolStyle: searchParams.get('tools') ?? defaults.toolStyle,
    toolResultLimit: searchParams.get('tool') ?? defaults.toolResultLimit,
    toolArgumentsLimit: searchParams.get('args') ?? defaults.toolArgumentsLimit,
    folding: searchParams.get('folding') ?? defaults.folding,
    includeSystem: boolean('system', defaults.includeSystem),
    includeUsage: boolean('usage', defaults.includeUsage),
    includeFrontMatter: boolean('fm', defaults.includeFrontMatter),
  })
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
