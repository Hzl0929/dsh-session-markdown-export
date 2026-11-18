/**
 * Pure Markdown renderer for one DSH session log.
 *
 * The input is the plain event list `sessionQuery.readSession()` returns, so
 * nothing here depends on Cordis, Node or the browser. One session becomes one
 * self-contained Markdown document: front matter, a short summary, then one
 * section per turn with reasoning and tool calls inside `<details>` blocks.
 *
 * @module dsh-session-markdown-export/render
 */

/** Words the document uses, per output language. */
const LABELS = {
  zh: {
    untitled: '未命名会话',
    created: '创建',
    exported: '导出',
    session: '会话',
    turns: '轮对话',
    messages: '条消息',
    toolCalls: '次工具调用',
    models: '模型',
    cwd: '工作目录',
    preset: '智能体预设',
    inherited: '本会话包含继承的历史（fork 或压缩）',
    turn: '第 {n} 轮',
    continued: '续',
    user: '用户',
    assistant: '助手',
    reasoning: '思考',
    toolCall: '工具调用',
    tools: '工具',
    moreTools: '等 {n} 个',
    listSeparator: '、',
    usageTotal: '用量合计',
    arguments: '参数',
    result: '结果',
    ok: '成功',
    failed: '失败',
    noResult: '没有记录结果',
    empty: '（无输出）',
    truncated: '结果已截断，原 {n} 字符',
    argsTruncated: '参数已截断，原 {n} 字符',
    usage: '用量',
    input: '输入',
    output: '输出',
    cacheRead: '缓存读',
    cacheWrite: '缓存写',
    reasoningTokens: '思考',
    error: '错误',
    turnEnded: '本轮结束',
    aborted: '中断',
    abortedByUser: '用户取消',
    abortedByParent: '父级取消',
    abortedByHook: '钩子终止',
    abortedByDispose: '会话销毁',
    blocked: '被阻塞',
    maxTokens: '超出 token 上限',
    interrupted: '被打断',
    forked: '已分叉',
    errored: '出错',
    image: '图片',
    file: '文件',
    systemPrompt: '系统提示',
    context: '上下文注入',
    requestParams: '请求参数',
    reasoningEffort: '思考强度',
    temperature: '温度',
  },
  en: {
    untitled: 'Untitled session',
    created: 'Created',
    exported: 'Exported',
    session: 'Session',
    turns: 'turn(s)',
    messages: 'message(s)',
    toolCalls: 'tool call(s)',
    models: 'Models',
    cwd: 'Working directory',
    preset: 'Agent preset',
    inherited: 'This session contains inherited history (fork or compaction)',
    turn: 'Turn {n}',
    continued: 'continued',
    user: 'User',
    assistant: 'Assistant',
    reasoning: 'Reasoning',
    toolCall: 'Tool call',
    tools: 'Tools',
    moreTools: '+{n} more',
    listSeparator: ', ',
    usageTotal: 'Total usage',
    arguments: 'Arguments',
    result: 'Result',
    ok: 'ok',
    failed: 'failed',
    noResult: 'No result recorded',
    empty: '(no output)',
    truncated: 'Result truncated, originally {n} characters',
    argsTruncated: 'Arguments truncated, originally {n} characters',
    usage: 'Usage',
    input: 'input',
    output: 'output',
    cacheRead: 'cache read',
    cacheWrite: 'cache write',
    reasoningTokens: 'reasoning',
    error: 'Error',
    turnEnded: 'Turn ended',
    aborted: 'interrupted',
    abortedByUser: 'user cancelled',
    abortedByParent: 'parent cancelled',
    abortedByHook: 'stopped by a hook',
    abortedByDispose: 'session disposed',
    blocked: 'blocked',
    maxTokens: 'max tokens reached',
    interrupted: 'interrupted',
    forked: 'forked',
    errored: 'error',
    image: 'image',
    file: 'file',
    systemPrompt: 'System prompt',
    context: 'Injected context',
    requestParams: 'Request settings',
    reasoningEffort: 'reasoning effort',
    temperature: 'temperature',
  },
}

/** Renderer defaults; every field can be overridden per request. */
export const DEFAULT_OPTIONS = {
  lang: 'zh',
  timeZone: 'UTC',
  toolStyle: 'names',
  toolResultLimit: 1500,
  toolArgumentsLimit: 1200,
  reasoningLimit: 6000,
  folding: 'details',
  includeSystem: false,
  includeContext: false,
  includeUsage: true,
  includeFrontMatter: true,
}

