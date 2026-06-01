'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { workflowApi, connectionApi, credentialDefinitionApi } from '@/lib/api'
import { useAuth } from '../../context/AuthContext'
import { Icon } from '../../components/ui/Icons'
import { runtimeConfig } from '@/lib/runtimeConfig'
import { WorkflowProvider, UiProfileProvider } from '@ajna-inc/workflow-react'
import { PRESET_TEMPLATES, applicationApprovalTemplate } from '../workflows/presetTemplates'

const WorkflowBuilder = dynamic(
  () => import('@/app/components/workflows/builder/WorkflowBuilder').then(m => m.WorkflowBuilder),
  {
    ssr: false,
    loading: () => (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: 14 }}>
        Loading builder…
      </div>
    ),
  }
)

// ============================================================================
// HELPERS
// ============================================================================

const TONE_STYLES = [
  { bg: 'oklch(0.94 0.06 250)', color: 'var(--accent-ink)' },
  { bg: 'oklch(0.94 0.06 155)', color: 'var(--green-ink)' },
  { bg: 'oklch(0.96 0.06 75)', color: 'var(--amber-ink)' },
  { bg: 'oklch(0.94 0.06 295)', color: 'var(--violet-ink)' },
]
function toneForId(id: string) {
  let h = 0; for (const c of (id || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffff
  return TONE_STYLES[h % 4]
}
function prettify(id: string) {
  return (id || '').replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function matchesSearch(t: any, q: string) {
  if (!q) return true
  const s = q.toLowerCase()
  return (t.title || t.template_id || '').toLowerCase().includes(s)
}

const BLANK_TEMPLATE = {
  template_id: 'new-workflow',
  version: '1.0.0',
  title: 'New Workflow',
  states: [
    { name: 'start', type: 'start' },
    { name: 'done', type: 'final' },
  ],
  transitions: [
    { from: 'start', to: 'done', on: 'complete' },
  ],
}

type Mode = 'library' | 'editor'

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function WorkflowDesignerPage() {
  const { token } = useAuth()
  const baseUrl = runtimeConfig.API_URL
  return (
    <WorkflowProvider baseUrl={baseUrl} token={token || undefined}>
      <UiProfileProvider initial={undefined}>
        <WorkflowDesignerContent />
      </UiProfileProvider>
    </WorkflowProvider>
  )
}

// ============================================================================
// CONTENT (manages both modes)
// ============================================================================

function WorkflowDesignerContent() {
  const { isAuthenticated } = useAuth()

  // If navigated here with "Edit in Designer" sessionStorage key → go directly to editor
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('workflows.designerTemplate')) return 'editor'
    return 'library'
  })

  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(() => PRESET_TEMPLATES[0] ? `builtin:${PRESET_TEMPLATES[0].template_id}` : null)
  const [publishedTemplates, setPublishedTemplates] = useState<any[]>([])
  const [connections, setConnections] = useState<{ id: string; theirLabel?: string; state?: string }[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState('')
  const [templateJson, setTemplateJson] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('workflows.designerTemplate')
      if (stored) { sessionStorage.removeItem('workflows.designerTemplate'); return stored }
    }
    return JSON.stringify(applicationApprovalTemplate, null, 2)
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [fullYoursTemplate, setFullYoursTemplate] = useState<any>(null)
  const [loadingFull, setLoadingFull] = useState(false)

  // ── Data loading ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return
    connectionApi.getAll().then(res => setConnections(res.connections ?? [])).catch(() => { })
    workflowApi.listTemplates().then(res => setPublishedTemplates(res.templates ?? [])).catch(() => { })
  }, [isAuthenticated])

  useEffect(() => {
    if (!connections.length) return
    setSelectedConnectionId(prev => {
      if (prev && connections.some(c => c.id === prev)) return prev
      const done = connections.find((c: any) => c.state === 'completed' || c.state === 'complete')
      return done?.id || connections[0]?.id || ''
    })
  }, [connections])

  // ── Combined template library ──────────────────────────────────────────────

  const allTemplates = useMemo(() => {
    const builtIn = PRESET_TEMPLATES.map(p => ({
      ...p,
      _owner: 'builtin' as const,
      _selKey: `builtin:${p.template_id}`,
    }))
    const yours = publishedTemplates.map(t => ({
      ...t,
      _owner: 'yours' as const,
      _selKey: `yours:${t.id || t.template_id}`,
    }))
    return [...builtIn, ...yours]
  }, [publishedTemplates])

  const selectedTemplate = allTemplates.find(t => t._selKey === selectedKey) || null
  const builtInFiltered = allTemplates.filter(t => t._owner === 'builtin' && matchesSearch(t, search))
  const yoursFiltered = allTemplates.filter(t => t._owner === 'yours' && matchesSearch(t, search))

  // Fetch full template when a "yours" entry is selected (list API only returns metadata)
  useEffect(() => {
    if (!selectedKey?.startsWith('yours:')) {
      setFullYoursTemplate(null)
      return
    }
    const template = allTemplates.find(t => t._selKey === selectedKey)
    if (!template) return
    if (template.states?.length) {
      setFullYoursTemplate(template)
      return
    }
    let cancelled = false
    setLoadingFull(true)
    workflowApi.getTemplate(template.template_id, template.version)
      .then(res => {
        if (cancelled) return
        // Backend may return { template: {...} } or the object directly
        const tpl = res?.template ?? (res?.template_id ? res : null)
        if (tpl?.states?.length) {
          setFullYoursTemplate({ ...tpl, _owner: 'yours' as const, _selKey: template._selKey })
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingFull(false) })
    return () => { cancelled = true }
  }, [selectedKey, allTemplates])

  const displayTemplate = selectedTemplate?._owner === 'yours'
    ? (fullYoursTemplate ?? selectedTemplate)
    : selectedTemplate

  // ── Actions ────────────────────────────────────────────────────────────────

  const openEditor = (json: string) => {
    setTemplateJson(json)
    setMode('editor')
    setError(null)
    setSavedAt(null)
  }

  const handleNewTemplate = () => {
    openEditor(JSON.stringify(BLANK_TEMPLATE, null, 2))
  }

  const handleForkEdit = async (t: any) => {
    setLoading(true)
    try {
      let full = t
      if (!t.states && t.version) {
        const res = await workflowApi.getTemplate(t.template_id, t.version)
        if (res?.template) full = res.template
      }
      // Strip UI-only metadata before loading into editor
      const { _owner, _selKey, ...cleanFull } = full as any
      openEditor(JSON.stringify(cleanFull, null, 2))
    } catch {
      const { _owner, _selKey, ...cleanT } = t as any
      openEditor(JSON.stringify(cleanT, null, 2))
    }
    finally { setLoading(false) }
  }

  const handleDuplicate = async (t: any) => {
    const copy = {
      ...t,
      template_id: `${t.template_id}-copy`,
      title: `${t.title || prettify(t.template_id)} (copy)`,
      _owner: undefined,
      _selKey: undefined,
    }
    openEditor(JSON.stringify(copy, null, 2))
  }

  const validateTemplateCredDefs = useCallback(async (template: any): Promise<string | null> => {
    const ids: Array<{ profileId: string; credDefId: string }> = []
    Object.entries(template?.catalog?.credential_profiles || {}).forEach(([pid, p]) => {
      const cid = (p as any)?.cred_def_id; if (typeof cid === 'string') ids.push({ profileId: pid, credDefId: cid })
    })
    if (!ids.length) return null
    const res = await credentialDefinitionApi.getAll()
    const valid = new Set((res?.credentialDefinitions || []).map((cd: any) => cd.credentialDefinitionId).filter(Boolean))
    const bad = ids.filter(({ credDefId }) => !credDefId.trim() || credDefId.startsWith('REPLACE_WITH_') || !valid.has(credDefId))
    return bad.length ? `Invalid credential definition ID(s): ${bad.map(p => `${p.profileId}: ${p.credDefId || '(empty)'}`).join(', ')}.` : null
  }, [])

  const handlePublish = async (json: string) => {
    setError(null)
    try {
      const parsed = JSON.parse(json)
      // Strip non-schema fields before sending to backend
      const { _owner, _selKey, ...rest } = parsed as any
      const cleanParsed = {
        ...rest,
        states: (rest.states || []).map(({ _x, _y, ...s }: any) => s),
      }
      const verr = await validateTemplateCredDefs(cleanParsed)
      if (verr) { setError(verr); return }
      await workflowApi.publish(cleanParsed)
      setSavedAt(new Date())
      setSuccess(`"${parsed.template_id}" published`); setTimeout(() => setSuccess(null), 3000)
      // Refresh published list
      workflowApi.listTemplates().then(res => setPublishedTemplates(res.templates ?? [])).catch(() => { })
    } catch (err) { setError((err as Error).message || 'Failed to publish') }
  }

  // ── Template meta from current editor JSON ─────────────────────────────────

  const editorMeta = useMemo(() => {
    try {
      const p = JSON.parse(templateJson)
      return { id: p.template_id || '', version: p.version || '', title: p.title || '' }
    } catch { return { id: '', version: '', title: '' } }
  }, [templateJson])

  const editorDisplayName = editorMeta.title || (editorMeta.id ? prettify(editorMeta.id) : 'New Template')
  const editorTone = toneForId(editorMeta.id)

  const savedLabel = savedAt
    ? (() => {
      const diff = Date.now() - savedAt.getTime()
      if (diff < 60_000) return 'Saved just now'
      return `Saved ${Math.floor(diff / 60_000)}m ago`
    })()
    : null

  // ============================================================================
  // EDITOR MODE
  // ============================================================================

  if (mode === 'editor') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', margin: '-28px -32px -80px', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

        {/* Editor topbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 48, flexShrink: 0, padding: '0 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
          <button
            onClick={() => setMode('library')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 5, fontSize: 12.5, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s', whiteSpace: 'nowrap' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-sunk)'; e.currentTarget.style.color = 'var(--ink)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-3)' }}
          >
            <Icon name="arrowRight" size={12} style={{ transform: 'rotate(180deg)' }} />
            Templates
          </button>

          <span style={{ color: 'var(--ink-5)', fontSize: 16, fontWeight: 300 }}>/</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 auto' }}>
            <div style={{ width: 22, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', flexShrink: 0, ...editorTone }}>
              <Icon name="workflow" size={12} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 }}>
              {editorDisplayName}
            </span>
            {editorMeta.version && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-4)', padding: '1px 6px', background: 'var(--bg-sunk)', borderRadius: 3, flexShrink: 0 }}>
                {editorMeta.version}
              </span>
            )}
          </div>

          {savedLabel && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--ink-4)', marginLeft: 4, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
              {savedLabel}
            </div>
          )}

          <div style={{ flex: 1 }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontWeight: 500 }}>Load:</span>
            <select
              defaultValue=""
              onChange={e => {
                const t = PRESET_TEMPLATES.find(p => p.template_id === e.target.value)
                if (t) { openEditor(JSON.stringify(t, null, 2)); e.currentTarget.value = '' }
              }}
              style={{ height: 28, padding: '0 6px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', maxWidth: 160 }}
            >
              <option value="" disabled>Preset…</option>
              {PRESET_TEMPLATES.map(t => (
                <option key={t.template_id} value={t.template_id}>{t.title || t.template_id}</option>
              ))}
            </select>
          </div>

          {connections.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span style={{ fontSize: 11.5, color: 'var(--ink-4)', fontWeight: 500 }}>With:</span>
              <select
                value={selectedConnectionId}
                onChange={e => setSelectedConnectionId(e.target.value)}
                style={{ height: 28, padding: '0 6px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', maxWidth: 160 }}
              >
                {connections.map(c => (
                  <option key={c.id} value={c.id}>{c.theirLabel || c.id}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'flex', background: 'var(--bg-sunk)', borderRadius: 8, padding: 3, gap: 2, border: '1px solid var(--border)', flexShrink: 0 }}>
            <Link href="/dashboard/workflows" style={{ fontSize: 12.5, fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: 'transparent', color: 'var(--ink-3)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Run</Link>
            <button style={{ fontSize: 12.5, fontWeight: 500, padding: '4px 12px', borderRadius: 6, background: 'var(--bg-elev)', color: 'var(--ink)', border: 'none', cursor: 'default', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>Design</button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error" style={{ margin: 0, flexShrink: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
            <span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} className="btn btn-ghost btn-icon btn-sm"><Icon name="close" size={14} /></button>
          </div>
        )}
        {success && (
          <div className="alert alert-success" style={{ margin: 0, flexShrink: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
            <span>{success}</span>
          </div>
        )}

        <WorkflowBuilder
          initialJson={templateJson}
          onJsonChange={(json) => setTemplateJson(json)}
          onPublish={handlePublish}
        />
      </div>
    )
  }

  // ============================================================================
  // LIBRARY MODE
  // ============================================================================

  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '-28px -32px -80px', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

      {/* Library page header */}
      {/* <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 28px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.018em', color: 'var(--ink)' }}>Workflow Designer</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>Build and publish workflow templates</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-sunk)', borderRadius: 8, padding: 3, gap: 2, border: '1px solid var(--border)' }}>
            <Link href="/dashboard/workflows" style={{ fontSize: 12.5, fontWeight: 500, padding: '5px 14px', borderRadius: 6, background: 'transparent', color: 'var(--ink-3)', textDecoration: 'none', display: 'flex', alignItems: 'center' }}>Run</Link>
            <button style={{ fontSize: 12.5, fontWeight: 500, padding: '5px 14px', borderRadius: 6, background: 'var(--bg-elev)', color: 'var(--ink)', border: 'none', cursor: 'default', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>Design</button>
          </div>
        </div>
      </div> */}

      {/* Hub layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, minHeight: 0 }}>

        {/* ── Left rail ── */}
        <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* New template button */}
          <div style={{ padding: '14px 20px 8px', flexShrink: 0 }}>
            <button
              onClick={handleNewTemplate}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--accent)', background: 'var(--accent)', color: 'white', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '-0.005em', transition: 'filter 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
              onMouseLeave={e => (e.currentTarget.style.filter = '')}
            >
              <Icon name="plus" size={14} />
              <span>New template</span>
            </button>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', margin: '0 20px 6px', flexShrink: 0 }}>
            <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--ink-4)' }}>
              <Icon name="search" size={13} />
            </div>
            <input
              type="text"
              placeholder="Search templates…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: 30, padding: '0 12px 0 32px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 7, fontSize: 12.5, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
          </div>

          {/* Scrollable list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0 14px' }}>
            {builtInFiltered.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px 6px', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
                  <span>Built-in</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-5)', fontWeight: 400 }}>{builtInFiltered.length}</span>
                </div>
                {builtInFiltered.map((t, idx) => (
                  <TemplateRow key={t._selKey} template={t} idx={idx} selected={selectedKey === t._selKey} onSelect={() => setSelectedKey(t._selKey)} />
                ))}
              </>
            )}
            {yoursFiltered.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px 6px', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
                  <span>Yours</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-5)', fontWeight: 400 }}>{yoursFiltered.length}</span>
                </div>
                {yoursFiltered.map((t, idx) => (
                  <TemplateRow key={t._selKey} template={t} idx={builtInFiltered.length + idx} selected={selectedKey === t._selKey} onSelect={() => setSelectedKey(t._selKey)} />
                ))}
              </>
            )}
            {builtInFiltered.length === 0 && yoursFiltered.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5 }}>No templates match</div>
            )}
          </div>
        </div>

        {/* ── Right pane ── */}
        <div style={{ overflowY: 'auto', background: 'var(--bg)' }}>
          {displayTemplate ? (
            <LibraryPreview
              template={displayTemplate}
              loading={loading || loadingFull}
              onForkEdit={handleForkEdit}
              onDuplicate={handleDuplicate}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--ink-4)', fontSize: 13 }}>
              Select a template from the list
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LIBRARY LIST ROW
// ============================================================================

function TemplateRow({ template, idx, selected, onSelect }: {
  template: any; idx: number; selected: boolean; onSelect: () => void
}) {
  const ts = TONE_STYLES[idx % 4]
  const stateCount = template.states?.length || '?'
  const transCount = template.transitions?.length || 0

  return (
    <div
      onClick={onSelect}
      style={{
        display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'center',
        padding: '9px 20px', cursor: 'pointer', userSelect: 'none',
        borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        background: selected ? 'var(--accent-soft)' : 'transparent', transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--bg)' }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ width: 32, height: 32, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0, ...ts }}>
        <Icon name="workflow" size={15} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: selected ? 600 : 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {template.title || prettify(template.template_id)}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
          {template.template_id} · {stateCount} states{transCount > 0 ? ` · ${transCount} tr` : ''}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LIBRARY PREVIEW (right pane)
// ============================================================================

function LibraryPreview({ template, loading, onForkEdit, onDuplicate }: {
  template: any; loading: boolean
  onForkEdit: (t: any) => void; onDuplicate: (t: any) => void
}) {
  const states: any[] = template.states || []
  const transitions: any[] = template.transitions || []
  const isBuiltin = template._owner === 'builtin'
  const tone = toneForId(template.template_id)

  // Derive type label
  const typeLabel = useMemo(() => {
    if (!states.length) return 'Workflow'
    const names = states.map((s: any) => (s.name || '').toLowerCase()).join(' ')
    if (names.includes('proof') || names.includes('verify')) return 'Verification'
    if (names.includes('issuing') || names.includes('offer')) return 'Issuance'
    if (names.includes('apply') || names.includes('review')) return 'Application Flow'
    return 'Workflow'
  }, [states])

  return (
    <>
      {/* Preview header */}
      <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', ...tone }}>
            <Icon name="workflow" size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Key row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-4)' }}>{template.template_id}</span>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>{typeLabel}</span>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span style={{
                padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 500,
                background: isBuiltin ? 'var(--bg-sunk)' : 'oklch(0.94 0.06 295)',
                color: isBuiltin ? 'var(--ink-3)' : 'var(--violet-ink)',
              }}>
                {isBuiltin ? 'Built-in' : 'Yours'}
              </span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.018em', color: 'var(--ink)', marginBottom: 6 }}>
              {template.title || prettify(template.template_id)}
            </div>
            {template.description && (
              <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.55, maxWidth: 660 }}>
                {template.description}
              </div>
            )}
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--ink-4)' }}>
          {states.length > 0 && <span><b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{states.length}</b> states</span>}
          {transitions.length > 0 && <span><b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{transitions.length}</b> transitions</span>}
          {template.version && <><span style={{ color: 'var(--ink-5)' }}>·</span><span style={{ fontFamily: 'var(--font-mono)' }}>v{template.version}</span></>}
          {template.createdAt && <><span style={{ color: 'var(--ink-5)' }}>·</span><span>Published {new Date(template.createdAt).toLocaleDateString()}</span></>}
          {isBuiltin && <><span style={{ color: 'var(--ink-5)' }}>·</span><span>Built-in</span></>}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16 }}>
          <button
            onClick={() => onForkEdit(template)}
            disabled={loading}
            className="btn btn-primary btn-sm"
          >
            <Icon name="edit" size={12} style={{ marginRight: 4 }} />
            {isBuiltin ? 'Fork & edit' : 'Edit'}
          </button>
          <Link
            href="/dashboard/workflows"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: 'none' }}
          >
            <Icon name="play" size={12} style={{ marginRight: 4 }} />
            Use
          </Link>
          <button onClick={() => onDuplicate(template)} className="btn btn-secondary btn-sm">
            <Icon name="copy" size={12} style={{ marginRight: 4 }} />
            Duplicate
          </button>
        </div>
      </div>

      {/* Preview body */}
      {states.length > 0 && (
        <div style={{ padding: '24px 28px 40px', maxWidth: 760 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600, marginBottom: 16 }}>
            How it works
          </div>

          <div style={{ position: 'relative' }}>
            {/* Single line from center of first circle to center of last */}
            {states.length > 1 && (
              <div style={{ position: 'absolute', left: 17, top: 28, bottom: 28, width: 2, background: 'var(--border)', zIndex: 0 }} />
            )}
            {states.map((s: any, i: number) => {
              const isFirst = s.type === 'start' || i === 0
              const isLast = s.type === 'final' || i === states.length - 1
              const stepNum = isLast ? '✓' : String(i + 1)
              return (
                <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '36px 1fr', gap: 12, padding: '10px 0' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600,
                    background: isFirst ? 'var(--accent)' : isLast ? 'var(--green)' : 'var(--bg-sunk)',
                    color: isFirst || isLast ? 'white' : 'var(--ink-3)',
                    border: '3px solid var(--bg)',
                    flexShrink: 0, position: 'relative', zIndex: 1, boxSizing: 'border-box',
                  }}>
                    {stepNum}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: '36px' }}>{prettify(s.name)}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: -4, lineHeight: 1.4 }}>
                      {s.type === 'start' ? 'Workflow begins here' : s.type === 'final' ? 'Workflow ends here' : s.actions?.length ? `${s.actions.length} action${s.actions.length > 1 ? 's' : ''} configured` : 'Intermediate state'}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500, marginTop: 4 }}>
                      {s.type === 'start' ? 'BY · INITIATOR' : s.type === 'final' ? null : 'BY · SYSTEM OR PARTICIPANT'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {states.length === 0 && (
        <div style={{ padding: '40px 28px', color: 'var(--ink-4)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading
            ? <><div className="spinner" style={{ width: 16, height: 16, flexShrink: 0 }} /> Loading template details…</>
            : 'No state information available for this template.'
          }
        </div>
      )}
    </>
  )
}
