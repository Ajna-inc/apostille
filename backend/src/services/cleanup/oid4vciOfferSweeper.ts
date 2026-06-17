import { db } from '../../db/driver'

/**
 * Periodic sweeper for `oid4vci_pending_offers`.
 *
 * Demo offers no longer hit Postgres (they live in Redis with TTL), but the
 * non-demo OID4VCI flow still INSERTs rows that have no inherent cleanup.
 * Without sweeping, the table grows unbounded — at the time of writing it
 * held 169 fully-expired rows totalling ~3 MB.
 *
 * Strategy: delete rows whose `expires_at` is older than a 1-hour grace
 * window. The grace window leaves recently-expired rows alone in case an
 * operator wants to inspect a failed flow.
 */

const SWEEP_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes
const GRACE_INTERVAL = '1 hour'

let timer: NodeJS.Timeout | undefined

async function sweepOnce(): Promise<void> {
  try {
    const result = await db.query(
      `DELETE FROM oid4vci_pending_offers WHERE expires_at < NOW() - INTERVAL '${GRACE_INTERVAL}'`,
    )
    const removed = (result as any).rowCount ?? 0
    if (removed > 0) {
      console.log(`[OfferSweeper] removed ${removed} expired oid4vci_pending_offers rows`)
    }
  } catch (e: any) {
    console.warn('[OfferSweeper] sweep failed:', e?.message || e)
  }
}

export function startOid4vciOfferSweeper(): void {
  if (timer) return
  // Run once shortly after boot (after the agent system is up) so we don't
  // race with initialization, then on the regular interval.
  setTimeout(() => {
    void sweepOnce()
    timer = setInterval(() => void sweepOnce(), SWEEP_INTERVAL_MS)
    timer.unref?.()
  }, 30_000)
}

export function stopOid4vciOfferSweeper(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}
