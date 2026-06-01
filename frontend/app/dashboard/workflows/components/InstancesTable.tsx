'use client'

import { useState } from 'react'
import { Icon } from '../../../components/ui/Icons'

interface Instance {
  id: string
  instance_id: string
  template_id: string
  template_version?: string
  connection_id?: string
  state: string
  section?: string
  status: string
  createdAt: string
  updatedAt?: string
}

interface Connection {
  id: string
  theirLabel?: string
  state?: string
}

interface InstancesTableProps {
  instances: Instance[]
  connections: Connection[]
  loading?: boolean
  activeInstanceId: string | null
  onOpen: (instanceId: string) => void
  devMode?: boolean
}

// Plain language state labels
const STATE_PLAIN: Record<string, string> = {
  'apply': 'Waiting for applicant',
  'pending_review': 'Awaiting your review',
  'issuing': 'Issuing credential',
  'done': 'Completed',
  'rejected': 'Rejected',
  'request_received': 'Request received',
  'presentation_sent': 'Proof submitted',
  'credential_offered': 'Credential offered',
  'credential_issued': 'Credential issued',
  'waiting_for_input': 'Needs input',
  'error': 'Error',
  'failed': 'Failed',
}

const STATES_NEEDING_ACTION = new Set(['pending_review', 'waiting_for_input', 'request_received'])

function getPlainState(state: string, devMode: boolean) {
  if (devMode) return state
  return STATE_PLAIN[state] || state.replace(/_/g, ' ')
}

function formatRelativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function getStateStyle(state: string, status: string): { dot: string; badge: string } {
  if (status === 'completed' || state === 'done') return { dot: 'var(--green)', badge: 'badge-success' }
  if (state.includes('fail') || state.includes('reject') || state.includes('error')) return { dot: 'var(--red)', badge: 'badge-error' }
  if (STATES_NEEDING_ACTION.has(state)) return { dot: 'var(--amber)', badge: 'badge-warning' }
  return { dot: 'var(--accent)', badge: 'badge-primary' }
}

// ── Active instance cards (shown at the top of the page) ─────────────────────

