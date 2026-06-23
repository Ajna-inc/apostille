'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Icon } from '../ui/Icons'
import { makeDefaultElement, UI_ELEMENT_LABELS } from '@/lib/workflow-builder/constants'
import type { UIElement, WorkflowTemplate } from '@/lib/workflow-builder/types'
import type { ProfileName, UIElementType } from '@/lib/workflow-builder/constants'
import { PROFILE_LABELS } from './WorkflowScreenPreview'
import { prettify as _prettify, wfGetAt, wfSetAt, safeMediaSrc } from '@/lib/workflow-builder/utils'

type DragPayload =
  | { kind: 'palette'; type: UIElementType }
  | { kind: 'move'; fromIndex: number }

type DeviceKind = 'phone' | 'tablet' | 'website'

const DEVICE_GROUPS: { group: string; kind: DeviceKind; devices: { label: string; width: number; height?: number }[] }[] = [
  {
    group: 'iPhone',
    kind: 'phone',
    devices: [
      { label: 'iPhone 16 Pro', width: 393 },
      { label: 'iPhone 16', width: 390 },
      { label: 'iPhone 15 Pro', width: 393 },
      { label: 'iPhone 14', width: 390 },
      { label: 'iPhone SE', width: 375 },
    ],
  },
  {
    group: 'Android',
    kind: 'phone',
    devices: [
      { label: 'Galaxy S25 Ultra', width: 412 },
      { label: 'Galaxy S24', width: 384 },
      { label: 'Galaxy S23', width: 393 },
      { label: 'Galaxy A55', width: 412 },
      { label: 'Pixel 9 Pro', width: 412 },
      { label: 'Pixel 8', width: 412 },
    ],
  },
  {
    group: 'iPad',
    kind: 'tablet',
    devices: [
      { label: 'iPad Pro 13"', width: 1024 },
      { label: 'iPad Pro 11"', width: 834 },
      { label: 'iPad Air', width: 820 },
      { label: 'iPad mini', width: 744 },
    ],
  },
  {
    group: 'Android Tablet',
    kind: 'tablet',
    devices: [
      { label: 'Galaxy Tab S9 Ultra', width: 1280 },
      { label: 'Galaxy Tab S9+', width: 1012 },
      { label: 'Galaxy Tab S9', width: 834 },
      { label: 'Pixel Tablet', width: 1280 },
    ],
  },
  {
    group: 'Web',
    kind: 'website',
    devices: [
      { label: 'Desktop', width: 1440 },
    ],
  },
]

const ALL_DEVICES = DEVICE_GROUPS.flatMap(g => g.devices.map(d => ({ ...d, kind: g.kind, group: g.group })))
type AnyDevice = typeof ALL_DEVICES[number]

