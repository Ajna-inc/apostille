'use client'

import { useEffect, useRef, useState } from 'react'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { ACTION_TYPE_LABELS, STATE_TYPE_COLORS } from '@/lib/workflow-builder/constants'
import { schemaApi } from '@/lib/api'
import type { StateType, CredentialProfile, AttributeSpec } from '@/lib/workflow-builder/types'

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
    // Re-assert selection in case canvas cleared it
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
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  {linked.tag}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500, padding: '1px 5px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 3 }}>
                    {linked.credentialDefinitionId.split(':')[3] || 'v1'}
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

        {/* Custom inline dropdown — stays within PropertiesPanel DOM, never overlaps canvas */}
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

function AttributeRow({ attrName, spec, onUpdate }: {
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
