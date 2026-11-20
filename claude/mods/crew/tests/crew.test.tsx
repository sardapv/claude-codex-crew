import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'crew',
  component: 'Pane',
  requestId: 'crew',
  props: {
    title: 'Crew',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the pane shows every member, on every surface', async ($, on) => {
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const names = ['Opus', 'Astra', 'Sonnet', 'Sol', 'Terra', 'Luna', 'Haiku']

  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  for (const name of names) {
    expect(await term.find({ type: 'Text', text: new RegExp(name) })).toBeTruthy()
  }
  await term.unmount()

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const chart = (await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined
    const source = chart?.props?.source ?? ''
    for (const name of names) expect(source).toContain(`>${name}<`)
    await ui.unmount()
  }
})

test('a Haiku subagent gets the crew effort when none is given', async ($, on) => {
  let seen: unknown
  on('tool.call', (_, e) => {
    seen = (e as { effort?: string }).effort
    return { result: {} }
  })
  await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'y', model: 'haiku' })
  expect(seen).toBe('xhigh')
})

test('a codex exec command gets the crew effort added', async ($, on) => {
  let seen = ''
  on('tool.call', (_, e) => {
    seen = (e as { command: string }).command
    return { result: {} }
  })
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6-luna "do x"' })
  expect(seen).toBe('codex exec -c model_reasoning_effort=xhigh -m gpt-6-luna "do x"')
})

test('the words inside a string are left alone, a chained call is not', async ($, on) => {
  const seen: string[] = []
  on('tool.call', (_, e) => {
    seen.push((e as { command: string }).command)
    return { result: {} }
  })
  const inText = `python3 - <<'PY'\nprint("run codex exec later")\nPY`
  await $.tool.call({ tool: 'Bash', command: inText })
  await $.tool.call({ tool: 'Bash', command: 'cd /tmp && codex exec -m gpt-6-luna "x"' })
  expect(seen[0]).toBe(inText)
  expect(seen[1]).toBe('cd /tmp && codex exec -c model_reasoning_effort=xhigh -m gpt-6-luna "x"')
})

test('reads pass and writes ask, per service', async ($, on) => {
  // A call the crew lets pass reaches this hook; one it stops to ask about does not.
  let reached = false
  on('classic.PreToolUse', () => {
    reached = true
    return {} as never
  })
  on('tool.call', () => ({ result: { ok: true } }))
  // Made-up connector ids, read at session start from ~/.claude/crew-connectors.json.
  mock.env(on, { HOME: '/home/test' })
  mock.store(on)
  let readPath = ''
  on('fs.read', (_, e) => {
    readPath = e.path
    return { value: JSON.stringify({ 'test-shop-id': 'shopify', 'test-posthog-id': 'posthog', 'test-supabase-id': 'supabase', x: 'nope' }) }
  })
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(readPath).toBe('/home/test/.claude/crew-connectors.json')
  const ph = 'mcp__test-posthog-id__exec'
  const sb = 'mcp__test-supabase-id__execute_sql'
  const sh = 'mcp__test-shop-id__'
  const cf = 'mcp__plugin_cloudflare_cloudflare__execute'

  const passes = async (tool: string, input: Record<string, unknown>) => {
    reached = false
    await $.tool.call({ tool, ...input } as never)
    return reached
  }

  expect(await passes(ph, { command: 'call project-get {}', context: 'x' })).toBe(true)
  expect(await passes(ph, { command: 'call execute-sql {"query":"select 1"}', context: 'x' })).toBe(true)
  expect(await passes(ph, { command: 'call feature-flag-update {"id":1}', context: 'x' })).toBe(false)
  expect(await passes(ph, { command: 'call --confirm feature-flag-delete {"id":1}', context: 'x' })).toBe(false)
  expect(await passes(sb, { project_id: 'p', query: 'select * from t' })).toBe(true)
  expect(await passes(sb, { project_id: 'p', query: 'delete from t' })).toBe(false)
  expect(await passes(`${sh}get-shop-info`, {})).toBe(true)
  expect(await passes(`${sh}update-product`, { id: '1' })).toBe(false)
  expect(await passes(cf, { code: 'await cloudflare.request({ method: "GET", path: "/zones" })' })).toBe(true)
  expect(await passes(cf, { code: 'await cloudflare.request({ method: "DELETE", path: "/zones/1" })' })).toBe(false)
  expect(await passes('Bash', { command: 'ls' })).toBe(true)
})

