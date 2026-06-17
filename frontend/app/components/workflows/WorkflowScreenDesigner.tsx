'use client'

import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../ui/Icons'
import { makeDefaultElement, UI_ELEMENT_LABELS } from '@/lib/workflow-builder/constants'
import type { UIElement, WorkflowTemplate } from '@/lib/workflow-builder/types'
import type { ProfileName, UIElementType } from '@/lib/workflow-builder/constants'
import { PROFILE_LABELS } from './WorkflowScreenPreview'

type DragPayload =
  | { kind: 'palette'; type: UIElementType }
  | { kind: 'move'; fromIndex: number }

interface WorkflowScreenDesignerProps {
  template: WorkflowTemplate | null
  profile: ProfileName
  stateName: string
  onProfileChange: (profile: ProfileName) => void
  onStateChange: (stateName: string) => void
  onTemplateChange: (template: WorkflowTemplate) => void
  connectionLabel?: string
  className?: string
}

const ELEMENT_PALETTES: { label: string; icon: string; types: UIElementType[] }[] = [
  { label: 'Content', icon: 'layout', types: ['title', 'text', 'warning', 'badge', 'image', 'video', 'divider', 'spacer', 'list'] },
  { label: 'Charts', icon: 'trendUp', types: ['bar-chart', 'pie-chart', 'donut-chart', 'gauge', 'timeline', 'table'] },
  { label: 'Interactive', icon: 'edit', types: ['input', 'checkbox', 'button', 'submit-button'] },
  { label: 'Layout', icon: 'cards', types: ['card', 'container'] },
]

const DRAG_MIME = 'application/x-workflow-screen-element'

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6']

function prettify(id: string) {
  return (id || '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function cloneTemplate(template: WorkflowTemplate): WorkflowTemplate {
  return JSON.parse(JSON.stringify(template))
}

function ensureDisplayHints(template: WorkflowTemplate) {
  const next = template.display_hints ?? {}
  if (!next.profiles) next.profiles = {}
  if (!next.profiles.sender) next.profiles.sender = { states: {} }
  if (!next.profiles.receiver) next.profiles.receiver = { states: {} }
  if (!next.profiles.sender.states) next.profiles.sender.states = {}
  if (!next.profiles.receiver.states) next.profiles.receiver.states = {}
  return next
}

function getStateElements(template: WorkflowTemplate | null, profile: ProfileName, stateName: string): UIElement[] {
  return template?.display_hints?.profiles?.[profile]?.states?.[stateName] || []
}

function updateStateElements(
  template: WorkflowTemplate,
  profile: ProfileName,
  stateName: string,
  updater: (elements: UIElement[]) => UIElement[],
) {
  const next = cloneTemplate(template)
  next.display_hints = ensureDisplayHints(next)
  const bucket = next.display_hints.profiles?.[profile]?.states || {}
  bucket[stateName] = updater([...(bucket[stateName] || [])])
  return next
}

function setElementAt(
  template: WorkflowTemplate,
  profile: ProfileName,
  stateName: string,
  index: number,
  updater: (element: UIElement) => UIElement,
) {
  return updateStateElements(template, profile, stateName, elements => {
    if (!elements[index]) return elements
    const next = [...elements]
    next[index] = updater(next[index])
    return next
  })
}

function moveElement(
  template: WorkflowTemplate,
  profile: ProfileName,
  stateName: string,
  fromIndex: number,
  toIndex: number,
) {
  return updateStateElements(template, profile, stateName, elements => {
    if (fromIndex === toIndex || !elements[fromIndex]) return elements
    const next = [...elements]
    const [item] = next.splice(fromIndex, 1)
    const bounded = Math.max(0, Math.min(toIndex, next.length))
    next.splice(bounded, 0, item)
    return next
  })
}

function addElement(
  template: WorkflowTemplate,
  profile: ProfileName,
  stateName: string,
  element: UIElement,
  index?: number,
) {
  return updateStateElements(template, profile, stateName, elements => {
    const next = [...elements]
    if (typeof index === 'number') next.splice(Math.max(0, Math.min(index, next.length)), 0, element)
    else next.push(element)
    return next
  })
}

function removeElement(
  template: WorkflowTemplate,
  profile: ProfileName,
  stateName: string,
  index: number,
) {
  return updateStateElements(template, profile, stateName, elements => elements.filter((_, i) => i !== index))
}

function useStateElements(template: WorkflowTemplate | null, profile: ProfileName, stateName: string) {
  return useMemo(() => getStateElements(template, profile, stateName), [template, profile, stateName])
}

function paletteIconName(type: UIElementType): string {
  switch (type) {
    case 'title': return 'layout'
    case 'text': return 'log'
    case 'warning': return 'alert'
    case 'input': return 'edit'
    case 'checkbox': return 'check'
    case 'bar-chart': return 'trendUp'
    case 'pie-chart': return 'target'
    case 'donut-chart': return 'badge'
    case 'gauge': return 'clock'
    case 'timeline': return 'scroll'
    case 'button':
    case 'submit-button': return 'send'
    case 'card':
    case 'container': return 'cards'
    case 'image': return 'layout'
    case 'video': return 'video'
    case 'table': return 'database'
    case 'list': return 'list'
    case 'badge': return 'badge'
    case 'divider': return 'layout'
    case 'spacer': return 'layout'
    default:
      return 'log'
  }
}

function uiText(value: unknown, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function fieldLabel(label: string, required?: boolean) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-4)', marginBottom: 4 }}>
      {label}{required ? ' *' : ''}
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; mono?: boolean }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div style={{ marginBottom: 10 }}>
      {fieldLabel(label)}
      <input
        value={local}
        placeholder={placeholder}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        style={{ width: '100%', height: 34, padding: '0 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: mono ? 'var(--font-mono)' : 'inherit', outline: 'none', boxSizing: 'border-box' }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />
    </div>
  )
}