/**
 * Normalize caller options into a complete option set.
 *
 * @param options - partial options from the request.
 * @returns complete options with coerced values.
 */
export function normalizeOptions(options) {
  const input = options ?? {}
  return {
    lang: input.lang === 'en' ? 'en' : 'zh',
    timeZone: typeof input.timeZone === 'string' && input.timeZone.length > 0 ? input.timeZone : DEFAULT_OPTIONS.timeZone,
    toolStyle: input.toolStyle === 'details' || input.toolStyle === 'off' ? input.toolStyle : DEFAULT_OPTIONS.toolStyle,
    toolResultLimit: positiveInteger(input.toolResultLimit, DEFAULT_OPTIONS.toolResultLimit),
    toolArgumentsLimit: positiveInteger(input.toolArgumentsLimit, DEFAULT_OPTIONS.toolArgumentsLimit),
    reasoningLimit: positiveInteger(input.reasoningLimit, DEFAULT_OPTIONS.reasoningLimit),
    folding: input.folding === 'plain' ? 'plain' : 'details',
    includeSystem: input.includeSystem === true,
    includeContext: input.includeContext === true,
    includeUsage: input.includeUsage !== false,
    includeFrontMatter: input.includeFrontMatter !== false,
  }
}

function positiveInteger(value, fallback) {
  const number = typeof value === 'string' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number) || number <= 0) return fallback
  return Math.floor(number)
}

/**
 * Render one session log as Markdown.
 *
 * @param input - session log, optional current surface, title, export time, options.
 * @returns the Markdown document.
 */
