import { OpenBadgesKeyBindingRepository } from '@ajna-inc/openbadges'

/**
 * OBv3 EndorsementCredential issuance helper.
 *
 * Delegates to `agent.modules.openbadges.issueEndorsement` from
 * `@ajna-inc/openbadges`. The endorsement is signed with
 * `DataIntegrityProof` + `eddsa-rdfc-2022` (same path as
 * AchievementCredential) and stored as `OpenBadgeCredentialRecord` in
 * holder wallets — so bifold v2 renders it correctly via the same
 * `isOpenBadgeV3`/OBv3 code path that already works for our existing
 * AchievementCredential demos.
 *
 * The OID4VCI wire format is `ldp_vc` (per OID4VCI §A.3); wallets detect
 * the endorsement shape from the `type` array
 * (`['VerifiableCredential', 'EndorsementCredential']`) and
 * `credentialSubject.type === 'EndorsementSubject'`.
 */

export interface IssueEndorsementOptions {
  /** URN/DID/URL of the entity being endorsed (achievement id, profile id, etc.) */
  endorsedEntity: string
  /** Optional human-readable comment explaining the endorsement. */
  endorsementComment?: string
  /** Endorser profile — becomes the credential's `issuer`. */
  issuerProfile: {
    id: string
    type?: 'Profile' | ['Profile', ...string[]]
    name?: string
    description?: string
    url?: string
    image?: string | { id: string; type?: 'Image' }
    email?: string
  }
  /** Verification method id used for signing. Defaults to `${issuerProfile.id}#key-0`. */
  verificationMethod?: string
  /** Optional override credential id. */
  credentialId?: string
  /** Optional ISO 8601 timestamp for `validFrom`. */
  validFrom?: string
  /** Optional ISO 8601 timestamp for `validUntil`. */
  validUntil?: string
}

export async function issueEndorsementCredential(
  agent: any,
  opts: IssueEndorsementOptions,
): Promise<{ credential: Record<string, unknown> }> {
  const openbadgesApi = (agent.modules as any)?.openbadges
  if (!openbadgesApi) {
    throw new Error('OpenBadges module not configured on agent — required for endorsement issuance')
  }

  const verificationMethod = opts.verificationMethod || `${opts.issuerProfile.id}#key-0`

  // Self-heal stale binding records (same logic as the AchievementCredential
  // and ldp_vc paths in oid4vciRoutes.ts). Without kmsKeyId, DataIntegrity
  // signing throws "Key binding is missing kmsKeyId".
  let binding = await openbadgesApi.ensureBinding(opts.issuerProfile.id, verificationMethod)
  if (!binding?.kmsKeyId) {
    const bindingRepo: any = agent.dependencyManager.resolve(OpenBadgesKeyBindingRepository as any)
    try {
      const stale = await bindingRepo.findByVmId(agent.context, verificationMethod)
      if (stale) await bindingRepo.delete(agent.context, stale)
    } catch (e: any) {
      console.warn('[Endorsement] Failed deleting stale key binding:', e?.message || e)
    }
    binding = await openbadgesApi.ensureBinding(opts.issuerProfile.id, verificationMethod)
    if (!binding?.kmsKeyId) {
      throw new Error(`Failed to create kms-backed key binding for ${verificationMethod}`)
    }
  }

  const record = await openbadgesApi.issueEndorsement({
    endorsedEntity: opts.endorsedEntity,
    endorsementComment: opts.endorsementComment,
    issuerProfile: {
      id: opts.issuerProfile.id,
      type: opts.issuerProfile.type || 'Profile',
      ...(opts.issuerProfile.name && { name: opts.issuerProfile.name }),
      ...(opts.issuerProfile.description && { description: opts.issuerProfile.description }),
      ...(opts.issuerProfile.url && { url: opts.issuerProfile.url }),
      ...(opts.issuerProfile.image && { image: opts.issuerProfile.image }),
      ...(opts.issuerProfile.email && { email: opts.issuerProfile.email }),
    },
    verificationMethod,
    ...(opts.credentialId && { id: opts.credentialId }),
    ...(opts.validFrom && { validFrom: opts.validFrom }),
    ...(opts.validUntil && { validUntil: opts.validUntil }),
  })

  return { credential: record.credential }
}
