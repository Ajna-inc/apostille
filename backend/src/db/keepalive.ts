import { db } from './driver'

/**
 * Postgres app-pool keepalive.
 *
 * The `pg` Pool's `idleTimeoutMillis` is 30 s, after which idle clients are
 * evicted from the pool. DigitalOcean's managed Postgres also closes idle
 * backend connections after a few minutes. Combined with the cluster egress
 * NAT, a "cold" demo request can pay 150-500 ms re-establishing TCP+TLS.
 *
 * A `SELECT 1` every 30 s keeps at least one connection warm so demo DB
 * queries (whichever the route makes) hit a live connection.
 *
 * Cost: ~1 ms server-side per tick, 120 queries/hour total.
 */

const PG_KEEPALIVE_MS = 30_000

let interval: NodeJS.Timeout | undefined

export function startPgKeepalive(): void {
  if (interval) return
  const tick = () => {
    db.query('SELECT 1').catch((err) => {
      console.warn('[PgKeepalive] ping failed:', err?.message || err)
    })
  }
  interval = setInterval(tick, PG_KEEPALIVE_MS)
  interval.unref?.()
}

export function stopPgKeepalive(): void {
  if (interval) {
    clearInterval(interval)
    interval = undefined
  }
}