export function renderSessionMarkdown(input) {
  const options = normalizeOptions(input.options)
  const labels = LABELS[options.lang]
  const clock = makeClock(options.timeZone)
  const header = input.log?.session ?? {}
  const events = Array.isArray(input.log?.events) ? input.log.events : []
  const surfaceEvents = Array.isArray(input.surface?.events) ? input.surface.events : []
  const surfaceSeqs = new Set(surfaceEvents.map((event) => event.seq))
  const hasSurface = surfaceSeqs.size > 0

  const resultsByCall = new Map()
  const stepStarts = new Map()
  const renderableSteps = new Set()

  for (const event of events) {
    const data = event.data ?? {}
    if (event.type === 'tool/result') {
      const callId = data.message?.toolCallId
      if (typeof callId === 'string' && !resultsByCall.has(callId)) resultsByCall.set(callId, event)
    } else if (event.type === 'step/start') {
      stepStarts.set(stepKey(data.turn, data.step), event.time)
    }
  }
  for (const event of surfaceEvents) {
    const data = event.data ?? {}
    if (typeof data.turn === 'number' && typeof data.step === 'number') {
      renderableSteps.add(stepKey(data.turn, data.step))
    }
  }

  const isStepRenderable = (turn, step) => !hasSurface || renderableSteps.has(stepKey(turn, step))
  const isSurfaceEvent = (event) => !hasSurface || surfaceSeqs.has(event.seq)

  const turns = []
  let currentTurn = null
  let currentStep = null

  const openTurn = (index, time) => {
    currentTurn = { index, startTime: time, endTime: null, reason: null, entries: [] }
    turns.push(currentTurn)
    currentStep = null
    return currentTurn
  }

  for (const event of events) {
    const data = event.data ?? {}
    switch (event.type) {
      case 'turn/start': {
        openTurn(typeof data.turn === 'number' ? data.turn : turns.length + 1, event.time)
        break
      }
      case 'step/start': {
        currentStep = null
        break
      }
      case 'user/message': {
        if (!isSurfaceEvent(event)) break
        const kind = data.source?.kind
        if (kind !== 'user' && !options.includeContext) break
        if (currentTurn === null) openTurn(turns.length + 1, event.time)
        const content = Array.isArray(data.content) ? data.content : []
        if (kind !== 'user') currentTurn.entries.push({ kind: 'context', label: kind, time: event.time, content })
        else currentTurn.entries.push({ kind: 'user', time: event.time, content })
        break
      }
      case 'assistant/message': {
        if (!isStepRenderable(data.turn, data.step)) break
        if (currentTurn === null) openTurn(typeof data.turn === 'number' ? data.turn : turns.length + 1, event.time)
        const step = buildStepEntry({ event, data, stepStart: stepStarts.get(stepKey(data.turn, data.step)) })
        currentTurn.entries.push(step)
        currentStep = step
        break
      }
      case 'tool/call': {
        if (currentTurn === null) break
        if (!isStepRenderable(data.turn, data.step)) break
        const call = {
          callId: data.callId,
          name: typeof data.name === 'string' ? data.name : 'tool',
          arguments: typeof data.arguments === 'string' ? data.arguments : '',
          time: event.time,
          result: resultsByCall.get(data.callId),
        }
        const target = currentStep !== null && currentStep.step === stepKey(data.turn, data.step) ? currentStep : null
        if (target !== null) target.toolCalls.push(call)
        else currentTurn.entries.push({ kind: 'tools', calls: [call] })
        break
      }
      case 'system/message': {
        if (!options.includeSystem) break
        if (!isSurfaceEvent(event)) break
        if (currentTurn === null) openTurn(turns.length + 1, event.time)
        const blocks = Array.isArray(data.message?.content) ? data.message.content : []
        const text = blocks.filter((block) => block.type === 'text').map((block) => block.text).join('\n\n').trim()
        if (text.length > 0) currentTurn.entries.push({ kind: 'system', time: event.time, text })
        break
      }
      case 'request/header': {
        if (currentTurn !== null && data.header?.config) currentTurn.requestConfig = data.header.config
        break
      }
      case 'turn/end': {
        if (currentTurn === null) break
        currentTurn.endTime = event.time
        currentTurn.reason = data.reason ?? null
        currentStep = null
        break
      }
      default:
        break
    }
  }

  finalizeTurns(turns, resultsByCall)

  const counters = countContent(turns)
  const models = uniqueModels(turns)
  const documentTitle = typeof input.title === 'string' && input.title.trim().length > 0 ? input.title.trim() : labels.untitled
  const exportedAt = typeof input.exportedAt === 'number' ? input.exportedAt : Date.now()
  const document = {
    header,
    documentTitle,
    exportedAt,
    timeZone: options.timeZone,
    counters,
    models,
    labels,
    clock,
    includeUsage: options.includeUsage,
    usage: usageTotals(turns),
  }

  const lines = []
  if (options.includeFrontMatter) pushFrontMatter(lines, document)
  lines.push(`# ${documentTitle}`, '')
  pushSummary(lines, document)

  for (const [position, turn] of turns.entries()) {
    if (turn.entries.length === 0) continue
    pushTurn(lines, { turn, previous: turns[position - 1], labels, clock, options })
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function stepKey(turn, step) {
  return `${String(turn)}:${String(step)}`
}

function buildStepEntry({ event, data, stepStart }) {
  const message = data.message ?? {}
  const content = Array.isArray(message.content) ? message.content : []
  const reasoning = content.filter((block) => block.type === 'reasoning').map((block) => block.text ?? '').join('\n\n').trim()
  const text = content.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n\n').trim()
  const orphanCalls = content
    .filter((block) => block.type === 'tool-call')
    .map((block) => ({
      callId: block.id,
      name: typeof block.name === 'string' ? block.name : 'tool',
      arguments: typeof block.arguments === 'string' ? block.arguments : '',
      time: event.time,
      result: null,
    }))
  return {
    kind: 'step',
    time: event.time,
    step: stepKey(data.turn, data.step),
    model: typeof message.source?.model === 'string' ? message.source.model : '',
    provider: typeof message.source?.provider === 'string' ? message.source.provider : '',
    reasoning,
    reasoningMs: reasoningTimingOf(data.stream),
    text,
    usage: data.usage ?? null,
    durationMs: typeof stepStart === 'number' ? Math.max(0, event.time - stepStart) : null,
    toolCalls: [],
    orphanCalls,
  }
}

function finalizeTurns(turns, resultsByCall) {
  for (const turn of turns) {
    for (const entry of turn.entries) {
      if (entry.kind !== 'step') continue
      if (entry.toolCalls.length === 0 && entry.orphanCalls.length > 0) {
        entry.toolCalls = entry.orphanCalls.map((call) => ({ ...call, result: resultsByCall.get(call.callId) }))
      }
      delete entry.orphanCalls
    }
  }
}

function countContent(turns) {
  let messages = 0
  let toolCalls = 0
  let turnsWithContent = 0
  for (const turn of turns) {
    let used = false
    for (const entry of turn.entries) {
      if (entry.kind === 'user' || entry.kind === 'context') {
        messages += 1
        if (entry.kind === 'user') used = true
      }
      if (entry.kind === 'step') {
        messages += 1
        used = true
        toolCalls += entry.toolCalls.length
      }
      if (entry.kind === 'tools') toolCalls += entry.calls.length
    }
    if (used) turnsWithContent += 1
  }
  return { messages, toolCalls, turns: turnsWithContent }
}

function uniqueModels(turns) {
  const models = []
  for (const turn of turns) {
    for (const entry of turn.entries) {
      if (entry.kind === 'step' && entry.model && !models.includes(entry.model)) models.push(entry.model)
    }
  }
  return models
}

/** Sum the token usage the steps report, for one line in the document summary. */
function usageTotals(turns) {
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, steps: 0 }
  for (const turn of turns) {
    for (const entry of turn.entries) {
      if (entry.kind !== 'step' || entry.usage === null) continue
      const usage = entry.usage
      if (typeof usage.inputTokens === 'number') totals.inputTokens += usage.inputTokens
      if (typeof usage.outputTokens === 'number') totals.outputTokens += usage.outputTokens
      if (typeof usage.cacheReadTokens === 'number') totals.cacheReadTokens += usage.cacheReadTokens
      if (typeof usage.cacheWriteTokens === 'number') totals.cacheWriteTokens += usage.cacheWriteTokens
      if (typeof usage.reasoningTokens === 'number') totals.reasoningTokens += usage.reasoningTokens
      totals.steps += 1
    }
  }
  return totals
}

function reasoningTimingOf(stream) {
  if (!Array.isArray(stream)) return null
  let first = null
  let last = null
  for (const record of stream) {
    if (record?.type === 'reasoning-chunks') {
      const total = Array.isArray(record.dt) ? record.dt.reduce((sum, value) => sum + value, 0) : 0
      if (first === null || record.time0 < first) first = record.time0
      const end = record.time0 + total
      if (last === null || end > last) last = end
    } else if (record?.type === 'chunk' && record.chunk?.type === 'reasoning-delta' && typeof record.time === 'number') {
      if (first === null || record.time < first) first = record.time
      if (last === null || record.time > last) last = record.time
    }
  }
  if (first === null || last === null) return null
  return Math.max(0, last - first)
}

function makeClock(timeZone) {
  let formatter
  try {
    formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
  } catch {
    formatter = new Intl.DateTimeFormat('sv-SE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
  }
  return (milliseconds) => {
    if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds)) return ''
    return formatter.format(new Date(milliseconds))
  }
}

