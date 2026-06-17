'use client'

import { useEffect, useState } from 'react'
import { useBuilderStore } from '@/lib/workflow-builder/store'
import { STATE_TYPE_COLORS, ACTION_TYPE_URIS } from '@/lib/workflow-builder/constants'
import type { StateType } from '@/lib/workflow-builder/types'

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({ label, hint, right }: { label: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 0', marginBottom: 10, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
      <span>{label}</span>
      {hint && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-5)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{hint}</span>}
      {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  )
}

function PaletteItem({ label, icon, description, onDragStart }: {
  label: string; icon: React.ReactNode; description: string; onDragStart: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'copy'; onDragStart() }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={description}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px',
        background: hov ? 'var(--bg-elev)' : 'var(--bg)',
        border: `1px solid ${hov ? 'var(--ink-4)' : 'var(--border)'}`,
        borderRadius: 6, fontSize: 12.5, color: 'var(--ink-2)',
        cursor: 'grab', marginBottom: 6, transition: 'all 0.1s', userSelect: 'none',
      }}
    >
      <div style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--bg-elev)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', flexShrink: 0 }}>
        {icon}
      </div>
      <span>{label}</span>
    </div>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

const PlayIcon = ({ color }: { color?: string }) => (
  <svg width="13" height="13" fill={color || 'currentColor'} viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
)
const CircleIcon = ({ color }: { color?: string }) => (
  <svg width="13" height="13" fill="none" stroke={color || 'currentColor'} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2"/></svg>
)
const CheckCircleIcon = ({ color }: { color?: string }) => (
  <svg width="13" height="13" fill={color || 'currentColor'} viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
)
const SendIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
const FileCheckIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
const ShieldIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
const PenIcon = () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>

const inputStyle: React.CSSProperties = {
  height: 30, width: '100%', padding: '0 10px',
  border: '1px solid var(--border)', background: 'var(--bg)',
  borderRadius: 6, fontSize: 12.5, color: 'var(--ink)',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}

// ── Main component ────────────────────────────────────────────────────────────

