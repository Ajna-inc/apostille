import { Router, Request, Response } from 'express'
import { auth } from '../middleware/authMiddleware'
import { registerWorkflowRoutes } from '@ajna-inc/workflow-backend-express'
import { getAgent } from '../services/agentService'
import { PublishTemplateMessage, WorkflowTemplateRepository, WorkflowInstanceRepository } from '@ajna-inc/workflow'
import { DidCommConnectionService, DidCommMessageSender, DidCommOutboundMessageContext } from '@credo-ts/didcomm'

const router = Router()

// Apply auth once and register standardized workflow routes
router.use(auth)

// Override the package's POST /templates (publish) to also push the updated template
// to all connected receivers via DIDComm so their cached copy is always fresh.
// Receiver's PublishTemplateHandler calls publishTemplate (upsert) — no deletion, no gap.
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const template = req.body?.template
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing' })
    if (!template || typeof template !== 'object') return res.status(400).json({ success: false, message: 'Template payload is required' })
    const agent = await getAgent({ tenantId })
    const rec = await (agent.modules.workflow as any).publishTemplate(template)
    // Fire-and-forget: push to all connections with instances of this template
    ;(async () => {
      try {
        const instanceRepo = agent.dependencyManager.resolve(WorkflowInstanceRepository)
        const instances = await instanceRepo.findByTemplateAndConnection(agent.context, template.template_id, undefined)
        const connectionIds = [...new Set(instances.map((i: any) => i.connectionId).filter(Boolean))] as string[]
        if (!connectionIds.length) return
        const connSvc = agent.dependencyManager.resolve(DidCommConnectionService)
        const messageSender = agent.dependencyManager.resolve(DidCommMessageSender)
        for (const connId of connectionIds) {
          try {
            const connection = await connSvc.getById(agent.context, connId)
            const msg = new PublishTemplateMessage({ body: { template: rec.template } })
            const outbound = new DidCommOutboundMessageContext(msg, { agentContext: agent.context, connection })
            await messageSender.sendMessage(outbound)
          } catch (e) { console.warn(`[workflow] auto-push skipped for ${connId}:`, (e as Error).message) }
        }
      } catch (e) { console.warn('[workflow] auto-push failed:', (e as Error).message) }
    })()
    return res.status(200).json({
      success: true,
      template: { id: rec.id, template_id: rec.template.template_id, version: rec.template.version, hash: rec.hash },
    })
  } catch (error) {
    const code = (error as any).code
    console.error('[workflow] POST /templates failed:', (error as Error).message)
    return res.status(code === 'invalid_template' ? 400 : 500).json({ success: false, message: (error as Error).message || 'Failed to publish template', code })
  }
})

// Force-refresh a template by deleting local cache and re-fetching from peer.
// Called on the RECEIVER side so they can pull the latest from the sender.
// FetchTemplateMessage goes receiver→sender (sender is always reachable).
router.post('/templates/force-refresh', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { template_id, version, connection_id } = req.body || {}
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing' })
    if (!template_id || !connection_id) return res.status(400).json({ success: false, message: 'template_id and connection_id are required' })

    const agent = await getAgent({ tenantId })
    const repo = agent.dependencyManager.resolve(WorkflowTemplateRepository)

    // Delete stale cached copy so ensureTemplate is forced to re-fetch
    try {
      const existing = await repo.findByTemplateIdAndVersion(agent.context, template_id, version)
      if (existing) await (repo as any).delete(agent.context, existing)
    } catch (e) { console.warn('[workflow] force-refresh delete failed:', (e as Error).message) }

    // Re-fetch from peer (FetchTemplateMessage: receiver→sender, sender IS reachable)
    const rec = await agent.modules.workflow.ensureTemplate({ connection_id, template_id, template_version: version, waitMs: 5000 })
    if (!rec) return res.status(404).json({ success: false, message: 'Template not found on peer' })
    return res.status(200).json({ success: true, message: 'Template refreshed from peer' })
  } catch (error) {
    console.error('[workflow] POST /templates/force-refresh failed:', (error as Error).message)
    return res.status(500).json({ success: false, message: (error as Error).message || 'Failed to refresh template' })
  }
})

// Push a published template to a peer via DIDComm so their cached copy updates.
// Must be registered BEFORE registerWorkflowRoutes to avoid the :templateId param catching it.
router.post('/templates/push', async (req: Request, res: Response) => {
  try {
    const tenantId = req.user?.tenantId
    const { template_id, version, connection_id } = req.body || {}
    if (!tenantId) return res.status(400).json({ success: false, message: 'Tenant ID missing from request context' })
    if (!template_id || !connection_id) return res.status(400).json({ success: false, message: 'template_id and connection_id are required' })

    const agent = await getAgent({ tenantId })
    const repo = agent.dependencyManager.resolve(WorkflowTemplateRepository)
    const rec = await repo.findByTemplateIdAndVersion(agent.context, template_id, version)
    if (!rec) return res.status(404).json({ success: false, message: 'Template not found locally — publish it first' })

    const connSvc = agent.dependencyManager.resolve(DidCommConnectionService)
    const messageSender = agent.dependencyManager.resolve(DidCommMessageSender)
    const connection = await connSvc.getById(agent.context, connection_id)

    const msg = new PublishTemplateMessage({ body: { template: rec.template } })
    const outbound = new DidCommOutboundMessageContext(msg, { agentContext: agent.context, connection })
    await messageSender.sendMessage(outbound)

    return res.status(200).json({ success: true, message: 'Template pushed to connection' })
  } catch (error) {
    console.error('[workflow] POST /templates/push failed:', (error as Error).message)
    return res.status(500).json({ success: false, message: (error as Error).message || 'Failed to push template' })
  }
})

registerWorkflowRoutes(router, async ({ tenantId }) => getAgent({ tenantId }))

export default router