function timeOfDay(stamp) {
  const parts = stamp.split(' ')
  return parts.length > 1 ? parts[1] : stamp
}

function dateOf(stamp) {
  return stamp.slice(0, 10)
}

function humanDuration(milliseconds) {
  if (typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds < 0) return ''
  if (milliseconds < 1000) return `${Math.round(milliseconds)}ms`
  const seconds = milliseconds / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const restSeconds = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m${String(restSeconds).padStart(2, '0')}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h${String(minutes % 60).padStart(2, '0')}m`
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : String(value ?? '')
}

function clip(text, limit) {
  if (typeof text !== 'string') return { text: '', clipped: false, originalLength: 0 }
  if (text.length <= limit) return { text, clipped: false, originalLength: text.length }
  return { text: text.slice(0, limit), clipped: true, originalLength: text.length }
}

function fenceFor(text) {
  const runs = String(text).match(/`+/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

function prettyJson(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return null
  }
}

function pushFrontMatter(lines, input) {
  const quote = (value) => JSON.stringify(String(value ?? ''))
  lines.push('---')
  lines.push(`session_id: ${quote(input.header.id)}`)
  lines.push(`title: ${quote(input.documentTitle)}`)
  lines.push(`created_at: ${quote(input.clock(input.header.createdAt))}`)
  lines.push(`exported_at: ${quote(input.clock(input.exportedAt))}`)
  lines.push(`time_zone: ${quote(input.timeZone)}`)
  if (input.header.cwd) lines.push(`cwd: ${quote(input.header.cwd)}`)
  if (input.header.agentPreset) lines.push(`agent_preset: ${quote(input.header.agentPreset)}`)
  if (input.header.parentSession) lines.push(`parent_session: ${quote(input.header.parentSession)}`)
  lines.push(`format_version: ${Number(input.header.version ?? 0)}`)
  lines.push(`models: [${input.models.map((model) => quote(model)).join(', ')}]`)
  lines.push(`turns: ${input.counters.turns}`)
  lines.push(`messages: ${input.counters.messages}`)
  lines.push(`tool_calls: ${input.counters.toolCalls}`)
  lines.push('---', '')
}