function TextAreaField({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; mono?: boolean }) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])
  return (
    <div style={{ marginBottom: 10 }}>
      {fieldLabel(label)}
      <textarea
        value={local}
        placeholder={placeholder}
        rows={3}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        style={{ width: '100%', padding: '10px 11px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: mono ? 'var(--font-mono)' : 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {fieldLabel(label)}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', height: 34, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
  )
}

function ToggleField({ label, checked, onChange, helper }: { label: string; checked: boolean; onChange: (value: boolean) => void; helper?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--ink-2)' }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
        <span>{label}</span>
      </label>
      {helper && <div style={{ marginTop: 4, fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.5 }}>{helper}</div>}
    </div>
  )
}

function JsonField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <TextAreaField label={label} value={value} onChange={onChange} placeholder={placeholder} mono />
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

function WorkflowSchemaFields({ schema, values, onChange, prefix }: {
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
            <div key={pathKey} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-4)', marginBottom: 6 }}>
                {def.title || key}
              </div>
              <div style={{ paddingLeft: 12, borderLeft: '2px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <WorkflowSchemaFields schema={def} values={values} onChange={onChange} prefix={path} />
              </div>
            </div>
          )
        }

        const isReq = required.includes(key)
        const val = wfGetAt(values, path)
        const inputType = def?.type === 'number' ? 'number' : 'text'

        return (
          <div key={pathKey} style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>
              {def?.title || key}{isReq ? ' *' : ''}
            </label>
            <input
              type={inputType}
              required={isReq}
              value={val ?? ''}
              onChange={(e) => onChange(wfSetAt(values, path, inputType === 'number' ? Number(e.target.value) : e.target.value))}
              style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-sunk)', color: 'var(--ink)', padding: '8px 11px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        )
      })}
    </>
  )
}

