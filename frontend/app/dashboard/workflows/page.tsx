'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { workflowApi, connectionApi, credentialDefinitionApi } from '@/lib/api'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../../components/ui/Icons'
import { runtimeConfig } from '@/lib/runtimeConfig'
import {
  WorkflowProvider,
  UiProfileProvider,
  useWorkflowStatus,
} from '@ajna-inc/workflow-react'

import { PRESET_TEMPLATES } from './presetTemplates'

// ============================================================================
// TYPES
// ============================================================================

interface TemplateListItem {
  id: string; template_id: string; version: string; title: string; createdAt: string; hash?: string
}
interface Instance {
  id: string; instance_id: string; template_id: string; template_version?: string
  connection_id?: string; state: string; section?: string; status: string
  createdAt: string; updatedAt?: string
}
type SelectedItem =
  | { type: 'instance'; instanceId: string }
  | { type: 'template'; template: any; idx: number }
  | { type: 'picker' }

// ============================================================================
// HELPERS
// ============================================================================

const STATES_NEEDING_ACTION = new Set(['pending_review', 'waiting_for_input', 'request_received'])
const WORKFLOW_CONNECTION_STORAGE_KEY = 'workflows.selectedConnectionId'

const AV_PALETTES = [
  { bg: 'oklch(0.55 0.2 250)', color: 'white' },
  { bg: 'oklch(0.55 0.18 155)', color: 'white' },
  { bg: 'oklch(0.70 0.17 75)', color: 'white' },
  { bg: 'oklch(0.50 0.22 295)', color: 'white' },
  { bg: 'oklch(0.58 0.16 30)', color: 'white' },
]

function avPalette(id: string) {
  let h = 0; for (const c of (id || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return AV_PALETTES[h % AV_PALETTES.length]
}

function getInitials(label: string): string {
  const words = (label || '').replace(/[—–\-]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (label || '??').slice(0, 2).toUpperCase()
}

function Avatar({ label, id, size = 36 }: { label: string; id: string; size?: number }) {
  const { bg, color } = avPalette(id)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: bg, color,
      display: 'grid', placeItems: 'center',
      fontSize: Math.round(size * 0.33), fontWeight: 600,
      flexShrink: 0, letterSpacing: '-0.02em', userSelect: 'none',
    }}>
      {getInitials(label)}
    </div>
  )
}

