'use client'

interface Connection {
  id: string
  theirLabel?: string
  state?: string
}

interface ConnectionSelectorProps {
  connections: Connection[]
  selectedConnectionId: string
  onConnectionChange: (id: string) => void
  disabled?: boolean
}

export function ConnectionSelector({
  connections,
  selectedConnectionId,
  onConnectionChange,
  disabled = false,
}: ConnectionSelectorProps) {
  const selectedConn = connections.find(c => c.id === selectedConnectionId)
  const isCompleted = selectedConn?.state === 'completed' || selectedConn?.state === 'complete'

  if (connections.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>No connections yet —</span>
        <a href="/dashboard/connections" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>
          create one first
        </a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
        Run workflow with
      </span>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          width: 7, height: 7, borderRadius: '50%', pointerEvents: 'none',
          background: isCompleted ? 'var(--green)' : 'var(--ink-4)',
        }} />
        <select
          value={selectedConnectionId}
          onChange={(e) => onConnectionChange(e.target.value)}
          disabled={disabled}
          className="input"
          style={{ paddingLeft: 26, paddingRight: 28, height: 34, minWidth: 180, fontSize: 13 }}
        >
          <option value="">Select a connection…</option>
          {[...connections]
            .sort((a, b) => (a.theirLabel || '').localeCompare(b.theirLabel || ''))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.theirLabel || 'Unknown Peer'}
              </option>
            ))}
        </select>
      </div>
    </div>
  )
}

// Keep backward-compat export
export function ConnectionContextBar(props: any) {
  return (
    <ConnectionSelector
      connections={props.connections}
      selectedConnectionId={props.selectedConnectionId}
      onConnectionChange={props.onConnectionChange}
    />
  )
}
