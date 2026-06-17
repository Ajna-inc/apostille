import crypto from 'crypto'
import { DataIntegrityService } from '@ajna-inc/openbadges'

/**
 * Generic JSON-LD VC issuance helper.
 *
 * Signs a W3C VC v2 document with `DataIntegrityProof` + `eddsa-rdfc-2022`
 * via `DataIntegrityService` from `@ajna-inc/openbadges`. This bypasses the
 * OBv3 envelope validator inside `IssuerService.issueCredential`, so the
 * credential is not constrained to the `OpenBadgeCredential` type/shape.
 *
 * The output is bifold-v2 compatible: the wallet's JSON-LD bridge only
 * verifies `eddsa-rdfc-2022` and `ecdsa-rdfc-2019` cryptosuites, which is
 * why Credo's default `Ed25519Signature2020` (used by `signLdpVc`) is
 * rejected.
 */

export const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2'

export interface IssueJsonLdOptions {
  contexts: string[]
  types: string[]
  issuerDid: string
  verificationMethod: string
  credentialSubject: Record<string, unknown>
  credentialId?: string
  validFrom?: string
  validUntil?: string
}

export async function issueJsonLdCredential(
  agent: any,
  opts: IssueJsonLdOptions,
): Promise<{ credential: Record<string, unknown> }> {
  const openbadgesApi = (agent.modules as any)?.openbadges
  if (!openbadgesApi) {
    throw new Error(
      'OpenBadges module not configured on agent — required for DataIntegrityProof signing',
    )
  }

  await openbadgesApi.ensureBinding(opts.issuerDid, opts.verificationMethod)

  const contexts = Array.from(
    new Set([VC_V2_CONTEXT, ...(opts.contexts || [])]),
  )
  const validFrom = opts.validFrom || new Date().toISOString()
  const document: Record<string, unknown> = {
    '@context': contexts,
    id: opts.credentialId || `urn:uuid:${crypto.randomUUID()}`,
    type: opts.types,
    issuer: opts.issuerDid,
    validFrom,
    issuanceDate: validFrom,
    ...(opts.validUntil && { validUntil: opts.validUntil }),
    credentialSubject: opts.credentialSubject,
  }

  const di = agent.dependencyManager.resolve(DataIntegrityService) as DataIntegrityService
  const signed = await di.sign(agent.context, document, {
    id: opts.verificationMethod,
    controller: opts.verificationMethod.split('#')[0],
  } as any)

  return { credential: signed as Record<string, unknown> }
}