function pushSummary(lines, input) {
  const facts = [
    `${input.labels.session} \`${input.header.id ?? ''}\``,
    `${input.labels.created} ${input.clock(input.header.createdAt)}`,
    `${input.labels.exported} ${input.clock(input.exportedAt)}`,
  ]
  lines.push(`> ${facts.join(' · ')}`)

  const scale = [
    `${input.counters.turns} ${input.labels.turns}`,
    `${input.counters.messages} ${input.labels.messages}`,
    `${input.counters.toolCalls} ${input.labels.toolCalls}`,
  ]
  if (input.models.length > 0) scale.push(`${input.labels.models} ${input.models.join(' / ')}`)
  lines.push(`> ${scale.join(' · ')}`)

  const extras = []
  if (input.header.cwd) extras.push(`${input.labels.cwd} \`${input.header.cwd}\``)
  if (input.header.agentPreset) extras.push(`${input.labels.preset} ${input.header.agentPreset}`)
  if (extras.length > 0) lines.push(`> ${extras.join(' · ')}`)
  if (input.header.isSeeded === true) lines.push(`> ${input.labels.inherited}`)
  if (input.includeUsage && input.usage !== undefined) {
    const totals = `${input.labels.usageTotal}：${usageLine(input.usage, input.labels, false)}`
    if (totals.length > input.labels.usageTotal.length + 1) lines.push(`> ${totals}`)
  }
  lines.push('')
}

function pushTurn(lines, input) {
  const { turn, previous, labels, clock, options } = input
  const start = clock(turn.startTime)
  const sameDay = previous !== undefined && previous.startTime !== undefined && dateOf(clock(previous.startTime)) === dateOf(start)
  const stamp = sameDay ? timeOfDay(start) : start
  const span = typeof turn.endTime === 'number' ? humanDuration(turn.endTime - turn.startTime) : ''
  const heading = [`## ${labels.turn.replace('{n}', String(turn.index))}`, stamp]
  if (span) heading.push(span)
  lines.push(heading.join(' · '), '')

  const turnDate = dateOf(start)
  const stampOf = (milliseconds) => {
    const full = clock(milliseconds)
    return dateOf(full) === turnDate ? timeOfDay(full) : full
  }

  let stepIndex = 0
  for (const entry of turn.entries) {
    if (entry.kind === 'user') {
      lines.push(`### ${labels.user} · ${stampOf(entry.time)}`, '')
      const body = renderContentBlocks(entry.content, labels)
      if (body.length > 0) lines.push(demoteHeadings(body, 2), '')
    } else if (entry.kind === 'context') {
      const body = renderContentBlocks(entry.content, labels)
      if (body.length > 0) pushCollapsible(lines, { options, summary: `${labels.context} · ${entry.label ?? ''}`, body: demoteHeadings(body, 2) })
    } else if (entry.kind === 'step') {
      pushStepEntry(lines, { entry, stepIndex, labels, stampOf, options })
      stepIndex += 1
    } else if (entry.kind === 'tools') {
      if (options.toolStyle === 'details') pushToolCallGroup(lines, { calls: entry.calls, labels, stampOf, options })
      else if (options.toolStyle === 'names') pushToolLine(lines, { calls: entry.calls, labels })
    } else if (entry.kind === 'system') {
      pushCollapsible(lines, { options, summary: labels.systemPrompt, body: demoteHeadings(entry.text, 2) })
    }
  }

  const ended = turnEndLabel(turn.reason, labels)
  if (ended) lines.push(`> ${labels.turnEnded}：${ended}`, '')
}

