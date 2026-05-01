/**
 * AnonCreds OID4VCI holder-side helpers. Used by:
 *   - integration tests, to drive the full issuance loop
 *   - the future studio reference holder (Phase 9)
 *
 * Responsibilities:
 *   - Wrap Credo's AnonCredsHolderService to produce a blinded credential
 *     request from an offer.
 *   - Shape the request into the OID4VCI wire form defined in spec §6.
 *   - Process the issuer's response, unblind the credential, and store it
 *     in the holder's wallet.
 */

import {
  AnonCredsHolderService,
  AnonCredsHolderServiceSymbol,
  AnonCredsCredential,
  AnonCredsCredentialDefinition,
  AnonCredsCredentialOffer,
  AnonCredsCredentialRequest,
  AnonCredsRevocationRegistryDefinition,
  AnonCredsSchema,
} from '@credo-ts/anoncreds'
import { Agent } from '@credo-ts/core'

// Credo's AnonCredsCredentialRequestMetadata interface is not part of the
// public package surface, but the shape is stable. Mirror it here so we can
// pass the value through createCredentialRequest → storeCredential without
// `any`. The link_secret_blinding_data field is opaque crypto state.
interface AnonCredsCredentialRequestMetadata {
  link_secret_blinding_data: unknown
  link_secret_name: string
  nonce: string
}

function getHolderService(agent: Agent): AnonCredsHolderService {
  return agent.dependencyManager.resolve<AnonCredsHolderService>(AnonCredsHolderServiceSymbol)
}

/**
 * Ensure the holder has a link secret. Returns its id; creates the default
 * one if none exists. Idempotent.
 */
export async function ensureLinkSecret(agent: Agent): Promise<string> {
  const ids = await agent.modules.anoncreds.getLinkSecretIds()
  if (ids.length > 0) return ids[0]
  return agent.modules.anoncreds.createLinkSecret()
}

interface BuildRequestParams {
  credentialOffer: AnonCredsCredentialOffer
  credentialDefinition: AnonCredsCredentialDefinition
  credentialDefinitionId: string
  credentialConfigurationId: string
  linkSecretId?: string
}

interface BuildRequestResult {
  /** Body to POST to the OID4VCI credential endpoint, per spec §6.1. */
  wireBody: {
    format: 'anoncreds'
    credential_identifier: string
    proof: {
      proof_type: 'anoncreds'
      anoncreds: AnonCredsCredentialRequest
    }
  }
  /** Local holder state — keep until the issuer's response arrives. */
  credentialRequest: AnonCredsCredentialRequest
  credentialRequestMetadata: AnonCredsCredentialRequestMetadata
}

/**
 * Build a blinded AnonCreds credential request and shape it into the
 * OID4VCI wire body. Caller must persist `credentialRequestMetadata` until
 * the credential response arrives so the credential can be unblinded.
 */
export async function buildAnonCredsCredentialRequest(
  agent: Agent,
  params: BuildRequestParams,
): Promise<BuildRequestResult> {
  const linkSecretId = params.linkSecretId ?? (await ensureLinkSecret(agent))
  const holderService = getHolderService(agent)

  const { credentialRequest, credentialRequestMetadata } = await holderService.createCredentialRequest(
    agent.context,
    {
      credentialOffer: params.credentialOffer,
      credentialDefinition: params.credentialDefinition,
      linkSecretId,
    },
  )

  return {
    wireBody: {
      format: 'anoncreds',
      credential_identifier: params.credentialConfigurationId,
      proof: {
        proof_type: 'anoncreds',
        anoncreds: credentialRequest,
      },
    },
    credentialRequest,
    credentialRequestMetadata,
  }
}

interface ProcessResponseParams {
  credential: AnonCredsCredential
  credentialRequestMetadata: AnonCredsCredentialRequestMetadata
  credentialDefinition: AnonCredsCredentialDefinition
  credentialDefinitionId: string
  schema: AnonCredsSchema
  revocationRegistry?: {
    id: string
    definition: AnonCredsRevocationRegistryDefinition
  }
  credentialId?: string
}

/**
 * Unblind and store the credential. Returns the wallet credential id.
 */
export async function processAnonCredsCredentialResponse(
  agent: Agent,
  params: ProcessResponseParams,
): Promise<{ credentialId: string }> {
  const holderService = getHolderService(agent)
  const credentialId = await holderService.storeCredential(agent.context, {
    credential: params.credential,
    // Credo's internal metadata type is not publicly exported; cast at this
    // boundary — the value is opaque cryptographic state and is round-tripped
    // verbatim from createCredentialRequest.
    credentialRequestMetadata: params.credentialRequestMetadata as never,
    credentialDefinition: params.credentialDefinition,
    credentialDefinitionId: params.credentialDefinitionId,
    schema: params.schema,
    revocationRegistry: params.revocationRegistry,
    credentialId: params.credentialId,
  })
  return { credentialId }
}