interface WorkflowScreenDesignerProps {
  template: WorkflowTemplate | null
  stateName: string
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

const prettify = _prettify

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
        return safeMediaSrc(element.src) ? <img src={safeMediaSrc(element.src)} alt={element.alt || element.label || 'Preview image'} style={{ width: '100%', borderRadius: 16, display: 'block', ...(element.maxHeight ? { maxHeight: element.maxHeight, objectFit: 'cover' as const } : {}) }} /> : <div style={{ borderRadius: 16, border: '1px dashed var(--border)', background: 'var(--bg-sunk)', minHeight: 120, display: 'grid', placeItems: 'center', color: 'var(--ink-4)' }}>Image placeholder</div>
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
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', cursor: 'grab', color: 'var(--ink)', userSelect: 'none', fontSize: 12, fontWeight: 500 }}
    >
      <Icon name={paletteIconName(type) as any} size={11} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{UI_ELEMENT_LABELS[type]}</span>
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
          <TextField label="Max height (px)" value={element.maxHeight ? String(element.maxHeight) : ''} onChange={v => update({ maxHeight: v ? Number(v) : undefined })} />
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

const PHONE_CONFIGS: Record<string, { cornerRadius: number; btnRadius: number; top: 'notch' | 'dynamicIsland' | 'punchHole' | 'none'; bottom: 'homeIndicator' | 'homeButton'; leftBtns: number[][] }> = {
  'iPhone 16 Pro': { cornerRadius: 46, btnRadius: 3, top: 'dynamicIsland', bottom: 'homeIndicator', leftBtns: [[72, 28], [112, 52], [172, 52]] },
  'iPhone 16':     { cornerRadius: 44, btnRadius: 3, top: 'dynamicIsland', bottom: 'homeIndicator', leftBtns: [[72, 28], [112, 52], [172, 52]] },
  'iPhone 15 Pro': { cornerRadius: 46, btnRadius: 3, top: 'dynamicIsland', bottom: 'homeIndicator', leftBtns: [[72, 28], [112, 52], [172, 52]] },
  'iPhone 14':     { cornerRadius: 44, btnRadius: 3, top: 'notch',         bottom: 'homeIndicator', leftBtns: [[72, 28], [112, 52], [172, 52]] },
  'iPhone SE':     { cornerRadius: 20, btnRadius: 3, top: 'none',          bottom: 'homeButton',    leftBtns: [[80, 52], [140, 52]] },
  'Galaxy S25 Ultra': { cornerRadius: 38, btnRadius: 2, top: 'punchHole',  bottom: 'homeIndicator', leftBtns: [[80, 60], [148, 44]] },
  'Galaxy S24':    { cornerRadius: 42, btnRadius: 2, top: 'punchHole',     bottom: 'homeIndicator', leftBtns: [[80, 60], [148, 44]] },
  'Galaxy S23':    { cornerRadius: 40, btnRadius: 2, top: 'punchHole',     bottom: 'homeIndicator', leftBtns: [[80, 60], [148, 44]] },
  'Galaxy A55':    { cornerRadius: 36, btnRadius: 2, top: 'punchHole',     bottom: 'homeIndicator', leftBtns: [[100, 56], [164, 44]] },
  'Pixel 9 Pro':   { cornerRadius: 40, btnRadius: 2, top: 'punchHole',     bottom: 'homeIndicator', leftBtns: [[100, 72]] },
  'Pixel 8':       { cornerRadius: 38, btnRadius: 2, top: 'punchHole',     bottom: 'homeIndicator', leftBtns: [[100, 72]] },
  'iPad Pro 13"':  { cornerRadius: 18, btnRadius: 2, top: 'none',          bottom: 'homeIndicator', leftBtns: [[120, 80]] },
  'iPad Pro 11"':  { cornerRadius: 18, btnRadius: 2, top: 'none',          bottom: 'homeIndicator', leftBtns: [[100, 72]] },
  'iPad Air':      { cornerRadius: 18, btnRadius: 2, top: 'none',          bottom: 'homeIndicator', leftBtns: [[100, 72]] },
  'iPad mini':     { cornerRadius: 18, btnRadius: 2, top: 'none',          bottom: 'homeIndicator', leftBtns: [[80, 60]] },
  'Galaxy Tab S9 Ultra': { cornerRadius: 16, btnRadius: 2, top: 'punchHole', bottom: 'homeIndicator', leftBtns: [[120, 80]] },
  'Galaxy Tab S9+': { cornerRadius: 16, btnRadius: 2, top: 'punchHole',    bottom: 'homeIndicator', leftBtns: [[100, 72]] },
  'Galaxy Tab S9': { cornerRadius: 16, btnRadius: 2, top: 'punchHole',     bottom: 'homeIndicator', leftBtns: [[100, 60]] },
  'Pixel Tablet':  { cornerRadius: 20, btnRadius: 2, top: 'punchHole',     bottom: 'homeIndicator', leftBtns: [[120, 72]] },
}

const PHONE_HEIGHTS: Record<string, number> = {
  'iPhone 16 Pro': 852, 'iPhone 16': 844, 'iPhone 15 Pro': 852, 'iPhone 14': 844, 'iPhone SE': 667,
  'Galaxy S25 Ultra': 918, 'Galaxy S24': 832, 'Galaxy S23': 851, 'Galaxy A55': 900, 'Pixel 9 Pro': 896, 'Pixel 8': 896,
  'iPad Pro 13"': 1366, 'iPad Pro 11"': 1194, 'iPad Air': 1180, 'iPad mini': 1133,
  'Galaxy Tab S9 Ultra': 1848, 'Galaxy Tab S9+': 1332, 'Galaxy Tab S9': 1280, 'Pixel Tablet': 1920,
}


function WebsiteFrame({ frameTitle, stateName, children }: { frameTitle: string; stateName: string; children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 10, overflow: 'hidden', background: '#0f1117', boxShadow: '0 8px 40px -8px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Instance header */}
      <div style={{ flexShrink: 0, padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>HY</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>hyperbola2</div>
          <div style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ color: '#6366f1' }}>{frameTitle || 'Workflow'}</span>
            <span>·</span>
            <span>{stateName || 'state'}</span>
            <span>·</span>
            <span>Started 2d ago</span>
            <span>·</span>
            <span style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', borderRadius: 5, padding: '1px 7px', fontSize: 10.5, fontWeight: 600 }}>Receiving</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#eab308' }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#eab308' }}>NEEDS YOU</span>
        </div>
      </div>

      {/* Content blocks (scrollable) */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '28px 40px' }}>
        <div style={{ maxWidth: 700 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6366f1', marginBottom: 4 }}>Action needed</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#94a3b8', marginBottom: 20 }}>{prettify(stateName || 'State')}</div>
          {children}
        </div>
      </div>
    </div>
  )
}