function pushStepEntry(lines, input) {
  const { entry, stepIndex, labels, stampOf } = input
  const options = input.options
  const showsTools = entry.toolCalls.length > 0 && options.toolStyle !== 'off'
  const hasBody = entry.reasoning.length > 0 || entry.text.length > 0 || showsTools
  if (!hasBody) return

  const details = [stampOf(entry.time)]
  if (entry.model) details.push(entry.model)
  const duration = humanDuration(entry.durationMs)
  if (duration) details.push(duration)

  if (stepIndex === 0) lines.push(`### ${labels.assistant} · ${details.join(' · ')}`, '')
  else lines.push(`> ${labels.continued} · ${details.join(' · ')}`, '')

  if (entry.reasoning.length > 0) {
    const reasoningDuration = humanDuration(entry.reasoningMs)
    const summary = reasoningDuration ? `${labels.reasoning}（${reasoningDuration}）` : labels.reasoning
    pushCollapsible(lines, { options, summary, body: demoteHeadings(entry.reasoning, 2) })
  }

  if (entry.text.length > 0) lines.push(demoteHeadings(entry.text, 2), '')

  if (showsTools) {
    if (options.toolStyle === 'details') pushToolCallGroup(lines, { calls: entry.toolCalls, labels, stampOf, options })
    else pushToolLine(lines, { calls: entry.toolCalls, labels })
  }
}

/**
 * One muted line naming the tools a step used, with no arguments or results.
 *
 * @param lines - document lines to append to.
 * @param input - the step's calls and the active labels.
 */
function pushToolLine(lines, input) {
  const { calls, labels } = input
  const counts = new Map()
  for (const call of calls) counts.set(call.name, (counts.get(call.name) ?? 0) + 1)
  const names = [...counts.entries()].map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
  const shown = names.length > 8 ? [...names.slice(0, 8), labels.moreTools.replace('{n}', String(names.length - 8))] : names
  lines.push(`> ${labels.tools}：${shown.join(labels.listSeparator)}`, '')
}

function pushCollapsible(lines, input) {
  const { options, summary, body } = input
  const content = typeof body === 'string' && body.trim().length > 0 ? body : ''
  if (options.folding === 'plain') {
    lines.push(`#### ${summary}`, '', content, '')
    return
  }
  lines.push('<details>', `<summary>${summary}</summary>`, '', content, '', '</details>', '')
}

function pushToolCallGroup(lines, input) {
  const { calls, labels, stampOf, options } = input
  for (const [position, call] of calls.entries()) {
    const index = calls.length > 1 ? ` ${position + 1}/${calls.length}` : ''
    const parts = [`${labels.toolCall}${index}`, call.name, stampOf(call.time)]
    const result = call.result
    if (result !== undefined && result !== null) {
      const elapsed = typeof result.time === 'number' && typeof call.time === 'number' ? humanDuration(result.time - call.time) : ''
      const failed = result.data?.message?.isError === true || result.data?.error !== undefined
      const outcome = [failed ? labels.failed : labels.ok]
      if (elapsed) outcome.push(elapsed)
      parts.push(outcome.join(' · '))
    } else {
      parts.push(labels.noResult)
    }

    const argumentsText = typeof call.arguments === 'string' ? call.arguments : ''
    const pretty = prettyJson(argumentsText) ?? argumentsText
    const clippedArguments = clip(pretty, options.toolArgumentsLimit)
    const body = []

    if (clippedArguments.text.trim().length > 0) {
      const language = pretty.trim().startsWith('{') || pretty.trim().startsWith('[') ? 'json' : 'text'
      const fence = fenceFor(clippedArguments.text)
      body.push(`**${labels.arguments}**`, '', `${fence}${language}`, clippedArguments.text, fence)
      if (clippedArguments.clipped) body.push('', `> ${labels.argsTruncated.replace('{n}', formatNumber(clippedArguments.originalLength))}`)
    }

    if (result !== undefined && result !== null) {
      const error = result.data?.error
      if (error) {
        const detail = [error.name, error.code, error.reason].filter((value) => typeof value === 'string' && value.length > 0).join(' / ')
        body.push('', `**${labels.error}** ${detail}`)
      }
      const resultsText = renderContentBlocks(result.data?.message?.content ?? [], labels)
      const clippedResult = clip(resultsText, options.toolResultLimit)
      if (clippedResult.text.trim().length > 0) {
        const fence = fenceFor(clippedResult.text)
        body.push('', `**${labels.result}**`, '', `${fence}text`, clippedResult.text, fence)
        if (clippedResult.clipped) body.push('', `> ${labels.truncated.replace('{n}', formatNumber(clippedResult.originalLength))}`)
      } else if (!error) {
        body.push('', labels.empty)
      }
    }

    pushCollapsible(lines, { options, summary: parts.join(' · '), body: body.join('\n') })
  }
}