export function ActiveInstanceCards({
  instances,
  connections,
  activeInstanceId,
  onOpen,
  devMode = false,
}: {
  instances: Instance[]
  connections: Connection[]
  activeInstanceId: string | null
  onOpen: (id: string) => void
  devMode?: boolean
}) {
  const [showAllAction, setShowAllAction] = useState(false)

  const allActive = instances.filter(i => i.status === 'active')
  if (allActive.length === 0) return null

  const actionItems = allActive.filter(i => STATES_NEEDING_ACTION.has(i.state))
  const runningItems = allActive.filter(i => !STATES_NEEDING_ACTION.has(i.state))

  const visibleAction = showAllAction ? actionItems : actionItems.slice(0, 4)
  const hiddenActionCount = actionItems.length - visibleAction.length

  const getLabel = (connId?: string) => {
    if (!connId) return 'Unknown'
    const c = connections.find(c => c.id === connId)
    return c?.theirLabel || connId.slice(0, 8) + '…'
  }

  return (
    <div style={{ marginBottom: 24 }}>

      {/* ── Action-required cards ── */}
      {actionItems.length > 0 && (
        <div style={{ marginBottom: runningItems.length > 0 ? 10 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
              Needs Attention
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: 'oklch(0.85 0.14 70)', color: 'oklch(0.35 0.12 70)',
              padding: '1px 6px', borderRadius: 4, lineHeight: 1.6,
            }}>
              {actionItems.length}
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 10,
          }}>
            {visibleAction.map(inst => {
              const style = getStateStyle(inst.state, inst.status)
              const isOpen = inst.instance_id === activeInstanceId
              const label = getLabel(inst.connection_id)
              return (
                <div
                  key={inst.instance_id}
                  style={{
                    background: 'var(--bg-elev)',
                    border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '13px 14px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                    boxShadow: isOpen ? '0 0 0 1px var(--accent)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5, fontWeight: 600, color: 'var(--ink)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {inst.template_id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 1 }}>
                        with {label}
                      </div>
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                      background: 'oklch(0.85 0.14 70)', color: 'oklch(0.35 0.12 70)',
                      padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      Needs you
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: style.dot,
                      boxShadow: `0 0 0 3px ${style.dot}33`,
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                      {getPlainState(inst.state, devMode)}
                    </span>
                    {devMode && (
                      <span style={{ fontSize: 10, color: 'var(--ink-4)', fontFamily: 'var(--font-mono, monospace)', marginLeft: 2 }}>
                        ({inst.state})
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>
                      {formatRelativeTime(inst.updatedAt || inst.createdAt)}
                    </span>
                    <button
                      onClick={() => onOpen(inst.instance_id)}
                      className={`btn btn-xs ${isOpen ? 'btn-secondary' : 'btn-primary'}`}
                    >
                      {isOpen ? 'Viewing' : 'View'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {hiddenActionCount > 0 && (
            <button
              onClick={() => setShowAllAction(true)}
              className="filter-chip"
              style={{ marginTop: 8, fontSize: 11.5 }}
            >
              Show {hiddenActionCount} more needing attention
            </button>
          )}
        </div>
      )}

      {/* ── Running summary strip — compact, no card flood ── */}
      {runningItems.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '9px 14px',
          background: 'var(--bg-sunk)',
          borderRadius: 8,
          fontSize: 12.5,
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--accent)', flexShrink: 0,
          }} />
          <span style={{ color: 'var(--ink-3)' }}>
            <strong style={{ color: 'var(--ink-2)' }}>{runningItems.length}</strong>
            {' '}workflow{runningItems.length !== 1 ? 's' : ''} running
            {actionItems.length === 0 && (
              <span style={{ color: 'var(--ink-4)', marginLeft: 6 }}>· no action needed</span>
            )}
          </span>
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap', alignItems: 'center' }}>
            {runningItems.slice(0, 4).map(inst => (
              <button
                key={inst.instance_id}
                onClick={() => onOpen(inst.instance_id)}
                className={`btn btn-ghost btn-xs ${inst.instance_id === activeInstanceId ? 'btn-secondary' : ''}`}
                style={{ fontSize: 11 }}
              >
                {getLabel(inst.connection_id)}
              </button>
            ))}
            {runningItems.length > 4 && (
              <span style={{ fontSize: 11, color: 'var(--ink-4)', marginLeft: 2 }}>
                +{runningItems.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── History table ─────────────────────────────────────────────────────────────

export function InstancesTable({
  instances,
  connections,
  loading = false,
  activeInstanceId,
  onOpen,
  devMode = false,
}: InstancesTableProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  const getLabel = (connId?: string) => {
    if (!connId) return '—'
    const c = connections.find(c => c.id === connId)
    return c?.theirLabel || connId.slice(0, 8) + '…'
  }

  const filtered = instances.filter(i => {
    if (filter === 'active') return i.status === 'active'
    if (filter === 'completed') return i.status === 'completed' || i.state === 'done'
    return true
  })

  const activeCount = instances.filter(i => i.status === 'active').length
  const completedCount = instances.filter(i => i.status === 'completed' || i.state === 'done').length

  return (
    <div className="card" style={{ overflow: 'hidden', marginTop: 20 }}>
      <div className="card-header cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="template-icon">
            <Icon name="log" size={14} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>History</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 1 }}>
              {activeCount} active · {completedCount} completed
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-gray">{instances.length}</span>
          <Icon
            name="chevDown"
            size={14}
            style={{ color: 'var(--ink-4)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
          />
        </div>
      </div>

      {isExpanded && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Filter chips */}
          <div style={{ padding: '10px 16px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
            {(['all', 'active', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={(e) => { e.stopPropagation(); setFilter(f) }}
                className={`filter-chip ${filter === f ? 'active' : ''}`}
                style={{ fontSize: 11.5 }}
              >
                {f === 'all' ? `All (${instances.length})` : f === 'active' ? `Active (${activeCount})` : `Completed (${completedCount})`}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--ink-4)' }}>
              No {filter === 'all' ? '' : filter} instances yet.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Connection</th>
                    <th>Template</th>
                    <th>State</th>
                    <th>Updated</th>
                    <th style={{ textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inst => {
                    const s = getStateStyle(inst.state, inst.status)
                    const isActive = inst.instance_id === activeInstanceId
                    return (
                      <tr key={inst.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                            <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{getLabel(inst.connection_id)}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12.5, color: 'var(--ink)' }}>{inst.template_id}</div>
                          {devMode && inst.template_version && (
                            <div style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono, monospace)' }}>
                              v{inst.template_version}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${s.badge}`}>
                            {getPlainState(inst.state, devMode)}
                          </span>
                        </td>
                        <td style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
                          {formatRelativeTime(inst.updatedAt || inst.createdAt)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => onOpen(inst.instance_id)}
                            className={`btn btn-xs ${isActive ? 'btn-secondary' : 'btn-primary'}`}
                          >
                            {isActive ? 'Viewing' : 'Open'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
