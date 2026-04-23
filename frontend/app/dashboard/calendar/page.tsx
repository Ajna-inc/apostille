"use client"
import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { calendarApi, connectionApi } from '@/lib/api'
import { useNotifications } from '../../context/NotificationContext'

type CalendarEvent = {
  id: string
  eventId: string
  role: string
  organizerState?: string
  inviteeState?: string
  event: {
    event_id: string
    title: string
    type: string
    start?: string
    end?: string
    timezone?: string
    organizer: string
    participants: Array<{ did: string; role: string; status: string }>
    sequence: number
    sensitivity: string
    allow_delegation: boolean
    recurrence?: { rrule: string } | null
  }
  timeOptions?: Array<{ option_id: string; start: string; end: string; timezone: string }>
  connectionId?: string
}

type Connection = { id: string; theirLabel?: string; theirDid?: string; state: string }

type Tab = 'upcoming' | 'all' | 'invitations' | 'create'

export default function CalendarPage() {
  const { token } = useAuth()
  const { notifications } = useNotifications()
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [tab, setTab] = useState<Tab>('upcoming')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [title, setTitle] = useState('')
  const [eventType, setEventType] = useState('meeting')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [selectedConnection, setSelectedConnection] = useState('')
  // Call config (visible when type=call)
  const [callAudio, setCallAudio] = useState(true)
  const [callVideo, setCallVideo] = useState(true)
  const [callTopology, setCallTopology] = useState<'mesh' | 'sfu'>('mesh')

  const fetchEvents = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = tab === 'upcoming'
        ? await calendarApi.getUpcoming()
        : tab === 'invitations'
          ? await calendarApi.listEvents({ role: 'invitee' })
          : await calendarApi.listEvents()
      setEvents((res as any)?.data || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }, [token, tab])

  const fetchConnections = useCallback(async () => {
    if (!token) return
    try {
      const res = await connectionApi.getAll()
      const list = (res as any)?.data || (res as any) || []
      setConnections(Array.isArray(list) ? list.filter((c: Connection) => c.state === 'completed') : [])
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => { fetchEvents() }, [fetchEvents])
  useEffect(() => { fetchConnections() }, [fetchConnections])

  // Refresh on calendar WebSocket events
  useEffect(() => {
    if (!notifications.length) return
    const latest = notifications[0]
    const type = (latest as any)?.type || ''
    if (type.startsWith('Calendar')) fetchEvents()
  }, [notifications, fetchEvents])

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !selectedConnection) return
    setError(null)
    try {
      const conn = connections.find(c => c.id === selectedConnection)
      const media: string[] = []
      if (callAudio) media.push('audio')
      if (callVideo) media.push('video')

      await calendarApi.invite({
        title,
        type: eventType,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        timezone,
        participant_dids: conn?.theirDid ? [conn.theirDid] : [],
        connection_id: selectedConnection,
        organizer_did: '',
        allow_delegation: false,
        ...(eventType === 'call' ? { call_config: { topology: callTopology, media } } : {}),
      })
      setTitle('')
      setStart('')
      setEnd('')
      setTab('upcoming')
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to create event')
    }
  }

  const handleAccept = async (eventId: string) => {
    try {
      await calendarApi.accept({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to accept')
    }
  }

  const handleDecline = async (eventId: string) => {
    try {
      await calendarApi.decline({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to decline')
    }
  }

  const handleTentative = async (eventId: string) => {
    try {
      await calendarApi.tentative({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to mark tentative')
    }
  }

  const handleCancel = async (eventId: string) => {
    try {
      await calendarApi.cancel({ event_id: eventId })
      fetchEvents()
    } catch (e: any) {
      setError(e?.message || 'Failed to cancel')
    }
  }

  const formatTime = (iso?: string) => {
    if (!iso) return '-'
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  const getStateLabel = (ev: CalendarEvent) => {
    if (ev.role === 'organizer') return ev.organizerState || '-'
    return ev.inviteeState || '-'
  }

  const getStateBadgeColor = (state?: string) => {
    switch (state) {
      case 'accepted': case 'confirmed': case 'completed': return 'bg-green-100 text-green-800'
      case 'declined': case 'cancelled': case 'failed': return 'bg-red-100 text-red-800'
      case 'tentative': case 'proposing': case 'polling': return 'bg-yellow-100 text-yellow-800'
      case 'pending': case 'invited': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'invitations', label: 'Invitations' },
    { key: 'all', label: 'All Events' },
    { key: 'create', label: '+ Create' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Calendar</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              tab === t.key
                ? 'bg-white border border-b-0 border-gray-200 text-primary-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      {/* Create Form */}
      {tab === 'create' && (
        <form onSubmit={handleCreateInvite} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create Event</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)} required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              placeholder="Event title"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={eventType} onChange={e => setEventType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="meeting">Meeting</option>
                <option value="call">Call</option>
                <option value="deadline">Deadline</option>
                <option value="task">Task</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Connection</label>
              <select value={selectedConnection} onChange={e => setSelectedConnection(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg">
                <option value="">Select connection...</option>
                {connections.map(c => (
                  <option key={c.id} value={c.id}>{c.theirLabel || c.id.slice(0, 12)}</option>
                ))}
              </select>
            </div>
          </div>
          {eventType === 'call' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-blue-800">Call Configuration</h3>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={callAudio} onChange={e => setCallAudio(e.target.checked)}
                    className="rounded border-gray-300" />
                  Audio
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={callVideo} onChange={e => setCallVideo(e.target.checked)}
                    className="rounded border-gray-300" />
                  Video
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-1">Topology</label>
                <select value={callTopology} onChange={e => setCallTopology(e.target.value as 'mesh' | 'sfu')}
                  className="px-3 py-1.5 text-sm border border-blue-300 rounded-lg bg-white">
                  <option value="mesh">Mesh (P2P)</option>
                  <option value="sfu">SFU (Server-mediated)</option>
                </select>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <button type="submit"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition-colors">
            Create & Send Invite
          </button>
        </form>
      )}

      {/* Events List */}
      {tab !== 'create' && (
        <div className="space-y-3">
          {loading && <p className="text-gray-500 text-sm">Loading...</p>}
          {!loading && events.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="font-medium">No events found</p>
              <p className="text-sm mt-1">Create an event to get started</p>
            </div>
          )}
          {events.map(ev => {
            const state = getStateLabel(ev)
            const isPending = ev.role === 'invitee' && ev.inviteeState === 'pending'
            return (
              <div key={ev.id || ev.eventId} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{ev.event?.title || 'Untitled'}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStateBadgeColor(state)}`}>
                        {state}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {ev.role}
                      </span>
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">
                        {ev.event?.type}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5">
                      <p>{formatTime(ev.event?.start)} - {formatTime(ev.event?.end)}</p>
                      <p>{ev.event?.participants?.length || 0} participant(s)</p>
                      {ev.event?.recurrence && (
                        <p className="text-xs text-purple-600">Recurring: {ev.event.recurrence.rrule}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 ml-4">
                    {isPending && (
                      <>
                        <button onClick={() => handleAccept(ev.eventId)}
                          className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700">
                          Accept
                        </button>
                        <button onClick={() => handleTentative(ev.eventId)}
                          className="px-3 py-1.5 text-xs font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">
                          Tentative
                        </button>
                        <button onClick={() => handleDecline(ev.eventId)}
                          className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700">
                          Decline
                        </button>
                      </>
                    )}
                    {ev.role === 'organizer' && ev.organizerState !== 'cancelled' && ev.organizerState !== 'completed' && (
                      <button onClick={() => handleCancel(ev.eventId)}
                        className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-700 rounded-lg hover:bg-red-200">
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
