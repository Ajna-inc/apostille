/**
 * AnonCreds Credential Format Profile for OID4VCI 1.0 — issuer-side helpers.
 *
 * Implements the wire-level glue between OID4VCI's offer/token/credential
 * endpoints and Credo-ts' AnonCredsIssuerService. Used by oid4vciRoutes.ts
 * when an offer's `format` is `anoncreds`.
 *
 * Spec: docs/specs/anoncreds-oid4vci-profile.md
 */

import crypto from 'crypto'
import type {
  AnonCredsIssuerService,
  AnonCredsCredential,
  AnonCredsCredentialOffer,
  AnonCredsCredentialRequest,
  AnonCredsCredentialValues,
} from '@credo-ts/anoncreds'
import type { Agent } from '@credo-ts/core'

// Runtime symbols are looked up lazily so unit tests that exercise only the
// validation/encoding helpers don't need to load Credo's ESM bundle.
function loadIssuerServiceSymbol(): symbol {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@credo-ts/anoncreds')
  return mod.AnonCredsIssuerServiceSymbol as symbol
}

/**
 * Encode an attribute value per Aries RFC 0036/0037 — the same encoding used
 * inside Credo's anoncreds module. Implemented locally because Credo does
 * not export the helper publicly. Algorithm:
 *   - boolean/int32-numeric strings or numbers → decimal string of the value
 *   - everything else → BigInt(SHA-256(str)) as decimal string
 */
function isInt32(n: number): boolean {
  return Number.isInteger(n) && n >= -2147483648 && n <= 2147483647
}

function isNumericString(value: string): boolean {
  return /^-?\d+$/.test(value)
}

export function encodeCredentialValue(value: unknown): string {
  if (typeof value === 'boolean') return Number(value).toString()
  if (typeof value === 'number' && isInt32(value)) return value.toString()
  if (typeof value === 'string' && value !== '' && !Number.isNaN(Number(value)) && isNumericString(value) && isInt32(Number(value))) {
    return Number(value).toString()
  }
  let str: string
  if (value === null || value === undefined) {
    str = 'None'
  } else if (typeof value === 'number') {
    str = value.toString()
  } else {
    str = String(value)
  }
  const hash = crypto.createHash('sha256').update(str).digest()
  return BigInt('0x' + hash.toString('hex')).toString()
}

/**
 * Build the AnonCreds `values` map (raw + encoded pairs) expected by
 * AnonCredsIssuerService.createCredential.
 */
export function encodeAttributes(rawValues: Record<string, unknown>): AnonCredsCredentialValues {
  const out: AnonCredsCredentialValues = {}
  for (const [key, value] of Object.entries(rawValues ?? {})) {
    if (value !== null && typeof value === 'object') {
      throw new Error(`Attribute '${key}' has unsupported value type 'object'; AnonCreds attributes must be primitives`)
    }
    out[key] = {
      raw: value === null || value === undefined ? '' : String(value),
      encoded: encodeCredentialValue(value),
    }
  }
  return out
}

/**
 * AnonCreds nonce: ≥ 80 bits of entropy, encoded as a decimal string.
 * Matches the `c_nonce_format` rule in spec §5.2.
 */
export function generateAnonCredsNonce(): string {
  const bytes = crypto.randomBytes(10) // 80 bits
  return BigInt('0x' + bytes.toString('hex')).toString()
}

/**
 * Resolve the AnonCredsIssuerService from a tenant agent's dependency
 * container. Throws if the AnonCreds module is not registered.
 */
function getIssuerService(agent: Agent): AnonCredsIssuerService {
  return agent.dependencyManager.resolve<AnonCredsIssuerService>(loadIssuerServiceSymbol() as never)
}

/**
 * Create an AnonCreds credential offer for a given credential definition.
 * The returned object is persisted alongside the OID4VCI pending offer and
 * later combined with the holder's blinded request to produce the final
 * blind CL signature.
 */
export async function createAnonCredsOidcOffer(
  agent: Agent,
  credentialDefinitionId: string,
): Promise<AnonCredsCredentialOffer> {
  const issuerService = getIssuerService(agent)
  return issuerService.createCredentialOffer(agent.context, { credentialDefinitionId })
}

interface VerifyAndIssueParams {
  storedOffer: AnonCredsCredentialOffer
  credentialRequest: AnonCredsCredentialRequest
  attributeValues: Record<string, unknown>
  revocationRegistryDefinitionId?: string
  revocationRegistryIndex?: number
}

/**
 * Verify a holder's blinded credential request, then issue a blind CL
 * signature over the link secret + attribute values.
 *
 * Verification:
 *   - The request's `nonce` must equal the offer's nonce (replay defence).
 *   - The blinded link secret correctness proof is verified inside
 *     AnonCredsIssuerService.createCredential — invalid proofs throw.
 *
 * Returns the credential, which the caller forwards to the holder. The
 * holder unblinds client-side using the metadata it stored alongside the
 * request.
 */
export async function verifyAndIssueAnonCredsCredential(
  agent: Agent,
  params: VerifyAndIssueParams,
): Promise<{ credential: AnonCredsCredential }> {
  const { storedOffer, credentialRequest, attributeValues } = params

  if (!storedOffer || !storedOffer.nonce) {
    throw new Error('Missing stored credential offer for this OID4VCI session')
  }
  if (!credentialRequest || !credentialRequest.blinded_ms) {
    throw new Error('Credential request is missing blinded_ms')
  }
  if (!credentialRequest.blinded_ms_correctness_proof) {
    throw new Error('Credential request is missing blinded_ms_correctness_proof')
  }
  if (credentialRequest.cred_def_id !== storedOffer.cred_def_id) {
    throw new Error('cred_def_id in credential request does not match offer')
  }
  if (credentialRequest.nonce !== storedOffer.nonce) {
    throw new Error('Credential request nonce does not match offer nonce')
  }

  const credentialValues = encodeAttributes(attributeValues)

  const issuerService = getIssuerService(agent)
  const result = await issuerService.createCredential(agent.context, {
    credentialOffer: storedOffer,
    credentialRequest,
    credentialValues,
    revocationRegistryDefinitionId: params.revocationRegistryDefinitionId,
    revocationRegistryIndex: params.revocationRegistryIndex,
  })

  return { credential: result.credential }
}
