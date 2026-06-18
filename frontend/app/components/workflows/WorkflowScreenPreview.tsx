'use client'

import { useMemo, useState } from 'react'
import { Icon } from '../ui/Icons'
import type { UIElement, WorkflowTemplate } from '@/lib/workflow-builder/types'

export const PROFILE_LABELS = {
  sender: {
    label: 'ESSI',
    hint: 'Sender view',
  },
  receiver: {
    label: 'Wallet',
    hint: 'Receiver view',
  },
} as const

type ProfileName = keyof typeof PROFILE_LABELS

interface WorkflowScreenPreviewProps {
  template: WorkflowTemplate | null
  stateName?: string
  profile: ProfileName
  className?: string
}

function prettify(id: string) {
  return (id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function getStateElements(template: WorkflowTemplate | null, stateName: string, profile: ProfileName): UIElement[] {
  if (!template?.display_hints?.profiles?.[profile]?.states) return []
  return template.display_hints.profiles[profile]!.states?.[stateName] || []
}

function WorkflowElementRenderer({
  items,
}: {
  items: UIElement[]
}) {
  if (!items.length) return null

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <WorkflowElementNode key={`${item.type}-${index}`} element={item} />
      ))}
    </div>
  )
}

function WorkflowElementNode({ element }: { element: UIElement }) {
  const tone = (() => {
    const event = element.event || ''
    if (['approve', 'accept', 'confirm', 'submit', 'issue', 'next', 'propose'].includes(event)) {
      return {
        bg: 'var(--green)',
        color: 'white',
        border: 'var(--green)',
      }
    }
    if (['reject', 'decline', 'cancel', 'deny', 'back'].includes(event)) {
      return {
        bg: 'var(--bg-elev)',
        color: 'var(--ink)',
        border: 'var(--border)',
      }
    }
    return {
      bg: 'var(--accent)',
      color: 'white',
      border: 'var(--accent)',
    }
  })()

  const schema = element.input_schema

  if (element.type === 'text') {
    return (
      <div className="text-sm leading-6 text-text-secondary">
        {element.text || element.label || 'Text'}
      </div>
    )
  }

  if (element.type === 'badge') {
    return (
      <div className="inline-flex max-w-full items-center rounded-full border border-border-secondary bg-surface-100 px-3 py-1 text-xs font-medium text-text-secondary">
        {element.text || element.label || 'Badge'}
      </div>
    )
  }

  if (element.type === 'divider') {
    return <div className="h-px w-full bg-border-secondary/80" />
  }

  if (element.type === 'spacer') {
    return <div style={{ height: 12 }} />
  }

  if (element.type === 'image') {
    return (
      <div className="overflow-hidden rounded-2xl border border-border-secondary bg-surface-100">
        {element.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={element.src}
            alt={element.alt || element.label || 'Preview image'}
            className="h-40 w-full object-cover"
          />
        ) : (
          <div className="flex h-40 items-center justify-center text-xs text-text-tertiary">
            Image placeholder
          </div>
        )}
      </div>
    )
  }

  if (element.type === 'video') {
    return (
      <div className="overflow-hidden rounded-2xl border border-border-secondary bg-surface-100 px-4 py-6 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <Icon name="video" size={15} />
          <span>{element.label || element.alt || 'Video'}</span>
        </div>
        <div className="mt-2 text-xs text-text-tertiary">
          {element.src ? 'Video source configured' : 'Video placeholder'}
        </div>
      </div>
    )
  }

  if (element.type === 'list') {
    const items = element.items || []
    return (
      <div className="rounded-2xl border border-border-secondary bg-surface-50 px-4 py-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">
          {element.label || element.title || 'List'}
        </div>
        <div className="space-y-2">
          {(items.length ? items : ['Item one', 'Item two']).map((item, index) => (
            <div key={`${item}-${index}`} className="rounded-xl border border-border-secondary bg-surface-100 px-3 py-2 text-sm text-text-secondary">
              {String(item)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (element.type === 'table') {
    const columns = element.columns || []
    const rows = element.rows || []
    return (
      <div className="overflow-hidden rounded-2xl border border-border-secondary bg-surface-50">
        <div className="border-b border-border-secondary px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">
          {element.label || element.title || 'Table'}
        </div>
        <div className="divide-y divide-border-secondary">
          {columns.length > 0 && (
            <div className="grid gap-2 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}>
              {columns.map(col => (
                <div key={col.key}>{col.label}</div>
              ))}
            </div>
          )}
          {(rows.length ? rows : [{}, {}]).map((row, index) => (
            <div
              key={index}
              className="grid gap-2 px-4 py-3 text-sm text-text-secondary"
              style={{ gridTemplateColumns: `repeat(${Math.max(columns.length, 2)}, minmax(0, 1fr))` }}
            >
              {columns.length > 0
                ? columns.map(col => <div key={col.key}>{String((row as Record<string, unknown>)[col.key] ?? '—')}</div>)
                : <div className="col-span-2">{JSON.stringify(row)}</div>
              }
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (element.type === 'card' || element.type === 'container') {
    return (
      <div className="rounded-3xl border border-border-secondary bg-surface-50 p-4">
        {(element.title || element.label) && (
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            {element.title || element.label}
          </div>
        )}
        <div className="space-y-3">
          {(element.children || []).length > 0 ? (
            element.children!.map((child, index) => (
              <WorkflowElementNode key={`${child.type}-${index}`} element={child} />
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-border-secondary bg-surface-100 px-4 py-5 text-sm text-text-tertiary">
              Empty container
            </div>
          )}
        </div>
      </div>
    )
  }

  if (element.type === 'submit-button' && schema) {
    return (
      <div className="rounded-3xl border border-border-secondary bg-surface-50 p-4">
        <div className="mb-3 text-sm font-medium text-text-primary">
          {element.label || prettify(element.event || 'Submit')}
        </div>
        <WorkflowSchemaForm schema={schema} label={element.label || prettify(element.event || 'Submit')} event={element.event || 'submit'} />
      </div>
    )
  }

  if (element.type === 'button' || element.type === 'submit-button') {
    return (
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors"
        style={{
          background: tone.bg,
          color: tone.color,
          borderColor: tone.border,
        }}
      >
        <Icon name={element.type === 'submit-button' ? 'send' : 'arrowRight'} size={14} />
        <span>{element.label || prettify(element.event || 'Action')}</span>
      </button>
    )
  }

  return null
}

function wfGetAt(obj: any, path: string[]): any {
  return path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj)
}

function wfSetAt(obj: any, path: string[], value: any): any {
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

function WorkflowSchemaFields({
  schema,
  values,
  onChange,
  prefix,
}: {
  schema: any
  values: any
  onChange: (value: any) => void
  prefix: string[]
}) {
  if (schema?.type !== 'object' || !schema?.properties) return null
  const props = schema.properties as Record<string, any>
  const required: string[] = schema.required || []

  return (
    <>
      {Object.entries(props).map(([key, def]: [string, any]) => {
        const path = [...prefix, key]
        const pathKey = path.join('.')
        if (def?.type === 'object' && def?.properties) {
          return (
            <div key={pathKey} className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                {def.title || key}
              </div>
              <div className="border-l-2 border-border-secondary pl-3">
                <WorkflowSchemaFields schema={def} values={values} onChange={onChange} prefix={path} />
              </div>
            </div>
          )
        }

        const isRequired = required.includes(key)
        const val = wfGetAt(values, path)
        const inputType = def?.type === 'number' ? 'number' : 'text'

        return (
          <div key={pathKey} className="space-y-1">
            <label className="block text-xs font-medium text-text-secondary">
              {def?.title || key}{isRequired ? ' *' : ''}
            </label>
            <input
              type={inputType}
              required={isRequired}
              value={val ?? ''}
              onChange={(e) => onChange(wfSetAt(values, path, inputType === 'number' ? Number(e.target.value) : e.target.value))}
              className="w-full rounded-xl border border-border-secondary bg-surface-100 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-primary-500"
            />
          </div>
        )
      })}
    </>
  )
}

function WorkflowSchemaForm({
  schema,
  label,
  event,
}: {
  schema: any
  label: string
  event: string
}) {
  const [values, setValues] = useState<Record<string, any>>({})

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
      }}
    >
      <WorkflowSchemaFields schema={schema} values={values} onChange={setValues} prefix={[]} />
      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary-500 bg-primary-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-500"
      >
        <Icon name="send" size={14} />
        {label || prettify(event)}
      </button>
    </form>
  )
}

export function WorkflowScreenPreview({ template, stateName, profile, className }: WorkflowScreenPreviewProps) {
  const resolvedStateName = useMemo(() => {
    if (!template?.states?.length) return stateName || ''
    if (stateName && template.states.some(state => state.name === stateName)) return stateName
    return template.states[0]?.name || stateName || ''
  }, [stateName, template])

  const resolvedState = template?.states?.find(state => state.name === resolvedStateName) || null
  const profileMeta = PROFILE_LABELS[profile]
  const items = useMemo(() => getStateElements(template, resolvedStateName, profile), [template, resolvedStateName, profile])

  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border-secondary bg-surface-50 shadow-[0_20px_80px_-36px_rgba(0,0,0,0.5)] ${className || ''}`}>
      <div className="flex items-start justify-between border-b border-border-secondary bg-surface-100 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
            Screen preview
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-text-primary">
            {template?.title || template?.template_id || 'Workflow'}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
            {resolvedState && (
              <span className="rounded-full border border-border-secondary bg-surface-50 px-2.5 py-1 font-medium text-text-secondary">
                {prettify(resolvedState.name)}
              </span>
            )}
            <span className="rounded-full border border-border-secondary bg-surface-50 px-2.5 py-1 font-medium text-text-secondary">
              {profileMeta.label}
            </span>
            <span className="rounded-full border border-border-secondary bg-surface-50 px-2.5 py-1 font-medium text-text-tertiary">
              {profileMeta.hint}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-text-tertiary">
          <Icon name="phone" size={18} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto w-full max-w-[430px]">
          <div className="rounded-[34px] border border-border-secondary bg-surface-950 p-3 shadow-[0_28px_90px_-32px_rgba(0,0,0,0.65)]">
            <div className="rounded-[28px] border border-border-secondary bg-surface-50 p-4">
              <div className="flex items-center justify-between text-[11px] text-text-tertiary">
                <span>9:41</span>
                <span className="rounded-full bg-surface-200 px-2 py-0.5 font-medium text-text-secondary">
                  {profileMeta.label}
                </span>
              </div>

              <div className="mt-4 rounded-[24px] border border-border-secondary bg-surface-100/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                      {profileMeta.hint}
                    </div>
                    <div className="mt-1 text-lg font-semibold tracking-[-0.02em] text-text-primary">
                      {prettify(resolvedState?.name || 'Preview')}
                    </div>
                    {resolvedState?.section && (
                      <div className="mt-1 text-xs text-text-tertiary">
                        Section: {resolvedState.section}
                      </div>
                    )}
                  </div>
                  <div className="rounded-full border border-border-secondary bg-surface-50 px-3 py-1 text-[11px] font-medium text-text-secondary">
                    {items.length} block{items.length === 1 ? '' : 's'}
                  </div>
                </div>

                <div className="mt-4">
                  {items.length > 0 ? (
                    <WorkflowElementRenderer items={items} />
                  ) : (
                    <div className="rounded-3xl border border-dashed border-border-secondary bg-surface-50 px-4 py-6 text-sm leading-6 text-text-tertiary">
                      No UI elements configured for this state yet.
                      <div className="mt-2 text-xs text-text-tertiary">
                        Add screen blocks in Flow view, then come back here to validate the layout.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border-secondary bg-surface-100 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                Template states
              </div>
              <div className="mt-1 text-sm font-medium text-text-primary">
                {template?.states?.length || 0}
              </div>
            </div>
            <div className="rounded-2xl border border-border-secondary bg-surface-100 px-4 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-tertiary">
                Screen blocks
              </div>
              <div className="mt-1 text-sm font-medium text-text-primary">
                {items.length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WorkflowScreenPreview
