import { DidCommCredentialsApi } from '@credo-ts/didcomm'
import { WorkflowService, WorkflowInstanceRepository } from '@ajna-inc/workflow'

/**
 * Replaces WorkflowService.autoAdvanceByConnection entirely.
 *
 * Problems solved:
 *
 * 1. Wrong instance selected: the library calls findLatestByConnection which sorts by updatedAt
 *    and returns the most recently touched record. When multiple workflow cycles exist for the
 *    same connection (e.g. a user starts several "kanon-auto-issue" workflows), a completed
 *    instance often has a newer updatedAt than the current active one. The library advances
 *    the wrong instance, logs a silent warning, and the real active instance stays stuck.
 *    Fix: findByConnection + filter to non-terminal, advance every active instance.
 *
 * 2. Empty sender context on proposal_received: the kanon template reads credential attributes
 *    from source:"context", but in CRMS-to-CRMS the sender never runs set_context — the holder
 *    provides attributes via a DIDComm credential proposal. We extract those and inject them
 *    into the instance context before advancing.
 */
export function registerWorkflowActionOverrides(agent: any): void {
  try {
    const service: any = agent.dependencyManager.resolve(WorkflowService)
    const instanceRepo: any = agent.dependencyManager.resolve(WorkflowInstanceRepository)

    service.autoAdvanceByConnection = async (agentContext: any, connectionId: string, event: string) => {
      try {
        // Find every workflow instance for this connection, keep only active (non-terminal) ones.
        const allInstances: any[] = await instanceRepo.findByConnection(agentContext, connectionId)
        const TERMINAL = new Set(['completed', 'canceled', 'cancelled'])
        const activeInstances = allInstances.filter((inst: any) => !TERMINAL.has(inst.status))

        console.log(`[WorkflowActionOverrides] event=${event} connection=${connectionId} found=${allInstances.length} active=${activeInstances.length} states=${activeInstances.map((i: any) => `${i.instanceId.slice(-6)}@${i.state}(${i.status})`).join(', ')}`)

        if (activeInstances.length === 0) {
          console.warn(`[WorkflowActionOverrides] No active workflow instance for connection ${connectionId}, event=${event}`)
          return
        }

        // For proposal_received: inject proposed credential attributes into context first.
        if (event === 'proposal_received') {
          let proposedAttrs: Record<string, string> = {}
          try {
            const credsApi: any = agentContext.dependencyManager.resolve(DidCommCredentialsApi)
            const allCreds: any[] = await credsApi.getAll()
            const proposals = allCreds
              .filter((r: any) => r.connectionId === connectionId && r.state === 'proposal-received')
              .sort((a: any, b: any) => {
                const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
                const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
                return tB - tA
              })

            if (proposals.length > 0) {
              const formatData: any = await credsApi.getFormatData(proposals[0].id)
              for (const attr of (formatData?.proposalAttributes || [])) {
                proposedAttrs[attr.name] = String(attr.value)
              }
            }
          } catch (e: any) {
            console.warn('[WorkflowActionOverrides] Failed to read proposal attributes:', e?.message)
          }

          for (const inst of activeInstances) {
            const missing: Record<string, string> = {}
            for (const [k, v] of Object.entries(proposedAttrs)) {
              if (!(k in (inst.context || {}))) missing[k] = v
            }
            if (Object.keys(missing).length > 0) {
              inst.context = { ...inst.context, ...missing }
              await instanceRepo.update(agentContext, inst)
              console.log(`[WorkflowActionOverrides] Injected proposal attrs into instance ${inst.instanceId}:`, missing)
            }
          }
        }

        // Advance every active instance with this event. Instances that have no transition for
        // the event in their current state will throw, which we swallow — that's expected when
        // multiple active instances are at different states.
        for (const inst of activeInstances) {
          try {
            await service.advance(agentContext, {
              instance_id: inst.instanceId,
              event,
              idempotency_key: `auto:${event}:${inst.instanceId}`,
            })
            console.log(`[WorkflowActionOverrides] Advanced instance ${inst.instanceId} with event=${event}`)
          } catch (e: any) {
            // Not every active instance will have a transition for this event — that's normal.
            console.warn(`[WorkflowActionOverrides] Instance ${inst.instanceId} did not advance on event=${event}: ${e?.message}`)
          }
        }
      } catch (e: any) {
        console.warn(`[WorkflowActionOverrides] Handler error for event=${event}, connection=${connectionId}: ${e?.message}`)
      }
    }

    console.log('[WorkflowActionOverrides] Patched autoAdvanceByConnection (all events)')
  } catch (e: any) {
    console.warn('[WorkflowActionOverrides] Failed to patch WorkflowService:', e?.message)
  }
}
