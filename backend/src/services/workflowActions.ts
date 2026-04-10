// import { ConnectionService, CredentialsApi } from '@credo-ts/core'
// import { AttributePlanner } from '@ajna-inc/workflow/build/engine/AttributePlanner'
// import { WorkflowService } from '@ajna-inc/workflow/build'

// type WorkflowActionContext = {
//   agentContext: any
//   instance: any
//   action: any
//   template: any
//   input?: any
// }

// const OFFER_TYPE_URI = 'https://didcomm.org/issue-credential/2.0/offer-credential'
// const REQUEST_TYPE_URI = 'https://didcomm.org/issue-credential/2.0/request-credential'
// const ISSUE_TYPE_URI = 'https://didcomm.org/issue-credential/2.0/issue-credential'

// const getRecordCredDefId = (record: any): string | undefined => {
//   return (
//     record?.credentialDefinitionId ||
//     record?.metadata?.data?.credentialDefinitionId ||
//     record?.metadata?.data?.credential_definition_id
//   )
// }

// const getProfileForAction = (ctx: WorkflowActionContext): any | undefined => {
//   const ref = ctx.action?.profile_ref
//   if (!ref?.startsWith('cp.')) return undefined
//   const key = ref.slice(3)
//   return ctx.template?.catalog?.credential_profiles?.[key]
// }

// const enforceToRefDid = async (ctx: WorkflowActionContext, toRef?: string) => {
//   const expectedDid = toRef ? ctx.instance?.participants?.[toRef]?.did : undefined
//   if (!expectedDid || !ctx.instance?.connection_id) return
//   const connSvc = ctx.agentContext.dependencyManager.resolve(ConnectionService)
//   const conn = await connSvc.getById(ctx.agentContext, ctx.instance.connection_id)
//   const theirDid = conn?.theirDid
//   if (theirDid && theirDid !== expectedDid) {
//     throw Object.assign(new Error('to_ref DID mismatch'), { code: 'forbidden' })
//   }
// }

// const pickMostRecent = (records: any[]) => {
//   return records.sort((a, b) => {
//     const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
//     const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
//     return dateB - dateA
//   })[0]
// }

// export class OfferCredentialV2ActionOverride {
//   public readonly typeUri = OFFER_TYPE_URI

//   async execute(ctx: WorkflowActionContext) {
//     const profile = getProfileForAction(ctx)
//     if (!profile) throw Object.assign(new Error('missing catalog profile'), { code: 'action_error' })

//     const attrs = AttributePlanner.materialize(profile.attribute_plan || {}, ctx.instance)
//     const attributes = Object.entries(attrs).map(([name, value]) => ({ name, value: String(value) }))

//     const connectionId = ctx.instance?.connection_id
//     if (!connectionId) throw Object.assign(new Error('connectionId required'), { code: 'action_error' })

//     await enforceToRefDid(ctx, profile.to_ref)

//     try {
//       const credsApi = ctx.agentContext.dependencyManager.resolve(CredentialsApi)
//       const record = await credsApi.offerCredential({
//         connectionId,
//         protocolVersion: 'v2',
//         credentialFormats: { anoncreds: { credentialDefinitionId: profile.cred_def_id, attributes } },
//         comment: profile.options?.comment,
//       })

//       let messageId = record?.id || record?.credentialRecord?.id
//       try {
//         if (messageId) {
//           const found = await credsApi.findOfferMessage(messageId)
//           if (found && typeof found === 'object') {
//             const f = found as any
//             messageId = f.message?.id || f.id || messageId
//           }
//         }
//       } catch {
//         // no-op
//       }

//       const recordId = record?.id || record?.credentialRecord?.id
//       return {
//         artifacts: {
//           credentialRecordId: recordId,
//           issueRecordId: recordId,
//         },
//         messageId,
//       }
//     } catch (e: any) {
//       throw Object.assign(new Error(`issue action error: ${e.message}`), { code: 'action_error' })
//     }
//   }
// }

// export class RequestCredentialV2ActionOverride {
//   public readonly typeUri = REQUEST_TYPE_URI

