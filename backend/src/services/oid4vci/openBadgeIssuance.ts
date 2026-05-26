import crypto from 'crypto'

/**
 * OpenBadges v3 OID4VCI issuance helper.
 *
 * The OBv3 OID4VCI flow piggybacks on `format: ldp_vc` per OID4VCI §A.3 —
 * the wallet detects OBv3 from the `type` array (`OpenBadgeCredential`)
 * rather than the wire format string.
 *
 * Internally we delegate signing to `@ajna-inc/openbadges` which produces a
 * `DataIntegrityProof` with `cryptosuite: eddsa-rdfc-2022` (the suite
 * required by the IMS Global OBv3 specification).
 *
 * This module intentionally does NOT bundle the OBv3 verification step;
 * verification is the verifier's concern and lives in a separate module.
 */

export const OBV3_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
export const OBV3_EXTENSIONS_CONTEXT = 'https://purl.imsglobal.org/spec/ob/v3p0/extensions.json'
export const VC_V2_CONTEXT = 'https://www.w3.org/ns/credentials/v2'
export const OBV3_ACHIEVEMENT_SCHEMA_URL =
  'https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json'

export interface AchievementTemplate {
  id?: string
  type?: string | string[]
  achievementType?: string
  name: string
  description?: string
  criteria?: { id?: string; narrative?: string } | string
  image?: string | { id: string; type?: string }
  tag?: string[]
}

export interface IssuerProfile {
  id: string                  // did:web:...
  name?: string
  url?: string
  description?: string
  image?: string | { id: string; type?: string }
}

/**
 * An OBv3 `IdentityObject` (the JSON Schema $def used by
 * `AchievementSubject.identifier`). Required by spec:
 *   { type:'IdentityObject', hashed, identityHash, identityType }
 * `identityType` is one of the IdentifierTypeEnum values or an `ext:` extension.
 * `additionalProperties:false` on the schema, so do not add other fields.
 */
export interface ObV3IdentityObject {
  type: 'IdentityObject'
  hashed: boolean
  identityHash: string
  identityType: string
  salt?: string
}

export interface RecipientData {
  /**
   * Subject identifier. When the holder presents a holder-binding proof
   * (jwk or did kid), the resolved DID should be passed here so
   * `credentialSubject.id` is correctly bound. Per OBv3 (§AchievementSubject)
   * either `id` or at least one `identifier` MUST be supplied; if neither is
   * provided a `urn:uuid:` is minted as a placeholder.
   */
  id?: string
  /**
   * Display name for the recipient. NOT emitted as `credentialSubject.name`
   * (which is not an AchievementSubject property in the OBv3 data model).
   * It is instead packed into `identifier[]` as
   * `{ type:'IdentityObject', hashed:false, identityType:'name', identityHash:<name> }`.
   */
  name?: string
  /** OBv3 IdentityObject entries (e.g. studentId via `sourcedId`, email, …). */
  identifiers?: ObV3IdentityObject[]
  /**
   * Free-form extras merged onto credentialSubject. These are NOT part of
   * the OBv3 AchievementSubject vocabulary; terms not defined in the OBv3
   * JSON-LD context will be dropped during URDNA2015 canonicalization and
   * therefore will not be covered by the proof. Use only for non-load-bearing
   * fields that the issuing surface really needs to round-trip.
   */
  extras?: Record<string, unknown>
}

export interface BuildOpenBadgeOptions {
  achievement: AchievementTemplate
  issuer: IssuerProfile
  recipient: RecipientData
  /** Verification-method id used to ensure key binding before signing. Defaults to `${issuer.id}#key-0`. */
  verificationMethod?: string
  /** Override the credential id. Defaults to `urn:uuid:<random>`. */
  credentialId?: string
  /** Override the validFrom timestamp. Defaults to now. */
  validFrom?: string
  /** Optional validUntil timestamp. */
  validUntil?: string
  /** Override the `name` claim. Defaults to `${recipient.name} - ${achievement.name}`. */
  credentialName?: string
}

interface BuiltOpenBadgeCredential {
  '@context': string[]
  id: string
  type: string[]
  credentialSchema?: Array<{ id: string; type: string }>
  issuer: Record<string, unknown>
  validFrom: string
  validUntil?: string
  name?: string
  credentialSubject: Record<string, unknown>
}

/**
 * Build an unsigned OBv3 AchievementCredential ready to be passed to
 * `agent.modules.openbadges.issueCredential(credentialWithProof)`.
 *
 * The shape mirrors the existing DIDComm route at
 * `backend/src/routes/openBadgesRoutes.ts` so issued credentials look
 * identical across transports.
 */
