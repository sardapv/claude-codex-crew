import type { PermMode, Service } from '../types'

export const SERVICES: Service[] = ['shopify', 'posthog', 'supabase', 'cloudflare']
export const SERVICE_LABEL: Record<Service, string> = {
  shopify: 'Shopify',
  posthog: 'PostHog',
  supabase: 'Supabase',
  cloudflare: 'Cloudflare',
}
export const PERM_LABEL: Record<PermMode, string> = {
  reads: 'Reads auto, writes ask me',
  ask: 'Ask me for everything',
  all: 'Allow everything',
}
export const DEFAULT_PERMS: Record<Service, PermMode> = {
  shopify: 'reads',
  posthog: 'reads',
  supabase: 'reads',
  cloudflare: 'reads',
}

// Tool prefixes of the official plugins, the same on every account.
const PREFIXES: [RegExp, Service][] = [
  [/^mcp__plugin_posthog_posthog__/, 'posthog'],
  [/^mcp__plugin_cloudflare_cloudflare__/, 'cloudflare'],
]

/** Services Codex may only read: Crew guard (codex/crew-guard.py) blocks their writes. */
export const CODEX_GUARDED: Service[] = ['posthog', 'cloudflare']

export type CrewConfig = { services: Service[]; codex: boolean }
export const DEFAULT_CONFIG: CrewConfig = { services: [...SERVICES], codex: true }

/** Reads ~/.claude/crew.json: `services` (missing means all four), `codex` (missing means true). */
export function parseConfig(raw: unknown): CrewConfig {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const services = Array.isArray(o.services)
    ? SERVICES.filter(s => (o.services as unknown[]).includes(s))
    : [...SERVICES]
  return { services, codex: o.codex !== false }
}

/** Connector ids private to this account, from ~/.claude/crew.json "connectors" (never in the repo). */
let local: [string, Service][] = []

/** Loads `{ "<connector id>": "<service>" }`; entries naming an unknown service are skipped. */
export function setConnectors(map: unknown): number {
  const entries = typeof map === 'object' && map !== null ? Object.entries(map as Record<string, unknown>) : []
  local = entries.flatMap(([id, s]) =>
    typeof s === 'string' && (SERVICES as string[]).includes(s) ? [[`mcp__${id}__`, s as Service] as [string, Service]] : [],
  )
  return local.length
}

const serviceOf = (tool: string, server?: string): Service | undefined => {
  for (const [prefix, s] of local) if (tool.startsWith(prefix)) return s
  for (const [re, s] of PREFIXES) if (re.test(tool)) return s
  const hay = `${server ?? ''} ${tool}`.toLowerCase()
  return SERVICES.find(s => hay.includes(s))
}

const str = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v ?? ''))
const field = (input: unknown, key: string) =>
  typeof input === 'object' && input !== null ? (input as Record<string, unknown>)[key] : undefined

const SQL_WRITE = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|comment|vacuum|copy|call|do)\b/i
const HTTP_WRITE = /\bmethod\s*:\s*["'`](POST|PUT|PATCH|DELETE)\b|\.(create|update|delete|edit|put|post|patch|purge|remove|set)\s*\(/i
const POSTHOG_READ_CMD = /^\s*(learn|help|tools|search|info|schema)\b/
const POSTHOG_READ_TOOL = /(^query-|^execute-sql$|^read-data-schema$|^docs-search$|(^|-)(get|list|retrieve|get-all|search|info)$)/

/** Whether a call to one of the four services only reads. Unknown means write. */
function isRead(service: Service, tool: string, input: unknown): boolean {
  const name = tool.replace(/^mcp__.*?__/, '')
  switch (service) {
    case 'shopify':
      return /^(get|list|search|find|run-analytics-query|graphql_query|graphql_schema|generate|show|test|get_|search_)/.test(name)
    case 'supabase':
      if (/^(list_|get_|search_docs|generate_typescript_types)/.test(name)) return true
      if (name === 'execute_sql') return !SQL_WRITE.test(str(field(input, 'query')))
      return false
    case 'posthog': {
      if (name !== 'exec') return /^(get|list|query|search|read)/.test(name)
      const cmd = str(field(input, 'command'))
      if (POSTHOG_READ_CMD.test(cmd)) return true
      const called = /^\s*call\s+((?:--\w+\s+)*)([\w-]+)/.exec(cmd)
      if (!called || /--confirm/.test(called[1] ?? '')) return false
      return POSTHOG_READ_TOOL.test(called[2] ?? '')
    }
    case 'cloudflare':
      if (name !== 'execute') return /^(search|docs|whoami|list|get)/.test(name)
      return !HTTP_WRITE.test(str(field(input, 'code') ?? input))
  }
}

export type Verdict = { service: Service; isRead: boolean }

export function classify(tool: string, input: unknown, server?: string): Verdict | undefined {
  if (!tool.startsWith('mcp__')) return undefined
  const service = serviceOf(tool, server)
  return service ? { service, isRead: isRead(service, tool, input) } : undefined
}
