/**
 * Public wallet-backup OOB endpoints.
 *
 * Two QRs, one connection model:
 *
 *   GET /api/vaults/restore-qr   goal_code: vault.restore   — for users who
 *                                lost their wallet and are recovering.
 *
 *   GET /api/vaults/backup-qr    goal_code: vault.backup    — for users
 *                                pairing a wallet with this server for the
 *                                first time so they can create backups.
 *
 * Both endpoints emit a permanent multi-use OOB DIDComm invitation. The
 * underlying connection is the same — the goal code only tells the wallet
 * which UX flow to route the user into. Once paired, the connection
 * carries Store / Retrieve messages either direction forever.
 *
 * Public (no auth): a user restoring has lost their wallet and has no JWT;
 * a user setting up a backup for the first time may not be logged into the
 * web UI either.
 */
import { Router, Request, Response } from 'express';
import { createTenant, getAgent } from '../services/agentService';

const router = Router();

// Must match the wallet-side constants exactly
const VAULT_RESTORE_GOAL_CODE = 'vault.restore';
const VAULT_BACKUP_GOAL_CODE = 'vault.backup';

type VaultGoalCode = typeof VAULT_RESTORE_GOAL_CODE | typeof VAULT_BACKUP_GOAL_CODE;

const baseLabel = (): string => {
  const explicit = process.env.VAULT_RESTORE_LABEL;
  if (explicit) return explicit;
  const service = process.env.SERVICE_NAME ?? 'ESSI Studio';
  const domain = (() => {
    try {
      return new URL(process.env.PUBLIC_DOMAIN ?? 'https://localhost').host;
    } catch {
      return '';
    }
  })();
  return domain ? `${service} Backup · ${domain}` : `${service} Backup`;
};

// Resolved once per process. Vault OOBs must be minted by a *tenant* agent,
// not by the root, because the root's MessageReceiver routes inbound
// envelopes by recipient-key lookup against the tenant registry. Keys
// owned by the root agent itself aren't registered there, so messages
// encrypted to a root-minted OOB key stall at the inbound transport and
// the wallet times out with "Aborted" / "undeliverable".
let cachedVaultTenantId: string | null = null;

async function getVaultTenantId(): Promise<string> {
  if (cachedVaultTenantId) return cachedVaultTenantId;

  // Prefer an explicit env binding so admins can route vault traffic to a
  // dedicated tenant they've already provisioned. Fall back to
  // PLATFORM_TENANT_ID (which the demo flow also uses) before creating a
  // brand-new tenant — creating one on every cold start would leak
  // tenants on every redeploy.
  const configured = process.env.VAULT_TENANT_ID ?? process.env.PLATFORM_TENANT_ID;
  if (configured) {
    try {
      await getAgent({ tenantId: configured });
      cachedVaultTenantId = configured;
      return cachedVaultTenantId;
    } catch (err) {
      console.warn(
        `[vaultRestore] Configured vault tenant '${configured}' is not openable; ` +
          `falling back to a freshly-created tenant. Err: ${(err as Error).message}`
      );
    }
  }

  const tenant = await createTenant({ label: 'ESSI Vault Backups' });
  cachedVaultTenantId = tenant.id;
  console.log(
    `[vaultRestore] Provisioned dedicated vault tenant ${tenant.id}. ` +
      `Set VAULT_TENANT_ID=${tenant.id} in the environment to make this stable across restarts.`
  );
  return tenant.id;
}

/**
 * Shared OOB-invitation builder. Both /restore-qr and /backup-qr share
 * everything except the goal code and the label suffix.
 */
async function createBackupServerInvitation(
  goalCode: VaultGoalCode,
  suffix: 'restore' | 'setup'
): Promise<{ url: string; label: string; goalCode: VaultGoalCode }> {
  const tenantId = await getVaultTenantId();
  const agent = await getAgent({ tenantId });
  const label = `${baseLabel()} · ${suffix}`;

  const { outOfBandInvitation } = await agent.didcomm.oob.createInvitation({
    label,
    goalCode,
    multiUseInvitation: true,
  });

  // Use the `didcomm://invite` outer URL form so the wallet's deep-link
  // intent filter routes the URL into the app instead of opening a
  // browser. The OOB invitation's `serviceEndpoint` (inside the base64
  // payload) still points at our real agent host — the outer URL is
  // just a transport wrapper for the QR / deep-link layer.
  const url = outOfBandInvitation.toUrl({ domain: 'didcomm://invite' });

  return { url, label, goalCode };
}

/**
 * GET /api/vaults/restore-qr — for users restoring an existing wallet.
 */
router.get('/restore-qr', async (_req: Request, res: Response) => {
  try {
    const data = await createBackupServerInvitation(VAULT_RESTORE_GOAL_CODE, 'restore');
    res.json(data);
  } catch (error: any) {
    console.error('[vaultRestore] Failed to create restore QR:', error);
    res.status(500).json({
      error: 'failed_to_create_restore_qr',
      message: error?.message ?? String(error),
    });
  }
});

/**
 * GET /api/vaults/backup-qr — for users pairing a wallet with this server
 * so they can start creating backups. After scanning, the wallet auto-
 * accepts the connection and routes to its Back-Up flow.
 */
router.get('/backup-qr', async (_req: Request, res: Response) => {
  try {
    const data = await createBackupServerInvitation(VAULT_BACKUP_GOAL_CODE, 'setup');
    res.json(data);
  } catch (error: any) {
    console.error('[vaultRestore] Failed to create backup QR:', error);
    res.status(500).json({
      error: 'failed_to_create_backup_qr',
      message: error?.message ?? String(error),
    });
  }
});

export default router;