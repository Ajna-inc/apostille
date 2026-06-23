export function prettify(id: string) {
  return (id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function parseVersionRank(version: string) {
  if (!version) return 0
  return version.split('.').reduce((acc, part, i) => acc + (parseInt(part, 10) || 0) * Math.pow(1000, 2 - i), 0)
}

export function relativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export const STATES_NEEDING_ACTION = new Set(['pending_review', 'waiting_for_input', 'request_received'])

export function safeMediaSrc(src: unknown): string | undefined {
  if (!src || typeof src !== 'string') return undefined
  const lower = src.trim().toLowerCase()
  if (lower.startsWith('javascript:') || lower.startsWith('data:text') || lower.startsWith('vbscript:')) return undefined
  return src
}

export function wfGetAt(obj: any, path: string[]): any {
  return path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj)
}

export function wfSetAt(obj: any, path: string[], value: any): any {
  const next = { ...(obj || {}) }
  let current: any = next
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    current[key] = { ...(current[key] || {}) }
    current = current[key]
  }
  current[path[path.length - 1]] = value
  return next
}