function prettify(id: string) {
  return (id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function relativeTime(dateString: string) {
  const diff = Date.now() - new Date(dateString).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 172_800_000) return 'yesterday'
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const TONE_STYLES = [
  { bg: 'oklch(0.94 0.06 250)', color: 'var(--accent-ink)' },
  { bg: 'oklch(0.94 0.06 155)', color: 'var(--green-ink)' },
  { bg: 'oklch(0.96 0.06 75)', color: 'var(--amber-ink)' },
  { bg: 'oklch(0.94 0.06 295)', color: 'var(--violet-ink)' },
]
function toneStyle(idx: number) { return TONE_STYLES[idx % 4] }

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function WorkflowsPage() {
  const { token } = useAuth()
  const baseUrl = runtimeConfig.API_URL
  return (
    <WorkflowProvider baseUrl={baseUrl} token={token || undefined}>
      <UiProfileProvider initial={undefined}>
        <WorkflowsHub />
      </UiProfileProvider>
    </WorkflowProvider>
  )
}

// ============================================================================
// HUB
// ============================================================================

function WorkflowsHub() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const q = (searchParams.get('q') ?? '').trim().toLowerCase()

  const [connections, setConnections] = useState<{ id: string; theirLabel?: string; state?: string }[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(() => {
    if (typeof window !== 'undefined') return window.localStorage.getItem(WORKFLOW_CONNECTION_STORAGE_KEY) || ''
    return ''
  })
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [instances, setInstances] = useState<Instance[]>([])
  const [loadingInstances, setLoadingInstances] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: 'picker' })
  const [startingTemplateId, setStartingTemplateId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const hasAutoSelected = useRef(false)

  // ── Active instance status ─────────────────────────────────────────────────
  const activeInstanceId = selectedItem.type === 'instance' ? selectedItem.instanceId : null
  const { status: instanceStatus, loading: statusLoading, refresh: refreshStatus } = useWorkflowStatus(
    activeInstanceId || undefined, { includeActions: true }
  )

  const activeTemplate = useMemo(() => {
    const status = instanceStatus as any
    if (!status?.template_id) return null
    return PRESET_TEMPLATES.find(p => p.template_id === status.template_id) || null
  }, [(instanceStatus as any)?.template_id])

  const activeConnectionLabel = useMemo(() => {
    if (!activeInstanceId) return undefined
    const inst = instances.find(i => i.instance_id === activeInstanceId)
    if (!inst?.connection_id) return undefined
    const conn = connections.find(c => c.id === inst.connection_id)
    return conn?.theirLabel || undefined
  }, [activeInstanceId, instances, connections])

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadConnections = useCallback(async () => {
    if (!isAuthenticated) return
    try { const res = await connectionApi.getAll(); setConnections(res.connections ?? []) }
    catch { /* ignore */ }
  }, [isAuthenticated])

  const loadTemplates = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingTemplates(true)
    try { const res = await workflowApi.listTemplates(); setTemplates(res.templates ?? []) }
    catch { /* ignore */ }
    finally { setLoadingTemplates(false) }
  }, [isAuthenticated])

  const loadInstances = useCallback(async () => {
    if (!isAuthenticated) return
    setLoadingInstances(true)
    try { const res = await workflowApi.listInstances(undefined); setInstances(res.instances ?? []) }
    catch { /* ignore */ }
    finally { setLoadingInstances(false) }
  }, [isAuthenticated])

  useEffect(() => {
    loadConnections(); loadTemplates(); loadInstances()
  }, [isAuthenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedConnectionId) return
    window.localStorage.setItem(WORKFLOW_CONNECTION_STORAGE_KEY, selectedConnectionId)
  }, [selectedConnectionId])

  // ── Computed groups ────────────────────────────────────────────────────────

  const matchesQ = (id: string) => !q || prettify(id).toLowerCase().includes(q) || id.toLowerCase().includes(q)
  const actionInstances = instances.filter(i => i.status === 'active' && STATES_NEEDING_ACTION.has(i.state) && matchesQ(i.template_id))
  const runningInstances = instances.filter(i => i.status === 'active' && !STATES_NEEDING_ACTION.has(i.state) && matchesQ(i.template_id))
  const doneInstances = instances.filter(i => (i.status === 'completed' || i.state === 'done') && matchesQ(i.template_id))

  const allTemplates = useMemo(() => {
    // Presets keyed by template_id (no duplicates among built-ins)
    const presetMap = new Map<string, any>()
    for (const p of PRESET_TEMPLATES) presetMap.set(p.template_id, p)
    // User templates keyed by their unique API id — never collide with presets
    const userMap = new Map<string, any>()
    for (const t of templates) userMap.set(t.id, t)
    const all = [...presetMap.values(), ...userMap.values()]
    return q ? all.filter(t => (t.title || t.template_id).toLowerCase().includes(q)) : all
  }, [templates, q])

  // Auto-select first action/running instance on load
  useEffect(() => {
    if (hasAutoSelected.current || loadingInstances) return
    if (actionInstances.length > 0) {
      setSelectedItem({ type: 'instance', instanceId: actionInstances[0].instance_id })
      hasAutoSelected.current = true
    } else if (runningInstances.length > 0) {
      setSelectedItem({ type: 'instance', instanceId: runningInstances[0].instance_id })
      hasAutoSelected.current = true
    }
  }, [actionInstances, runningInstances, loadingInstances])

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateTemplateCredDefs = useCallback(async (template: any): Promise<string | null> => {
    const ids: Array<{ profileId: string; credDefId: string }> = []
    const collectIds = (profiles: Record<string, any>) => {
      Object.entries(profiles).forEach(([pid, p]) => {
        const cid = (p as any)?.cred_def_id
        if (typeof cid === 'string') ids.push({ profileId: pid, credDefId: cid })
      })
    }
    collectIds(template?.catalog?.credential_profiles || {})
    collectIds(template?.catalog?.proof_profiles || {})
    if (ids.length === 0) return null
    const res = await credentialDefinitionApi.getAll()
    const valid = new Set((res?.credentialDefinitions || []).map((cd: any) => cd.credentialDefinitionId).filter(Boolean))
    const bad = ids.filter(({ credDefId }) => !credDefId.trim() || credDefId.startsWith('REPLACE_WITH_') || !valid.has(credDefId))
    return bad.length ? `Invalid credential definition ID(s): ${bad.map(p => `${p.profileId}: ${p.credDefId || '(empty)'}`).join(', ')}.` : null
  }, [])

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleStartWorkflow = async (template: any) => {
    if (!selectedConnectionId) { setError('Select a connection first'); return }
    setStartingTemplateId(template.template_id); setError(null)
    try {
      let resolved = template; let published = false
      const entry = templates.find(t => t.template_id === template.template_id)
      if (entry) {
        try { const r = await workflowApi.getTemplate(entry.template_id, entry.version); if (r?.template) { resolved = r.template; published = true } } catch { /* ignore */ }
      }
      const verr = await validateTemplateCredDefs(resolved)
      if (verr) { setError(verr); return }
      if (!published) {
        const full = PRESET_TEMPLATES.find(p => p.template_id === template.template_id)
        if (full) { try { await workflowApi.publish(full) } catch { /* ignore */ } }
      }
      let participants: Record<string, { did: string }> | undefined
      try { const c = await connectionApi.getById(selectedConnectionId); const did = c?.connection?.theirDid; if (did) participants = { holder: { did } } } catch { /* ignore */ }
      const resp = await workflowApi.start({
        template_id: resolved.template_id, template_version: resolved.version,
        connection_id: selectedConnectionId, ...(participants ? { participants } : {}),
      })
      const instId = resp?.instance?.instance_id
      if (instId) {
        setSelectedItem({ type: 'instance', instanceId: instId })
        await loadInstances()
        setSuccess('Workflow started'); setTimeout(() => setSuccess(null), 3000)
      }
    } catch (err) { setError((err as Error).message || 'Failed to start workflow') }
    finally { setStartingTemplateId(null) }
  }

  const handleAdvance = async (event: string, input?: any) => {
    if (!activeInstanceId) return; setError(null)
    try {
      if (selectedConnectionId && (instanceStatus as any)?.template_id) {
        try { await workflowApi.ensureTemplate({ connection_id: selectedConnectionId, template_id: (instanceStatus as any).template_id, template_version: (instanceStatus as any).template_version, waitMs: 6000 }) } catch { /* ignore */ }
      }
      await workflowApi.advance({ instance_id: activeInstanceId, event, input, idempotency_key: `ui:${event}:${activeInstanceId}:${Date.now()}` })
      await refreshStatus()
    } catch (err) { setError((err as Error).message || 'Advance failed') }
  }

  const handleEditInDesigner = async (template: any) => {
    let full = template
    if (!template.states) {
      try { const r = await workflowApi.getTemplate(template.template_id, template.version); if (r?.template) full = r.template }
      catch { const p = PRESET_TEMPLATES.find(p => p.template_id === template.template_id); if (p) full = p }
    }
    if (typeof window !== 'undefined') sessionStorage.setItem('workflows.designerTemplate', JSON.stringify(full))
    router.push('/dashboard/workflows-designer')
  }

  const handleEnsure = async (template: any) => {
    if (!selectedConnectionId) { setError('Select a connection first'); return }
    setError(null)
    try {
      await workflowApi.ensureTemplate({ connection_id: selectedConnectionId, template_id: template.template_id, template_version: template.version, waitMs: 6000 })
      setSuccess('Template synced to peer'); setTimeout(() => setSuccess(null), 3000)
    } catch (err) { setError((err as Error).message || 'Failed to sync') }
  }

  const handleRefresh = async () => { await Promise.all([loadTemplates(), loadInstances()]) }

  // Keyboard shortcut: N → open picker
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return
      if (e.key === 'n' || e.key === 'N') setSelectedItem({ type: 'picker' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  const isPicker = selectedItem.type === 'picker'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '-28px -32px -80px', minHeight: 'calc(100vh - 60px)' }}>

      {/* Alerts */}
      {(error || success) && (
        <div style={{ padding: '12px 32px 0', flexShrink: 0 }}>
          {error && (
            <div className="alert alert-error" style={{ marginBottom: 8 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} className="btn btn-ghost btn-icon btn-sm"><Icon name="close" size={14} /></button>
            </div>
          )}
          {success && <div className="alert alert-success" style={{ marginBottom: 8 }}><span>{success}</span></div>}
        </div>
      )}

      {/* Hub */}
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', flex: 1, minHeight: 0, borderTop: '1px solid var(--border)' }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Hub top */}
          <div style={{ padding: '14px 20px 12px', background: 'var(--bg-elev)', flexShrink: 0 }}>
            <button
              onClick={() => setSelectedItem({ type: 'picker' })}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', border: `1px solid var(--accent)`,
                background: isPicker ? 'var(--accent)' : 'var(--accent)',
                color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '-0.005em',
                boxShadow: isPicker ? '0 0 0 3px oklch(0.55 0.15 250 / 0.22)' : 'none',
                transition: 'filter 0.1s',
              }}
            >
              <span style={{ display: 'grid', placeItems: 'center', color: 'white', opacity: 0.95, flexShrink: 0 }}>
                <Icon name="plus" size={14} />
              </span>
              <span style={{ flex: 1, textAlign: 'left' }}>New workflow</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, padding: '1px 6px', background: 'rgba(255,255,255,0.18)', borderRadius: 4, fontWeight: 500, opacity: 0.85 }}>N</span>
            </button>
          </div>

          {/* Scrollable list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 14px' }}>
            {loadingInstances ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <div className="spinner" style={{ width: 20, height: 20 }} />
              </div>
            ) : (
              <>
                {actionInstances.length > 0 && (
                  <>
                    <HubSectionHeader label="Needs you" count={actionInstances.length} />
                    {actionInstances.map(inst => (
                      <HubInstanceRow
                        key={inst.instance_id} inst={inst} connections={connections}
                        selected={selectedItem.type === 'instance' && selectedItem.instanceId === inst.instance_id}
                        onSelect={() => setSelectedItem({ type: 'instance', instanceId: inst.instance_id })}
                        needsAction
                      />
                    ))}
                  </>
                )}

                {runningInstances.length > 0 && (
                  <>
                    <HubSectionHeader label="In progress" count={runningInstances.length} />
                    {runningInstances.map(inst => (
                      <HubInstanceRow
                        key={inst.instance_id} inst={inst} connections={connections}
                        selected={selectedItem.type === 'instance' && selectedItem.instanceId === inst.instance_id}
                        onSelect={() => setSelectedItem({ type: 'instance', instanceId: inst.instance_id })}
                      />
                    ))}
                  </>
                )}

                {doneInstances.length > 0 && (
                  <>
                    <HubSectionHeader label="Recently done" count={doneInstances.length} />
                    {doneInstances.map(inst => (
                      <HubInstanceRow
                        key={inst.instance_id} inst={inst} connections={connections}
                        selected={selectedItem.type === 'instance' && selectedItem.instanceId === inst.instance_id}
                        onSelect={() => setSelectedItem({ type: 'instance', instanceId: inst.instance_id })}
                        isDone
                      />
                    ))}
                    <div style={{ padding: '8px 20px 4px' }}>
                      <button onClick={handleRefresh} style={{ fontSize: 11.5, color: 'var(--ink-4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent-ink)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}>
                        View all completed →
                      </button>
                    </div>
                  </>
                )}

                {instances.length === 0 && !loadingInstances && (
                  <div style={{ padding: '20px 20px 8px', fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>
                    No active workflows. Click <b style={{ color: 'var(--ink-2)' }}>New workflow</b> to get started.
                  </div>
                )}

                {/* Divider */}
                <div style={{ margin: '14px 20px 8px', height: 1, background: 'var(--border)' }} />

                {/* Templates in sidebar */}
                {allTemplates.length > 0 && (
                  <>
                    <HubSectionHeader label="Templates" count={allTemplates.length} />
                    {loadingTemplates ? (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
                        <div className="spinner" style={{ width: 16, height: 16 }} />
                      </div>
                    ) : allTemplates.map((t, idx) => (
                      <HubTemplateRow
                        key={t.template_id} template={t} idx={idx}
                        selected={selectedItem.type === 'template' && (selectedItem as any).template?.template_id === t.template_id}
                        onSelect={() => setSelectedItem({ type: 'template', template: t, idx })}
                      />
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ overflowY: 'auto', background: 'var(--bg)' }}>
          {selectedItem.type === 'picker' && (
            <TemplatePicker
              templates={allTemplates}
              onPick={(t, idx) => setSelectedItem({ type: 'template', template: t, idx })}
              onCompose={() => { if (typeof window !== 'undefined') sessionStorage.removeItem('workflows.designerTemplate'); router.push('/dashboard/workflows-designer') }}
            />
          )}
          {selectedItem.type === 'template' && (
            <TemplatePreviewPanel
              template={(selectedItem as any).template}
              idx={(selectedItem as any).idx}
              connections={connections}
              selectedConnectionId={selectedConnectionId}
              onConnectionChange={setSelectedConnectionId}
              onStart={handleStartWorkflow}
              onEnsure={handleEnsure}
              onEditInDesigner={handleEditInDesigner}
              startingTemplateId={startingTemplateId}
            />
          )}
          {selectedItem.type === 'instance' && (
            <InstanceThreadView
              instanceStatus={instanceStatus}
              template={activeTemplate}
              connectionLabel={activeConnectionLabel}
              onAdvance={handleAdvance}
              onRefresh={refreshStatus}
              loading={statusLoading}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LEFT PANEL COMPONENTS
// ============================================================================

function HubSectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 8px', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
      <span>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-5)', fontWeight: 400 }}>{count}</span>
    </div>
  )
}

function HubInstanceRow({ inst, connections, selected, onSelect, needsAction, isDone }: {
  inst: Instance; connections: { id: string; theirLabel?: string }[]
  selected: boolean; onSelect: () => void; needsAction?: boolean; isDone?: boolean
}) {
  const conn = connections.find(c => c.id === inst.connection_id)
  const label = conn?.theirLabel || inst.connection_id || 'Unknown'
  const stateLabel = needsAction ? 'Needs you' : isDone ? 'Done' : inst.state.replace(/_/g, ' ')
  const borderCol = needsAction ? 'var(--amber)' : isDone ? 'var(--green)' : 'var(--accent)'
  const selBg = needsAction ? 'var(--amber-soft)' : 'var(--accent-soft)'
  const labelColor = selected && needsAction ? 'var(--amber-ink)' : 'var(--ink)'
  const subColor = selected && needsAction ? 'var(--amber-ink)' : 'var(--ink-4)'

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, alignItems: 'center',
        padding: '9px 20px', cursor: 'pointer', userSelect: 'none',
        borderLeft: `2px solid ${selected ? borderCol : 'transparent'}`,
        background: selected ? selBg : 'transparent', transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = needsAction ? 'var(--amber-soft)' : 'var(--bg)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <Avatar label={label} id={inst.connection_id || inst.instance_id} size={32} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: labelColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        <div style={{ fontSize: 11, color: subColor, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {stateLabel} · {prettify(inst.template_id)}
        </div>
      </div>
      <span style={{ fontSize: 11, color: subColor, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {relativeTime(inst.updatedAt || inst.createdAt)}
      </span>
    </div>
  )
}

function HubTemplateRow({ template, idx, selected, onSelect }: { template: any; idx: number; selected: boolean; onSelect: () => void }) {
  const ts = toneStyle(idx)
  return (
    <div
      onClick={onSelect}
      style={{
        display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'center',
        padding: '9px 20px', cursor: 'pointer', userSelect: 'none',
        borderLeft: `2px solid ${selected ? 'var(--violet)' : 'transparent'}`,
        background: selected ? 'var(--accent-soft)' : 'transparent', transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center', background: selected ? ts.bg : 'var(--bg-sunk)', color: selected ? ts.color : 'var(--ink-3)' }}>
        <Icon name="workflow" size={13} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {template.title || prettify(template.template_id)}
        </div>
        {(template.states?.length || template.states_count) ? (
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {template.states?.length || template.states_count} states
          </div>
        ) : (
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
            {template.template_id}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// RIGHT PANEL: TEMPLATE PICKER
// ============================================================================

function TemplatePicker({ templates, onPick, onCompose }: {
  templates: any[]; onPick: (t: any, idx: number) => void; onCompose: () => void
}) {
  return (
    <div style={{ padding: '22px 28px 32px', maxWidth: 920 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.012em', color: 'var(--ink)' }}>Start a new workflow</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>{templates.length} templates</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {templates.map((t, idx) => {
          const ts = toneStyle(idx)
          const stateCount = t.states?.length || t.states_count || '?'
          return (
            <button
              key={t.template_id}
              onClick={() => onPick(t, idx)}
              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 18px 16px', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-4)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px -4px rgba(0,0,0,0.08)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', ...ts }}>
                <Icon name="workflow" size={17} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>
                {t.template_id}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.012em', color: 'var(--ink)', lineHeight: 1.3 }}>
                {t.title || prettify(t.template_id)}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5, flex: 1 }}>
                {t.description || 'Start this workflow with a connection.'}
              </div>
              <div style={{ display: 'flex', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--ink-4)' }}>
                <span><b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{stateCount}</b> states</span>
                {t.transitions?.length > 0 && <><span style={{ color: 'var(--ink-5)' }}>·</span><span><b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{t.transitions.length}</b> transitions</span></>}
              </div>
            </button>
          )
        })}
        {/* Compose your own */}
        <button
          onClick={onCompose}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '18px 18px 16px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: 'inherit', transition: 'all 0.15s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'transparent', border: '1px dashed var(--border-strong)', color: 'var(--ink-4)' }}>
            <Icon name="edit" size={17} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>OPEN DESIGNER</div>
          <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.012em', color: 'var(--ink)', lineHeight: 1.3 }}>Compose your own</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5, flex: 1 }}>Build a template from scratch in the Workflow Designer.</div>
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// RIGHT PANEL: TEMPLATE PREVIEW
// ============================================================================

function TemplatePreviewPanel({ template, idx, connections, selectedConnectionId, onConnectionChange, onStart, onEnsure, onEditInDesigner, startingTemplateId }: {
  template: any; idx: number; connections: { id: string; theirLabel?: string; state?: string }[]
  selectedConnectionId: string; onConnectionChange: (id: string) => void
  onStart: (t: any) => void; onEnsure: (t: any) => void; onEditInDesigner: (t: any) => void
  startingTemplateId: string | null
}) {
  const ts = toneStyle(idx)
  const isStarting = startingTemplateId === template.template_id
  const states: any[] = template.states || []
  const selectedConn = connections.find(c => c.id === selectedConnectionId)

  return (
    <>
      {/* Header */}
      <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', ...ts }}>
            <Icon name="workflow" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)' }}>{template.template_id}</span>
              {template.version && <><span style={{ color: 'var(--ink-5)' }}>·</span><span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontWeight: 500 }}>{template.version}</span></>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.018em', color: 'var(--ink)', marginBottom: 6 }}>
              {template.title || prettify(template.template_id)}
            </div>
            {template.description && <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: 620 }}>{template.description}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--ink-4)', flexWrap: 'wrap' }}>
          {states.length > 0 && <span><b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{states.length}</b> states</span>}
          {template.transitions?.length > 0 && <span><b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{template.transitions.length}</b> transitions</span>}
          {template.createdAt && <span>Published {new Date(template.createdAt).toLocaleDateString()}</span>}
        </div>
      </div>

      <div style={{ padding: '24px 28px 40px', maxWidth: 760 }}>
        {/* Step list */}
        {states.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600, marginBottom: 12 }}>How it works</div>
            <div style={{ position: 'relative' }}>
              {/* Single continuous line from center of first circle to center of last */}
              {states.length > 1 && (
                <div style={{ position: 'absolute', left: 11, top: 21, bottom: 21, width: 2, background: 'var(--border)', zIndex: 0 }} />
              )}
              {states.map((s: any, i: number) => {
                const isFirst = s.type === 'start' || i === 0
                const isLast = s.type === 'final' || i === states.length - 1
                return (
                  <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, padding: '10px 0' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, background: isFirst ? 'var(--accent)' : isLast ? 'var(--green)' : 'var(--bg-sunk)', color: isFirst || isLast ? 'white' : 'var(--ink-3)', border: '3px solid var(--bg)', position: 'relative', zIndex: 1, boxSizing: 'border-box' }}>
                      {isLast ? '✓' : i + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{prettify(s.name)}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 2, lineHeight: 1.4 }}>
                        {s.type === 'start' ? 'Entry point' : s.type === 'final' ? 'Workflow ends here' : s.actions?.length ? `${s.actions.length} action${s.actions.length > 1 ? 's' : ''}` : 'Intermediate state'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Start section */}
        <div style={{ marginTop: states.length > 0 ? 0 : 0, padding: '20px 22px', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)', marginBottom: 12 }}>Start this workflow</div>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600, marginBottom: 8 }}>Pick a connection</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {connections.map(c => {
              const isSel = selectedConnectionId === c.id
              return (
                <div
                  key={c.id}
                  onClick={() => onConnectionChange(c.id)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px 6px 6px', background: isSel ? 'var(--accent-soft)' : 'var(--bg)', border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s', userSelect: 'none' }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-4)' }}
                  onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                >
                  <Avatar label={c.theirLabel || c.id} id={c.id} size={22} />
                  <span style={{ fontSize: 12.5, color: isSel ? 'var(--accent-ink)' : 'var(--ink)', fontWeight: isSel ? 500 : 400 }}>{c.theirLabel || c.id}</span>
                  {isSel && <Icon name="check" size={13} style={{ color: 'var(--accent-ink)', flexShrink: 0 }} />}
                </div>
              )
            })}
            {connections.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--ink-4)' }}>No connections available</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-4)' }}>
              {selectedConn ? `Workflow will start with ${selectedConn.theirLabel || selectedConn.id}` : 'Choose someone above to continue'}
            </span>
            <button onClick={() => onStart(template)} disabled={isStarting || !selectedConnectionId} className="btn btn-primary btn-sm">
              <Icon name="play" size={11} style={{ marginRight: 4 }} />
              {isStarting ? 'Starting…' : 'Start workflow'}
            </button>
          </div>
        </div>

        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={() => onEditInDesigner(template)} className="btn btn-secondary btn-sm">
            <Icon name="edit" size={12} style={{ marginRight: 4 }} />Edit in Designer
          </button>
          <button onClick={() => onEnsure(template)} disabled={!selectedConnectionId} className="btn btn-secondary btn-sm" title="Push template to peer">
            <Icon name="refresh" size={12} style={{ marginRight: 4 }} />Sync to Peer
          </button>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// RIGHT PANEL: INSTANCE THREAD VIEW