test('a delegation lights a command line, then a report line; idle draws none', async ($, on) => {
  let during = ''
  let chartSource = async () => ''
  on('tool.call', async () => {
    during = await chartSource()
    return { result: {} }
  })
  mock.store(on)
  const clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  chartSource = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const chart = (await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined
    await ui.unmount()
    return chart?.props?.source ?? ''
  }

  expect(await chartSource()).not.toContain('class="route')

  await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'y', model: 'haiku', effort: 'xhigh' })
  expect(during).toContain('class="route command"')
  expect(during).toContain('WORKING')
  expect(await chartSource()).toContain('class="route report"')
  expect(await chartSource()).toContain('REPORTED')
  await clock.advance(4000)
  expect(await chartSource()).not.toContain('class="route')
})

test('a background subagent stays lit until its own turn ends', async ($, on) => {
  on('tool.call', () => ({
    result: { status: 'async_launched', agentId: 'bg-1', description: 'x', prompt: 'y' },
  }) as never)
  mock.store(on)
  mock.clock(on)
  on('classic.SubagentStop', () => ({}) as never)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const chartSource = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const chart = (await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined
    await ui.unmount()
    return chart?.props?.source ?? ''
  }

  await $.tool.call({ tool: 'Agent', description: 'x', prompt: 'y', model: 'haiku', effort: 'xhigh' })
  const launched = await chartSource()
  expect(launched).toContain('class="route command"')
  expect(launched).not.toContain('class="route report"')

  await $.classic.SubagentStop({ agent_id: 'bg-1', agent_type: 'general-purpose', agent_transcript_path: '', stop_hook_active: false } as never)
  const after = await chartSource()
  expect(after).toContain('class="route report"')
  expect(after).not.toContain('class="route command"')
})

test('a background Codex run stays lit until the session no longer lists it', async ($, on) => {
  on('tool.call', () => ({
    result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'shell-1' },
  }) as never)
  mock.store(on)
  mock.clock(on)
  on('classic.Stop', () => ({}) as never)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const chartSource = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const chart = (await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined
    await ui.unmount()
    return chart?.props?.source ?? ''
  }
  const stop = (ids: string[]) =>
    $.classic.Stop({ stop_hook_active: false, background_tasks: ids.map(id => ({ id, type: 'shell', status: 'running', description: '' })) } as never)

  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6.1-sol "x"', run_in_background: true } as never)
  expect(await chartSource()).toContain('class="route command"')

  await stop(['shell-1'])
  expect(await chartSource()).toContain('class="route command"')

  await stop([])
  const after = await chartSource()
  expect(after).toContain('class="route report"')
  expect(after).not.toContain('class="route command"')
})

test('each delegation gets a card under its call: who, from whom, and its status', async ($, on) => {
  on('tool.call', (_, e) =>
    (e as { tool?: string }).tool === 'Bash'
      ? ({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'shell-9' } }) as never
      : ({ result: {} }) as never,
  )
  mock.store(on)
  mock.clock(on)
  on('classic.Stop', () => ({}) as never)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })
  on('ui.render', { component: 'ToolGroup' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>Ran 3 commands</Text>
  })
  mock.env(on, { HOME: '/home/test' })
  on('fs.read', () => ({ value: '' }))
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const codex = { command: 'codex exec -m gpt-6.1-terra "count lines"', description: 'Count install.sh lines', run_in_background: true }
  await $.tool.call({ tool: 'Bash', tool_use_id: 'tu-codex', ...codex } as never)
  await $.tool.call({ tool: 'Agent', tool_use_id: 'tu-agent', description: 'Summarize README', prompt: 'x', model: 'haiku', effort: 'xhigh' } as never)

  const card = async (id: string, tool: string, input: unknown, surface: 'desktop' | 'terminal' | 'mobile' | 'vscode' = 'desktop') => {
    const ui = await $.ui.mount({
      plugin: 'crew',
      component: 'ToolUse',
      requestId: id,
      surface,
      props: { tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false },
    } as never)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => (t as { text?: string }).text ?? '')
    const svgs = (await ui.findAll({ type: 'Svg' })).map(s => (s as { props?: { source?: string } }).props?.source ?? '')
    await ui.unmount()
    return [...texts, ...svgs].join(' | ')
  }

  const working = await card('tu-codex', 'Bash', codex)
  expect(working).toContain('row')
  expect(working).toContain('Terra')
  expect(working).toContain('Count install.sh lines')
  expect(working).toContain('Working')
  // Two boxes: Opus gave it, Terra got it; a moving dot on the arrow while it works.
  expect(working).toContain('>Opus<')
  expect(working).toContain('>Terra<')
  expect(working).toContain('animateMotion')
  for (const surface of ['terminal', 'mobile', 'vscode'] as const) {
    expect(await card('tu-codex', 'Bash', codex, surface)).toContain('Terra')
  }
  expect(await card('tu-codex', 'Bash', codex, 'terminal')).toContain('assigned')

  await $.classic.Stop({ stop_hook_active: false, background_tasks: [] } as never)
  expect(await card('tu-codex', 'Bash', codex)).toContain('Reported')

  const agent = await card('tu-agent', 'Agent', { description: 'Summarize README', prompt: 'x', model: 'haiku' })
  expect(agent).toContain('Haiku')
  expect(agent).toContain('Reported')

  // A plain Bash call keeps its row and gets no card.
  const plain = await card('tu-ls', 'Bash', { command: 'ls -la' })
  expect(plain).toBe('row')

  // Folded into one "Ran 3 commands" line, the delegations still get their cards under it.
  const call = (id: string, tool: string, input: unknown) => ({ tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false })
  const group = async (isExpanded: boolean) => {
    const ui = await $.ui.mount({
      plugin: 'crew',
      component: 'ToolGroup',
      requestId: 'g-1',
      surface: 'desktop',
      props: { calls: [call('tu-codex', 'Bash', codex), call('tu-ls', 'Bash', { command: 'ls' }), call('tu-agent', 'Agent', { description: 'Summarize README', model: 'haiku' })], isActive: false, isExpanded },
    } as never)
    const texts = (await ui.findAll({ type: 'Text' })).map(t => (t as { text?: string }).text ?? '')
    const svgs = (await ui.findAll({ type: 'Svg' })).map(s => (s as { props?: { source?: string } }).props?.source ?? '')
    await ui.unmount()
    return [...texts, ...svgs].join(' | ')
  }
  const folded = await group(false)
  expect(folded).toContain('Ran 3 commands')
  expect(folded).toContain('Terra')
  expect(folded).toContain('Haiku')
  expect(await group(true)).toBe('Ran 3 commands')
})

