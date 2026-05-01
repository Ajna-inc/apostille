/**
 * AnonCreds OID4VCI end-to-end interop harness.
 *
 * Spins up an in-process Credo holder agent (Askar + AnonCreds + Node
 * transport), then drives the full issuance flow against a live ESSI Studio
 * issuer at TEST_API_URL.
 *
 * This is the canonical proof of correctness for the wire protocol defined
 * in docs/specs/anoncreds-oid4vci-profile.md. Wallet vendors implementing
 * the profile can mirror this script's HTTP shape exactly.
 *
 * Usage:
 *   1. Run the studio backend (npm run dev) and frontend.
 *   2. Through the studio:
 *        - Register a tenant.
 *        - Create an AnonCreds schema + cred-def.
 *        - Create an OID4VCI offer of format=anoncreds (note the offer URI).
 *   3. Run:
 *        TEST_OFFER_URI='openid-credential-offer://?credential_offer=...' \
 *        npx ts-node scripts/anoncreds-oid4vci-e2e.ts
 */

import { Agent, ConsoleLogger, LogLevel, utils as credoUtils, InitConfig } from '@credo-ts/core'
import { AskarModule } from '@credo-ts/askar'
import { registerAskar } from '@openwallet-foundation/askar-shared'
import { askar } from '@openwallet-foundation/askar-nodejs'
import { AnonCredsModule, AnonCredsHolderServiceSymbol } from '@credo-ts/anoncreds'
import { agentDependencies } from '@credo-ts/node'
import { anoncreds } from '@hyperledger/anoncreds-nodejs'
import { KanonAnonCredsRegistry } from '../src/plugins/kanon/anoncreds/services/KanonAnonCredsRegistry'

const OFFER_URI = process.env.TEST_OFFER_URI

if (!OFFER_URI) {
  console.error('Set TEST_OFFER_URI to an openid-credential-offer:// URI created via the studio.')
  process.exit(1)
}

function decodeOffer(uri: string): any {
  const idx = uri.indexOf('credential_offer=')
  if (idx === -1) throw new Error('offer URI missing credential_offer parameter')
  const encoded = uri.slice(idx + 'credential_offer='.length).split('&')[0]
  return JSON.parse(decodeURIComponent(encoded))
}

async function postJson(url: string, body: unknown, bearer?: string): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`POST ${url} → ${res.status}: ${JSON.stringify(json)}`)
  }
  return json
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.json()
}

async function buildHolderAgent(): Promise<Agent> {
  registerAskar({ askar })

  const walletId = `anoncreds-oid4vci-e2e-${credoUtils.uuid()}`
  const walletKey = walletId

  const config: InitConfig = {
    logger: new ConsoleLogger(LogLevel.warn),
  }

  const agent = new Agent({
    config,
    dependencies: agentDependencies,
    modules: {
      askar: new AskarModule({
        askar,
        store: { id: walletId, key: walletKey },
      }),
      anoncreds: new AnonCredsModule({
        registries: [new KanonAnonCredsRegistry()],
        anoncreds,
      }),
    },
  })
  await agent.initialize()
  return agent
}

async function ensureLinkSecret(agent: Agent): Promise<string> {
  const ids = await agent.modules.anoncreds.getLinkSecretIds()
  if (ids.length > 0) return ids[0]
  return agent.modules.anoncreds.createLinkSecret({ setAsDefault: true })
}

async function main() {
  const offer = decodeOffer(OFFER_URI!)
  console.log('▶ E2E harness; issuer:', offer.credential_issuer)

  const issuerUrl: string = offer.credential_issuer
  const configurationId: string = offer.credential_configuration_ids[0]
  const preAuthCode: string = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

  // 1. Discover issuer metadata.
  const metadata = await getJson(`${issuerUrl}/.well-known/openid-credential-issuer`)
  const config = metadata.credential_configurations_supported?.[configurationId]
  if (!config) throw new Error(`config ${configurationId} not found in issuer metadata`)
  if (config.format !== 'anoncreds') throw new Error(`config format is ${config.format}, expected 'anoncreds'`)
  console.log('✓ metadata advertises proof_type.anoncreds')

  // 2. Token exchange.
  const token = await postJson(`${issuerUrl}/token`, {
    grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
    'pre-authorized_code': preAuthCode,
  })
  if (!token.anoncreds_offer) throw new Error('token response missing anoncreds_offer')
  if (token.anoncreds_offer.nonce !== token.c_nonce) throw new Error('anoncreds_offer.nonce must equal c_nonce')
  if (!/^\d+$/.test(token.c_nonce)) throw new Error('c_nonce must be a decimal string for anoncreds')
  console.log('✓ token: c_nonce', token.c_nonce, '(decimal); anoncreds_offer present')

  // 3. Build a holder agent and a blinded credential request.
  const agent = await buildHolderAgent()
  try {
    const linkSecretId = await ensureLinkSecret(agent)
    const credDefId: string = config.anoncreds.credential_definition.id
    const schemaId: string = config.anoncreds.schema.id

    const { credentialDefinition } = await agent.modules.anoncreds.getCredentialDefinition(credDefId)
    if (!credentialDefinition) throw new Error('failed to resolve credential definition')

    const { schema } = await agent.modules.anoncreds.getSchema(schemaId)
    if (!schema) throw new Error('failed to resolve schema')

    const holderService = agent.dependencyManager.resolve<any>(AnonCredsHolderServiceSymbol)
    const { credentialRequest, credentialRequestMetadata } =
      await holderService.createCredentialRequest(agent.context, {
        credentialOffer: token.anoncreds_offer,
        credentialDefinition,
        linkSecretId,
      })
    console.log('✓ built blinded credential request (cred_def_id', credentialRequest.cred_def_id + ')')

    // 4. POST to the credential endpoint with the spec §6 wire body.
    const credRes = await postJson(
      `${issuerUrl}/credential`,
      {
        format: 'anoncreds',
        credential_identifier: configurationId,
        proof: { proof_type: 'anoncreds', anoncreds: credentialRequest },
      },
      token.access_token,
    )
    if (credRes.format !== 'anoncreds') throw new Error(`expected format=anoncreds, got ${credRes.format}`)
    console.log('✓ issuer returned blind CL signature')

    // 5. Unblind and store.
    const credentialId = await holderService.storeCredential(agent.context, {
      credential: credRes.credential,
      credentialRequestMetadata,
      credentialDefinition,
      credentialDefinitionId: credDefId,
      schema,
    })
    console.log('✓ unblinded + stored credential id=' + credentialId)

    // 6. Sanity-check the stored credential.
    const stored = await agent.modules.anoncreds.getCredential(credentialId)
    const attrNames = Object.keys((stored as any).attributes ?? (stored as any).credentialValues ?? {})
    console.log('✓ wallet has credential, attrs:', attrNames)
    console.log('\n✅ AnonCreds OID4VCI end-to-end PASS')
  } finally {
    try {
      await agent.shutdown()
    } catch {
      /* ignore */
    }
  }
}

main().catch((err) => {
  console.error('\n❌ E2E harness failed:', err.message)
  if (err.stack) console.error(err.stack)
  process.exit(1)
})
