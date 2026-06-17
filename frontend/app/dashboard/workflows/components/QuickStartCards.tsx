'use client'
import { useState } from 'react'
import { Icon } from '../../../components/ui/Icons'

interface WorkflowTemplate {
  template_id: string
  version: string
  title: string
  states?: Array<{ name: string; type: 'start' | 'normal' | 'final' }>
  sections?: Array<{ name: string }>
}

interface QuickStartCardsProps {
  templates: WorkflowTemplate[]
  onStart: (template: WorkflowTemplate) => void
  onCustomize: (template: WorkflowTemplate) => void
  onCreateCustom: () => void
  disabled?: boolean
  startingTemplateId?: string | null
  devMode?: boolean
}

const TEMPLATE_META: Record<string, { description: string; iconName: string; tag?: string }> = {
  'credential-application': {
    description: 'Applicant fills a form, you review it, then issue the credential.',
    iconName: 'fileCheck',

  },
  'kanon-multi-step-kyc': {
    description: 'Collect and verify identity documents across multiple steps before issuing.',
    iconName: 'userCheck',

  },
  'kanon-proof-to-credential': {
    description: 'Verify an existing credential via proof, then automatically issue a new one.',
    iconName: 'shieldCheck',

  },
  'kanon-auto-issue-on-request': {
    description: 'Instantly issue a credential when the counterparty requests one.',
    iconName: 'zap',

  },
}

function getTemplateMeta(templateId: string) {
  // Try exact match
  if (TEMPLATE_META[templateId]) return TEMPLATE_META[templateId]
  // Partial match
  for (const [key, val] of Object.entries(TEMPLATE_META)) {
    if (templateId.includes(key) || key.includes(templateId)) return val
  }
  if (templateId.includes('approval') || templateId.includes('application')) return TEMPLATE_META['credential-application']
  if (templateId.includes('kyc') || templateId.includes('multi')) return TEMPLATE_META['kanon-multi-step-kyc']
  if (templateId.includes('proof')) return TEMPLATE_META['kanon-proof-to-credential']
  if (templateId.includes('auto') || templateId.includes('issue')) return TEMPLATE_META['kanon-auto-issue-on-request']
  return { description: 'Run a templated credential exchange workflow.', iconName: 'workflow', tag: 'Custom' }
}

