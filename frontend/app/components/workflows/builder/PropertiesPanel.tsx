'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { ACTION_TYPE_LABELS, STATE_TYPE_COLORS, UI_ELEMENT_LABELS, makeDefaultElement } from '@/lib/workflow-builder/constants'
import type { UIElementType } from '@/lib/workflow-builder/constants'
import { schemaApi } from '@/lib/api'
import type { StateType, CredentialProfile, AttributeSpec, UIElement } from '@/lib/workflow-builder/types'

type InspectorTab = 'properties' | 'json' | 'versions'

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 6, marginTop: 14 }}>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 32, padding: '0 10px',
  border: '1px solid var(--border)', background: 'var(--bg)',
  borderRadius: 6, fontSize: 13, color: 'var(--ink)',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

// ── Main component ────────────────────────────────────────────────────────────

export function PropertiesPanel() {
  const {
    selection, edges, template, updateState, updateTransition,
    getTemplateJson, credentialDefinitions, schemas,
    updateCredentialProfile, removeCredentialProfile, addCredentialProfile,
    updateTemplateMetadata, setSelection,
  } = useBuilderStore()

  const [tab, setTab] = useState<InspectorTab>('properties')
  const [jsonText, setJsonText] = useState('')

  useEffect(() => {
    if (tab === 'json') setJsonText(getTemplateJson())
  }, [tab, getTemplateJson])

  const rawNode = selection.nodes.length === 1 ? selection.nodes[0] : null
  const selectedCredProfileId = rawNode?.startsWith('cred:') ? rawNode.slice(5) : null
  const selectedCredProfile = selectedCredProfileId
    ? template.catalog?.credential_profiles?.[selectedCredProfileId] ?? null
    : null

  const selectedStateName = rawNode && !rawNode.startsWith('cred:') ? rawNode : null
  const selectedState = selectedStateName
    ? template.states.find(s => s.name === selectedStateName) ?? null
    : null

  const selectedEdgeId = selection.edges.length === 1 ? selection.edges[0] : null
  const selectedEdge = selectedEdgeId ? edges.find(e => e.id === selectedEdgeId) : null
  const selectedTransition = selectedEdge
    ? template.transitions.find(t => t.from === selectedEdge.from && t.to === selectedEdge.to && t.on === selectedEdge.data.on) ?? null
    : null

  useEffect(() => {
    if (rawNode || selectedEdgeId) setTab('properties')
  }, [rawNode, selectedEdgeId])

  const tabStyle = (t: InspectorTab): React.CSSProperties => ({
    flex: 1, padding: '9px 8px', background: 'none', border: 'none',
    borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
    fontFamily: 'inherit', fontSize: 12, fontWeight: tab === t ? 600 : 500,
    color: tab === t ? 'var(--ink)' : 'var(--ink-3)',
    cursor: 'pointer', marginBottom: -1, transition: 'color 0.12s',
  })

  return (
    <div style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg)', flexShrink: 0 }}>
        <button style={tabStyle('properties')} onClick={() => setTab('properties')}>Properties</button>
        <button style={tabStyle('json')} onClick={() => setTab('json')}>JSON</button>
        <button style={tabStyle('versions')} onClick={() => setTab('versions')}>Versions</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>

        {/* PROPERTIES */}
        {tab === 'properties' && (
          <>
            {/* Template name/version — always visible at top */}
            <TemplateMiniSection template={template} onUpdate={updateTemplateMetadata} />

            {/* Selection-specific content */}
            {selectedCredProfile && selectedCredProfileId && (
              <CredentialProfileInspector
                profileId={selectedCredProfileId}
                profile={selectedCredProfile}
                credentialDefinitions={credentialDefinitions}
                schemas={schemas}
                template={template}
                onUpdate={(pid, updates) => updateCredentialProfile(pid, updates)}
                onDelete={(pid) => removeCredentialProfile(pid)}
                onDuplicate={(pid, profile) => addCredentialProfile(`${pid}_copy`, { ...profile })}
                onReselect={() => setSelection({ nodes: [`cred:${selectedCredProfileId}`], edges: [] })}
              />
            )}
            {selectedState && !selectedCredProfile && (
              <StateInspector state={selectedState} onUpdate={updateState} template={template} />
            )}
            {selectedTransition && !selectedCredProfile && (
              <TransitionInspector transition={selectedTransition} edgeId={selectedEdgeId!} onUpdate={updateTransition} template={template} />
            )}
            {!selectedCredProfile && !selectedState && !selectedTransition && (
              <div style={{ padding: '16px 18px', fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.6 }}>
                Click a state or transition on the canvas, or a credential profile in the sidebar.
              </div>
            )}
          </>
        )}

        {/* JSON */}
        {tab === 'json' && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 8 }}>Template JSON</div>
            <pre style={{ margin: 0, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflow: 'auto' }}>
              {jsonText || getTemplateJson()}
            </pre>
          </div>
        )}

        {/* VERSIONS */}
        {tab === 'versions' && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 12 }}>Version history</div>
            <div style={{ padding: '10px 12px', background: 'var(--accent-soft)', border: '1px solid var(--accent)', borderRadius: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)' }}>
                <span>v{template.version || '1.0.0'}</span>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', background: 'var(--accent)', color: 'white', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>current</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 3 }}>Working version · unsaved</div>
            </div>
            <div style={{ marginTop: 16, padding: 12, background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>
              Publish the template to create a new version entry.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Template mini-section (always visible at top of Properties) ───────────────

function TemplateMiniSection({ template, onUpdate }: {
  template: any
  onUpdate: (updates: Partial<{ template_id: string; version: string; title: string }>) => void
}) {
  const [name, setName] = useState(template.title || '')
  const [version, setVersion] = useState(template.version || '')
  useEffect(() => { setName(template.title || '') }, [template.title])
  useEffect(() => { setVersion(template.version || '') }, [template.version])

  return (
    <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 10 }}>Template</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9.5, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Name</div>
          <input value={name} style={{ ...inputStyle, fontSize: 12 }}
            onChange={e => setName(e.target.value)}
            onBlur={() => onUpdate({ title: name })}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>
        <div style={{ width: 72 }}>
          <div style={{ fontSize: 9.5, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Version</div>
          <input value={version} style={{ ...inputStyle, fontSize: 12 }}
            onChange={e => setVersion(e.target.value)}
            onBlur={() => onUpdate({ version })}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>
      </div>
    </div>
  )
}

// ── Credential Profile Inspector ──────────────────────────────────────────────

function CredentialProfileInspector({ profileId, profile, credentialDefinitions, schemas, template, onUpdate, onDelete, onDuplicate, onReselect }: {
  profileId: string
  profile: CredentialProfile
  credentialDefinitions: Array<{ id?: string; credentialDefinitionId: string; tag: string; schemaId?: string; issuerId?: string }>
  schemas: Array<{ schemaId: string; attrNames?: string[] }>
  template: any
  onUpdate: (profileId: string, updates: Partial<CredentialProfile>) => void
  onDelete: (profileId: string) => void
  onDuplicate: (profileId: string, profile: CredentialProfile) => void
  onReselect: () => void
}) {
  const [toRef, setToRef] = useState(profile.to_ref || '')
  const [comment, setComment] = useState(String(profile.options?.comment || ''))
  const [showCredPicker, setShowCredPicker] = useState(false)
  const [schemaAttributes, setSchemaAttributes] = useState<string[]>([])
  const [loadingSchema, setLoadingSchema] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setToRef(profile.to_ref || '') }, [profile.to_ref])
  useEffect(() => { setComment(String(profile.options?.comment || '')) }, [profile.options?.comment])
  useEffect(() => { setShowCredPicker(false) }, [profileId])

  const linked = credentialDefinitions.find(cd => cd.credentialDefinitionId === profile.cred_def_id)
  const attrs = Object.entries(profile.attribute_plan || {})
  const attrCount = attrs.length

  // Fetch schema for linked cred def
  useEffect(() => {
    if (!linked?.schemaId) { setSchemaAttributes([]); return }
    const cached = schemas.find(s => s.schemaId === linked.schemaId)
    if (cached?.attrNames?.length) { setSchemaAttributes(cached.attrNames); return }
    setLoadingSchema(true)
    schemaApi.getBySchemaId(linked.schemaId)
      .then((r: any) => setSchemaAttributes(r?.schema?.attrNames || []))
      .catch(() => setSchemaAttributes([]))
      .finally(() => setLoadingSchema(false))
  }, [linked?.schemaId, schemas])

  // Compute required keys for filtering cred defs
  const lockedRequiredKeys: string[] = (() => {
    const keys = new Set<string>()
    const states = template?.display_hints?.profiles?.receiver?.states || {}
    const collectRequired = (schema: any) => {
      if (!schema?.properties) return
      const req: string[] = Array.isArray(schema.required) ? schema.required : []
      for (const [k, p] of Object.entries(schema.properties)) {
        if ((p as any)?.properties) collectRequired(p)
        else if (req.includes(k)) keys.add(k)
      }
    }
    for (const hints of Object.values(states)) {
      if (!Array.isArray(hints)) continue
      for (const hint of hints as any[]) { if (hint?.input_schema) collectRequired(hint.input_schema) }
    }
    Object.entries(profile.attribute_plan || {}).forEach(([k, s]) => { if (s.required) keys.add(k) })
    return Array.from(keys)
  })()

  // Select a cred def: fetch schema, build attribute plan, update profile
  const handleCredDefSelect = async (credDefId: string) => {
    setShowCredPicker(false)
    const credDef = credentialDefinitions.find(cd => cd.credentialDefinitionId === credDefId)
    let attrNames: string[] = []
    if (credDef?.schemaId) {
      const cached = schemas.find(s => s.schemaId === credDef.schemaId)
      if (cached?.attrNames?.length) {
        attrNames = cached.attrNames
      } else {
        try {
          const r = await schemaApi.getBySchemaId(credDef.schemaId)
          attrNames = r?.schema?.attrNames || []
        } catch { /* ignore */ }
      }
    }
    const existing = profile.attribute_plan || {}
    const newPlan: Record<string, AttributeSpec> = {}
    attrNames.forEach((attr: string) => {
      newPlan[attr] = existing[attr] || { source: 'context', path: attr, required: true }
    })
    onUpdate(profileId, { cred_def_id: credDefId, attribute_plan: attrNames.length ? newPlan : existing })
    setTimeout(() => onReselect(), 0)
  }

  const updateAttr = (attrName: string, updates: Partial<AttributeSpec>) => {
    onUpdate(profileId, {
      attribute_plan: { ...profile.attribute_plan, [attrName]: { ...profile.attribute_plan[attrName], ...updates } },
    })
  }

  // USED BY
  const usedByStates = (template.actions || [])
    .filter((a: any) => a.profile_ref === profileId)
    .flatMap((a: any) => (template.transitions || []).filter((t: any) => t.action === a.key).map((t: any) => t.from))
    .filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i)

  // Sorted cred defs: compatible first
  const sortedCredDefs = credentialDefinitions
    .map(cd => {
      const schemaAttrs = schemas.find(s => s.schemaId === cd.schemaId)?.attrNames || []
      const incompatible = lockedRequiredKeys.length > 0 && schemaAttrs.length > 0 &&
        lockedRequiredKeys.some(k => !schemaAttrs.includes(k))
      return { cd, incompatible }
    })
    .sort((a, b) => {
      if (a.incompatible !== b.incompatible) return a.incompatible ? 1 : -1
      return a.cd.tag.localeCompare(b.cd.tag)
    })

  return (
    <div style={{ padding: '16px 18px 32px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Credential Profile</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink)', marginTop: 4, marginBottom: 2, fontFamily: 'var(--font-mono)' }}>{profileId}</div>

      <FieldLabel>Profile Name</FieldLabel>
      <input value={profileId} readOnly style={{ ...inputStyle, color: 'var(--ink-3)', background: 'var(--bg-sunk)', cursor: 'default' }} />

      {/* CREDENTIAL DEFINITION with custom inline dropdown */}
      <FieldLabel>Credential Definition</FieldLabel>
      <div style={{ position: 'relative' }} ref={pickerRef}>
        <div style={{ padding: '10px 12px', background: 'var(--bg)', border: `1px solid ${showCredPicker ? 'var(--accent)' : 'var(--border)'}`, borderRadius: showCredPicker ? '7px 7px 0 0' : 7, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {linked ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linked.tag}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500, padding: '1px 5px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 3, flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(linked.credentialDefinitionId.split(':').pop()?.split('/')[0] || 'v1').slice(0, 8)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
                  {(linked.schemaId || linked.credentialDefinitionId).slice(0, 30)}…
                  {loadingSchema ? ' · loading…' : schemaAttributes.length > 0 ? ` · ${schemaAttributes.length} attrs` : ''}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: profile.cred_def_id ? 'var(--amber-ink)' : 'var(--ink-4)' }}>
                {profile.cred_def_id ? 'Not found — click Change' : 'No cred def selected'}
              </div>
            )}
          </div>
          <button
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); setShowCredPicker(v => !v) }}
            style={{ fontSize: 12, color: showCredPicker ? 'var(--accent-ink)' : 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0, fontFamily: 'inherit', fontWeight: showCredPicker ? 600 : 400 }}
          >
            {showCredPicker ? 'Close' : 'Change'}
          </button>
        </div>

        {/* Custom inline dropdown */}
        {showCredPicker && (
          <div style={{ border: '1px solid var(--accent)', borderTop: 'none', borderRadius: '0 0 7px 7px', background: 'var(--bg-elev)', maxHeight: 220, overflowY: 'auto', boxShadow: '0 4px 12px -4px rgba(0,0,0,0.12)' }}>
            {sortedCredDefs.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12.5, color: 'var(--ink-4)' }}>No credential definitions loaded</div>
            )}
            {sortedCredDefs.map(({ cd, incompatible }) => {
              const isCurrent = cd.credentialDefinitionId === profile.cred_def_id
              return (
                <div
                  key={cd.credentialDefinitionId}
                  onMouseDown={e => {
                    e.stopPropagation()
                    e.preventDefault()
                    if (!incompatible) void handleCredDefSelect(cd.credentialDefinitionId)
                  }}
                  style={{
                    padding: '8px 14px', borderBottom: '1px solid var(--border)',
                    cursor: incompatible ? 'not-allowed' : 'pointer',
                    opacity: incompatible ? 0.4 : 1,
                    background: isCurrent ? 'var(--accent-soft)' : 'transparent',
                    transition: 'background 0.08s',
                  }}
                  onMouseEnter={e => { if (!incompatible && !isCurrent) (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunk)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isCurrent ? 'var(--accent-soft)' : 'transparent' }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: isCurrent ? 600 : 500, color: isCurrent ? 'var(--accent-ink)' : 'var(--ink)' }}>
                    {cd.tag}
                    {incompatible && <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--amber-ink)' }}>· missing attrs</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {cd.credentialDefinitionId.slice(0, 38)}…
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <FieldLabel>Recipient (to_ref)</FieldLabel>
      <input value={toRef} style={inputStyle}
        onChange={e => setToRef(e.target.value)}
        onBlur={() => onUpdate(profileId, { to_ref: toRef })}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />

      <FieldLabel>Comment</FieldLabel>
      <input value={comment} style={inputStyle}
        onChange={e => setComment(e.target.value)}
        onBlur={() => onUpdate(profileId, { options: { ...profile.options, comment } })}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />

      <div style={{ height: 1, background: 'var(--border)', margin: '18px 0 0' }} />

      {/* ATTRIBUTE PLAN */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>Attribute Plan</div>
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', fontFamily: 'var(--font-mono)' }}>{attrCount} / {attrCount}</div>
      </div>

      {attrCount === 0 && (
        <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--ink-4)', marginBottom: 8 }}>
          {linked ? 'No attributes configured.' : 'Select a credential definition to auto-populate attributes.'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {attrs.map(([attrName, spec]) => (
          <AttributeRow key={attrName} attrName={attrName} spec={spec} onUpdate={updates => updateAttr(attrName, updates)} />
        ))}
      </div>

      {schemaAttributes.length > 0 && schemaAttributes.some(a => !profile.attribute_plan?.[a]) && (
        <button
          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-sunk)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', fontSize: 11.5, color: 'var(--ink-3)', cursor: 'pointer', marginTop: 6 }}
          onMouseDown={e => e.stopPropagation()}
          onClick={() => {
            const existing = profile.attribute_plan || {}
            const newPlan = { ...existing }
            schemaAttributes.filter(a => !existing[a]).forEach(a => { newPlan[a] = { source: 'context', path: a, required: true } })
            onUpdate(profileId, { attribute_plan: newPlan })
          }}
        >+ Add missing schema attributes</button>
      )}

      <button
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px 10px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 7, fontFamily: 'inherit', fontSize: 12, color: 'var(--ink-3)', cursor: 'pointer', marginTop: 6, transition: 'all 0.12s' }}
        onMouseDown={e => e.stopPropagation()}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-ink)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-3)' }}
        onClick={() => {
          const newName = `attr_${Date.now().toString(36)}`
          onUpdate(profileId, { attribute_plan: { ...profile.attribute_plan, [newName]: { source: 'context', path: newName, required: false } } })
        }}
      >+ Add attribute</button>

      {/* USED BY */}
      {usedByStates.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '18px 0 0' }} />
          <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginTop: 14, marginBottom: 10 }}>Used By</div>
          {usedByStates.map((stateName: string) => (
            <div key={stateName} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 9px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, marginBottom: 6 }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, padding: '1px 5px', background: 'var(--bg-sunk)', borderRadius: 3, color: 'var(--ink-4)', letterSpacing: '0.04em' }}>STATE</span>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{stateName}</span>
            </div>
          ))}
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
        <button onMouseDown={e => e.stopPropagation()} onClick={() => onDuplicate(profileId, profile)} style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Duplicate</button>
        <button onMouseDown={e => e.stopPropagation()} onClick={() => onDelete(profileId)} style={{ fontSize: 13, fontWeight: 500, color: 'var(--red-ink, #dc2626)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Delete</button>
      </div>
    </div>
  )
}