function WorkflowSchemaForm({ schema, label, event }: { schema: any; label: string; event: string }) {
  const [values, setValues] = useState<Record<string, any>>({})
  return (
    <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
      <WorkflowSchemaFields schema={schema} values={values} onChange={setValues} prefix={[]} />
      <button
        type="submit"
        style={{ width: '100%', borderRadius: 12, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'white', padding: '10px 14px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}
      >
        {label || prettify(event)}
      </button>
    </form>
  )
}

function chartDataFor(element: UIElement) {
  const source = (element.data || element.series || []) as Array<{ label: string; value: number; color?: string }>
  const fallback = [
    { label: 'A', value: 35, color: CHART_COLORS[0] },
    { label: 'B', value: 25, color: CHART_COLORS[1] },
    { label: 'C', value: 40, color: CHART_COLORS[2] },
  ]
  return (source.length ? source : fallback).map((item, index) => ({
    label: String(item.label ?? `Item ${index + 1}`),
    value: Number(item.value ?? 0),
    color: item.color || CHART_COLORS[index % CHART_COLORS.length],
  }))
}

function ChartPreview({ element, kind }: { element: UIElement; kind: 'bar-chart' | 'pie-chart' | 'donut-chart' | 'gauge' | 'timeline' }) {
  if (kind === 'gauge') {
    const value = Number(element.value ?? 65)
    const max = Number(element.max ?? 100) || 100
    const pct = Math.max(0, Math.min(1, value / max))
    return (
      <div className="rounded-2xl border border-border-secondary bg-surface-50 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">{element.title || 'Gauge'}</div>
        <div className="mt-3 h-3 rounded-full bg-surface-200 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-500" style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="mt-2 text-sm font-semibold text-text-primary">{Math.round(pct * 100)}%</div>
      </div>
    )
  }

  if (kind === 'timeline') {
    const items = (element.items || [
      { title: 'Started', meta: 'Now' },
      { title: 'Waiting for review', meta: 'Next' },
    ]) as Array<string | { title: string; meta?: string; description?: string }>
    return (
      <div className="rounded-2xl border border-border-secondary bg-surface-50 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">{element.title || 'Timeline'}</div>
        <div className="mt-3 space-y-3">
          {items.map((item, index) => {
            const title = typeof item === 'string' ? item : item.title
            const meta = typeof item === 'string' ? '' : item.meta || item.description || ''
            return (
              <div key={`${title}-${index}`} className="grid grid-cols-[18px_1fr] gap-3">
                <div className="mt-1 h-3 w-3 rounded-full bg-primary-500" />
                <div>
                  <div className="text-sm font-medium text-text-primary">{title}</div>
                  {meta && <div className="text-xs text-text-tertiary">{meta}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const data = chartDataFor(element)
  const total = Math.max(1, data.reduce((sum, item) => sum + item.value, 0))

  if (kind === 'bar-chart') {
    return (
      <div className="rounded-2xl border border-border-secondary bg-surface-50 px-4 py-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">{element.title || 'Bar chart'}</div>
        <div className="mt-4 flex items-end gap-2 h-28">
          {data.map(item => (
            <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="w-full rounded-t-xl bg-surface-200 overflow-hidden" style={{ minHeight: 16, height: `${Math.max(12, (item.value / total) * 100 * 1.8)}%` }}>
                <div className="h-full w-full" style={{ background: item.color }} />
              </div>
              <div className="text-[11px] text-text-tertiary">{item.label}</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const colors = data.map(item => item.color)
  const slices = data.map((item, index) => `${item.color} ${index === 0 ? 0 : data.slice(0, index).reduce((sum, prev) => sum + (prev.value / total) * 100, 0)}% ${(data.slice(0, index + 1).reduce((sum, prev) => sum + (prev.value / total) * 100, 0))}%`).join(', ')
  const donut = kind === 'donut-chart'

  return (
    <div className="rounded-2xl border border-border-secondary bg-surface-50 px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-text-tertiary">{element.title || (donut ? 'Donut chart' : 'Pie chart')}</div>
      <div className="mt-4 flex items-center gap-5">
        <div
          className="mx-auto aspect-square w-28 rounded-full border border-border-secondary"
          style={{
            background: `conic-gradient(${slices})`,
            WebkitMask: donut ? 'radial-gradient(circle at center, transparent 43%, #000 44%)' : undefined,
            mask: donut ? 'radial-gradient(circle at center, transparent 43%, #000 44%)' : undefined,
          }}
        />
        <div className="min-w-0 space-y-2">
          {data.map((item, index) => (
            <div key={item.label} className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[index] }} />
              <span className="truncate">{item.label}</span>
              <span className="ml-auto font-medium text-text-primary">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ScreenBlock({
  element,
  index,
  selected,
  onSelect,
  onDropData,
  onMoveUp,
  onMoveDown,
  runtimeValue,
  onRuntimeValue,
}: {
  element: UIElement
  index: number
  selected: boolean
  onSelect: () => void
  onDropData: (payload: DragPayload) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  runtimeValue: unknown
  onRuntimeValue: (value: unknown) => void
}) {
  const baseBorder = selected ? 'var(--accent)' : 'var(--border-secondary)'
  const commonShell = {
    border: `1px solid ${baseBorder}`,
    background: selected ? 'var(--accent-soft)' : 'var(--bg)',
    borderRadius: 18,
    padding: '14px 14px 12px',
    boxShadow: selected ? '0 0 0 3px oklch(0.55 0.15 250 / 0.12)' : 'none',
  } as React.CSSProperties

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    try {
      onDropData(JSON.parse(raw) as DragPayload)
    } catch {
      // ignore
    }
  }

  const content = (() => {
    switch (element.type) {
      case 'title':
        return <div style={{ fontSize: Math.max(18, Math.min(28, 32 - ((element.level || 2) - 2) * 4)), fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{element.text || 'Title'}</div>
      case 'text':
        return <div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-3)' }}>{element.text || 'Text'}</div>
      case 'warning':
        return (
          <div style={{ borderRadius: 16, border: '1px solid oklch(0.75 0.13 75)', background: 'oklch(0.97 0.05 75)', padding: '14px 14px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber-ink)', fontWeight: 700 }}>
              <Icon name="alert" size={15} />
              <span>{element.title || 'Warning'}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)' }}>{element.text || 'Please review this step.'}</div>
          </div>
        )
      case 'badge':
        return <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--surface-200, var(--bg-sunk))', border: '1px solid var(--border)' }}>{element.text || element.label || 'Badge'}</div>
      case 'image':
        return element.src ? <img src={element.src} alt={element.alt || element.label || 'Preview image'} style={{ width: '100%', borderRadius: 16, objectFit: 'cover', maxHeight: 220 }} /> : <div style={{ borderRadius: 16, border: '1px dashed var(--border)', background: 'var(--bg-sunk)', minHeight: 120, display: 'grid', placeItems: 'center', color: 'var(--ink-4)' }}>Image placeholder</div>
      case 'video':
        return <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-sunk)', padding: 16, color: 'var(--ink-3)' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="video" size={16} /><span>{element.label || element.alt || 'Video'}</span></div></div>
      case 'divider':
        return <div style={{ height: 1, background: 'var(--border)' }} />
      case 'spacer':
        return <div style={{ height: 18 }} />
      case 'input': {
        const kind = element.inputType || 'text'
        const value = runtimeValue as string | number | undefined
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>{element.label || 'Input'}</div>
            {kind === 'textarea' ? (
              <textarea
                value={uiText(value, String(element.defaultValue ?? ''))}
                placeholder={element.placeholder}
                onChange={e => onRuntimeValue(e.target.value)}
                rows={4}
                style={{ width: '100%', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-sunk)', color: 'var(--ink)', padding: '12px 13px', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
              />
            ) : (
              <input
                type={kind}
                value={uiText(value, String(element.defaultValue ?? ''))}
                placeholder={element.placeholder}
                onChange={e => onRuntimeValue(e.target.value)}
                style={{ width: '100%', height: 40, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg-sunk)', color: 'var(--ink)', padding: '0 13px', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            )}
            {element.helperText && <div style={{ marginTop: 5, fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.5 }}>{element.helperText}</div>}
          </div>
        )
      }
      case 'checkbox':
        return (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-sunk)', padding: 14 }}>
            <input type="checkbox" checked={!!runtimeValue || !!element.checked} onChange={e => onRuntimeValue(e.target.checked)} style={{ accentColor: 'var(--accent)', marginTop: 2 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>{element.label || 'Checkbox'}</div>
              {element.helperText && <div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-4)' }}>{element.helperText}</div>}
            </div>
          </label>
        )
      case 'button':
      case 'submit-button':
        if (element.type === 'submit-button' && element.input_schema) {
          return (
            <div style={{ borderRadius: 18, border: '1px solid var(--border)', background: 'var(--bg-sunk)', padding: 14 }}>
              <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
                {element.title || element.label || prettify(element.event || 'Submit')}
              </div>
              <WorkflowSchemaForm schema={element.input_schema} label={element.label || prettify(element.event || 'Submit')} event={element.event || 'submit'} />
            </div>
          )
        }
        return (
          <button type="button" style={{ width: '100%', borderRadius: 999, border: `1px solid ${element.type === 'submit-button' ? 'var(--accent)' : 'var(--border)'}`, background: element.type === 'submit-button' ? 'var(--accent)' : 'var(--bg-sunk)', color: element.type === 'submit-button' ? 'white' : 'var(--ink)', padding: '11px 14px', fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
            {element.label || prettify(element.event || 'Action')}
          </button>
        )
      case 'bar-chart':
      case 'pie-chart':
      case 'donut-chart':
      case 'gauge':
      case 'timeline':
        return <ChartPreview element={element} kind={element.type} />
      case 'list':
        return (
          <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-sunk)', padding: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 10 }}>{element.title || 'List'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(element.items || ['Item one', 'Item two']).map((item, itemIndex) => (
                <div key={`${itemIndex}-${typeof item === 'string' ? item : item.title}`} style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px 12px', fontSize: 13, color: 'var(--ink-2)' }}>
                  {typeof item === 'string' ? item : item.title}
                  {typeof item !== 'string' && item.meta && <div style={{ marginTop: 3, fontSize: 11, color: 'var(--ink-4)' }}>{item.meta}</div>}
                </div>
              ))}
            </div>
          </div>
        )
      case 'table':
        return (
          <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg-sunk)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', borderBottom: '1px solid var(--border)' }}>{element.title || 'Table'}</div>
            <div style={{ padding: 14, color: 'var(--ink-3)', fontSize: 12.5 }}>Table preview.</div>
          </div>
        )
      case 'card':
      case 'container':
        return (
          <div style={{ borderRadius: 22, border: '1px solid var(--border)', background: 'var(--bg-sunk)', padding: 16 }}>
            {(element.title || element.label) && <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>{element.title || element.label}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(element.children || []).length > 0 ? (
                (element.children || []).map((child, childIndex) => (
                  <div key={`${child.type}-${childIndex}`} style={{ opacity: 0.92 }}>
                    <ScreenInlinePreview element={child} />
                  </div>
                ))
              ) : (
                <div style={{ borderRadius: 16, border: '1px dashed var(--border)', background: 'var(--bg)', padding: 14, color: 'var(--ink-4)', fontSize: 12.5 }}>
                  Empty container
                </div>
              )}
            </div>
          </div>
        )
      default:
        return null
    }
  })()

  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'move', fromIndex: index }))
      }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
      onClick={onSelect}
      style={commonShell}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'grab', userSelect: 'none' }}>
        <span style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--bg-elev)', display: 'grid', placeItems: 'center', color: 'var(--ink-4)', flexShrink: 0 }}>
          <Icon name="more" size={10} />
        </span>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>
          {element.type}
        </span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={e => { e.stopPropagation(); onMoveUp?.() }} disabled={!onMoveUp} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-3)', cursor: onMoveUp ? 'pointer' : 'not-allowed' }}>↑</button>
        <button type="button" onClick={e => { e.stopPropagation(); onMoveDown?.() }} disabled={!onMoveDown} style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-3)', cursor: onMoveDown ? 'pointer' : 'not-allowed' }}>↓</button>
      </div>
      {content}
      {selected && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--accent-ink)' }}>Selected block</div>}
    </div>
  )
}

function ScreenInlinePreview({ element }: { element: UIElement }) {
  if (element.type === 'text') return <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.6 }}>{element.text || 'Text'}</div>
  if (element.type === 'title') return <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{element.text || 'Title'}</div>
  if (element.type === 'badge') return <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, padding: '5px 10px', background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 12 }}>{element.text || 'Badge'}</div>
  if (element.type === 'divider') return <div style={{ height: 1, background: 'var(--border)' }} />
  if (element.type === 'spacer') return <div style={{ height: 12 }} />
  return <div style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>{UI_ELEMENT_LABELS[element.type]}</div>
}

function PaletteItem({ type, onAdd }: { type: UIElementType; onAdd: () => void }) {
  return (
    <div
      draggable
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'copy'
        e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'palette', type }))
      }}
      onClick={onAdd}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg)', cursor: 'grab', color: 'var(--ink)', userSelect: 'none' }}
    >
      <div style={{ width: 24, height: 24, borderRadius: 7, background: 'var(--bg-elev)', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', flexShrink: 0 }}>
        <Icon name={paletteIconName(type) as any} size={12} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{UI_ELEMENT_LABELS[type]}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>Drag into the simulator</div>
      </div>
    </div>
  )
}

