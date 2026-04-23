import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { getAgent } from '../services/agentService'

const router = Router()

function getIceServers(tenantId?: string) {
  const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = []
  iceServers.push({ urls: ['stun:stun.l.google.com:19302'] })
  iceServers.push({ urls: ['stun:stun1.l.google.com:19302'] })

  const urls = process.env.WEBRTC_STUN_URLS || ''
  const turnSecret = process.env.WEBRTC_TURN_AUTH_SECRET
  const ttlSeconds = Number(process.env.WEBRTC_TURN_CRED_TTL_SECONDS || '3600')

  let username: string | undefined
  let credential: string | undefined

  if (turnSecret) {
    const now = Math.floor(Date.now() / 1000)
    const expires = now + Math.max(60, ttlSeconds)
    const userId = tenantId || 'anon'
    username = `${expires}:${userId}`
    credential = crypto.createHmac('sha1', turnSecret).update(username).digest('base64')
  }

  for (const url of urls.split(',').map((u) => u.trim()).filter(Boolean)) {
    if ((url.startsWith('turn:') || url.startsWith('turns:')) && username && credential) {
      iceServers.push({ urls: [url], username, credential })
    } else if (url.startsWith('stun:')) {
      iceServers.push({ urls: [url] })
    }
  }
  return iceServers
}

function getTenantId(req: Request) {
  return (req as any)?.user?.tenantId as string | undefined
}

// ── List events ─────────────────────────────────────────────────────

router.get('/events', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { role, connectionId } = req.query as { role?: string; connectionId?: string }
    const agent = await getAgent({ tenantId })
    const events = await agent.modules.calendar.listEvents(
      role || connectionId ? { role: role as any, connectionId } : undefined
    )
    res.json({ success: true, data: events })
  } catch (e: any) {
    console.error('[calendar/events] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Get upcoming events ─────────────────────────────────────────────

router.get('/upcoming', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const agent = await getAgent({ tenantId })
    const events = await agent.modules.calendar.getUpcomingEvents()
    res.json({ success: true, data: events })
  } catch (e: any) {
    console.error('[calendar/upcoming] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Get single event ────────────────────────────────────────────────

router.get('/events/:eventId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { eventId } = req.params
    const agent = await getAgent({ tenantId })
    const event = await agent.modules.calendar.getEvent(eventId)
    res.json({ success: true, data: event })
  } catch (e: any) {
    console.error('[calendar/events/:id] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Propose (with time options for polling) ─────────────────────────

router.post('/propose', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.propose(req.body)
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/propose] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Invite (direct, no poll) ────────────────────────────────────────

router.post('/invite', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.invite(req.body)
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/invite] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Accept ──────────────────────────────────────────────────────────

router.post('/accept', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, comment, signed_rsvp } = req.body
    if (!event_id) return res.status(400).json({ success: false, message: 'event_id is required' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.accept({ event_id, comment, signed_rsvp })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/accept] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Decline ─────────────────────────────────────────────────────────

router.post('/decline', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, reason, counter_propose } = req.body
    if (!event_id) return res.status(400).json({ success: false, message: 'event_id is required' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.decline({ event_id, reason, counter_propose })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/decline] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Tentative ───────────────────────────────────────────────────────

router.post('/tentative', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, confirm_by, comment } = req.body
    if (!event_id) return res.status(400).json({ success: false, message: 'event_id is required' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.tentative({ event_id, confirm_by, comment })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/tentative] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Update (organizer) ──────────────────────────────────────────────

router.post('/update', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, changes, reason, require_re_rsvp } = req.body
    if (!event_id || !changes) return res.status(400).json({ success: false, message: 'event_id and changes are required' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.update({ event_id, changes, reason, require_re_rsvp })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/update] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Cancel (organizer) ──────────────────────────────────────────────

router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, reason, cancel_scope, recurrence_id } = req.body
    if (!event_id) return res.status(400).json({ success: false, message: 'event_id is required' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.cancel({ event_id, reason, cancel_scope, recurrence_id })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/cancel] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Delegate ────────────────────────────────────────────────────────

router.post('/delegate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, delegate_to, scope, reason, jws } = req.body
    if (!event_id || !delegate_to || !jws) {
      return res.status(400).json({ success: false, message: 'event_id, delegate_to, and jws are required' })
    }

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.delegate({ event_id, delegate_to, scope: scope || 'full', reason, jws })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/delegate] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Poll Vote ───────────────────────────────────────────────────────

router.post('/poll-vote', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, votes } = req.body
    if (!event_id || !votes) return res.status(400).json({ success: false, message: 'event_id and votes are required' })

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.castPollVote({ event_id, votes })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/poll-vote] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Poll Close (organizer) ──────────────────────────────────────────

router.post('/poll-close', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, selected_option_id } = req.body
    if (!event_id || !selected_option_id) {
      return res.status(400).json({ success: false, message: 'event_id and selected_option_id are required' })
    }

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.closePoll({ event_id, selected_option_id })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/poll-close] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Query Availability ──────────────────────────────────────────────

router.post('/query-availability', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { connection_id, range, timezone, granularity_minutes, purpose } = req.body
    if (!connection_id || !range) {
      return res.status(400).json({ success: false, message: 'connection_id and range are required' })
    }

    const agent = await getAgent({ tenantId })
    await agent.modules.calendar.queryAvailability({
      connection_id,
      range,
      timezone: timezone || 'UTC',
      granularity_minutes,
      purpose,
    })
    res.json({ success: true })
  } catch (e: any) {
    console.error('[calendar/query-availability] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Send Reminder ───────────────────────────────────────────────────

router.post('/send-reminder', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, connection_id, offset_minutes, action } = req.body
    if (!event_id || !connection_id) {
      return res.status(400).json({ success: false, message: 'event_id and connection_id are required' })
    }

    const agent = await getAgent({ tenantId })
    // Generate fresh ICE credentials for call reminders
    const iceServers = action === 'join_call' ? getIceServers(tenantId) : undefined
    await agent.modules.calendar.sendReminder({
      event_id,
      connection_id,
      offset_minutes: offset_minutes ?? -15,
      action,
      ice_servers: iceServers,
    })
    res.json({ success: true })
  } catch (e: any) {
    console.error('[calendar/send-reminder] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

// ── Recurrence Exception ────────────────────────────────────────────

router.post('/recurrence-exception', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req)
    if (!tenantId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const { event_id, recurrence_id, action, changes, reason } = req.body
    if (!event_id || !recurrence_id || !action) {
      return res.status(400).json({ success: false, message: 'event_id, recurrence_id, and action are required' })
    }

    const agent = await getAgent({ tenantId })
    const record = await agent.modules.calendar.handleRecurrenceException({
      event_id,
      recurrence_id,
      action,
      changes,
      reason,
    })
    res.json({ success: true, data: record })
  } catch (e: any) {
    console.error('[calendar/recurrence-exception] error', e)
    res.status(500).json({ success: false, message: e?.message || 'Internal error' })
  }
})

export default router