export function BuilderSidebar() {
  const {
    startDrag, credentialDefinitions, template,
    updateTemplateMetadata, setSelection, selection,
    addCredentialProfile,
  } = useBuilderStore()

  const [name, setName] = useState(template.title || '')
  const [key, setKey] = useState(template.template_id || '')

  useEffect(() => { setName(template.title || '') }, [template.title])
  useEffect(() => { setKey(template.template_id || '') }, [template.template_id])

  // Credential profiles from the template catalog
  const credProfiles = Object.entries(template.catalog?.credential_profiles || {})

  // Which credential profile is selected (via selection.nodes with 'cred:' prefix)
  const selectedCredKey = selection.nodes.length === 1 && selection.nodes[0].startsWith('cred:')
    ? selection.nodes[0] : null

  const stateItems: Array<{ type: StateType; label: string; icon: React.ReactNode }> = [
    { type: 'start',  label: 'Start state',  icon: <PlayIcon  color={STATE_TYPE_COLORS.start}  /> },
    { type: 'normal', label: 'Normal state', icon: <CircleIcon color={STATE_TYPE_COLORS.normal} /> },
    { type: 'final',  label: 'Final state',  icon: <CheckCircleIcon color={STATE_TYPE_COLORS.final} /> },
  ]

  const actionItems = [
    { typeURI: ACTION_TYPE_URIS.CREDENTIAL_OFFER,   label: 'Offer credential',   icon: <SendIcon /> },
    { typeURI: ACTION_TYPE_URIS.CREDENTIAL_REQUEST,  label: 'Request credential', icon: <FileCheckIcon /> },
    { typeURI: ACTION_TYPE_URIS.PROOF_REQUEST,       label: 'Request proof',      icon: <ShieldIcon /> },
    { typeURI: ACTION_TYPE_URIS.STATE_SET,           label: 'Set context',        icon: <PenIcon /> },
  ]

  const handleAddProfile = () => {
    const newId = `cred_profile_${Date.now().toString(36)}`
    addCredentialProfile(newId, {
      cred_def_id: '',
      to_ref: 'holder',
      attribute_plan: {},
    })
    setSelection({ nodes: [`cred:${newId}`], edges: [] })
  }

  return (
    <div style={{ width: 280, flexShrink: 0, background: 'var(--bg-elev)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>

        {/* TEMPLATE INFO */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <SectionHeader label="Template info" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Name</label>
              <input type="text" value={name} style={inputStyle}
                onChange={e => setName(e.target.value)}
                onBlur={() => updateTemplateMetadata({ title: name })}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 10.5, color: 'var(--ink-4)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Key</label>
              <input type="text" value={key} style={inputStyle}
                onChange={e => setKey(e.target.value)}
                onBlur={() => updateTemplateMetadata({ template_id: key })}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>
          </div>
        </div>

        {/* STATES */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <SectionHeader label="States" hint="drag onto canvas" />
          <div style={{ padding: '0 16px' }}>
            {stateItems.map(item => (
              <PaletteItem key={item.type} label={item.label} icon={item.icon}
                description={`Drag to add a ${item.type} state`}
                onDragStart={() => startDrag({ type: 'state', data: { type: item.type } })}
              />
            ))}
          </div>
        </div>

        {/* ACTIONS */}
        <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <SectionHeader label="Actions" />
          <div style={{ padding: '0 16px' }}>
            {actionItems.map(item => (
              <PaletteItem key={item.typeURI} label={item.label} icon={item.icon}
                description={`Action: ${item.typeURI.split('/').pop()}`}
                onDragStart={() => startDrag({ type: 'action', data: { typeURI: item.typeURI } })}
              />
            ))}
          </div>
        </div>

        {/* CREDENTIALS — template catalog profiles only */}
        <div>
          <SectionHeader
            label="Credentials"
            right={
              <button
                onClick={handleAddProfile}
                style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--bg-sunk)', border: '1px solid var(--border)', color: 'var(--ink-3)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                title="Add credential profile"
              >
                <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            }
          />
          <div style={{ padding: '0 16px' }}>
            {credProfiles.length === 0 ? (
              <div style={{ padding: '10px 11px', border: '1px dashed var(--border)', borderRadius: 7, marginBottom: 6 }}>
                <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.5 }}>
                  No credential profiles. Click + to add one.
                </div>
              </div>
            ) : (
              credProfiles.map(([profileId, profile]) => {
                const credKey = `cred:${profileId}`
                const isSel = selectedCredKey === credKey
                const linked = credentialDefinitions.find(cd => cd.credentialDefinitionId === profile.cred_def_id)
                const attrCount = Object.keys(profile.attribute_plan || {}).length
                return (
                  <div
                    key={profileId}
                    onClick={() => setSelection({ nodes: [credKey], edges: [] })}
                    style={{
                      padding: '9px 11px', borderRadius: 7, marginBottom: 6, cursor: 'pointer', transition: 'all 0.12s',
                      background: isSel ? 'var(--accent-soft)' : 'var(--bg)',
                      border: `1px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ink-4)' }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ShieldIcon />
                      <span style={{ fontSize: 12.5, fontWeight: 500, color: isSel ? 'var(--accent-ink)' : 'var(--ink)' }}>{profileId}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {linked ? (
                        <><span style={{ fontWeight: 500, color: 'var(--ink-2)' }}>{linked.tag}</span><span style={{ padding: '1px 5px', background: 'var(--bg-sunk)', borderRadius: 3, color: 'var(--ink-4)' }}>v1</span><span style={{ color: 'var(--ink-4)' }}>· {attrCount} attrs</span></>
                      ) : (
                        <span style={{ color: 'var(--amber-ink)' }}>No cred def linked</span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
