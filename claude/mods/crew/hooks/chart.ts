import type { Effort, Member, Route, Vendor } from '../types'

export const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
export const TIER_NAMES: Record<number, string> = { 0: 'CTO', 1: 'Boss', 2: 'Lead', 3: 'Specialist', 4: 'Junior' }

const VENDOR: Record<Vendor, { color: string; label: string }> = {
  claude: { color: '#D97757', label: 'Claude' },
  codex: { color: '#3B8BD4', label: 'Codex' },
}

const EFFORT_COLOR: Record<Effort, string> = {
  low: '#9C9A92',
  medium: '#1D9E75',
  high: '#C98A1A',
  xhigh: '#D85A30',
  max: '#E24B4A',
}

/** Command: work going down to a member. Report: the result coming back up. */
const LIVE = '#22B07D'
const REPORT = '#5AA9F0'
const W = 520
const PAD = 16
const GAP = 12
const NODE_H = 108
const ROW_GAP = 44
const TOP = 58
const FONT = `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif`
const MONO = `'SF Mono', ui-monospace, Menlo, monospace`

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fit = (s: string, px: number, charPx: number) => {
  const max = Math.max(4, Math.floor(px / charPx))
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

// Up to two lines, broken at spaces; the second ends with an ellipsis if cut.
const wrap = (s: string, px: number, charPx: number) => {
  const max = Math.max(4, Math.floor(px / charPx))
  const lines: string[] = []
  let line = ''
  for (const word of s.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (next.length <= max) line = next
    else {
      if (line) lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines.length > 2 ? [lines[0]!, fit(lines.slice(1).join(' '), px, charPx)] : lines.map(l => fit(l, px, charPx))
}

type Placed = { m: Member; x: number; y: number; w: number; row: number }
type State = 'busy' | 'done' | undefined
type Pt = [number, number]

const mid = (p: Placed) => p.x + p.w / 2

function chipPill(x: number, y: number, w: number, color: string, label: string, pulse: boolean): string {
  return `<g>
    <rect x="${x + w - 88}" y="${y + 12}" width="76" height="18" rx="9" fill="${color}" fill-opacity="0.14"/>
    <circle cx="${x + w - 77}" cy="${y + 21}" r="3" fill="${color}"/>
    ${pulse
      ? `<circle cx="${x + w - 77}" cy="${y + 21}" r="3" fill="none" stroke="${color}" stroke-width="1.5">
          <animate attributeName="r" values="3;8" dur="1.4s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.8;0" dur="1.4s" repeatCount="indefinite"/>
        </circle>`
      : ''}
    <text x="${x + w - 69}" y="${y + 24.5}" class="chip" style="fill:${color}">${label}</text>
  </g>`
}

function node(p: Placed, state: State, isSelected: boolean): string {
  const { m, x, y, w } = p
  const v = VENDOR[m.vendor]
  const level = EFFORTS.indexOf(m.effort) + 1
  const ec = EFFORT_COLOR[m.effort]
  const tx = x + 50
  const pills = EFFORTS.map((_, i) => {
    const on = i < level
    return `<rect x="${x + 14 + i * 15}" y="${y + 63}" width="11" height="5" rx="2.5" ${on ? `fill="${ec}"` : 'class="off"'}/>`
  }).join('')

  // Activity rings are solid; the editing outline is thin and dashed so it never reads as activity.
  const ring =
    state === 'busy'
      ? `<rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${NODE_H + 2}" rx="15" fill="none" stroke="${LIVE}" stroke-width="2" filter="url(#soft)"/>`
      : state === 'done'
        ? `<rect x="${x - 1}" y="${y - 1}" width="${w + 2}" height="${NODE_H + 2}" rx="15" fill="none" stroke="${REPORT}" stroke-width="2" filter="url(#soft)"/>`
        : ''
  const editing = isSelected
    ? `<rect x="${x - 3.5}" y="${y - 3.5}" width="${w + 7}" height="${NODE_H + 7}" rx="17" fill="none" class="editing"/>`
    : ''

  const chip =
    state === 'busy'
      ? chipPill(x, y, w, LIVE, 'WORKING', true)
      : state === 'done'
        ? chipPill(x, y, w, REPORT, 'REPORTED', false)
        : `<text x="${x + w - 14}" y="${y + 25}" text-anchor="end" class="chip">${esc(m.badge ?? TIER_NAMES[m.tier] ?? `Tier ${m.tier}`)}</text>`

  return `<g class="node">
    <title>${esc(`${m.name} · ${v.label} · ${m.model} · effort ${m.effort}\n${m.role}`)}</title>
    <rect x="${x}" y="${y}" width="${w}" height="${NODE_H}" rx="14" class="card"/>
    <rect x="${x}" y="${y}" width="${w}" height="${NODE_H}" rx="14" fill="url(#tint-${m.vendor})"/>
    ${editing}
    ${ring}
    <circle cx="${x + 28}" cy="${y + 29}" r="15" fill="${v.color}" fill-opacity="0.16"/>
    <circle cx="${x + 28}" cy="${y + 29}" r="15" fill="none" stroke="${v.color}" stroke-opacity="0.45"/>
    <text x="${x + 28}" y="${y + 34}" text-anchor="middle" class="initial" style="fill:${v.color}">${esc(m.name.slice(0, 1))}</text>
    <text x="${tx}" y="${y + 26}" class="name">${esc(fit(m.name, w - 140, 8))}</text>
    <text x="${tx}" y="${y + 42}" class="model">${esc(fit(m.model, w - 64, 6.3))}</text>
    ${chip}
    <line x1="${x + 14}" x2="${x + w - 14}" y1="${y + 53}" y2="${y + 53}" class="rule"/>
    ${pills}
    <text x="${x + 14 + 5 * 15 + 6}" y="${y + 68.5}" class="effort" style="fill:${ec}">${m.effort}</text>
    ${wrap(m.role, w - 28, 5.4).map((line, i) => `<text x="${x + 14}" y="${y + 86 + i * 14}" class="role">${esc(line)}</text>`).join('')}
  </g>`
}

/** A down-then-across-then-down path with rounded corners, top to bottom. */
function elbow(px: number, y1: number, bus: number, cx: number, y2: number): string {
  const dx = cx - px
  if (Math.abs(dx) < 1) return `M${px} ${y1}V${y2}`
  const dir = Math.sign(dx)
  const r = Math.min(10, Math.abs(dx) / 2, bus - y1, y2 - bus)
  return `M${px} ${y1}V${bus - r}Q${px} ${bus} ${px + dir * r} ${bus}H${cx - dir * r}Q${cx} ${bus} ${cx} ${bus + r}V${y2}`
}

/** A path through the points, in their order, with rounded corners. */
function rounded(raw: Pt[]): string {
  const pts = raw.filter((p, i) => i === 0 || p[0] !== raw[i - 1]![0] || p[1] !== raw[i - 1]![1])
  if (pts.length < 2) return ''
  let d = `M${pts[0]![0]} ${pts[0]![1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1]!
    const [px, py] = pts[i]!
    const [bx, by] = pts[i + 1]!
    const l1 = Math.hypot(px - ax, py - ay)
    const l2 = Math.hypot(bx - px, by - py)
    const u1: Pt = [(px - ax) / l1, (py - ay) / l1]
    const u2: Pt = [(bx - px) / l2, (by - py) / l2]
    if (Math.abs(u1[0] * u2[1] - u1[1] * u2[0]) < 1e-6) continue // straight on
    const r = Math.min(10, l1 / 2, l2 / 2)
    d += `L${px - u1[0] * r} ${py - u1[1] * r}Q${px} ${py} ${px + u2[0] * r} ${py + u2[1] * r}`
  }
  const last = pts[pts.length - 1]!
  return `${d}L${last[0]} ${last[1]}`
}

/** The tree route from an upper member down to a lower one, passing behind the cards in between. */
function descent(upper: Placed, lower: Placed, rows: Placed[][]): Pt[] {
  const hops: Placed[] = [upper]
  for (let r = upper.row + 1; r < lower.row; r++) {
    const row = rows[r] ?? []
    if (row.length === 0) continue
    hops.push(row.reduce((a, b) => (Math.abs(mid(b) - mid(lower)) < Math.abs(mid(a) - mid(lower)) ? b : a)))
  }
  hops.push(lower)
  const pts: Pt[] = [[mid(upper), upper.y + NODE_H]]
  for (let i = 0; i < hops.length - 1; i++) {
    const u = hops[i]!
    const v = hops[i + 1]!
    const bus = u.y + NODE_H + ROW_GAP / 2
    pts.push([mid(u), bus], [mid(v), bus], [mid(v), v.y])
    if (i + 1 < hops.length - 1) pts.push([mid(v), v.y + NODE_H])
  }
  return pts
}

function traffic(from: Placed, to: Placed, rows: Placed[][], phase: Route['phase']): string {
  if (from.row === to.row) return ''
  const down = from.row < to.row ? descent(from, to, rows) : descent(to, from, rows).reverse()
  const pts = phase === 'command' ? down : [...down].reverse()
  const d = rounded(pts)
  const length = pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0)
  const dur = Math.max(1.2, length / 200).toFixed(2)
  const color = phase === 'command' ? LIVE : REPORT
  const dots = [0, 0.5]
    .map(
      f => `<circle r="3" fill="${color}" filter="url(#bloom)" opacity="0">
        <animateMotion dur="${dur}s" begin="${(f * Number(dur)).toFixed(2)}s" repeatCount="indefinite" path="${d}"/>
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="${dur}s" begin="${(f * Number(dur)).toFixed(2)}s" repeatCount="indefinite"/>
      </circle>`,
    )
    .join('')
  return `<g class="route ${phase}">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#soft)"/>
    ${dots}
  </g>`
}

/**
 * The crew as an org chart: one row per tier, still connectors. A line lights only
 * for real traffic: green with dots flowing down while a member works on a command,
 * blue with dots flowing back up for a moment when it reports.
 */
export function crewChart(
  list: Member[],
  busy: Record<string, number>,
  selectedId: string,
  routes: Record<string, Route> = {},
): { svg: string; width: number; height: number } {
  const tiers = [...new Set(list.map(m => m.tier))].sort((a, b) => a - b)
  const rows: Placed[][] = []
  let y = TOP

  tiers.forEach((t, r) => {
    const row = list.filter(m => m.tier === t)
    const w = Math.min(236, (W - 2 * PAD - (row.length - 1) * GAP) / row.length)
    const total = row.length * w + (row.length - 1) * GAP
    const x0 = (W - total) / 2
    rows.push(row.map((m, i) => ({ m, x: x0 + i * (w + GAP), y, w, row: r })))
    y += NODE_H + ROW_GAP
  })

  const placed = rows.flat()
  const byId = new Map(placed.map(p => [p.m.id, p]))
  const isBusy = (p: Placed) => (busy[p.m.id] ?? 0) > 0
  const stateOf = (p: Placed): State => (isBusy(p) ? 'busy' : routes[p.m.id]?.phase === 'report' ? 'done' : undefined)

  const base: string[] = []
  rows.slice(1).forEach((row, i) => {
    const parents = rows[i] ?? []
    if (parents.length === 0) return
    const top = parents[0]!.y + NODE_H
    const bus = top + ROW_GAP / 2
    for (const c of row) for (const p of parents) base.push(elbow(mid(p), top, bus, mid(c), c.y))
  })

  const live = Object.entries(routes)
    .map(([to, r]) => {
      const a = byId.get(r.from)
      const b = byId.get(to)
      return a && b ? traffic(a, b, rows, r.phase) : ''
    })
    .join('')

  const claude = list.filter(m => m.vendor === 'claude').length
  const working = placed.filter(isBusy).length
  const reporting = placed.filter(p => stateOf(p) === 'done').length
  const legendY = y - ROW_GAP + 30
  const height = legendY + 12

  const pill = (x: number, w: number, color: string, label: string) =>
    `<rect x="${x}" y="14" width="${w}" height="22" rx="11" fill="${color}" fill-opacity="0.14"/>
     <circle cx="${x + 13}" cy="25" r="3.5" fill="${color}"/>
     <text x="${x + 22}" y="29" class="pill" style="fill:${color}">${label}</text>`
  let px = W - PAD
  const pills: string[] = []
  if (working) {
    const label = `${working} working`
    const w = 32 + label.length * 6.2
    px -= w
    pills.push(pill(px, w, LIVE, label))
  }
  if (reporting) {
    const label = `${reporting} reported`
    const w = 32 + label.length * 6.2
    px -= w + (pills.length ? 8 : 0)
    pills.push(pill(px, w, REPORT, label))
  }
  const status = pills.length
    ? pills.join('')
    : `<rect x="${W - PAD - 58}" y="14" width="58" height="22" rx="11" class="idle"/>
       <text x="${W - PAD - 29}" y="29" text-anchor="middle" class="pill muted">Idle</text>`

  const legend = [
    { c: VENDOR.claude.color, t: 'Claude' },
    { c: VENDOR.codex.color, t: 'Codex' },
    { c: LIVE, t: 'Command' },
    { c: REPORT, t: 'Report back' },
  ]
  let lx = PAD
  const legendSvg = legend.map(l => {
    const out = `<circle cx="${lx + 4}" cy="${legendY - 4}" r="4" fill="${l.c}"/><text x="${lx + 13}" y="${legendY}" class="head">${l.t}</text>`
    lx += 13 + l.t.length * 6.2 + 18
    return out
  }).join('')

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img">
  <defs>
    <linearGradient id="tint-claude" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${VENDOR.claude.color}" stop-opacity="0.07"/>
      <stop offset="0.55" stop-color="${VENDOR.claude.color}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="tint-codex" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${VENDOR.codex.color}" stop-opacity="0.07"/>
      <stop offset="0.55" stop-color="${VENDOR.codex.color}" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="bloom" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <style>
    text { font-family: ${FONT}; }
    .card { fill: #FFFFFF; stroke: #E6E3DA; stroke-width: 1; filter: drop-shadow(0 1px 2px rgba(31,30,29,0.06)) drop-shadow(0 4px 12px rgba(31,30,29,0.05)); }
    .name { font-size: 14px; font-weight: 650; fill: #1F1E1D; letter-spacing: -0.01em; }
    .initial { font-size: 14px; font-weight: 700; }
    .model { font-family: ${MONO}; font-size: 10.5px; fill: #7A786F; }
    .role { font-size: 11px; fill: #8A8880; }
    .effort { font-size: 11px; font-weight: 650; }
    .chip { font-size: 9.5px; font-weight: 650; letter-spacing: 0.08em; text-transform: uppercase; fill: #A3A198; }
    .rule { stroke: #EFEDE6; stroke-width: 1; }
    .off { fill: #ECEAE3; }
    .link { fill: none; stroke: #DEDBD1; stroke-width: 1.25; }
    .editing { stroke: #9C9A92; stroke-width: 1; stroke-dasharray: 4 4; }
    .head { font-size: 11px; fill: #8A8880; }
    .title { font-size: 15px; font-weight: 700; fill: #1F1E1D; letter-spacing: -0.01em; }
    .pill { font-size: 11px; font-weight: 600; }
    .muted { fill: #8A8880; }
    .idle { fill: #EFEDE6; }
    .node:hover .card { stroke: #C9C6BB; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #2B2A28; stroke: #3A3936; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35)) drop-shadow(0 6px 16px rgba(0,0,0,0.25)); }
      .name, .title { fill: #F3F2EE; }
      .model { fill: #A9A79F; }
      .role { fill: #8F8D86; }
      .chip { fill: #7D7B75; }
      .rule { stroke: #353432; }
      .off { fill: #3D3C39; }
      .link { stroke: #3E3D3A; }
      .editing { stroke: #6E6C66; }
      .head, .muted { fill: #8F8D86; }
      .idle { fill: #353432; }
      .node:hover .card { stroke: #55534E; }
    }
    @media (prefers-reduced-motion: reduce) {
      .route circle { display: none; }
    }
  </style>
  <text x="${PAD}" y="25" class="title">Your crew</text>
  <text x="${PAD}" y="42" class="head">${list.length} members &#183; ${claude} Claude &#183; ${list.length - claude} Codex</text>
  ${status}
  <path d="${base.join('')}" class="link"/>
  ${live}
  ${placed.map(p => node(p, stateOf(p), p.m.id === selectedId)).join('')}
  ${legendSvg}
</svg>`

  return { svg, width: W, height }
}

export type Handoff = { phase: 'working' | 'reported' | 'failed' | 'interrupted'; secs?: number }

/**
 * The transcript card for one delegation: the member who gave the task on the left, the member
 * who got it on the right, a green arrow for the command and, once done, a blue arrow back.
 */
export function handoffCard(from: Member, to: Member, task: string, state: Handoff) {
  const CW = 600
  const H = 116
  const NW = 182
  const NY = 14
  const NH = 64
  const lx = 14
  const rx = CW - 14 - NW
  const a1 = lx + NW + 10
  const a2 = rx - 10
  const cx = (a1 + a2) / 2
  const done = state.phase === 'reported'
  const bad = state.phase === 'failed' || state.phase === 'interrupted'
  const back = done ? REPORT : bad ? '#E24B4A' : undefined
  const label = done
    ? `Reported${state.secs ? ` · ${state.secs}s` : ''}`
    : state.phase === 'failed' ? 'Failed' : state.phase === 'interrupted' ? 'Interrupted' : 'Working'

  const box = (m: Member, x: number, active: boolean) => {
    const v = VENDOR[m.vendor]
    const tier = m.badge ?? TIER_NAMES[m.tier] ?? `Tier ${m.tier}`
    return `<g>
      <title>${esc(`${m.name} · ${v.label} · ${tier} · ${m.model} · effort ${m.effort}`)}</title>
      <rect x="${x}" y="${NY}" width="${NW}" height="${NH}" rx="12" class="box"/>
      <rect x="${x}" y="${NY}" width="${NW}" height="${NH}" rx="12" fill="none" stroke="${v.color}" stroke-opacity="${active ? 0.9 : 0.35}" stroke-width="${active ? 1.5 : 1}"/>
      <circle cx="${x + 26}" cy="${NY + 32}" r="14" fill="${v.color}" fill-opacity="0.16"/>
      <circle cx="${x + 26}" cy="${NY + 32}" r="14" fill="none" stroke="${v.color}" stroke-opacity="0.45"/>
      <text x="${x + 26}" y="${NY + 37}" text-anchor="middle" class="initial" style="fill:${v.color}">${esc(m.name.slice(0, 1))}</text>
      <text x="${x + 48}" y="${NY + 24}" class="name">${esc(fit(m.name, NW - 56 - 52, 8))}</text>
      <text x="${x + NW - 12}" y="${NY + 24}" text-anchor="end" class="tag" style="fill:${EFFORT_COLOR[m.effort]}">${m.effort}</text>
      <text x="${x + 48}" y="${NY + 39}" class="meta">${esc(fit(`${tier} · ${v.label}`, NW - 60, 5.8))}</text>
      <text x="${x + 48}" y="${NY + 53}" class="model">${esc(fit(m.model, NW - 60, 6.3))}</text>
    </g>`
  }

  const out = `M${a1},38 L${a2},38`
  const command = `<g>
    <line x1="${a1}" y1="38" x2="${a2 - 2}" y2="38" stroke="${LIVE}" stroke-width="2" stroke-linecap="round"/>
    <path d="M${a2 - 8},33 L${a2},38 L${a2 - 8},43" fill="none" stroke="${LIVE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${cx}" y="29" text-anchor="middle" class="tag" style="fill:${LIVE}">Assigned</text>
    ${state.phase === 'working'
      ? `<circle r="3.5" fill="${LIVE}" class="dot"><animateMotion dur="1.4s" repeatCount="indefinite" path="${out}"/></circle>`
      : ''}
  </g>`
  const report = back
    ? `<g>
        <line x1="${a2}" y1="58" x2="${a1 + 2}" y2="58" stroke="${back}" stroke-width="2" stroke-linecap="round"/>
        <path d="M${a1 + 8},53 L${a1},58 L${a1 + 8},63" fill="none" stroke="${back}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="${cx}" y="76" text-anchor="middle" class="tag" style="fill:${back}">${esc(label)}</text>
      </g>`
    : `<g>
        <line x1="${a2}" y1="58" x2="${a1}" y2="58" class="pending"/>
        <text x="${cx}" y="76" text-anchor="middle" class="tag" style="fill:${LIVE}">${label}</text>
      </g>`

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${H}" viewBox="0 0 ${CW} ${H}" role="img">
  <style>
    text { font-family: ${FONT}; }
    .card { fill: #FFFFFF; stroke: #E6E3DA; stroke-width: 1; }
    .box { fill: #FAF9F5; }
    .name { font-size: 13.5px; font-weight: 650; fill: #1F1E1D; }
    .initial { font-size: 13px; font-weight: 700; }
    .meta { font-size: 10.5px; fill: #8A8880; }
    .model { font-family: ${MONO}; font-size: 10px; fill: #8A8880; }
    .tag { font-size: 11px; font-weight: 650; }
    .label { font-size: 11px; fill: #8A8880; }
    .task { font-size: 12.5px; fill: #1F1E1D; }
    .pending { stroke: #DEDBD1; stroke-width: 1.5; stroke-dasharray: 3 5; }
    @media (prefers-color-scheme: dark) {
      .card { fill: #262624; stroke: #3A3936; }
      .box { fill: #2E2D2B; }
      .name, .task { fill: #F3F2EE; }
      .meta, .model, .label { fill: #A9A79F; }
      .pending { stroke: #4A4945; }
    }
    @media (prefers-reduced-motion: reduce) { .dot { display: none; } }
  </style>
  <rect x="0.5" y="0.5" width="${CW - 1}" height="${H - 1}" rx="14" class="card"/>
  ${box(from, lx, false)}
  ${box(to, rx, true)}
  ${command}
  ${report}
  <text x="${lx}" y="${H - 16}" class="label">Task</text>
  <text x="${lx + 36}" y="${H - 16}" class="task">${esc(fit(task, CW - lx * 2 - 36, 6.6))}</text>
</svg>`
  return { svg, width: CW, height: H }
}

/** One line per member, for the terminal. */
export const meter = (effort: Effort) => {
  const n = EFFORTS.indexOf(effort) + 1
  return '▮'.repeat(n) + '▯'.repeat(EFFORTS.length - n)
}