test("the lead's card shows the session's live effort, not its saved one", async ($, on) => {
  mock.store(on)
  on('classic.Stop', () => ({}) as never)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const opusCard = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const src = ((await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined)?.props?.source ?? ''
    await ui.unmount()
    // The Opus card's text runs from its name to the next card's title.
    return src.slice(src.indexOf('>Opus<'), src.indexOf('>Astra<'))
  }
  expect(await opusCard()).toContain('>high<')

  // The session runs at medium: a main-thread event says so; a subagent's does not count.
  await $.classic.Stop({ stop_hook_active: false, agent_id: 'sub-1', effort: { level: 'low' } } as never)
  expect(await opusCard()).toContain('>high<')
  await $.classic.Stop({ stop_hook_active: false, effort: { level: 'medium' } } as never)
  const now = await opusCard()
  expect(now).toContain('>medium<')
  expect(now).not.toContain('>high<')
})

test('Opus asking Astra, side by side on the same tier, still lights a line between them', async ($, on) => {
  let during = ''
  let chartSource = async () => ''
  on('tool.call', async () => {
    during = await chartSource()
    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })
  mock.store(on)
  mock.clock(on)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  chartSource = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const chart = (await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined
    await ui.unmount()
    return chart?.props?.source ?? ''
  }
  await $.tool.call({ tool: 'Bash', command: 'codex exec -m gpt-6.2-astra "second opinion"' } as never)
  expect(during).toContain('class="route command"')
  expect(await chartSource()).toContain('class="route report"')
})

test('a Sonnet chat: its live effort goes on Sonnet, and edits stay in this chat until saved', async ($, on) => {
  const store: Record<string, unknown> = {}
  on('store.get', (_, e) => ({ value: store[(e as { key: string }).key] }) as never)
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    store[key] = value
    return { value: {} } as never
  })
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }) as never)
  mock.env(on, { HOME: '/home/test' })
  on('fs.read', () => ({ value: '' }))
  on('classic.Stop', () => ({}) as never)
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const savedBefore = JSON.stringify(store['members-v1'])

  const source = async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const src = ((await ui.find({ type: 'Svg' })) as { props?: { source?: string } } | undefined)?.props?.source ?? ''
    await ui.unmount()
    return src
  }
  const between = (src: string, a: string, b: string) => src.slice(src.indexOf(`>${a}<`), src.indexOf(`>${b}<`))

  await $.classic.Stop({ stop_hook_active: false, effort: { level: 'medium' } } as never)
  const src = await source()
  expect(between(src, 'Sonnet', 'Sol')).toContain('>medium<')
  expect(between(src, 'Opus', 'Astra')).toContain('>high<')

  // Pick Terra and set it to low: this chat changes, the saved defaults do not.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'pick-terra' })
  await ui.select({ key: 'effort-terra', value: 'low' })
  expect(await ui.find({ type: 'Text', text: /This chat only/ })).toBeTruthy()
  expect(JSON.stringify(store['members-v1'])).toBe(savedBefore)

  // Save as default: now the store has it.
  await ui.press({ key: 'save-default' })
  const saved = store['members-v1'] as { id: string; effort: string }[]
  expect(saved.find(m => m.id === 'terra')?.effort).toBe('low')
  expect(await ui.find({ type: 'Text', text: /Same as defaults/ })).toBeTruthy()
  await ui.unmount()
})

