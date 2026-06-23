'use client'

import { useState } from 'react'
import { Icon } from '../../../components/ui/Icons'
import { parseVersionRank } from '@/lib/workflow-builder/utils'

interface TemplateItem {
  id: string
  template_id: string
  version: string
  title: string
  createdAt: string
  hash?: string
}

interface TemplatesTableProps {
  templates: TemplateItem[]
  loading?: boolean
  onStart: (template: TemplateItem) => void
  onEnsure: (template: TemplateItem) => void
  onEdit: (template: TemplateItem) => void
  connectionSelected: boolean
}

// Group templates by template_id, latest version first
function groupByTemplateId(templates: TemplateItem[]) {
  const map = new Map<string, TemplateItem[]>()
  for (const t of templates) {
    if (!map.has(t.template_id)) map.set(t.template_id, [])
    map.get(t.template_id)!.push(t)
  }
  // Sort each group newest first
  for (const [, group] of map) {
    group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  return map
}

function latestVersion(versions: TemplateItem[]) {
  return [...versions].sort((a, b) => parseVersionRank(b.version) - parseVersionRank(a.version))[0]
}

export function TemplatesTable({
  templates,
  loading = false,
  onStart,
  onEnsure,
  onEdit,
  connectionSelected,
}: TemplatesTableProps) {
  const [open, setOpen] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const grouped = groupByTemplateId(templates)
  const uniqueCount = grouped.size

  const toggleExpand = (templateId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(templateId)) next.delete(templateId)
      else next.add(templateId)
      return next
    })
  }

  if (loading) {
    return (
      <div style={{ marginTop: 24 }}>
        <div className="section-title">Published Templates</div>
        <div className="empty"><div className="spinner" style={{ width: 20, height: 20 }} /></div>
      </div>
    )
  }

  if (templates.length === 0) return null

  return (
    <div style={{ marginTop: 16 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px 0', textAlign: 'left',
        }}
      >
        <Icon
          name="chevRight"
          size={13}
          style={{ color: 'var(--ink-4)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        />
        <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-3)' }}>
          Published Templates
        </span>
        <span style={{
          fontSize: 11, fontWeight: 600, color: 'var(--ink-4)',
          background: 'var(--bg-sunk)', padding: '1px 7px', borderRadius: 4,
        }}>
          {uniqueCount}
        </span>
      </button>

      {open && (
        <div className="table-wrap" style={{ marginTop: 6 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Template</th>
                <th>Latest</th>
                <th>Updated</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {[...grouped.entries()].map(([templateId, versions]) => {
                const latest = latestVersion(versions)
                const olderVersions = versions.filter(v => v.id !== latest.id)
                const isExpanded = expandedIds.has(templateId)

                return [
                  // Latest version row
                  <tr key={latest.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {olderVersions.length > 0 && (
                          <button
                            onClick={() => toggleExpand(templateId)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ink-4)' }}
                            title={isExpanded ? 'Hide older versions' : `${olderVersions.length} older version${olderVersions.length > 1 ? 's' : ''}`}
                          >
                            <Icon
                              name="chevRight"
                              size={11}
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                            />
                          </button>
                        )}
                        <div>
                          <span style={{ fontWeight: 500, color: 'var(--ink)' }}>{latest.title}</span>
                          <br />
                          <span className="mono-dim" style={{ fontSize: 10.5 }}>{templateId}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="tag">v{latest.version}</span>
                      {olderVersions.length > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 10.5, color: 'var(--ink-4)' }}>
                          +{olderVersions.length} older
                        </span>
                      )}
                    </td>
                    <td><span className="mono-dim">{new Date(latest.createdAt).toLocaleDateString()}</span></td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <button onClick={() => onStart(latest)} disabled={!connectionSelected} className="btn btn-accent btn-xs">Start</button>
                        <button onClick={() => onEnsure(latest)} disabled={!connectionSelected} className="btn btn-secondary btn-xs">Sync</button>
                        <button onClick={() => onEdit(latest)} className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={13} /></button>
                      </div>
                    </td>
                  </tr>,
                  // Older versions (expanded)
                  ...(isExpanded ? olderVersions.map(v => (
                    <tr key={v.id} style={{ background: 'var(--bg-sunk)', opacity: 0.75 }}>
                      <td style={{ paddingLeft: 36 }}>
                        <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Older version</span>
                      </td>
                      <td><span className="tag" style={{ opacity: 0.7 }}>v{v.version}</span></td>
                      <td><span className="mono-dim" style={{ fontSize: 11 }}>{new Date(v.createdAt).toLocaleDateString()}</span></td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                          <button onClick={() => onStart(v)} disabled={!connectionSelected} className="btn btn-secondary btn-xs">Start</button>
                          <button onClick={() => onEdit(v)} className="btn btn-ghost btn-icon btn-sm"><Icon name="edit" size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  )) : []),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