function TemplateCard({
  template,
  onStart,
  onCustomize,
  disabled,
  isStarting,
  devMode,
}: {
  template: WorkflowTemplate
  onStart: () => void
  onCustomize: () => void
  disabled: boolean
  isStarting: boolean
  devMode: boolean
}) {
  const meta = getTemplateMeta(template.template_id)
  const stateCount = template.states?.length || 0

  return (
    <div style={{
      background: 'var(--bg-elev)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '18px 18px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)'
        e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* Top */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: 'var(--accent-soft)', display: 'grid', placeItems: 'center',
        }}>
          <Icon name={meta.iconName as any} size={16} style={{ color: 'var(--accent)' }} />
        </div>
        {meta.tag && (
          <span style={{
            fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em',
            color: 'var(--accent)', background: 'var(--accent-soft)',
            padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
          }}>
            {meta.tag}
          </span>
        )}
      </div>

      {/* Title + description */}
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
          {template.title}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55 }}>
          {meta.description}
        </div>
      </div>

      {/* Dev-mode detail */}
      {devMode && (
        <div style={{ fontSize: 11, color: 'var(--ink-4)', fontFamily: 'var(--font-mono, monospace)' }}>
          {template.template_id} · v{template.version} · {stateCount} states
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
        <button
          onClick={onStart}
          disabled={disabled || isStarting}
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
        >
          {isStarting ? (
            <><span className="spinner" style={{ width: 12, height: 12, marginRight: 6 }} />Starting…</>
          ) : (
            'Start'
          )}
        </button>
        <button
          onClick={onCustomize}
          className="btn btn-ghost btn-icon btn-sm"
          title="Edit template"
          style={{ flexShrink: 0 }}
        >
          <Icon name="edit" size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Goal-picker data ──────────────────────────────────────────────────────────

const GOALS = [
  {
    id: 'issue',
    label: 'Issue a credential',
    icon: 'fileCheck' as const,
    description: 'Give someone a verifiable credential after they apply or qualify.',
    recommended: ['credential-application', 'kanon-auto-issue-on-request', 'kanon-proof-to-credential'],
  },
  {
    id: 'verify',
    label: 'Verify someone',
    icon: 'shieldCheck' as const,
    description: "Ask for a proof and act on whether it's valid.",
    recommended: ['kanon-proof-to-credential', 'kanon-multi-step-kyc'],
  },
  {
    id: 'collect',
    label: 'Collect an application',
    icon: 'userCheck' as const,
    description: 'Take input, route for review, decide approve/reject.',
    recommended: ['credential-application', 'kanon-multi-step-kyc'],
  },
  {
    id: 'compose',
    label: 'Compose your own',
    icon: 'setting' as const,
    description: 'Start from a blank state machine or import YAML.',
    recommended: [] as string[],
    action: 'compose' as const,
  },
] as const

const USE_WHEN: Record<string, string> = {
  'credential-application': 'Use when someone has to apply, you review the application, and you issue a credential if approved (or reject).',
  'kanon-auto-issue-on-request': 'Use when the credential is granted automatically — no manual review (e.g. employee badges).',
  'kanon-proof-to-credential': 'Use when you issue a new credential based on an existing one the user already holds.',
  'kanon-multi-step-kyc': 'For verification flows with document upload, biometric, and address checks across multiple sections.',
}

function getHappyPath(template: WorkflowTemplate): string[] {
  if (!template.states) return []
  const bad = ['reject', 'fail', 'error', 'cancel']
  return template.states.filter(s => !bad.some(w => s.name.toLowerCase().includes(w))).map(s => s.name)
}

function TemplateRecommendCard({
  template, onPick, onCustomize, disabled, isStarting,
}: {
  template: WorkflowTemplate
  onPick: () => void
  onCustomize: () => void
  disabled: boolean
  isStarting: boolean
}) {
  const meta = getTemplateMeta(template.template_id)
  const happyPath = getHappyPath(template)
  const showPath = happyPath.slice(0, 4)
  const extra = happyPath.length - showPath.length
  const stateCount = template.states?.length || 0
  const sectionCount = template.sections?.length || 0
  const useWhen = USE_WHEN[template.template_id] || meta.description

  return (
    <div style={{
      background: 'var(--bg-elev)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '16px',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 7, flexShrink: 0,
          background: 'var(--accent-soft)', display: 'grid', placeItems: 'center',
        }}>
          <Icon name={meta.iconName as any} size={14} style={{ color: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{template.title}</span>
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 500, color: 'var(--ink-4)',
          background: 'var(--bg-sunk)', padding: '2px 7px', borderRadius: 4,
          fontFamily: 'var(--font-mono, monospace)', flexShrink: 0,
        }}>
          v{template.version}
        </span>
      </div>

      {/* Use-when description */}
      <p style={{ fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.55, margin: 0 }}>
        {useWhen}
      </p>

      {/* State flow pills */}
      {showPath.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {showPath.map((s, i) => (
            <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {i > 0 && <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>→</span>}
              <span style={{
                fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
                background: s === 'done' || s === 'complete' ? 'var(--green-soft, #f0fdf4)' : 'var(--bg-sunk)',
                color: s === 'done' || s === 'complete' ? 'var(--green-ink, #166534)' : 'var(--ink-3)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-mono, monospace)',
              }}>
                {s}
              </span>
            </span>
          ))}
          {extra > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--ink-4)' }}>→</span>
              <span style={{
                fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
                background: 'var(--bg-sunk)', color: 'var(--ink-4)', border: '1px solid var(--border)',
              }}>+{extra}</span>
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 4 }}>
        <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
          {stateCount} states{sectionCount > 0 ? ` · ${sectionCount} section${sectionCount !== 1 ? 's' : ''}` : ''}
        </span>
        <div style={{ display: 'flex', gap: 5 }}>
          <button onClick={onCustomize} style={{
            width: 28, height: 28, display: 'grid', placeItems: 'center', borderRadius: 5, flexShrink: 0,
            background: 'none', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--ink-4)',
          }} title="Edit template">
            <Icon name="edit" size={12} />
          </button>
          <button onClick={onPick} disabled={disabled || isStarting} style={{
            fontSize: 12, fontWeight: 600, padding: '5px 14px', borderRadius: 5, flexShrink: 0,
            background: disabled ? 'var(--bg-sunk)' : 'var(--bg-elev)',
            color: disabled ? 'var(--ink-4)' : 'var(--ink)',
            border: '1px solid var(--border)', cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {isStarting
              ? <><span className="spinner" style={{ width: 11, height: 11 }} />Starting…</>
              : <><Icon name="play" size={11} style={{ color: 'var(--accent)' }} />Start</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}

export function GoalPicker({
  templates,
  onPick,
  onCustomize,
  onCreateCustom,
  disabled = false,
  startingTemplateId = null,
}: {
  templates: WorkflowTemplate[]
  onPick: (template: WorkflowTemplate) => void
  onCustomize: (template: WorkflowTemplate) => void
  onCreateCustom: () => void
  disabled?: boolean
  startingTemplateId?: string | null
}) {
  const [selectedGoalId, setSelectedGoalId] = useState<string>(GOALS[0].id)
  const selectedGoal = GOALS.find(g => g.id === selectedGoalId)!

  const recommended = (selectedGoal.recommended as readonly string[])
    .map(id => templates.find(t => t.template_id === id))
    .filter(Boolean) as WorkflowTemplate[]

  const others = templates.filter(t => !(selectedGoal.recommended as readonly string[]).includes(t.template_id))

  const sectionLabel = (text: string) => (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
      color: 'var(--ink-4)', marginBottom: 10, marginTop: 20,
    }}>
      {text}
    </div>
  )

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Goal selector */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
        What do you want to do?
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--ink-4)', marginBottom: 14 }}>
        Pick a goal — we'll show templates that fit. You can always start from scratch instead.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {GOALS.map(goal => {
          const isSelected = goal.id === selectedGoalId
          return (
            <button
              key={goal.id}
              onClick={() => {
                if ('action' in goal && goal.action === 'compose') { onCreateCustom(); return }
                setSelectedGoalId(goal.id as string)
              }}
              style={{
                background: isSelected ? 'var(--accent-soft)' : 'var(--bg-elev)',
                border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '14px 12px',
                textAlign: 'left', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: 8,
                transition: 'border-color 0.15s',
                boxShadow: isSelected ? '0 0 0 1px var(--accent)' : 'none',
              }}
            >
              <Icon name={goal.icon} size={16} style={{ color: isSelected ? 'var(--accent)' : 'var(--ink-3)' }} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: isSelected ? 'var(--accent)' : 'var(--ink)', marginBottom: 3 }}>
                  {goal.label}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.45 }}>
                  {goal.description}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Recommended templates for selected goal */}
      {recommended.length > 0 && (
        <>
          {sectionLabel(`Recommended for "${selectedGoal.label}" · ${recommended.length} template${recommended.length !== 1 ? 's' : ''}`)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {recommended.map(t => (
              <TemplateRecommendCard
                key={t.template_id}
                template={t}
                onPick={() => onPick(t)}
                onCustomize={() => onCustomize(t)}
                disabled={disabled}
                isStarting={startingTemplateId === t.template_id}
              />
            ))}
          </div>
        </>
      )}

      {/* Other templates */}
      {others.length > 0 && (
        <>
          {sectionLabel('Other templates · also available')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {others.map(t => (
              <TemplateRecommendCard
                key={t.template_id}
                template={t}
                onPick={() => onPick(t)}
                onCustomize={() => onCustomize(t)}
                disabled={disabled}
                isStarting={startingTemplateId === t.template_id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Quick-start cards (used when instances already exist) ─────────────────────

export function QuickStartCards({
  templates,
  onStart,
  onCustomize,
  onCreateCustom,
  disabled = false,
  startingTemplateId = null,
  devMode = false,
}: QuickStartCardsProps) {
  return (
    <div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
        gap: 12,
        marginBottom: 10,
      }}>
        {templates.map((template) => (
          <TemplateCard
            key={template.template_id}
            template={template}
            onStart={() => onStart(template)}
            onCustomize={() => onCustomize(template)}
            disabled={disabled}
            isStarting={startingTemplateId === template.template_id}
            devMode={devMode}
          />
        ))}
      </div>
      <button
        onClick={onCreateCustom}
        className="filter-chip"
        style={{ width: '100%', justifyContent: 'center', height: 34, fontSize: 12.5 }}
      >
        <Icon name="plus" size={12} style={{ marginRight: 5 }} />
        Create Custom Template
      </button>
    </div>
  )
}
