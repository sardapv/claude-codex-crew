import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { Effort, Member, PermMode, Route, Service, Vendor } from '../types'

import { crewChart, EFFORTS, meter, TIER_NAMES } from './chart'
import {
  classify,
  CODEX_GUARDED,
  type CrewConfig,
  DEFAULT_CONFIG,
  DEFAULT_PERMS,
  parseConfig,
  PERM_LABEL,
  SERVICE_LABEL,
  setConnectors,
} from './permissions'

const PERMS_KEY = 'perms-v1'
const lead = atom({ plugin: 'crew', key: 'lead' } as const, '')
const perms = atom({ plugin: 'crew', key: 'perms' } as const, DEFAULT_PERMS)
const config = atom({ plugin: 'crew', key: 'config' } as const, DEFAULT_CONFIG)

/** Reads ~/.claude/crew.json (services, codex, connectors); the old crew-connectors.json still counts for ids. */
async function loadConfig($: EngineInterface): Promise<void> {
  const home = await $.env.get('HOME')
  const json = async (path: string): Promise<unknown> => {
    const text = await $.fs.read(path).catch(() => '')
    try { return text ? JSON.parse(text) : undefined } catch { return undefined }
  }
  const crew = home ? await json(`${home}/.claude/crew.json`) : undefined
  const legacy = home ? await json(`${home}/.claude/crew-connectors.json`) : undefined
  const connectors = (crew as { connectors?: unknown } | undefined)?.connectors
  setConnectors({ ...(typeof legacy === 'object' ? legacy : {}), ...(typeof connectors === 'object' ? connectors : {}) })
  await update($, config, () => parseConfig(crew))
}

const PANE = 'crew'
const STORE_KEY = 'members-v1'

const FABLE: Member = { id: 'fable', name: 'Fable', vendor: 'claude', model: 'claude-fable-5-2', tier: 0, effort: 'xhigh', badge: 'CTO', role: 'Expert, only when Opus and Astra both fail' }
const ASTRA: Member = { id: 'astra', name: 'Astra', vendor: 'codex', model: 'gpt-6.2-astra', tier: 1, effort: 'high', badge: 'Advisor', role: 'Second opinion when Opus asks' }

const DEFAULTS: Member[] = [
  FABLE,
  { id: 'opus', name: 'Opus', vendor: 'claude', model: 'claude-opus-5-5', tier: 1, effort: 'high', badge: 'Boss', role: 'Plans, decides, final check' },
  ASTRA,
  { id: 'sonnet', name: 'Sonnet', vendor: 'claude', model: 'claude-sonnet-5-5', tier: 2, effort: 'high', role: 'Builds, analyses, reviews juniors' },
  { id: 'sol', name: 'Sol', vendor: 'codex', model: 'gpt-6.1-sol', tier: 2, effort: 'high', role: 'Builds and plans with Opus' },
  { id: 'terra', name: 'Terra', vendor: 'codex', model: 'gpt-6.1-terra', tier: 3, effort: 'medium', role: 'Clear, bounded tasks' },
  { id: 'luna', name: 'Luna', vendor: 'codex', model: 'gpt-6-luna', tier: 4, effort: 'xhigh', role: 'Zero-judgment chores only' },
  { id: 'haiku', name: 'Haiku', vendor: 'claude', model: 'claude-haiku-5-5', tier: 4, effort: 'xhigh', role: 'Zero-judgment chores only' },
]