function PhoneFrame({ model, width, children }: { model: AnyDevice; width: number; children: React.ReactNode }) {
  const screenHeight = PHONE_HEIGHTS[model.label] ?? 844
  const cfg = PHONE_CONFIGS[model.label] ?? PHONE_CONFIGS['iPhone 14']
  const cr = cfg.cornerRadius
  const btn: React.CSSProperties = {
    position: 'absolute', width: 3, background: 'linear-gradient(90deg, #3a3a3c, #2a2a2c)',
    borderRadius: `${cfg.btnRadius}px 0 0 ${cfg.btnRadius}px`,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.3)',
  }
  const btnR: React.CSSProperties = {
    ...btn, right: -3, left: 'unset',
    borderRadius: `0 ${cfg.btnRadius}px ${cfg.btnRadius}px 0`,
  }
  return (
    <div style={{ position: 'relative', width: `min(${width}px, 100%)`, height: 'fit-content', display: 'inline-block' }}>
      {/* Left buttons */}
      {cfg.leftBtns.map(([top, h], i) => (
        <div key={i} style={{ ...btn, left: -3, top, height: h }} />
      ))}
      {/* Right power button */}
      <div style={{ ...btnR, top: 130, height: 68 }} />

      {/* Body */}
      <div style={{
        borderRadius: cr + 8,
        background: 'linear-gradient(160deg, #2e2e30 0%, #1c1c1e 60%, #141416 100%)',
        padding: '11px 9px 14px',
        boxShadow: '0 60px 160px -40px rgba(0,0,0,0.95), 0 2px 8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}>
        {/* Screen glass */}
        <div style={{ borderRadius: cr, background: '#f1f5f9', overflow: 'hidden', position: 'relative', aspectRatio: `${model.width} / ${screenHeight}`, display: 'flex', flexDirection: 'column' }}>
          {/* Top chrome: notch / dynamic island / punch-hole */}
          {cfg.top === 'notch' && (
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 130, height: 28, background: '#1c1c1e', borderRadius: '0 0 20px 20px', zIndex: 10 }} />
          )}
          {cfg.top === 'dynamicIsland' && (
            <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 110, height: 30, background: '#1c1c1e', borderRadius: 20, zIndex: 10 }} />
          )}
          {cfg.top === 'punchHole' && (
            <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 12, height: 12, background: '#1c1c1e', borderRadius: '50%', zIndex: 10 }} />
          )}

          {/* Status bar — fixed, no shrink */}
          <div style={{ flexShrink: 0, padding: cfg.top === 'notch' ? '32px 18px 6px' : cfg.top === 'dynamicIsland' ? '48px 18px 6px' : '14px 18px 6px', display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#475569' }}>
            <span>9:41</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                <rect x="0" y="6" width="2" height="4" rx="0.5" fill="currentColor" opacity="0.4"/>
                <rect x="3" y="4" width="2" height="6" rx="0.5" fill="currentColor" opacity="0.6"/>
                <rect x="6" y="2" width="2" height="8" rx="0.5" fill="currentColor" opacity="0.8"/>
                <rect x="9" y="0" width="2" height="10" rx="0.5" fill="currentColor"/>
                <rect x="11.5" y="2" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1" fill="none" opacity="0.6"/>
                <rect x="12" y="3.5" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.6"/>
              </svg>
            </span>
          </div>

          {/* Scrollable content area */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            {children}
          </div>

          {/* Bottom chrome — fixed, no shrink */}
          {cfg.bottom === 'homeIndicator' && (
            <div style={{ flexShrink: 0, padding: '8px 0 10px', display: 'flex', justifyContent: 'center', background: '#f1f5f9' }}>
              <div style={{ width: 100, height: 4, borderRadius: 2, background: '#1c1c1e', opacity: 0.18 }} />
            </div>
          )}
          {cfg.bottom === 'homeButton' && (
            <div style={{ flexShrink: 0, padding: '10px 0 14px', display: 'flex', justifyContent: 'center', background: '#f1f5f9' }}>
              <div style={{ width: 42, height: 42, borderRadius: '50%', border: '2px solid rgba(0,0,0,0.15)', background: 'linear-gradient(145deg, #e2e8f0, #cbd5e1)', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8), 0 1px 3px rgba(0,0,0,0.15)' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function WorkflowScreenDesigner({
  template,
  stateName,
  onStateChange,
  onTemplateChange,
  connectionLabel,
  className,
}: WorkflowScreenDesignerProps) {
  const profile: ProfileName = 'receiver'
  const states = template?.states || []
  const activeStateName = useMemo(() => {
    if (!states.length) return stateName
    if (stateName && states.some(state => state.name === stateName)) return stateName
    return states[0]?.name || stateName
  }, [stateName, states])

  const [deviceIdx, setDeviceIdx] = useState(0)
  const device = ALL_DEVICES[deviceIdx]

  const elements = useStateElements(template, profile, activeStateName)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(elements.length ? 0 : null)
  const [runtimeValues, setRuntimeValues] = useState<Record<string, unknown>>({})

  useEffect(() => {
    if (!elements.length) {
      setSelectedIndex(null)
      return
    }
    setSelectedIndex(prev => (prev != null && prev < elements.length ? prev : 0))
  }, [elements.length, activeStateName])

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

  const blockList = (dropHandler: (payload: DragPayload) => void) => elements.length > 0 ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
  ) : null

  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr) 300px', gap: 0, minHeight: 0, height: '100%' }}>

      {/* ── Left sidebar: profile · states · palette ── */}
      <aside style={{ borderRight: '1px solid var(--border)', background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Screen designer</div>
          <div style={{ marginTop: 3, fontSize: 15, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{frameTitle}</div>
        </div>

        {/* States list */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 8 }}>
            States {states.length > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400, color: 'var(--ink-5)', fontSize: 9.5 }}>{states.length}</span>}
          </div>
          {states.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {states.map(state => {
                const active = state.name === activeStateName
                const dot = state.type === 'start' ? 'var(--green)' : state.type === 'final' ? 'var(--violet)' : 'var(--accent)'
                return (
                  <button
                    key={state.name}
                    onClick={() => onStateChange(state.name)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 9,
                      border: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
                      background: active ? 'var(--accent-soft)' : 'transparent',
                      textAlign: 'left', color: 'inherit', fontFamily: 'inherit', cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500, color: active ? 'var(--ink)' : 'var(--ink-2)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {prettify(state.name)}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--ink-5)' }}>{state.type}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-4)', padding: '6px 0' }}>No states — open a template first</div>
          )}
        </div>

        {/* Element palette */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', marginBottom: 8 }}>Elements</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ELEMENT_PALETTES.map(group => (
              <div key={group.label}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <Icon name={group.icon as any} size={11} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink-5)' }}>{group.label}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {group.types.map(type => (
                    <PaletteItem key={type} type={type} onAdd={() => handleAdd(type)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Center: simulator ── */}
      <main style={{ minWidth: 0, minHeight: 0, overflow: 'hidden', padding: 14, background: 'var(--bg)' }}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Device selector bar */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, background: 'var(--bg-elev)' }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>Device</span>
              <select
                value={deviceIdx}
                onChange={e => setDeviceIdx(Number(e.target.value))}
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: 'var(--ink)', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}
              >
                {(() => {
                  let idx = 0
                  return DEVICE_GROUPS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.devices.map(d => {
                        const i = idx++
                        return <option key={d.label} value={i}>{d.label}{g.kind !== 'website' ? ` · ${d.width}pt` : ''}</option>
                      })}
                    </optgroup>
                  ))
                })()}
              </select>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{device.kind === 'website' ? 'Web receiver' : device.kind === 'tablet' ? 'Tablet · Wallet' : 'Wallet receiver'}</span>
            </div>

            {/* Frame canvas */}
            {device.kind === 'website' ? (
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', padding: '20px 24px' }}>
                <WebsiteFrame frameTitle={frameTitle} stateName={activeStateName}>
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const raw = e.dataTransfer.getData(DRAG_MIME); if (!raw) return; try { handleDrop(JSON.parse(raw) as DragPayload) } catch {} }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                  >
                    {elements.length > 0 ? blockList(p => handleDrop(p)) : (
                      <div style={{ minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, border: '2px dashed #e2e8f0' }}>
                        <Icon name="plus" size={18} style={{ color: '#94a3b8' }} />
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Empty screen</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Drag blocks from the palette</div>
                      </div>
                    )}
                  </div>
                </WebsiteFrame>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', justifyContent: 'center', padding: '28px 24px' }}>
                <PhoneFrame model={device} width={device.width}>
                  {/* App header */}
                  <div style={{ padding: '4px 18px 14px', borderBottom: '1px solid rgba(15,23,42,0.07)', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>{frameTitle}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginTop: 3, letterSpacing: '-0.02em' }}>{prettify(activeStateName || 'State')}</div>
                  </div>

                  {/* Block canvas */}
                  <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      const raw = e.dataTransfer.getData(DRAG_MIME)
                      if (!raw) return
                      try { handleDrop(JSON.parse(raw) as DragPayload) } catch {}
                    }}
                    style={{ padding: '14px 14px 28px', background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)' }}
                  >
                    {elements.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {blockList(p => handleDrop(p))}
                      </div>
                    ) : (
                      <div style={{ minHeight: 280, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 20, border: '2px dashed rgba(15,23,42,0.1)', background: 'rgba(255,255,255,0.5)' }}>
                        <Icon name="plus" size={18} style={{ color: '#94a3b8' }} />
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#475569' }}>Empty screen</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Drag blocks from the palette</div>
                      </div>
                    )}
                  </div>
                </PhoneFrame>
              </div>
            )}
          </div>
      </main>

      {/* ── Right: inspector ── */}
      <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--bg-elev)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Inspector</div>
          <div style={{ marginTop: 3, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
            {selectedElement ? UI_ELEMENT_LABELS[selectedElement.type] : 'No block selected'}
          </div>
          <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--ink-4)' }}>
            Wallet · {prettify(activeStateName || 'state')}
            {connectionLabel ? ` · ${connectionLabel}` : ''}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
          <div style={{ padding: '10px 12px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg)', marginBottom: 14 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--ink-4)', fontWeight: 600 }}>Blocks</div>
            <div style={{ marginTop: 3, fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>{elements.length}</div>
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
            <div style={{ border: '1px dashed var(--border)', borderRadius: 14, padding: '18px 14px', color: 'var(--ink-4)', fontSize: 12.5, lineHeight: 1.6, textAlign: 'center' }}>
              Select a block in the simulator to edit its properties.
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

export default WorkflowScreenDesigner