/**
 * Push every Markdown heading in body text down by `levels`, so a reply's own
 * `##` section never outranks the turn heading that contains it. Fenced code
 * blocks are left untouched.
 *
 * @param text - Markdown body text.
 * @param levels - heading levels to add.
 * @returns the adjusted text.
 */
function demoteHeadings(text, levels) {
  if (typeof text !== 'string' || text.length === 0) return ''
  let fenceCharacter = null
  let fenceLength = 0
  const out = []
  for (const line of text.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)
    if (marker !== null) {
      const token = marker[1]
      if (fenceCharacter === null) {
        fenceCharacter = token[0]
        fenceLength = token.length
        out.push(line)
        continue
      }
      if (token[0] === fenceCharacter && token.length >= fenceLength) {
        fenceCharacter = null
        fenceLength = 0
      }
      out.push(line)
      continue
    }
    if (fenceCharacter !== null) {
      out.push(line)
      continue
    }
    const heading = line.match(/^(#{1,6})(\s+)/)
    if (heading === null) {
      out.push(line)
      continue
    }
    const hashes = Math.min(6, heading[1].length + levels)
    out.push(`${'#'.repeat(hashes)}${line.slice(heading[1].length)}`)
  }
  return out.join('\n')
}

function renderContentBlocks(blocks, labels) {
  if (!Array.isArray(blocks)) return ''
  const parts = []
  for (const block of blocks) {
    if (block === null || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string') {
      if (block.text.trim().length > 0) parts.push(block.text.trim())
    } else if (block.type === 'image') {
      const name = block.attachment?.name
      parts.push(`_[${labels.image}${typeof name === 'string' && name.length > 0 ? `：${name}` : ''}]_`)
    } else if (block.type === 'file') {
      const name = block.attachment?.name
      parts.push(`_[${labels.file}${typeof name === 'string' && name.length > 0 ? `：${name}` : ''}]_`)
    }
  }
  return parts.join('\n\n')
}

function usageLine(usage, labels, withLabel = true) {
  const parts = []
  if (typeof usage.inputTokens === 'number') parts.push(`${labels.input} ${formatNumber(usage.inputTokens)}`)
  if (typeof usage.outputTokens === 'number') parts.push(`${labels.output} ${formatNumber(usage.outputTokens)}`)
  if (typeof usage.cacheReadTokens === 'number') parts.push(`${labels.cacheRead} ${formatNumber(usage.cacheReadTokens)}`)
  if (typeof usage.cacheWriteTokens === 'number' && usage.cacheWriteTokens > 0) parts.push(`${labels.cacheWrite} ${formatNumber(usage.cacheWriteTokens)}`)
  if (typeof usage.reasoningTokens === 'number' && usage.reasoningTokens > 0) parts.push(`${labels.reasoningTokens} ${formatNumber(usage.reasoningTokens)}`)
  if (parts.length === 0) return ''
  return withLabel ? `${labels.usage}：${parts.join(' · ')}` : parts.join(' · ')
}

function turnEndLabel(reason, labels) {
  if (reason === null || reason === undefined) return ''
  switch (reason.kind) {
    case 'completed':
      return ''
    case 'aborted':
      return `${labels.aborted}（${abortCause(reason.reason, labels)}）`
    case 'blocked':
      return labels.blocked
    case 'max-tokens':
      return labels.maxTokens
    case 'interrupted':
      return labels.interrupted
    case 'forked':
      return labels.forked
    case 'error':
      return `${labels.errored}：${reason.error?.message ?? ''}`
    default:
      return String(reason.kind ?? '')
  }
}

function abortCause(cause, labels) {
  switch (cause?.kind) {
    case 'user':
      return labels.abortedByUser
    case 'parent':
      return labels.abortedByParent
    case 'hook':
      return cause.reason ? `${labels.abortedByHook}：${cause.reason}` : labels.abortedByHook
    case 'disposed':
      return labels.abortedByDispose
    default:
      return String(cause?.kind ?? '')
  }
}