// ── Attribute row ─────────────────────────────────────────────────────────────

function AttributeRow({ attrName, spec, onUpdate: _onUpdate }: {
  attrName: string; spec: AttributeSpec; onUpdate: (updates: Partial<AttributeSpec>) => void
}) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 500, color: 'var(--ink)', flex: 1 }}>{attrName}</span>
        {spec.required && <span style={{ fontSize: 9.5, fontWeight: 600, padding: '2px 6px', background: 'oklch(0.96 0.06 75)', color: 'var(--amber-ink)', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>REQUIRED</span>}
        {spec.source === 'context' && <span style={{ fontSize: 9.5, fontWeight: 600, padding: '2px 6px', background: 'oklch(0.94 0.06 250)', color: 'var(--accent-ink)', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>CONTEXT</span>}
        {spec.source === 'static' && <span style={{ fontSize: 9.5, fontWeight: 600, padding: '2px 6px', background: 'oklch(0.94 0.06 295)', color: 'var(--violet-ink)', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>STATIC</span>}
        {spec.source === 'compute' && <span style={{ fontSize: 9.5, fontWeight: 600, padding: '2px 6px', background: 'var(--bg-sunk)', color: 'var(--ink-3)', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>COMPUTE</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, display: 'flex', gap: 4, alignItems: 'baseline' }}>
        {spec.source === 'context' && spec.path && <><span style={{ color: 'var(--ink-5)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, fontSize: 9.5 }}>PATH</span><span style={{ fontFamily: 'var(--font-mono)' }}>{spec.path}</span></>}
        {spec.source === 'static' && spec.value !== undefined && <><span style={{ color: 'var(--ink-5)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, fontSize: 9.5 }}>VALUE</span><span style={{ fontFamily: 'var(--font-mono)' }}>{String(spec.value)}</span></>}
        {spec.source === 'compute' && spec.expr && <><span style={{ color: 'var(--ink-5)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, fontSize: 9.5 }}>EXPR</span><span style={{ fontFamily: 'var(--font-mono)' }}>{spec.expr}</span></>}
      </div>
    </div>
  )
}

// ── State inspector ───────────────────────────────────────────────────────────

function StateInspector({ state, onUpdate, template }: {
  state: { name: string; type: StateType; section?: string }
  onUpdate: (name: string, updates: Partial<{ name: string; type: StateType; section?: string }>) => void
  template: any
}) {
  const [localName, setLocalName] = useState(state.name)
  useEffect(() => { setLocalName(state.name) }, [state.name])

  const handleNameBlur = () => {
    if (localName !== state.name && localName.trim()) onUpdate(state.name, { name: localName.trim() })
  }

  return (
    <>
      <div style={{ padding: '16px 18px' }}>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>State</div>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--ink)', marginTop: 2, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_TYPE_COLORS[state.type], flexShrink: 0 }} />
          {state.name}
        </div>
        <FieldLabel>Name</FieldLabel>
        <input type="text" value={localName} style={inputStyle}
          onChange={e => setLocalName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={e => e.key === 'Enter' && handleNameBlur()}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <FieldLabel>Type</FieldLabel>
        <select value={state.type} onChange={e => onUpdate(state.name, { type: e.target.value as StateType })} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="start">Start</option>
          <option value="normal">Normal</option>
          <option value="final">Final</option>
        </select>
        {template.sections?.length > 0 && (
          <>
            <FieldLabel>Section</FieldLabel>
            <select value={state.section || ''} onChange={e => onUpdate(state.name, { section: e.target.value || undefined })} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">None</option>
              {template.sections.map((sec: any) => <option key={sec.name} value={sec.name}>{sec.name}</option>)}
            </select>
          </>
        )}
      </div>
      <UIElementsSection stateName={state.name} template={template} />
    </>
  )
}

// ── Transition inspector ──────────────────────────────────────────────────────

function TransitionInspector({ transition, edgeId, onUpdate, template }: {
  transition: { from: string; to: string; on: string; guard?: string; action?: string }
  edgeId: string
  onUpdate: (id: string, updates: Partial<{ on: string; guard?: string; action?: string }>) => void
  template: any
}) {
  const [localEvent, setLocalEvent] = useState(transition.on)
  const [localGuard, setLocalGuard] = useState(transition.guard || '')
  useEffect(() => { setLocalEvent(transition.on); setLocalGuard(transition.guard || '') }, [transition.on, transition.guard])

  return (
    <div style={{ padding: '16px 18px' }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Transition</div>
      <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--ink)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
        {transition.from} → {transition.to}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 14 }}>
        {[['From', transition.from], ['To', transition.to]].map(([label, val]) => (
          <div key={label} style={{ background: 'var(--bg)', borderRadius: 6, padding: '6px 10px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{val}</div>
          </div>
        ))}
      </div>
      <FieldLabel>Event</FieldLabel>
      <input type="text" value={localEvent} style={inputStyle}
        onChange={e => setLocalEvent(e.target.value)}
        onBlur={() => { if (localEvent !== transition.on && localEvent.trim()) onUpdate(edgeId, { on: localEvent.trim() }) }}
        onKeyDown={e => e.key === 'Enter' && onUpdate(edgeId, { on: localEvent.trim() })}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
      <FieldLabel>Guard <span style={{ color: 'var(--ink-5)', textTransform: 'none', fontWeight: 400, letterSpacing: 0, fontSize: 10 }}>(JMESPath)</span></FieldLabel>
      <input type="text" value={localGuard} style={inputStyle}
        onChange={e => setLocalGuard(e.target.value)}
        onBlur={() => onUpdate(edgeId, { guard: localGuard || undefined })}
        placeholder="e.g., context.ready == `true`"
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
      <FieldLabel>Action</FieldLabel>
      <select value={transition.action || ''} onChange={e => onUpdate(edgeId, { action: e.target.value || undefined })} style={{ ...inputStyle, cursor: 'pointer' }}>
        <option value="">None</option>
        {template.actions?.map((a: any) => (
          <option key={a.key} value={a.key}>
            {a.key} ({ACTION_TYPE_LABELS[a.typeURI as keyof typeof ACTION_TYPE_LABELS] || 'Action'})
          </option>
        ))}
      </select>
    </div>
  )
}

// ── UI Elements Section ───────────────────────────────────────────────────────

const UI_GROUPS: { label: string; types: UIElementType[] }[] = [
  { label: 'Content', types: ['title', 'text', 'warning', 'badge', 'image', 'video', 'divider', 'spacer', 'list'] },
  { label: 'Charts', types: ['bar-chart', 'pie-chart', 'donut-chart', 'gauge', 'timeline', 'table'] },
  { label: 'Interactive', types: ['input', 'checkbox', 'button', 'submit-button'] },
  { label: 'Layout', types: ['card', 'container'] },
]

function UITypeIcon({ type }: { type: UIElementType }) {
  const icons: Record<UIElementType, React.ReactNode> = {
    title: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M8 12h8M10 18h4"/></svg>,
    text: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h7"/></svg>,
    warning: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>,
    button: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2"/></svg>,
    'submit-button': <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    input: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 12h10"/></svg>,
    checkbox: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m9 12 2 2 4-4"/></svg>,
    card: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="8" x2="22" y2="8"/></svg>,
    container: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="2"/></svg>,
    divider: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12"/></svg>,
    spacer: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="2" x2="12" y2="22" strokeDasharray="2 3"/></svg>,
    list: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>,
    table: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="1"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="8" y1="8" x2="8" y2="22"/></svg>,
    badge: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/></svg>,
    image: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    video: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>,
    'bar-chart': <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>,
    'pie-chart': <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 3v9h9"/></svg>,
    'donut-chart': <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg>,
    gauge: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 19a7 7 0 0 1 14 0"/><path d="M12 13l4-4"/></svg>,
    timeline: <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 4v16"/><circle cx="6" cy="8" r="1.5" fill="currentColor"/><circle cx="6" cy="16" r="1.5" fill="currentColor"/><path d="M10 8h8M10 16h8"/></svg>,
  }
  return <span style={{ color: 'var(--ink-3)', display: 'flex', alignItems: 'center' }}>{icons[type]}</span>
}

function UIElementsSection({ stateName, template }: { stateName: string; template: any }) {
  const { addUIElement, updateUIElement, removeUIElement, reorderUIElements } = useBuilderStore()
  const [activeProfile, setActiveProfile] = useState<'sender' | 'receiver'>('sender')
  const [showPicker, setShowPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const elements: UIElement[] = template.display_hints?.profiles?.[activeProfile]?.states?.[stateName] || []

  useEffect(() => {
    if (!showPicker) return
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showPicker])

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 0' }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-4)' }}>UI Elements</div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg-sunk)', borderRadius: 6, padding: 2 }}>
          {(['sender', 'receiver'] as const).map(p => (
            <button key={p} onClick={() => setActiveProfile(p)} style={{
              padding: '3px 10px', borderRadius: 4, border: 'none', fontFamily: 'inherit',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              background: activeProfile === p ? 'var(--bg)' : 'transparent',
              color: activeProfile === p ? 'var(--ink)' : 'var(--ink-4)',
              boxShadow: activeProfile === p ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.12s',
            }}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '10px 18px 0' }}>
        {elements.length === 0 ? (
          <div style={{ padding: '10px 12px', border: '1px dashed var(--border)', borderRadius: 7, fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>
            No UI elements. Click + Add element below.
          </div>
        ) : (
          elements.map((element, i) => (
            <UIElementRow
              key={i}
              element={element}
              onUpdate={(updated) => updateUIElement(stateName, activeProfile, i, updated)}
              onDelete={() => removeUIElement(stateName, activeProfile, i)}
              onMoveUp={i > 0 ? () => reorderUIElements(stateName, activeProfile, i, i - 1) : undefined}
              onMoveDown={i < elements.length - 1 ? () => reorderUIElements(stateName, activeProfile, i, i + 1) : undefined}
            />
          ))
        )}
      </div>

      <div style={{ padding: '8px 18px 0', position: 'relative' }} ref={pickerRef}>
        <button
          onClick={() => setShowPicker(v => !v)}
          style={{
            width: '100%', padding: '7px 10px', background: 'transparent',
            border: `1px ${showPicker ? 'solid var(--accent)' : 'dashed var(--border)'}`,
            borderRadius: 7, fontFamily: 'inherit', fontSize: 12,
            color: showPicker ? 'var(--accent-ink)' : 'var(--ink-3)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
          }}
          onMouseEnter={e => { if (!showPicker) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-4)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink)' } }}
          onMouseLeave={e => { if (!showPicker) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--ink-3)' } }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add element
        </button>

        {showPicker && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--bg-elev)', border: '1px solid var(--accent)', borderRadius: 8, boxShadow: '0 4px 16px -4px rgba(0,0,0,0.18)', overflow: 'hidden', marginTop: 4 }}>
            {UI_GROUPS.map(group => (
              <div key={group.label}>
                <div style={{ padding: '7px 12px 4px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-5)', borderBottom: '1px solid var(--border)' }}>
                  {group.label}
                </div>
                {group.types.map(type => (
                  <div
                    key={type}
                    onMouseDown={e => { e.preventDefault(); setShowPicker(false); addUIElement(stateName, activeProfile, makeDefaultElement(type)) }}
                    style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.08s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunk)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    <UITypeIcon type={type} />
                    <span>{UI_ELEMENT_LABELS[type]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── UI Element Row ────────────────────────────────────────────────────────────

function UIElementRow({ element, onUpdate, onDelete, onMoveUp, onMoveDown }: {
  element: UIElement
  onUpdate: (updated: UIElement) => void
  onDelete: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const [open, setOpen] = useState(false)
  const canHaveChildren = element.type === 'card' || element.type === 'container'
  const children = element.children || []
  const previewText = element.text || element.label || element.title || element.src || element.asset || '—'

  const [showChildPicker, setShowChildPicker] = useState(false)
  const childPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showChildPicker) return
    const onDown = (e: MouseEvent) => {
      if (childPickerRef.current && !childPickerRef.current.contains(e.target as Node)) setShowChildPicker(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showChildPicker])

  return (
    <div style={{ marginBottom: 5 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 8px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: open ? '6px 6px 0 0' : 6, cursor: 'pointer', userSelect: 'none' as const }}
        onClick={() => setOpen(v => !v)}
      >
        <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5" style={{ flexShrink: 0, transition: 'transform 0.14s', transform: open ? 'rotate(90deg)' : 'none', color: 'var(--ink-4)' }}>
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', padding: '2px 5px', borderRadius: 3, background: 'var(--bg-sunk)', color: 'var(--ink-3)', flexShrink: 0 }}>
          {element.type}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
          {previewText}
        </span>
        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          {onMoveUp && (
            <button onClick={onMoveUp} title="Move up" style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', borderRadius: 3, fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}>↑</button>
          )}
          {onMoveDown && (
            <button onClick={onMoveDown} title="Move down" style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', borderRadius: 3, fontFamily: 'inherit', fontSize: 11, fontWeight: 600 }}>↓</button>
          )}
          <button onClick={onDelete} title="Delete" style={{ width: 20, height: 20, display: 'grid', placeItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-ink, #dc2626)', borderRadius: 3, fontFamily: 'inherit', fontSize: 14, fontWeight: 400, lineHeight: 1 }}>×</button>
        </div>
      </div>

      {open && (
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 6px 6px', background: 'var(--bg-elev)', padding: '10px 10px 8px' }}>
          <UIElementFields element={element} onUpdate={onUpdate} />

          {canHaveChildren && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-4)', marginBottom: 6 }}>Children</div>
              {children.map((child, i) => (
                <div key={i} style={{ marginLeft: 10 }}>
                  <UIElementRow
                    element={child}
                    onUpdate={(updated) => {
                      const next = [...children]; next[i] = updated
                      onUpdate({ ...element, children: next })
                    }}
                    onDelete={() => {
                      const next = children.filter((_, idx) => idx !== i)
                      onUpdate({ ...element, children: next })
                    }}
                    onMoveUp={i > 0 ? () => {
                      const next = [...children];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]]
                      onUpdate({ ...element, children: next })
                    } : undefined}
                    onMoveDown={i < children.length - 1 ? () => {
                      const next = [...children];
                      [next[i], next[i + 1]] = [next[i + 1], next[i]]
                      onUpdate({ ...element, children: next })
                    } : undefined}
                  />
                </div>
              ))}

              <div style={{ position: 'relative', marginLeft: 10 }} ref={childPickerRef}>
                <button
                  onClick={() => setShowChildPicker(v => !v)}
                  style={{ width: '100%', padding: '5px 8px', background: 'transparent', border: `1px ${showChildPicker ? 'solid var(--accent)' : 'dashed var(--border)'}`, borderRadius: 5, fontFamily: 'inherit', fontSize: 11, color: showChildPicker ? 'var(--accent-ink)' : 'var(--ink-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}
                >
                  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add child
                </button>
                {showChildPicker && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: 'var(--bg-elev)', border: '1px solid var(--accent)', borderRadius: 7, boxShadow: '0 4px 14px -4px rgba(0,0,0,0.18)', overflow: 'hidden', marginTop: 3 }}>
                    {UI_GROUPS.map(group => (
                      <div key={group.label}>
                        <div style={{ padding: '6px 10px 3px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.08em', color: 'var(--ink-5)', borderBottom: '1px solid var(--border)' }}>{group.label}</div>
                        {group.types.map(type => (
                          <div
                            key={type}
                            onMouseDown={e => {
                              e.preventDefault(); setShowChildPicker(false)
                              const next = [...children, makeDefaultElement(type)]
                              onUpdate({ ...element, children: next })
                            }}
                            style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.08s' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-sunk)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          >
                            <UITypeIcon type={type} />
                            <span>{UI_ELEMENT_LABELS[type]}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Per-type property fields ──────────────────────────────────────────────────

function UIInputField({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
      <input
        value={local}
        placeholder={placeholder}
        style={{ ...inputStyle, fontSize: 12, fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )
}

function UITextareaField({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
      <textarea
        value={local}
        placeholder={placeholder}
        rows={3}
        style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--ink)', outline: 'none', fontFamily: mono ? 'var(--font-mono)' : 'inherit', boxSizing: 'border-box' as const, resize: 'vertical' as const, lineHeight: 1.5 }}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      />
    </div>
  )
}

function UISelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-4)', marginBottom: 3 }}>{label}</div>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, fontSize: 12, cursor: 'pointer' }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function UICheckboxField({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--ink-2)' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
        <span>{label}</span>
      </label>
      {hint && <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.4 }}>{hint}</div>}
    </div>
  )
}

function UIJsonField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <UITextareaField label={label} value={value} onChange={onChange} placeholder={placeholder} mono />
  )
}

function UIElementFields({ element, onUpdate }: { element: UIElement; onUpdate: (updated: UIElement) => void }) {
  const u = (updates: Partial<UIElement>) => onUpdate({ ...element, ...updates } as UIElement)

  switch (element.type) {
    case 'title':
      return (
        <>
          <UIInputField label="Text" value={element.text || ''} onChange={v => u({ text: v })} />
          <UISelectField label="Level" value={String(element.level || 2)} options={[
            { value: '1', label: 'H1' },
            { value: '2', label: 'H2' },
            { value: '3', label: 'H3' },
            { value: '4', label: 'H4' },
            { value: '5', label: 'H5' },
            { value: '6', label: 'H6' },
          ]} onChange={v => u({ level: Number(v) as 1 | 2 | 3 | 4 | 5 | 6 })} />
        </>
      )

    case 'text':
      return <UITextareaField label="Text" value={element.text || ''} onChange={v => u({ text: v })} />

    case 'warning':
      return (
        <>
          <UIInputField label="Title" value={element.title || ''} onChange={v => u({ title: v })} />
          <UITextareaField label="Text" value={element.text || ''} onChange={v => u({ text: v })} />
          <UISelectField label="Tone" value={element.tone || 'warning'} options={[
            { value: 'info', label: 'Info' },
            { value: 'warning', label: 'Warning' },
            { value: 'success', label: 'Success' },
            { value: 'error', label: 'Error' },
          ]} onChange={v => u({ tone: v as UIElement['tone'] })} />
        </>
      )

    case 'input':
      return (
        <>
          <UIInputField label="Label" value={element.label || ''} onChange={v => u({ label: v })} />
          <UIInputField label="Name" value={element.name || ''} onChange={v => u({ name: v || undefined })} mono />
          <UIInputField label="Placeholder" value={element.placeholder || ''} onChange={v => u({ placeholder: v || undefined })} />
          <UISelectField label="Input Type" value={element.inputType || 'text'} options={[
            { value: 'text', label: 'Text' },
            { value: 'email', label: 'Email' },
            { value: 'number', label: 'Number' },
            { value: 'date', label: 'Date' },
            { value: 'textarea', label: 'Textarea' },
          ]} onChange={v => u({ inputType: v as UIElement['inputType'] })} />
          <UICheckboxField label="Required" checked={!!element.required} onChange={checked => u({ required: checked })} />
          <UIInputField label="Default Value" value={String(element.defaultValue ?? '')} onChange={v => u({ defaultValue: v })} />
          <UIInputField label="Helper Text" value={element.helperText || ''} onChange={v => u({ helperText: v || undefined })} />
        </>
      )

    case 'checkbox':
      return (
        <>
          <UIInputField label="Label" value={element.label || ''} onChange={v => u({ label: v })} />
          <UIInputField label="Name" value={element.name || ''} onChange={v => u({ name: v || undefined })} mono />
          <UICheckboxField label="Checked by default" checked={!!element.checked} onChange={checked => u({ checked })} />
          <UICheckboxField label="Required" checked={!!element.required} onChange={checked => u({ required: checked })} />
          <UIInputField label="Helper Text" value={element.helperText || ''} onChange={v => u({ helperText: v || undefined })} />
        </>
      )

    case 'button':
      return (
        <>
          <UIInputField label="Label" value={element.label || ''} onChange={v => u({ label: v })} />
          <UIInputField label="Event" value={element.event || ''} onChange={v => u({ event: v })} mono />
          <UIInputField label="Enabled When" value={element.enabledWhen || ''} onChange={v => u({ enabledWhen: v || undefined })} placeholder="JMESPath (optional)" mono />
          <UIInputField label="Show When" value={element.showWhen || ''} onChange={v => u({ showWhen: v || undefined })} placeholder="JMESPath (optional)" mono />
        </>
      )

    case 'submit-button':
      return (
        <>
          <UIInputField label="Label" value={element.label || ''} onChange={v => u({ label: v })} />
          <UIInputField label="Event" value={element.event || ''} onChange={v => u({ event: v })} mono />
          <UIInputField label="Enabled When" value={element.enabledWhen || ''} onChange={v => u({ enabledWhen: v || undefined })} placeholder="JMESPath (optional)" mono />
          <UIInputField label="Show When" value={element.showWhen || ''} onChange={v => u({ showWhen: v || undefined })} placeholder="JMESPath (optional)" mono />
          <UITextareaField
            label="Input Schema (JSON)"
            value={element.input_schema ? JSON.stringify(element.input_schema, null, 2) : ''}
            onChange={v => { try { u({ input_schema: v ? JSON.parse(v) : undefined }) } catch { /* ignore invalid JSON */ } }}
            placeholder='{ "type": "object", "properties": {} }'
            mono
          />
        </>
      )

    case 'card':
      return <UIInputField label="Title" value={element.title || ''} onChange={v => u({ title: v })} />

    case 'container':
      return <UIInputField label="Variant" value={element.variant || ''} onChange={v => u({ variant: v || undefined })} placeholder="optional" />

    case 'divider':
    case 'spacer':
      return <div style={{ fontSize: 11.5, color: 'var(--ink-4)', padding: '4px 0' }}>No properties.</div>

    case 'list':
      return <UIListItemsEditor title={element.title || ''} items={(element.items || []).map(item => typeof item === 'string' ? item : item.title || '')} onTitleChange={v => u({ title: v || undefined })} onItemsChange={items => u({ items })} />

    case 'table':
      return <UITableEditor title={element.title || ''} columns={element.columns || []} rows={element.rows || []} onTitleChange={v => u({ title: v || undefined })} onColumnsChange={cols => u({ columns: cols })} onRowsChange={rows => u({ rows })} />

    case 'badge':
      return (
        <>
          <UIInputField label="Text" value={element.text || ''} onChange={v => u({ text: v })} />
          <UIInputField label="Variant" value={element.variant || ''} onChange={v => u({ variant: v || undefined })} placeholder="optional" />
        </>
      )

    case 'bar-chart':
    case 'pie-chart':
    case 'donut-chart':
      return (
        <>
          <UIInputField label="Title" value={element.title || ''} onChange={v => u({ title: v || undefined })} placeholder="optional" />
          <UIJsonField
            label="Data (JSON)"
            value={JSON.stringify(element.data || element.series || [
              { label: 'A', value: 35 },
              { label: 'B', value: 25 },
              { label: 'C', value: 40 },
            ], null, 2)}
            onChange={v => {
              try {
                const parsed = v ? JSON.parse(v) : []
                if (Array.isArray(parsed)) u({ data: parsed as UIElement['data'] })
              } catch {
                /* ignore invalid JSON */
              }
            }}
            placeholder='[{ "label": "A", "value": 30 }]'
          />
        </>
      )

    case 'gauge':
      return (
        <>
          <UIInputField label="Title" value={element.title || ''} onChange={v => u({ title: v || undefined })} placeholder="optional" />
          <UIInputField label="Value" value={String(element.value ?? 65)} onChange={v => u({ value: Number(v) })} />
          <UIInputField label="Max" value={String(element.max ?? 100)} onChange={v => u({ max: Number(v) })} />
        </>
      )

    case 'timeline':
      return (
        <>
          <UIInputField label="Title" value={element.title || ''} onChange={v => u({ title: v || undefined })} placeholder="optional" />
          <UIJsonField
            label="Items (JSON)"
            value={JSON.stringify(element.items || [
              { title: 'Started', meta: 'Now' },
              { title: 'Waiting for review', meta: 'Next' },
            ], null, 2)}
            onChange={v => {
              try {
                const parsed = v ? JSON.parse(v) : []
                if (Array.isArray(parsed)) u({ items: parsed })
              } catch {
                /* ignore invalid JSON */
              }
            }}
            placeholder='[{ "title": "Submitted", "meta": "1m ago" }]'
          />
        </>
      )

    case 'image':
      return (
        <>
          <UIInputField label="Src (URL)" value={element.src || ''} onChange={v => u({ src: v || undefined })} mono />
          <UIInputField label="Asset" value={element.asset || ''} onChange={v => u({ asset: v || undefined })} placeholder="optional asset key" />
          <UIInputField label="Alt" value={element.alt || ''} onChange={v => u({ alt: v || undefined })} />
          <UISelectField label="Size" value={element.size || 'md'} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} onChange={v => u({ size: v as 'sm' | 'md' | 'lg' })} />
        </>
      )

    case 'video':
      return (
        <>
          <UIInputField label="Src (URL)" value={element.src || ''} onChange={v => u({ src: v || undefined })} mono />
          <UIInputField label="Asset" value={element.asset || ''} onChange={v => u({ asset: v || undefined })} placeholder="optional asset key" />
          <UISelectField label="Size" value={element.size || 'md'} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} onChange={v => u({ size: v as 'sm' | 'md' | 'lg' })} />
        </>
      )

    default:
      return null
  }
}

// ── List items editor ─────────────────────────────────────────────────────────

function UIListItemsEditor({ title, items, onTitleChange, onItemsChange }: {
  title: string; items: string[]; onTitleChange: (v: string) => void; onItemsChange: (items: string[]) => void
}) {
  return (
    <>
      <UIInputField label="Title" value={title} onChange={onTitleChange} placeholder="optional" />
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-4)', marginBottom: 4 }}>Items</div>
      {items.map((item, i) => (
        <UIListItemRow key={i} value={item} onChange={v => { const next = [...items]; next[i] = v; onItemsChange(next) }} onDelete={() => onItemsChange(items.filter((_, idx) => idx !== i))} />
      ))}
      <button
        onClick={() => onItemsChange([...items, ''])}
        style={{ width: '100%', padding: '5px 8px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 5, fontFamily: 'inherit', fontSize: 11, color: 'var(--ink-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginBottom: 8 }}
      >
        <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add item
      </button>
    </>
  )
}

function UIListItemRow({ value, onChange, onDelete }: { value: string; onChange: (v: string) => void; onDelete: () => void }) {
  const [local, setLocal] = useState(value)
  useEffect(() => { setLocal(value) }, [value])
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
      <input value={local} style={{ ...inputStyle, flex: 1, fontSize: 12 }} onChange={e => setLocal(e.target.value)} onBlur={() => onChange(local)} onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')} onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
      <button onClick={onDelete} style={{ width: 28, height: 32, background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--red-ink, #dc2626)', fontSize: 14, display: 'grid', placeItems: 'center' }}>×</button>
    </div>
  )
}

// ── Table editor ──────────────────────────────────────────────────────────────

function UITableEditor({ title, columns, rows, onTitleChange, onColumnsChange, onRowsChange }: {
  title: string
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, unknown>>
  onTitleChange: (v: string) => void
  onColumnsChange: (cols: Array<{ key: string; label: string }>) => void
  onRowsChange: (rows: Array<Record<string, unknown>>) => void
}) {
  return (
    <>
      <UIInputField label="Title" value={title} onChange={onTitleChange} placeholder="optional" />
      <div style={{ fontSize: 9.5, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: 'var(--ink-4)', marginBottom: 4 }}>Columns</div>
      {columns.map((col, i) => (
        <UITableColumnRow
          key={i}
          col={col}
          onChange={updated => { const next = [...columns]; next[i] = updated; onColumnsChange(next) }}
          onDelete={() => onColumnsChange(columns.filter((_, idx) => idx !== i))}
        />
      ))}
      <button
        onClick={() => onColumnsChange([...columns, { key: '', label: '' }])}
        style={{ width: '100%', padding: '5px 8px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: 5, fontFamily: 'inherit', fontSize: 11, color: 'var(--ink-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center', marginBottom: 8 }}
      >
        <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add column
      </button>
      <UITextareaField
        label="Rows (JSON)"
        value={rows.length > 0 ? JSON.stringify(rows, null, 2) : ''}
        onChange={v => { try { onRowsChange(v ? JSON.parse(v) : []) } catch { /* ignore */ } }}
        placeholder="[]"
        mono
      />
    </>
  )
}

function UITableColumnRow({ col, onChange, onDelete }: { col: { key: string; label: string }; onChange: (c: { key: string; label: string }) => void; onDelete: () => void }) {
  const [key, setKey] = useState(col.key)
  const [label, setLabel] = useState(col.label)
  useEffect(() => { setKey(col.key); setLabel(col.label) }, [col.key, col.label])
  const commit = () => onChange({ key, label })
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
      <input value={key} placeholder="key" style={{ ...inputStyle, flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)' }} onChange={e => setKey(e.target.value)} onBlur={commit} onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')} onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
      <input value={label} placeholder="label" style={{ ...inputStyle, flex: 1, fontSize: 11 }} onChange={e => setLabel(e.target.value)} onBlur={commit} onFocus={e => (e.currentTarget.style.borderColor = 'var(--border)')} onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
      <button onClick={onDelete} style={{ width: 28, height: 32, background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--red-ink, #dc2626)', fontSize: 14, display: 'grid', placeItems: 'center' }}>×</button>
    </div>
  )
}
