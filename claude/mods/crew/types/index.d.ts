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

/** One delegation, keyed by its tool call: drawn as a card under the call in the transcript. */
export type Call = { member: string; task: string; from: string; start: number; end?: number }

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
      agents: Record<string, { member: string; running: boolean; useId?: string }>
      /** The session's own live effort, read from its hook events; '' until one arrives. */
      leadEffort: Effort | ''
      /** This chat's own member id: the Claude member whose model the chat runs. */
      boss: string
      /** True once this chat's crew or service access differs from the saved defaults. */
      chatOnly: boolean
      /** Delegations by tool_use_id, for the cards in the transcript. */
      calls: Record<string, Call>
      /** From ~/.claude/crew.json: the services this person uses, and whether Codex is set up. */
      config: { services: Service[]; codex: boolean }
    }
  }
}
