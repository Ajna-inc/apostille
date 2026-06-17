import { Router, Request, Response, NextFunction } from 'express'
import { getMainAgent } from '../services/agentService'
import { StateStore } from '../services/redis/stateStore'

/**
 * Custom OID4VP authorization-response interceptor for the demo verifier.
 *
 * **Why this exists:**
 * Credo 0.6.1's `OpenId4VpVerifierService.verifyPresentation` (line 656 of
 * the compiled module) does:
 *
 *     JsonTransformer.fromJSON(presentation, W3cJsonLdVerifiablePresentation)
 *
 * `W3cJsonLdVerifiablePresentation` is the V1 class with strict
 * `@IsCredentialJsonLdContext()` validation — `@context[0]` MUST equal
 * `https://www.w3.org/2018/credentials/v1`. There is no
 * `W3cV2JsonLdVerifiablePresentation` in Credo 0.6.1.
 *
 * Our OBv3, AlumniCredential, VolunteerCertificate, and EndorsementCredential
 * all use `https://www.w3.org/ns/credentials/v2` (OBv3 v3p0 spec mandates v2),
 * so Credo's verifier always rejects them with
 * "One or more presentations failed verification".
 *
 * This interceptor pre-empts Credo for `ldp_vp` bodies on the demo verifier
 * and verifies the proof via `@ajna-inc/openbadges` (which DOES handle v2 +
 * `eddsa-rdfc-2022` correctly). All other formats fall through to Credo's
 * auto-mounted router via `next()`.
 */

export interface DemoLdpVpSessionRecord {
  authorizationRequestId: string
  verifierId: string
  state: 'verified' | 'failed'
  verifiedClaims?: Record<string, any>
  error?: string
  receivedAt: string
}

/** Keyed by the OID4VP `authorizationRequestId` (the `?session=<id>` query param). */
export const demoLdpVpSessions = new StateStore<DemoLdpVpSessionRecord>({
  prefix: 'demo-oid4vp-ldp:',
  defaultTtlSeconds: 600,
})

const router = Router()

/**
 * Heuristic: is the vp_token body an ldp_vp (W3C JSON-LD VP) rather than a
 * JWT/SD-JWT/mdoc string?
 */
function isLdpVp(vpToken: unknown): boolean {
  const candidates = Array.isArray(vpToken) ? vpToken : [vpToken]
  return candidates.every((c) =>
    c != null &&
    typeof c === 'object' &&
    Array.isArray((c as any)['@context']) &&
    (Array.isArray((c as any).type)
      ? (c as any).type.includes('VerifiablePresentation')
      : (c as any).type === 'VerifiablePresentation'),
  )
}

router.post(
  '/oid4vp/:verifierId/authorize',
  async (req: Request, res: Response, next: NextFunction) => {
    // Only intercept the demo verifier; other verifiers (or future ones) go
    // through Credo's normal path.
    if (req.params.verifierId !== 'demo-verifier') return next()

    let vpToken: unknown = req.body?.vp_token
    // Wallet might submit vp_token as a JSON-stringified object (per the
    // older OID4VP draft). Try to parse, fall through if it doesn't look
    // like JSON.
    if (typeof vpToken === 'string') {
      const trimmed = vpToken.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { vpToken = JSON.parse(trimmed) } catch { /* not ldp_vp */ }
      }
    }

    if (!isLdpVp(vpToken)) return next()

    // From here on, we own the response.
    const authorizationRequestId =
      typeof req.query.session === 'string' ? req.query.session : undefined
    if (!authorizationRequestId) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing session parameter',
      })
    }

    const vps = Array.isArray(vpToken) ? vpToken : [vpToken]

    try {
      const agent = await getMainAgent()
      const openbadgesApi = (agent.modules as any).openbadges
      if (!openbadgesApi) {
        throw new Error('OpenBadges module not configured on main agent')
      }

      const verifiedCredentials: Array<Record<string, any>> = []
      for (const vp of vps) {
        const inner = (vp as any).verifiableCredential
        const credentials = Array.isArray(inner) ? inner : inner ? [inner] : []
        if (credentials.length === 0) {
          throw new Error('Presentation contains no verifiableCredential')
        }
        for (const credential of credentials) {
          const result = await openbadgesApi.verify(credential)
          if (!result || result.verified === false) {
            throw new Error(
              `Credential proof verification failed: ${result?.error ?? 'unknown'}`,
            )
          }
          const subject = (credential.credentialSubject ?? {}) as Record<string, any>
          // OBv3 nests achievement inside credentialSubject. Flatten the
          // useful bits for the demo receipt.
          const achievement = (subject.achievement ?? {}) as Record<string, any>
          verifiedCredentials.push({
            __format: 'ldp_vc',
            __type: credential.type,
            ...subject,
            ...(achievement.name && { achievement_name: achievement.name }),
            ...(achievement.description && { achievement_description: achievement.description }),
          })
        }
      }

      await demoLdpVpSessions.set(authorizationRequestId, {
        authorizationRequestId,
        verifierId: req.params.verifierId,
        state: 'verified',
        verifiedClaims: verifiedCredentials[0] ?? {},
        receivedAt: new Date().toISOString(),
      })

      return res.status(200).json({})
    } catch (e: any) {
      console.error('[Demo OID4VP intercept] ldp_vp verification failed:', e?.message || e)
      await demoLdpVpSessions.set(authorizationRequestId, {
        authorizationRequestId,
        verifierId: req.params.verifierId,
        state: 'failed',
        error: e?.message || String(e),
        receivedAt: new Date().toISOString(),
      })
      return res.status(400).json({
        error: 'invalid_request',
        error_description: e?.message || 'Verification failed',
      })
    }
  },
)

export default router