//   async execute(ctx: WorkflowActionContext) {
//     const connectionId = ctx.instance?.connection_id
//     if (!connectionId) throw Object.assign(new Error('connectionId required'), { code: 'action_error' })

//     try {
//       const credsApi = ctx.agentContext.dependencyManager.resolve(CredentialsApi)

//       let credentialRecordId = ctx.instance?.artifacts?.credentialRecordId
//       if (!credentialRecordId) {
//         const all = await credsApi.getAll()
//         const base = all.filter((r: any) => r.connectionId === connectionId && r.state === 'offer-received')

//         const profile = getProfileForAction(ctx)
//         const credDefId = profile?.cred_def_id
//         const filtered = credDefId
//           ? base.filter((r: any) => getRecordCredDefId(r) === credDefId)
//           : base

//         const chosen = pickMostRecent(filtered.length ? filtered : base)
//         if (!chosen) {
//           throw Object.assign(new Error('no offer found to accept'), { code: 'action_error' })
//         }
//         credentialRecordId = chosen.id
//       }

//       const record = await credsApi.acceptOffer({ credentialRecordId })

//       let messageId = record?.id
//       try {
//         if (messageId) {
//           const found = await credsApi.findRequestMessage(messageId)
//           if (found && typeof found === 'object') {
//             const f = found as any
//             messageId = f.message?.id || f.id || messageId
//           }
//         }
//       } catch {
//         // no-op
//       }

//       return {
//         artifacts: { credentialRecordId: record?.id || credentialRecordId },
//         messageId,
//       }
//     } catch (e: any) {
//       throw Object.assign(new Error(`request action error: ${e.message}`), { code: 'action_error' })
//     }
//   }
// }

// export class IssueCredentialMessageV2ActionOverride {
//   public readonly typeUri = ISSUE_TYPE_URI

//   async execute(ctx: WorkflowActionContext) {
//     const connectionId = ctx.instance?.connection_id
//     if (!connectionId) throw Object.assign(new Error('connectionId required'), { code: 'action_error' })

//     try {
//       const credsApi = ctx.agentContext.dependencyManager.resolve(CredentialsApi)

//       let credentialRecordId =
//         ctx.instance?.artifacts?.credentialRecordId || ctx.instance?.artifacts?.issueRecordId

//       if (!credentialRecordId) {
//         const all = await credsApi.getAll()
//         const base = all.filter((r: any) => r.connectionId === connectionId && r.state === 'request-received')

//         const profile = getProfileForAction(ctx)
//         const credDefId = profile?.cred_def_id
//         const filtered = credDefId
//           ? base.filter((r: any) => getRecordCredDefId(r) === credDefId)
//           : base

//         const chosen = pickMostRecent(filtered.length ? filtered : base)
//         if (!chosen) {
//           throw Object.assign(new Error('no request found to issue'), { code: 'action_error' })
//         }
//         credentialRecordId = chosen.id
//       }

//       const record = await credsApi.acceptRequest({ credentialRecordId })

//       let messageId = record?.id
//       try {
//         if (messageId) {
//           const found = await credsApi.findCredentialMessage(messageId)
//           if (found && typeof found === 'object') {
//             const f = found as any
//             messageId = f.message?.id || f.id || messageId
//           }
//         }
//       } catch {
//         // no-op
//       }

//       return {
//         artifacts: { issuedCredentialRecordId: record?.id },
//         messageId,
//       }
//     } catch (e: any) {
//       throw Object.assign(new Error(`issue action error: ${e.message}`), { code: 'action_error' })
//     }
//   }
// }

// export const registerWorkflowActionOverrides = (agent: any) => {
//   if (!agent || (agent as any).__workflowActionsPatched) return
//   const service = agent.dependencyManager.resolve(WorkflowService)
//   service.registerActions([
//     new OfferCredentialV2ActionOverride(),
//     new RequestCredentialV2ActionOverride(),
//     new IssueCredentialMessageV2ActionOverride(),
//   ])
//   ;(agent as any).__workflowActionsPatched = true
// }