export function buildOpenBadgeCredential(opts: BuildOpenBadgeOptions): {
  credentialWithProof: BuiltOpenBadgeCredential & { proof: { verificationMethod: string } }
} {
  const {
    achievement,
    issuer,
    recipient,
    verificationMethod = `${issuer.id}#key-0`,
    credentialId = `urn:uuid:${crypto.randomUUID()}`,
    validFrom = new Date().toISOString(),
    validUntil,
    credentialName,
  } = opts

  const achievementId = achievement.id || `urn:uuid:${crypto.randomUUID()}`

  // Build OBv3 IdentityObject[] for credentialSubject.identifier. Recipient
  // name (when provided) goes here as an IdentityObject with identityType
  // 'name' — the OBv3 data model has no `name` property on AchievementSubject.
  const identifierList: ObV3IdentityObject[] = []
  if (recipient.name) {
    identifierList.push({
      type: 'IdentityObject',
      hashed: false,
      identityHash: recipient.name,
      identityType: 'name',
    })
  }
  if (recipient.identifiers && recipient.identifiers.length > 0) {
    identifierList.push(...recipient.identifiers)
  }

  // Per OBv3 §AchievementSubject: "Either `id` or at least one `identifier`
  // MUST be supplied." We satisfy this by either using the holder-bound `id`
  // when present, otherwise minting a urn:uuid placeholder.
  const recipientId = recipient.id || `urn:uuid:${crypto.randomUUID()}`

  const credentialSubject: Record<string, unknown> = {
    id: recipientId,
    type: ['AchievementSubject'],
    achievement: {
      id: achievementId,
      type: Array.isArray(achievement.type)
        ? achievement.type
        : achievement.type
          ? [achievement.type]
          : ['Achievement'],
      achievementType: achievement.achievementType || 'Badge',
      name: achievement.name,
      description: achievement.description || '',
      criteria:
        typeof achievement.criteria === 'string'
          ? { narrative: achievement.criteria }
          : achievement.criteria || { narrative: 'Criteria not specified' },
      ...(achievement.image && { image: normalizeImage(achievement.image) }),
      ...(achievement.tag && achievement.tag.length > 0 && { tag: achievement.tag }),
    },
    ...(identifierList.length > 0 && { identifier: identifierList }),
    ...(recipient.extras || {}),
  }

  const credentialWithoutProof: BuiltOpenBadgeCredential = {
    '@context': [VC_V2_CONTEXT, OBV3_CONTEXT, OBV3_EXTENSIONS_CONTEXT],
    id: credentialId,
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    credentialSchema: [
      {
        id: OBV3_ACHIEVEMENT_SCHEMA_URL,
        type: '1EdTechJsonSchemaValidator2019',
      },
    ],
    issuer: {
      id: issuer.id,
      type: ['Profile'],
      ...(issuer.name && { name: issuer.name }),
      ...(issuer.url && { url: issuer.url }),
      ...(issuer.description && { description: issuer.description }),
      ...(issuer.image && { image: normalizeImage(issuer.image) }),
    },
    validFrom,
    ...(validUntil && { validUntil }),
    ...(credentialName || (recipient.name && achievement.name)
      ? { name: credentialName || `${recipient.name} - ${achievement.name}` }
      : {}),
    credentialSubject,
  }

  return {
    credentialWithProof: {
      ...credentialWithoutProof,
      proof: { verificationMethod },
    },
  }
}

function normalizeImage(image: string | { id: string; type?: string }) {
  if (typeof image === 'string') return { id: image, type: 'Image' }
  return { type: 'Image', ...image }
}

/**
 * Issue an OpenBadge v3 credential via the agent's openbadges module.
 *
 * Returns the signed credential JSON (with DataIntegrityProof) ready to be
 * placed in the `credential` field of an OID4VCI credential response.
 */
export async function issueOpenBadgeCredential(
  agent: any,
  opts: BuildOpenBadgeOptions,
): Promise<{ credential: Record<string, unknown> }> {
  const openbadgesApi = (agent.modules as any).openbadges
  if (!openbadgesApi) {
    throw new Error(
      'OpenBadges module not configured on agent. Add OpenBadgesModule to agent modules.',
    )
  }

  const { credentialWithProof } = buildOpenBadgeCredential(opts)
  const record = await openbadgesApi.issueCredential(credentialWithProof)
  // `record.credential` is the fully signed credential with DataIntegrityProof.
  return { credential: record.credential }
}