// ============================================================================

function InstanceThreadView({ instanceStatus, template, connectionLabel, onAdvance, onRefresh, loading }: {
  instanceStatus: any; template: any; connectionLabel?: string
  onAdvance: (event: string, input?: any) => Promise<void>
  onRefresh: () => Promise<void>; loading: boolean
}) {
  const [advancing, setAdvancing] = useState<string | null>(null)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => { onRefreshRef.current = onRefresh })
  useEffect(() => {
    const id = setInterval(() => { void onRefreshRef.current() }, 3000)
    return () => clearInterval(id)
  }, [])

  const state: string = instanceStatus?.state || ''
  const allowedEvents: string[] = instanceStatus?.allowed_events || []
  const needsAction = STATES_NEEDING_ACTION.has(state) || (allowedEvents.length > 0 && !['done', 'final', 'completed', 'approved'].includes(state))
  const isDone = instanceStatus?.status === 'completed' || ['done', 'final', 'approved', 'completed'].includes(state)
  const states: any[] = template?.states || []
  const currentIdx = states.findIndex((s: any) => s.name === state)
  const effectiveIdx = currentIdx >= 0 ? currentIdx : (isDone ? states.length - 1 : 0)
  const templateName = template?.title || prettify(template?.template_id || '')
  const startedAt = instanceStatus?.createdAt ? relativeTime(instanceStatus.createdAt) : ''
  const connId = instanceStatus?.connection_id || ''

  const doAdvance = async (event: string) => {
    setAdvancing(event)
    try { await onAdvance(event) } finally { setAdvancing(null) }
  }

  const evtStyle = (event: string) => {
    if (['approve', 'accept', 'confirm', 'submit', 'issue', 'next', 'propose'].includes(event))
      return { bg: 'var(--green)', color: 'white', borderColor: 'var(--green)' }
    if (['reject', 'decline', 'cancel', 'deny'].includes(event))
      return { bg: 'var(--bg-elev)', color: 'var(--ink)', borderColor: 'var(--border)' }
    return { bg: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' }
  }

  const evtLabel = (event: string) => {
    const map: Record<string, string> = { approve: 'Approve & issue', reject: 'Reject with reason', accept: 'Accept', decline: 'Decline', confirm: 'Confirm', submit: 'Submit', cancel: 'Cancel', next: 'Continue', propose: 'Propose', issue: 'Issue credential' }
    return map[event] || event.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  if (!instanceStatus && loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200, color: 'var(--ink-4)', fontSize: 13 }}>Loading…</div>
  }

  return (
    <>
      {/* Header */}
      <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <Avatar label={connectionLabel || 'Unknown'} id={connId || 'x'} size={36} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--ink)' }}>
              {connectionLabel || 'Unknown connection'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12, color: 'var(--ink-4)', marginTop: 2 }}>
              <span style={{ color: 'var(--accent-ink)' }}>{templateName}</span>
              {template?.template_id && <><span style={{ color: 'var(--ink-5)' }}>·</span><span style={{ fontFamily: 'var(--font-mono)' }}>{template.template_id}</span></>}
              {startedAt && <><span style={{ color: 'var(--ink-5)' }}>·</span><span>Started {startedAt}</span></>}
            </div>
          </div>
          {needsAction && !isDone && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />Needs you
            </div>
          )}
          {isDone && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, background: 'var(--green-soft)', color: 'var(--green-ink)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />Done
            </div>
          )}
        </div>
      </div>

      {/* Thread */}
      <div style={{ padding: '24px 28px 40px', maxWidth: 760 }}>
        <div style={{ position: 'relative', paddingLeft: 2 }}>
          <div style={{ position: 'absolute', top: 28, bottom: 28, left: 19, width: 2, background: 'var(--border)', zIndex: 0 }} />

          {/* Started event */}
          <ThreadEvent
            icon="send" iconBg="var(--accent-soft)" iconColor="var(--accent-ink)"
            title="You started this workflow"
            desc={states[0] ? `Beginning: ${prettify(states[0].name)}` : 'Workflow initiated'}
            meta={[startedAt ? `Started ${startedAt}` : null].filter(Boolean) as string[]}
          />

          {/* Completed states */}
          {states.slice(1, effectiveIdx).map((s: any) => (
            <ThreadEvent
              key={s.name} icon="check" iconBg="var(--green-soft)" iconColor="var(--green-ink)"
              title={prettify(s.name)} desc={s.actions?.length ? `${s.actions.length} action${s.actions.length > 1 ? 's' : ''} completed` : ''}
              meta={['completed']}
            />
          ))}

          {/* Current state */}
          {!isDone && effectiveIdx >= 0 && effectiveIdx < states.length && (
            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 16, alignItems: 'flex-start', padding: '14px 0' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center',
                marginLeft: 4, border: '2px solid var(--bg)', position: 'relative', zIndex: 1,
                background: needsAction ? 'var(--amber)' : 'var(--accent-soft)',
                color: needsAction ? 'white' : 'var(--accent-ink)',
                boxShadow: needsAction ? '0 0 0 4px oklch(0.78 0.13 75 / 0.18)' : undefined,
              }}>
                <Icon name={needsAction ? 'bell' : 'workflow'} size={14} />
              </div>
              <div>
                {needsAction && allowedEvents.length > 0 ? (
                  <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--accent)', boxShadow: '0 0 0 4px oklch(0.55 0.15 250 / 0.08)', borderRadius: 12, padding: '18px 22px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-ink)', fontWeight: 700 }}>You are here · waiting on you</div>
                      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.012em', color: 'var(--ink)', marginTop: 4 }}>{prettify(states[effectiveIdx].name)}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 6, lineHeight: 1.5 }}>
                        Current state: {state.replace(/_/g, ' ')}. Your action is required to proceed.
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                      {allowedEvents.map(event => {
                        const s = evtStyle(event)
                        return (
                          <button
                            key={event}
                            onClick={() => doAdvance(event)}
                            disabled={advancing !== null}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start', padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, border: `1px solid ${s.borderColor}`, background: s.bg, color: s.color, cursor: advancing ? 'not-allowed' : 'pointer', opacity: advancing && advancing !== event ? 0.6 : 1, fontFamily: 'inherit', transition: 'opacity 0.1s' }}
                          >
                            {advancing === event
                              ? <span style={{ opacity: 0.7 }}>Processing…</span>
                              : <><Icon name={event.includes('reject') || event.includes('decline') ? 'alert' : 'check'} size={13} />{evtLabel(event)}</>
                            }
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{prettify(states[effectiveIdx]?.name || state)}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.5 }}>In progress — waiting on peer</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>in progress · last update just now</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Done */}
          {isDone && (
            <ThreadEvent
              icon="check" iconBg="var(--green)" iconColor="white"
              title="Completed" desc="Workflow finished successfully" meta={['done']}
            />
          )}

          {/* Future states */}
          {!isDone && states.slice(effectiveIdx + 1).map((s: any, i: number) => (
            <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 16, alignItems: 'flex-start', padding: '14px 0', opacity: 0.55 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', marginLeft: 4, border: '2px dashed var(--border-strong)', position: 'relative', zIndex: 1, background: 'var(--bg-elev)', color: 'var(--ink-4)' }}>
                <Icon name={s.type === 'final' ? 'checkCircle' : 'send'} size={14} />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{prettify(s.name)}</div>
                {s.actions?.length > 0 && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3 }}>{s.actions.map((a: any) => a.type || a.typeURI?.split('/').pop() || '').join(', ')}</div>}
                <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{i === 0 ? '~ next' : '~ later'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function ThreadEvent({ icon, iconBg, iconColor, title, desc, meta }: {
  icon: string; iconBg: string; iconColor: string
  title: string; desc: string; meta: string[]
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 16, alignItems: 'flex-start', padding: '14px 0' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', marginLeft: 4, border: '2px solid var(--bg)', position: 'relative', zIndex: 1, background: iconBg, color: iconColor }}>
        <Icon name={icon} size={14} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
        {desc && <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.5 }}>{desc}</div>}
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--ink-4)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
          {meta.map((m, i) => (
            <span key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {i > 0 && <span style={{ color: 'var(--ink-5)' }}>·</span>}
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