const MODELS: Record<Vendor, string[]> = {
  claude: ['claude-opus-5-5', 'claude-fable-5-2', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  codex: ['gpt-6.2-sol', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6.2-astra', 'gpt-6.1-terra', 'gpt-5.6-terra', 'gpt-6-luna', 'gpt-5.6-luna'],
}

const TIERS: Record<number, string> = { 0: 'CTO', 1: 'Boss', 2: 'Leads', 3: 'Specialist', 4: 'Juniors' }
const VENDOR_COLOR: Record<Vendor, string> = { claude: '#D97757', codex: '#3B8BD4' }
const VENDOR_LABEL: Record<Vendor, string> = { claude: 'Claude', codex: 'Codex' }
const EFFORT_COLOR: Record<Effort, string> = {
  low: '#888780',
  medium: '#1D9E75',
  high: '#BA7517',
  xhigh: '#D85A30',
  max: '#E24B4A',
}

const members = atom({ plugin: 'crew', key: 'members' } as const, DEFAULTS, { shape: 'members-1' })
const selected = atom({ plugin: 'crew', key: 'selected' } as const, '')
const active = atom({ plugin: 'crew', key: 'active' } as const, {} as Record<string, number>)
const confirmReset = atom({ plugin: 'crew', key: 'confirmReset' } as const, false)
const routes = atom({ plugin: 'crew', key: 'routes' } as const, {} as Record<string, Route>)
const agents = atom({ plugin: 'crew', key: 'agents' } as const, {} as Record<string, { member: string; running: boolean }>)

/** How long a finished member's report-back line stays lit. */
const REPORT_MS = 3500

const EFFORT_HINT: Record<Effort, string> = {
  low: 'Low · quick and cheapest',
  medium: 'Medium · balanced',
  high: 'High · careful',
  xhigh: 'Extra high · deepest thinking',
  max: 'Max · no limit',
}

const isMember = (m: unknown): m is Member =>
  typeof m === 'object' && m !== null &&
  typeof (m as Member).id === 'string' &&
  typeof (m as Member).model === 'string' &&
  EFFORTS.includes((m as Member).effort)

// Agent tool model aliases: 'opus', 'sonnet', 'haiku', 'fable'.
const memberForAlias = (list: Member[], alias: string) =>
  list.find(m => m.vendor === 'claude' && m.model.includes(alias))

// Only a real invocation: `codex exec` at the start of a command or right after
// `&&`, `;`, `|` or `cd ... &&`, never the words inside a string or a heredoc.
const CODEX_EXEC = /(?:^|&&|;|\|\|?)\s*codex\s+(exec|e)\b/
const CODEX_MODEL = /(?:^|\s)(?:-m|--model)[=\s]+["']?([\w.-]+)/

const memberForCodex = (list: Member[], command: string) => {
  const model = CODEX_MODEL.exec(command)?.[1]
  const codex = list.filter(m => m.vendor === 'codex')
  return model
    ? codex.find(m => m.model === model)
    : codex.find(m => m.id === 'sol') ?? codex[0]
}

const names = (list: Service[]) => {
  const l = list.map(s => SERVICE_LABEL[s])
  return l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`
}

/** Rule 6, written from the services and Codex setup in ~/.claude/crew.json. */
const toolsRule = (cfg: CrewConfig) => {
  if (cfg.services.length === 0) return '6. Tools. Claude members inherit this session\'s connections. No services are set up for the crew.'
  const parts = [`6. Tools. Claude members inherit this session's connections, including ${names(cfg.services)}.`]
  if (!cfg.codex) {
    parts.push('Codex is not set up on this machine: do not delegate to Codex members; give their work to the Claude member of the same tier, or the next tier up.')
    return parts.join(' ')
  }
  parts.push('Codex members reach them through their own Codex plugins and connectors.')
  const guarded = cfg.services.filter(s => CODEX_GUARDED.includes(s))
  if (guarded.length > 0) {
    parts.push(`For Codex, ${names(guarded)} ${guarded.length > 1 ? 'are' : 'is'} read-only: a Codex hook, Crew guard, blocks every call there that may change data. Send ${names(guarded)} writes to a Claude member, where the user is asked.`)
  }
  if (guarded.includes('posthog')) {
    parts.push('In a Codex brief for PostHog, spell the command as `call <tool> {json}` with a `context` argument, or the guard cannot tell it reads and blocks it.')
  }
  return parts.join(' ')
}

const routingText = (list: Member[], cfg: CrewConfig = DEFAULT_CONFIG) => {
  const sorted = [...list].sort((a, b) => a.tier - b.tier)
  const roster = sorted
    .map(m => `- Tier ${m.tier} ${m.badge ?? TIERS[m.tier] ?? ''}: ${m.name} (${VENDOR_LABEL[m.vendor]}, ${m.model}, effort ${m.effort}). ${m.role}.`)
    .join('\n')
  return [
    '# Crew: the user\'s AI team',
    'The user works with a fixed team spread over one Claude and one Codex subscription. Use it to save cost, never at the cost of quality. The user has asked that delegated work run at the efforts listed here.',
    roster,
    'Rules:',
    '1. Chain of command. The tier-1 Boss plans, makes hard decisions and gives the final check. The tier-1 Advisor gives a second opinion when the Boss asks for one (a risky design call, a stubborn bug, a plan worth challenging). The tier-0 CTO is the last resort: call it only when the Boss and the Advisor have both tried and failed, or disagree on a hard problem, and say why before calling it. Never send routine work to the CTO.',
    '2. Route the rest by difficulty: mid-level work to tier 2, clear bounded work to tier 3. Tier 4 (the juniors) gets only zero-judgment chores: work whose every step and exact output you already know, so there is nothing to decide and no mistake that would matter. Examples: fill a template you wrote, rename or move files you listed, reformat text, run a command you wrote word for word, list or count what you named. If a task needs any choice (which file, which query, which approach, what a result means), or a mistake would cost something, it goes to tier 3 or higher. When unsure, it is not a junior task.',
    '3. Quality first. Junior output (tiers 3-4) never counts until a tier-2 or higher member has checked it. Risky, ambiguous or security-sensitive work never goes below tier 2. A failed task goes up a tier, never down.',
    '4. Juniors forget context: give them a short, complete brief with the goal, exact steps, files, what done looks like and what not to touch.',
    '5. Spread the load: send work Codex can do to Codex members, so Claude usage goes to work only Claude does well.',
    toolsRule(cfg),
    '7. Claude members: the Agent tool, always passing both `model` (the member\'s alias) and `effort` (the member\'s effort) explicitly, so nothing has to fill them in. Codex members: Bash, `codex exec --skip-git-repo-check -m <model> -c model_reasoning_effort=<effort> "<brief>"`, in a folder of its own when it writes files.',
    '8. Before each delegation, tell the user in one line which member gets it and at what effort.',
    '9. If you are a delegated worker yourself, ignore these routing rules and do your brief.',
  ].join('\n\n')
}

/** A member starts work: it lights up, with a command line from whoever leads this turn. */
async function begin($: EngineInterface, id: string): Promise<void> {
  // The commander is whoever leads this turn (the session's own model), else the Boss.
  const from = (await read($, lead)) || 'opus'
  await update($, active, a => ({ ...a, [id]: (a[id] ?? 0) + 1 }))
  await update($, routes, r => ({ ...r, [id]: { from, phase: 'command' as const, at: Date.now() } }))
}

/** A member hands its work back: once nothing else of its runs, a report line shows for a moment. */
async function finish($: EngineInterface, id: string): Promise<void> {
  await update($, active, a => ({ ...a, [id]: Math.max(0, (a[id] ?? 1) - 1) }))
  if (((await read($, active))[id] ?? 0) > 0) return
  const at = Date.now()
  await update($, routes, r => ({ ...r, [id]: { from: r[id]?.from || 'opus', phase: 'report' as const, at } }))
  $.clock.after(REPORT_MS, () => {
    void clearReport($, id, at)
  })
}


/**
 * A Claude subagent call. One that runs in the foreground is done when the call returns;
 * one sent to the background is done only when its own turn ends, so it stays lit till then.
 */
/** Prefix of a background shell task's key in `agents`, beside subagent ids. */
const SHELL = 'shell:'

/** Ends every background shell the session no longer lists as in flight. */
async function settleShells($: EngineInterface, inFlight: readonly { id: string }[] | undefined): Promise<void> {
  if (!inFlight) return
  const live = new Set(inFlight.map(t => t.id))
  const all = await read($, agents)
  for (const [key, entry] of Object.entries(all)) {
    if (key.startsWith(SHELL) && entry.running && !live.has(key.slice(SHELL.length))) await agentTurn($, key, false)
  }
}

async function delegate<T>($: EngineInterface, id: string | undefined, run: () => Promise<T>): Promise<T> {
  if (!id) return run()
  await begin($, id)
  let out: T
  try {
    out = await run()
  } catch (err) {
    await finish($, id)
    throw err
  }
  const res = (out as { result?: { status?: string; agentId?: string; backgroundTaskId?: string } } | undefined)?.result
  if (res?.status === 'async_launched' && res.agentId) {
    const agentId = res.agentId
    await update($, agents, a => ({ ...a, [agentId]: { member: id, running: true } }))
  } else if (res?.backgroundTaskId) {
    // A background shell (a Codex member run with run_in_background): lit until the task leaves the session's list.
    const key = `${SHELL}${res.backgroundTaskId}`
    await update($, agents, a => ({ ...a, [key]: { member: id, running: true } }))
  } else {
    await finish($, id)
  }
  return out
}

/** A background subagent's own turn started (a follow-up) or ended (it reported). */
async function agentTurn($: EngineInterface, agentId: string | undefined, running: boolean): Promise<void> {
  if (!agentId) return
  const entry = (await read($, agents))[agentId]
  if (!entry || entry.running === running) return
  await update($, agents, a => ({ ...a, [agentId]: { ...entry, running } }))
  if (running) await begin($, entry.member)
  else await finish($, entry.member)
}

/** Ends a report-back line, unless newer work has lit it again since. */
async function clearReport($: EngineInterface, id: string, at: number): Promise<void> {
  await update($, routes, r => {
    if (r[id]?.phase !== 'report' || r[id]?.at !== at) return r
    const { [id]: _, ...rest } = r
    return rest
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // This person's services, Codex setup and connector ids live outside the mod, in ~/.claude/crew.json.
    await loadConfig($)
    const saved = await $.store.get(STORE_KEY)
    if (Array.isArray(saved) && saved.length > 0 && saved.every(isMember)) {
      await update($, members, () => saved as Member[])
    }
    // One-time move of juniors to xhigh, keeping every other edit.
    if (!(await $.store.get('juniors-xhigh'))) {
      await update($, members, l => l.map(m => (m.id === 'luna' || m.id === 'haiku' ? { ...m, effort: 'xhigh' as const } : m)))
      await $.store.set(STORE_KEY, await read($, members))
      await $.store.set('juniors-xhigh', true)
    }
    // One-time rewording of the juniors' role, unless the person changed it.
    if (!(await $.store.get('junior-roles'))) {
      await update($, members, l => l.map(m => ((m.id === 'luna' || m.id === 'haiku') && m.role === 'Cheap tasks, exact steps only' ? { ...m, role: 'Zero-judgment chores only' } : m)))
      await $.store.set(STORE_KEY, await read($, members))
      await $.store.set('junior-roles', true)
    }
    // One-time addition of the CTO and the Advisor, keeping every other edit.
    if (!(await $.store.get('cto-astra'))) {
      await update($, members, l => {
        const withBadge = l.map(m => (m.id === 'opus' && !m.badge ? { ...m, badge: 'Boss', role: m.role.replace(/^Boss: ?/, '') } : m))
        const has = (id: string) => withBadge.some(m => m.id === id)
        const out = has('fable') ? withBadge : [FABLE, ...withBadge]
        if (has('astra')) return out
        const at = out.findIndex(m => m.id === 'opus')
        return at < 0 ? [...out, ASTRA] : [...out.slice(0, at + 1), ASTRA, ...out.slice(at + 1)]
      })
      await $.store.set(STORE_KEY, await read($, members))
      await $.store.set('cto-astra', true)
    }
    const savedPerms = await $.store.get(PERMS_KEY)
    if (savedPerms && typeof savedPerms === 'object') {
      await update($, perms, p => ({ ...p, ...(savedPerms as Partial<Record<Service, PermMode>>) }))
    }
    await update($, active, () => ({}))
    await update($, routes, () => ({}))
    await update($, agents, () => ({}))
    await update($, lead, () => '')
    await $.command.register({ name: 'crew', description: 'Show and edit your AI crew' })
    void $.ui.open({ id: PANE, title: 'Crew' })

    return next(e)
  })

  on('command.run', { command: 'crew' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Crew' })
    return { text: 'Crew pane opened.' }
  })

  // The routing rules, rebuilt from the current crew for each new thread.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const list = await read($, members)
    return {
      sections: [
        ...composed.sections,
        { id: 'crew:routing', text: routingText(list, await read($, config)), scope: 'session' as const },
      ],
    }
  })

  // The boss is the session itself: lit while its own turn runs.
  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      const model = await $.session.model()
      const list = await read($, members)
      const boss = list.find(m => m.vendor === 'claude' && model.includes(m.model.replace(/^claude-/, '')))
      await update($, lead, () => boss?.id ?? '')
    } else await agentTurn($, e.agentId, true)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    if (!agentId) await update($, lead, () => '')
    else await agentTurn($, agentId, false)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.abort', async ($, e, next) => {
    const agentId = (e as { agentId?: string }).agentId
    if (!agentId) await update($, lead, () => '')
    else await agentTurn($, agentId, false)
    return next(e)
  }).catch(($, e, next) => next(e))

  // A subagent ended: the same signal again, from the classic hook (harmless if both arrive).
  on('classic.SubagentStop', async ($, e, next) => {
    await agentTurn($, (e as { agent_id?: string }).agent_id, false)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Shopify, PostHog, Supabase, Cloudflare: reads pass, writes ask the person, per the panel.
  on('classic.PreToolUse', async ($, e, next) => {
    const raw = e as unknown as { tool?: string; tool_name?: string; tool_input?: unknown; mcp_server?: { name?: string } }
    const verdict = classify(raw.tool_name ?? raw.tool ?? '', raw.tool_input ?? e, raw.mcp_server?.name)
    // A service this person did not choose is left to Claude Code's own permission rules.
    if (!verdict || !(await read($, config)).services.includes(verdict.service)) return next(e)
    const mode = (await read($, perms))[verdict.service] ?? 'reads'
    if (mode === 'all' || (mode === 'reads' && verdict.isRead)) return next(e)
    const what = verdict.isRead ? 'call' : 'change'
    return { ask: `Crew: this ${SERVICE_LABEL[verdict.service]} ${what} needs your OK (${PERM_LABEL[mode].toLowerCase()}).` }
  }).catch(($, e, next) => next(e))

  // Claude subagents: fill in the crew's effort when none was given, and light up the member.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const list = await read($, members)
    const member = e.model ? memberForAlias(list, e.model) : undefined
    const call = member && !e.effort ? { ...e, effort: member.effort } : e
    return delegate($, member?.id, () => next(call))
  }).catch(($, e, next) => next(e))

  // Codex workers: add the crew's effort when the command sets none, and light up the member.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!CODEX_EXEC.test(e.command)) return next(e)
    const list = await read($, members)
    const member = memberForCodex(list, e.command)
    const command =
      member && !e.command.includes('model_reasoning_effort')
        ? e.command.replace(CODEX_EXEC, m => `${m} -c model_reasoning_effort=${member.effort}`)
        : e.command
    return delegate($, member?.id, () => next({ ...e, command }))
  }).catch(($, e, next) => next(e))

  // A turn ended: background Codex runs that finished since are reported back.
  on('classic.Stop', async ($, e, next) => {
    await settleShells($, (e as { background_tasks?: { id: string }[] }).background_tasks)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Select } = $.ui.resolve(e)
    const list = await read($, members)
    const chosen = await read($, selected)
    const counts = await read($, active)
    const leadId = await read($, lead)
    const access = await read($, perms)
    const busy = leadId ? { ...counts, [leadId]: (counts[leadId] ?? 0) + 1 } : counts
    const target = list.find(m => m.id === chosen) ?? list[0]
    const setPerm = async (s: Service, mode: PermMode) => {
      await update($, perms, p => ({ ...p, [s]: mode }))
      await $.store.set(PERMS_KEY, await read($, perms))
    }

    const save = async (fn: (l: Member[]) => Member[]) => {
      await update($, members, fn)
      await $.store.set(STORE_KEY, await read($, members))
    }
    const setMember = (id: string, patch: Partial<Member>) =>
      save(l => l.map(m => (m.id === id ? { ...m, ...patch } : m)))

    const sorted = [...list].sort((a, b) => a.tier - b.tier)

    const alt = sorted.map(m => `${TIER_NAMES[m.tier] ?? ''} ${m.name}: ${m.model}, effort ${m.effort}`).join('; ')
    let chart
    if (e.surface === 'terminal') {
      chart = (
        <Box flexDirection="column">
          {sorted.map(m => (
            <Text>
              <Text dimColor>{(TIER_NAMES[m.tier] ?? '').padEnd(11)}</Text>
              <Text bold color={VENDOR_COLOR[m.vendor]}>{m.name.padEnd(8)}</Text>
              <Text dimColor>{m.model.padEnd(19)}</Text>
              <Text color={EFFORT_COLOR[m.effort]}>{meter(m.effort)} {m.effort}</Text>
              {(busy[m.id] ?? 0) > 0 && <Text color="success"> {'\u25CF'} working</Text>}
            </Text>
          ))}
        </Box>
      )
    } else {
      const { Svg } = $.ui.resolve(e)
      const drawn = crewChart(list, busy, target?.id ?? '', await read($, routes))
      chart = <Svg source={drawn.svg} alt={alt} width={drawn.width} height={drawn.height} />
    }

    const confirming = await read($, confirmReset)
    const cfg = await read($, config)
    const mine = cfg.services
    const guarded = cfg.codex ? mine.filter(s => CODEX_GUARDED.includes(s)) : []
    const safe = mine.filter(s => (access[s] ?? 'reads') !== 'all').length
    const custom = mine.some(s => (access[s] ?? 'reads') !== 'reads')

    // One titled card: a rounded border, a header with an optional status on the right.
    const card = (key: string, title: string, subtitle: string, status: { text: string; color: string } | undefined, body: RenderChildren) => (
      <Box key={key} flexDirection="column" gap="sm" padding="md" marginX="sm" borderStyle="round" borderDimColor>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text weight="semibold">{title}</Text>
          {status && <Text size="caption" weight="semibold" color={status.color}>{status.text}</Text>}
        </Box>
        <Text size="footnote" dimColor>{subtitle}</Text>
        {body}
      </Box>
    )

    const editor = target && card(
      'edit',
      'Edit a member',
      'Pick someone, then tune them. Changes save instantly and apply to the next delegation.',
      { text: '✓ Saved', color: 'success' },
      <Box flexDirection="column" gap="sm">
        <Box flexDirection="row" flexWrap="wrap" gap="xs">
          {sorted.map(m => (
            <Button
              key={`pick-${m.id}`}
              label={m.name}
              variant={m.id === target.id ? 'primary' : 'secondary'}
              onPress={() => update($, selected, () => m.id)}
            />
          ))}
        </Box>
        <Box flexDirection="column" gap="xs" paddingX="sm" paddingY="xs" borderStyle="round" borderColor={VENDOR_COLOR[target.vendor]}>
          <Text>
            <Text bold color={VENDOR_COLOR[target.vendor]}>{'● '}{target.name}</Text>
            <Text dimColor>{`  ${VENDOR_LABEL[target.vendor]} · ${target.badge ?? TIER_NAMES[target.tier] ?? ''}`}</Text>
            {(busy[target.id] ?? 0) > 0 && <Text color="success">{'  ● working'}</Text>}
          </Text>
          <Text size="footnote" dimColor>{target.role}</Text>
        </Box>
        <Select
          key={`effort-${target.id}`}
          label="Effort"
          value={target.effort}
          options={EFFORTS.map(v => ({ value: v, label: EFFORT_HINT[v] }))}
          onSelect={v => setMember(target.id, { effort: v as Effort })}
        />
        <Select
          key={`model-${target.id}`}
          label="Model"
          value={target.model}
          options={MODELS[target.vendor].map(v => ({ value: v }))}
          onSelect={v => setMember(target.id, { model: v })}
        />
        <Select
          key={`tier-${target.id}`}
          label="Tier"
          value={String(target.tier)}
          options={[0, 1, 2, 3, 4].map(n => ({ value: String(n), label: `${n} · ${TIER_NAMES[n]}` }))}
          onSelect={v => setMember(target.id, { tier: Number(v) })}
        />
        {confirming ? (
          <Box flexDirection="row" justifyContent="space-between" alignItems="center" gap="sm">
            <Text size="footnote" color="warning">Reset all {list.length} members to the defaults?</Text>
            <Box flexDirection="row" gap="xs">
              <Button key="reset-cancel" variant="secondary" label="Cancel" onPress={() => update($, confirmReset, () => false)} />
              <Button
                key="reset-yes"
                variant="primary"
                label="Reset crew"
                onPress={async () => {
                  await save(() => DEFAULTS)
                  await update($, confirmReset, () => false)
                }}
              />
            </Box>
          </Box>
        ) : (
          <Box flexDirection="row" justifyContent="flex-end">
            <Button key="reset" plain dimColor label="Reset crew to defaults" onPress={() => update($, confirmReset, () => true)} />
          </Box>
        )}
      </Box>,
    )

    const access_ = card(
      'access',
      'Service access',
      'What the crew may do in each service without asking you. Applies to every Claude member right away.',
      mine.length === 0
        ? undefined
        : custom
          ? { text: `Custom · ${safe}/${mine.length} guarded`, color: 'warning' }
          : { text: '✓ Recommended', color: 'success' },
      <Box flexDirection="column" gap="sm">
        {mine.length === 0 && (
          <Text size="footnote" dimColor>
            No services chosen. Run install.sh again, or list them under "services" in ~/.claude/crew.json.
          </Text>
        )}
        {mine.map(s => (
          <Select
            key={`perm-${s}`}
            label={SERVICE_LABEL[s]}
            value={access[s] ?? 'reads'}
            options={(['reads', 'ask', 'all'] as const).map(m => ({ value: m, label: PERM_LABEL[m] }))}
            onSelect={v => setPerm(s, v as PermMode)}
          />
        ))}
        {guarded.length > 0 && (
          <Box flexDirection="column" gap="xs" paddingX="sm" paddingY="xs" borderStyle="round" borderDimColor>
            <Text size="footnote" weight="semibold">{`\u{1F6E1} Codex: read-only for ${names(guarded)}`}</Text>
            <Text size="footnote" dimColor>
              Crew guard blocks every Codex write there. Those changes come back to a Claude member, where you are asked.
            </Text>
          </Box>
        )}
      </Box>,
    )

    return (
      <Box flexDirection="column" gap="md" paddingBottom="md">
        {chart}
        {editor}
        {access_}
      </Box>
    )
  })
}
