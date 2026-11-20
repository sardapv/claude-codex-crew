export type Vendor = 'claude' | 'codex'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type Service = 'shopify' | 'posthog' | 'supabase' | 'cloudflare'
export type PermMode = 'reads' | 'ask' | 'all'

export type Member = {
  id: string
  name: string
  vendor: Vendor
  model: string
  tier: number
  effort: Effort
  role: string
  badge?: string
}

/** A live line on the chart: `from` gave `to` work (command), or `to` just handed it back (report). */
export type Route = { from: string; phase: 'command' | 'report'; at: number }

declare module 'claude-code' {
  interface PluginState {
    crew: {
      members: Shaped<Member[]>
      selected: string
      active: Record<string, number>
      lead: string
      perms: Record<Service, PermMode>
      confirmReset: boolean
      routes: Record<string, Route>
      /** Background subagents by agent id: which member, and whether it is working now. */
      agents: Record<string, { member: string; running: boolean }>
      /** From ~/.claude/crew.json: the services this person uses, and whether Codex is set up. */
      config: { services: Service[]; codex: boolean }
    }
  }
}