function StateRail({
  states,
  stateName,
  onStateChange,
}: {
  states: NonNullable<WorkflowTemplate['states']>
  stateName: string
  onStateChange: (name: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {states.map((state, index) => {
        const active = state.name === stateName
        const dot = state.type === 'start' ? 'var(--green)' : state.type === 'final' ? 'var(--violet)' : 'var(--accent)'
        return (
          <button
            key={state.name}
            onClick={() => onStateChange(state.name)}
            style={{
              display: 'grid',
              gridTemplateColumns: '18px 1fr',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 14,
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-soft)' : 'var(--bg)',
              textAlign: 'left',
              color: 'inherit',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 11, height: 11, borderRadius: '50%', background: dot, marginTop: 4 }} />
              {index < states.length - 1 && <div style={{ position: 'absolute', top: 16, bottom: -16, width: 2, background: 'var(--border)' }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{prettify(state.name)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginTop: 3 }}>{state.type}{state.section ? ` · ${state.section}` : ''}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ElementInspector({
  element,
  index,
  onChange,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  element: UIElement | null
  index: number | null
  onChange: (updater: (element: UIElement) => UIElement) => void
  onDelete: () => void
  onDuplicate: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  if (!element) {
    return (
      <div style={{ border: '1px dashed var(--border)', borderRadius: 16, padding: 16, color: 'var(--ink-4)', fontSize: 12.5, lineHeight: 1.6 }}>
        Select a block to edit its properties.
      </div>
    )
  }

  const update = (updates: Partial<UIElement>) => onChange(prev => ({ ...prev, ...updates } as UIElement))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--bg-sunk)', border: '1px solid var(--border)', color: 'var(--ink-3)' }}>
          <Icon name={paletteIconName(element.type) as any} size={13} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{UI_ELEMENT_LABELS[element.type]}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>Element #{index != null ? index + 1 : '—'}</div>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onMoveUp} disabled={!onMoveUp} style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: onMoveUp ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Move up</button>
        <button onClick={onMoveDown} disabled={!onMoveDown} style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: onMoveDown ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>Move down</button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onDuplicate} style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit' }}>Duplicate</button>
        <button onClick={onDelete} style={{ flex: 1, height: 34, borderRadius: 10, border: '1px solid var(--red-400, #ef4444)', background: 'var(--red-50, #fff1f2)', color: 'var(--red-700, #b91c1c)', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
      </div>

      {element.type === 'title' && (
        <>
          <TextField label="Text" value={element.text || ''} onChange={v => update({ text: v })} />
          <SelectField label="Level" value={String(element.level || 2)} onChange={v => update({ level: Number(v) as 1 | 2 | 3 | 4 | 5 | 6 })} options={['1', '2', '3', '4', '5', '6'].map(v => ({ value: v, label: `H${v}` }))} />
        </>
      )}

      {element.type === 'text' && <TextAreaField label="Text" value={element.text || ''} onChange={v => update({ text: v })} />}

      {element.type === 'warning' && (
        <>
          <TextField label="Title" value={element.title || ''} onChange={v => update({ title: v })} />
          <TextAreaField label="Text" value={element.text || ''} onChange={v => update({ text: v })} />
          <SelectField label="Tone" value={element.tone || 'warning'} onChange={v => update({ tone: v as UIElement['tone'] })} options={[
            { value: 'info', label: 'Info' },
            { value: 'warning', label: 'Warning' },
            { value: 'success', label: 'Success' },
            { value: 'error', label: 'Error' },
          ]} />
        </>
      )}

      {(element.type === 'button' || element.type === 'submit-button') && (
        <>
          <TextField label="Label" value={element.label || ''} onChange={v => update({ label: v })} />
          <TextField label="Event" value={element.event || ''} onChange={v => update({ event: v })} mono />
          <TextField label="Enabled When" value={element.enabledWhen || ''} onChange={v => update({ enabledWhen: v || undefined })} placeholder="JMESPath (optional)" mono />
          <TextField label="Show When" value={element.showWhen || ''} onChange={v => update({ showWhen: v || undefined })} placeholder="JMESPath (optional)" mono />
          {element.type === 'submit-button' && (
            <JsonField
              label="Input Schema (JSON)"
              value={element.input_schema ? JSON.stringify(element.input_schema, null, 2) : ''}
              onChange={v => {
                try {
                  update({ input_schema: v ? JSON.parse(v) : undefined })
                } catch {
                  // ignore invalid JSON
                }
              }}
              placeholder='{ "type": "object", "properties": {} }'
            />
          )}
        </>
      )}

      {element.type === 'input' && (
        <>
          <TextField label="Label" value={element.label || ''} onChange={v => update({ label: v })} />
          <TextField label="Name" value={element.name || ''} onChange={v => update({ name: v || undefined })} mono />
          <TextField label="Placeholder" value={element.placeholder || ''} onChange={v => update({ placeholder: v || undefined })} />
          <SelectField label="Input Type" value={element.inputType || 'text'} onChange={v => update({ inputType: v as UIElement['inputType'] })} options={[
            { value: 'text', label: 'Text' },
            { value: 'email', label: 'Email' },
            { value: 'number', label: 'Number' },
            { value: 'date', label: 'Date' },
            { value: 'textarea', label: 'Textarea' },
          ]} />
          <ToggleField label="Required" checked={!!element.required} onChange={v => update({ required: v })} />
          <TextField label="Default Value" value={String(element.defaultValue ?? '')} onChange={v => update({ defaultValue: v })} />
          <TextField label="Helper Text" value={element.helperText || ''} onChange={v => update({ helperText: v || undefined })} />
        </>
      )}

      {element.type === 'checkbox' && (
        <>
          <TextField label="Label" value={element.label || ''} onChange={v => update({ label: v })} />
          <TextField label="Name" value={element.name || ''} onChange={v => update({ name: v || undefined })} mono />
          <ToggleField label="Checked by default" checked={!!element.checked} onChange={v => update({ checked: v })} />
          <ToggleField label="Required" checked={!!element.required} onChange={v => update({ required: v })} />
          <TextField label="Helper Text" value={element.helperText || ''} onChange={v => update({ helperText: v || undefined })} />
        </>
      )}

      {(element.type === 'bar-chart' || element.type === 'pie-chart' || element.type === 'donut-chart') && (
        <>
          <TextField label="Title" value={element.title || ''} onChange={v => update({ title: v || undefined })} />
          <JsonField
            label="Data (JSON)"
            value={JSON.stringify(element.data || [
              { label: 'A', value: 35 },
              { label: 'B', value: 25 },
              { label: 'C', value: 40 },
            ], null, 2)}
            onChange={v => {
              try {
                const parsed = v ? JSON.parse(v) : []
                if (Array.isArray(parsed)) update({ data: parsed })
              } catch {
                // ignore invalid JSON
              }
            }}
            placeholder='[{ "label": "A", "value": 30 }]'
          />
        </>
      )}

      {element.type === 'gauge' && (
        <>
          <TextField label="Title" value={element.title || ''} onChange={v => update({ title: v || undefined })} />
          <TextField label="Value" value={uiText(element.value, '65')} onChange={v => update({ value: Number(v) })} />
          <TextField label="Max" value={uiText(element.max, '100')} onChange={v => update({ max: Number(v) })} />
        </>
      )}

      {element.type === 'timeline' && (
        <>
          <TextField label="Title" value={element.title || ''} onChange={v => update({ title: v || undefined })} />
          <JsonField
            label="Items (JSON)"
            value={JSON.stringify(element.items || [
              { title: 'Started', meta: 'Now' },
              { title: 'Waiting for review', meta: 'Next' },
            ], null, 2)}
            onChange={v => {
              try {
                const parsed = v ? JSON.parse(v) : []
                if (Array.isArray(parsed)) update({ items: parsed })
              } catch {
                // ignore invalid JSON
              }
            }}
            placeholder='[{ "title": "Submitted", "meta": "1m ago" }]'
          />
        </>
      )}

      {element.type === 'badge' && (
        <>
          <TextField label="Text" value={element.text || ''} onChange={v => update({ text: v })} />
          <TextField label="Variant" value={element.variant || ''} onChange={v => update({ variant: v || undefined })} placeholder="optional" />
        </>
      )}

      {element.type === 'image' && (
        <>
          <TextField label="Src (URL)" value={element.src || ''} onChange={v => update({ src: v || undefined })} mono />
          <TextField label="Alt" value={element.alt || ''} onChange={v => update({ alt: v || undefined })} />
        </>
      )}

      {element.type === 'video' && (
        <>
          <TextField label="Src (URL)" value={element.src || ''} onChange={v => update({ src: v || undefined })} mono />
          <TextField label="Asset" value={element.asset || ''} onChange={v => update({ asset: v || undefined })} />
        </>
      )}

      {(element.type === 'card' || element.type === 'container') && <TextField label="Title" value={element.title || ''} onChange={v => update({ title: v || undefined })} />}

      {element.type === 'list' && (
        <JsonField
          label="Items (JSON)"
          value={JSON.stringify(element.items || ['Item one', 'Item two'], null, 2)}
          onChange={v => {
            try {
              const parsed = v ? JSON.parse(v) : []
              if (Array.isArray(parsed)) update({ items: parsed })
            } catch {
              // ignore invalid JSON
            }
          }}
          placeholder='["Item one", "Item two"]'
        />
      )}
    </div>
  )
}

export function WorkflowScreenDesigner({
  template,
  profile,
  stateName,
  onProfileChange,
  onStateChange,
  onTemplateChange,
  connectionLabel,
  className,
}: WorkflowScreenDesignerProps) {
  const states = template?.states || []
  const activeStateName = useMemo(() => {
    if (!states.length) return stateName
    if (stateName && states.some(state => state.name === stateName)) return stateName
    return states[0]?.name || stateName
  }, [stateName, states])

  const elements = useStateElements(template, profile, activeStateName)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(elements.length ? 0 : null)
  const [runtimeValues, setRuntimeValues] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!elements.length) {
      setSelectedIndex(null)
      return
    }
    setSelectedIndex(prev => (prev != null && prev < elements.length ? prev : 0))
  }, [elements.length, activeStateName, profile])

  useEffect(() => {
    if (!states.length) return
    if (!states.some(state => state.name === stateName)) {
      onStateChange(states[0]?.name || '')
    }
  }, [states, stateName, onStateChange])

  const selectedElement = selectedIndex != null ? elements[selectedIndex] || null : null

  const applyTemplate = (next: WorkflowTemplate) => {
    onTemplateChange(next)
  }

  const handleAdd = (type: UIElementType, index?: number) => {
    if (!template) return
    const next = addElement(template, profile, activeStateName, makeDefaultElement(type), index)
    applyTemplate(next)
    setSelectedIndex(index != null ? index : elements.length)
  }

  const handleDrop = (payload: DragPayload, index?: number) => {
    if (!template) return
    if (payload.kind === 'palette') {
      handleAdd(payload.type, index)
      return
    }
    if (payload.kind === 'move') {
      const targetIndex = typeof index === 'number' ? index : Math.max(0, elements.length - 1)
      const next = moveElement(template, profile, activeStateName, payload.fromIndex, targetIndex)
      applyTemplate(next)
      setSelectedIndex(targetIndex)
    }
  }

  const updateSelected = (updater: (element: UIElement) => UIElement) => {
    if (!template || selectedIndex == null || !selectedElement) return
    applyTemplate(setElementAt(template, profile, activeStateName, selectedIndex, updater))
  }

  const moveAt = (index: number, delta: number) => {
    if (!template) return
    const target = index + delta
    if (target < 0 || target >= elements.length) return
    applyTemplate(moveElement(template, profile, activeStateName, index, target))
    setSelectedIndex(prev => {
      if (prev === index) return target
      if (prev === target) return index
      return prev
    })
  }

  const deleteSelected = () => {
    if (!template || selectedIndex == null) return
    const next = removeElement(template, profile, activeStateName, selectedIndex)
    applyTemplate(next)
    setSelectedIndex(prev => {
      if (elements.length <= 1) return null
      return Math.max(0, Math.min((prev ?? 0) - 1, elements.length - 2))
    })
  }

  const duplicateSelected = () => {
    if (!template || selectedIndex == null || !selectedElement) return
    const copy = JSON.parse(JSON.stringify(selectedElement)) as UIElement
    const next = addElement(template, profile, activeStateName, copy, selectedIndex + 1)
    applyTemplate(next)
    setSelectedIndex(selectedIndex + 1)
  }

  const moveSelected = (delta: number) => {
    if (!template || selectedIndex == null) return
    const target = selectedIndex + delta
    if (target < 0 || target >= elements.length) return
    const next = moveElement(template, profile, activeStateName, selectedIndex, target)
    applyTemplate(next)
    setSelectedIndex(target)
  }

  const frameTitle = template?.title || template?.template_id || 'Workflow'
  const isSender = profile === 'sender'

  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr) 340px', gap: 0, minHeight: 0, height: '100%' }}>
      <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Screen designer</div>
          <div style={{ marginTop: 4, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>{frameTitle}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>
            Flow defines states. This simulator defines the UI the side sees.
          </div>
        </div>

        <div style={{ padding: '14px 18px 0' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 8 }}>Side</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {(Object.entries(PROFILE_LABELS) as Array<[ProfileName, typeof PROFILE_LABELS.sender]>).map(([key, meta]) => {
              const active = profile === key
              return (
                <button
                  key={key}
                  onClick={() => onProfileChange(key)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-soft)' : 'var(--bg)',
                    color: 'inherit',
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{meta.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>{meta.hint}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px 18px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 8 }}>Palette</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', paddingRight: 2, minHeight: 0, flex: 1 }}>
            {ELEMENT_PALETTES.map(group => (
              <div key={group.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon name={group.icon as any} size={12} />
                  <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>{group.label}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {group.types.map(type => (
                    <PaletteItem key={type} type={type} onAdd={() => handleAdd(type)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <main style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', background: 'var(--bg)', padding: '16px' }}>
        {isSender ? (
          <div style={{ height: '100%', minHeight: 0, borderRadius: 28, border: '1px solid var(--border)', background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)', padding: 18, boxShadow: '0 24px 100px -48px rgba(0,0,0,0.7)', display: 'grid', gridTemplateRows: 'auto 1fr' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.48)' }}>ESSI web simulator</div>
                <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: 'white' }}>{frameTitle}</div>
                <div style={{ marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.56)' }}>{connectionLabel || 'No connection selected'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(59,130,246,0.18)', color: '#bfdbfe', fontSize: 11, fontWeight: 700 }}>ESSI</span>
                <span style={{ padding: '5px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: 700 }}>{prettify(activeStateName || 'state')}</span>
              </div>
            </div>
            <div style={{ minHeight: 0, display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 18, paddingTop: 18 }}>
              <div style={{ minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {states.map((state, index) => (
                    <button
                      key={state.name}
                      onClick={() => onStateChange(state.name)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 18,
                        border: `1px solid ${state.name === activeStateName ? 'rgba(96,165,250,0.55)' : 'rgba(255,255,255,0.08)'}`,
                        background: state.name === activeStateName ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                        color: 'white',
                        fontFamily: 'inherit',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: state.type === 'start' ? '#22c55e' : state.type === 'final' ? '#a855f7' : '#3b82f6' }} />
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{prettify(state.name)}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11.5, color: 'rgba(255,255,255,0.58)' }}>{state.type}{state.section ? ` · ${state.section}` : ''}</div>
                      <div style={{ marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>{index === 0 ? 'Start' : 'State block'}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const raw = e.dataTransfer.getData(DRAG_MIME)
                  if (!raw) return
                  try {
                    handleDrop(JSON.parse(raw) as DragPayload)
                  } catch {
                    // ignore
                  }
                }}
                style={{ minHeight: 0, overflowY: 'auto', borderRadius: 30, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', padding: 18 }}
              >
                <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.44)', fontWeight: 700 }}>Drop blocks here</div>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.76)', marginTop: 4 }}>Build how the receiver sees this step.</div>
                  </div>
                  <div style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: 700 }}>{elements.length} blocks</div>
                </div>
                {elements.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {elements.map((element, index) => (
                      <ScreenBlock
                        key={`${element.type}-${index}`}
                        element={element}
                        index={index}
                        selected={index === selectedIndex}
                        onSelect={() => setSelectedIndex(index)}
                        onDropData={payload => handleDrop(payload, index)}
                        onMoveUp={index > 0 ? () => moveAt(index, -1) : undefined}
                        onMoveDown={index < elements.length - 1 ? () => moveAt(index, 1) : undefined}
                        runtimeValue={runtimeValues[`${profile}:${activeStateName}:${index}`]}
                        onRuntimeValue={value => setRuntimeValues(prev => ({ ...prev, [`${profile}:${activeStateName}:${index}`]: value }))}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ border: '1px dashed rgba(255,255,255,0.12)', borderRadius: 24, minHeight: 340, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.02)', padding: 24, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>Empty state</div>
                      <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>Drag a block from the palette or click one to add it here.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ height: '100%', minHeight: 0, borderRadius: 32, border: '1px solid var(--border)', background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)', boxShadow: '0 24px 100px -48px rgba(0,0,0,0.72)', padding: 20, display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 18 }}>
            <div style={{ minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {states.map((state, index) => (
                  <button
                    key={state.name}
                    onClick={() => onStateChange(state.name)}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 18,
                      border: `1px solid ${state.name === activeStateName ? 'rgba(96,165,250,0.55)' : 'rgba(255,255,255,0.08)'}`,
                      background: state.name === activeStateName ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                      color: 'white',
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: state.type === 'start' ? '#22c55e' : state.type === 'final' ? '#a855f7' : '#3b82f6' }} />
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{prettify(state.name)}</span>
                    </div>
                    <div style={{ marginTop: 4, fontSize: 11.5, color: 'rgba(255,255,255,0.58)' }}>{state.type}{state.section ? ` · ${state.section}` : ''}</div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'rgba(255,255,255,0.42)' }}>{index === 0 ? 'Start' : 'State block'}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 'min(430px, 100%)', height: '100%', maxHeight: '100%', borderRadius: 36, background: '#020617', padding: 10, boxShadow: '0 30px 110px -60px rgba(0,0,0,0.75)', overflow: 'hidden', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
                <div style={{ borderRadius: 28, background: '#f8fafc', overflow: 'hidden', minHeight: 0, height: '100%', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}>
                  <div style={{ padding: '14px 16px 10px', background: '#fff', borderBottom: '1px solid rgba(15,23,42,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--ink-4)' }}>
                      <span>9:41</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Icon name="phone" size={13} />
                        Wallet
                      </span>
                    </div>
                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)' }}>Wallet simulator</div>
                        <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{prettify(activeStateName || 'State')}</div>
                      </div>
                      <div style={{ padding: '5px 10px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 11, fontWeight: 700 }}>{PROFILE_LABELS.receiver.label}</div>
                    </div>
                  </div>

                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      const raw = e.dataTransfer.getData(DRAG_MIME)
                      if (!raw) return
                      try {
                        handleDrop(JSON.parse(raw) as DragPayload)
                      } catch {
                        // ignore
                      }
                    }}
                    style={{ minHeight: 0, overflowY: 'auto', padding: 16, background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 16 }}>
                      {elements.length > 0 ? (
                        elements.map((element, index) => (
                          <ScreenBlock
                            key={`${element.type}-${index}`}
                            element={element}
                            index={index}
                            selected={index === selectedIndex}
                            onSelect={() => setSelectedIndex(index)}
                            onDropData={payload => handleDrop(payload, index)}
                            onMoveUp={index > 0 ? () => moveAt(index, -1) : undefined}
                            onMoveDown={index < elements.length - 1 ? () => moveAt(index, 1) : undefined}
                            runtimeValue={runtimeValues[`${profile}:${activeStateName}:${index}`]}
                            onRuntimeValue={value => setRuntimeValues(prev => ({ ...prev, [`${profile}:${activeStateName}:${index}`]: value }))}
                          />
                        ))
                      ) : (
                        <div style={{ border: '1px dashed var(--border)', borderRadius: 24, minHeight: 360, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.65)', color: 'var(--ink-4)', padding: 24, textAlign: 'center' }}>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink-2)' }}>Empty wallet screen</div>
                            <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>Drag inputs, warnings, buttons, and charts into this simulator.</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Inspector</div>
          <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{selectedElement ? UI_ELEMENT_LABELS[selectedElement.type] : 'No block selected'}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>
            {profile === 'sender' ? 'ESSI web layout' : 'Wallet mobile layout'} · {connectionLabel || 'No connection selected'}
          </div>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', minHeight: 0, flex: 1 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr', marginBottom: 14 }}>
            <div style={{ padding: '12px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>State</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{prettify(activeStateName || 'State')}</div>
            </div>
            <div style={{ padding: '12px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--bg)' }}>
              <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Blocks</div>
              <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{elements.length}</div>
            </div>
          </div>

          {selectedElement ? (
            <ElementInspector
              element={selectedElement}
              index={selectedIndex}
              onChange={updateSelected}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              onMoveUp={selectedIndex != null && selectedIndex > 0 ? () => moveSelected(-1) : undefined}
              onMoveDown={selectedIndex != null && selectedIndex < elements.length - 1 ? () => moveSelected(1) : undefined}
            />
          ) : (
            <div style={{ border: '1px dashed var(--border)', borderRadius: 16, padding: 16, color: 'var(--ink-4)', fontSize: 12.5, lineHeight: 1.6 }}>
              Select a block in the simulator to edit it, or drag a new block from the palette.
            </div>
          )}

          <div style={{ marginTop: 16, padding: 14, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--ink-3)', fontSize: 12.5, lineHeight: 1.7 }}>
            Changes are written back to <span style={{ fontFamily: 'var(--font-mono)' }}>display_hints.profiles.{profile}.states.{activeStateName}</span> and stay in sync with the JSON tab.
          </div>
        </div>
      </aside>
    </div>
  )
}

export default WorkflowScreenDesigner