test('only the services in crew.json are guarded, shown and named in the rules', async ($, on) => {
  let reached = false
  on('classic.PreToolUse', () => {
    reached = true
    return {} as never
  })
  on('tool.call', () => ({ result: { ok: true } }))
  on('prompt.compose', () => ({ sections: [] }))
  mock.env(on, { HOME: '/home/test' })
  mock.store(on)
  on('fs.read', (_, e) => ({
    value: e.path.endsWith('/crew.json')
      ? JSON.stringify({ services: ['supabase'], codex: false, connectors: { 'test-supabase-id': 'supabase', 'test-shop-id': 'shopify' } })
      : '',
  }))
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const passes = async (tool: string, input: Record<string, unknown>) => {
    reached = false
    await $.tool.call({ tool, ...input } as never)
    return reached
  }
  // Supabase is chosen: a write stops to ask. Shopify is not: the crew leaves it to Claude Code.
  expect(await passes('mcp__test-supabase-id__execute_sql', { project_id: 'p', query: 'delete from t' })).toBe(false)
  expect(await passes('mcp__test-supabase-id__execute_sql', { project_id: 'p', query: 'select 1' })).toBe(true)
  expect(await passes('mcp__test-shop-id__update-product', { id: '1' })).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'perm-supabase' })).toBeTruthy()
  expect(await ui.find({ key: 'perm-shopify' })).toBeFalsy()
  expect(await ui.find({ type: 'Text', text: /Codex: read-only/ })).toBeFalsy()
  await ui.unmount()

  const { sections } = await $.prompt.compose({
    model: 'claude-opus-5-5',
    promptModel: 'claude-opus-5-5',
    surfaces: ['desktop'],
    tools: [],
    outputStyle: null,
    traits: [],
  } as never)
  const rules = sections.find(s => s.id === 'crew:routing')?.text ?? ''
  expect(rules).toContain('including Supabase.')
  expect(rules).toContain('Codex is not set up')
  expect(rules).not.toContain('Shopify')
})

test('two bosses: a saved crew loses Fable, Astra becomes Co-boss, and the rules say so', async ($, on) => {
  const old = [
    { id: 'fable', name: 'Fable', vendor: 'claude', model: 'claude-fable-5-2', tier: 0, effort: 'xhigh', badge: 'CTO', role: 'Expert' },
    { id: 'opus', name: 'Opus', vendor: 'claude', model: 'claude-opus-5-5', tier: 1, effort: 'high', badge: 'Boss', role: 'Plans, decides, final check' },
    { id: 'astra', name: 'Astra', vendor: 'codex', model: 'gpt-6.2-astra', tier: 1, effort: 'high', badge: 'Advisor', role: 'Second opinion when Opus asks' },
    { id: 'terra', name: 'Terra', vendor: 'codex', model: 'gpt-6.1-terra', tier: 3, effort: 'low', role: 'Clear, bounded tasks' },
  ]
  const store: Record<string, unknown> = { 'members-v1': old, 'juniors-xhigh': true, 'junior-roles': true, 'cto-astra': true }
  on('store.get', (_, e) => ({ value: store[(e as { key: string }).key] }) as never)
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    store[key] = value
    return { value: {} } as never
  })
  mock.env(on, { HOME: '/home/test' })
  on('fs.read', () => ({ value: '' }))
  on('prompt.compose', () => ({ sections: [] }))
  on('command.register', () => ({ value: { command: 'crew' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const saved = store['members-v1'] as { id: string; badge?: string; effort: string }[]
  expect(saved.some(m => m.id === 'fable')).toBe(false)
  expect(saved.find(m => m.id === 'astra')?.badge).toBe('Co-boss')
  expect(saved.find(m => m.id === 'terra')?.effort).toBe('low') // other edits kept

  const { sections } = await $.prompt.compose({ model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['desktop'], tools: [], outputStyle: null, traits: [] } as never)
  const rules = sections.find(s => s.id === 'crew:routing')?.text ?? ''
  expect(rules).toContain('Astra is the Co-boss')
  expect(rules).not.toContain('CTO')
  expect(rules).not.toContain('Fable')
})
