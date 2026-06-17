/**
 * Wallet backup pairing landing page.
 *
 * Public — no login required. A user with a working wallet who wants to
 * START backing up their credentials visits this page, scans the QR with
 * the wallet app, and the wallet auto-accepts the connection and routes
 * to its Back-up flow (seed reveal → verify → upload).
 *
 * Counterpart to /vaults/restore: same OOB shape, different goal code
 * (`vault.backup` vs `vault.restore`). One server, two intents.
 */
'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import runtimeConfig from '../../../lib/runtimeConfig';

interface BackupQrResponse {
  url: string;
  label: string;
  goalCode: string;
}

export default function VaultBackupPage() {
  const [data, setData] = useState<BackupQrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${runtimeConfig.API_URL}/api/vaults/backup-qr`, {
          method: 'GET',
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as BackupQrResponse;
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        background: '#f7f7f8',
      }}
      data-testid="vault-backup-page"
    >
      <section
        style={{
          maxWidth: 560,
          width: '100%',
          background: 'white',
          padding: 32,
          borderRadius: 16,
          boxShadow: '0 6px 24px rgba(0, 0, 0, 0.06)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: 26, fontWeight: 600, marginBottom: 12 }}>
          Set up wallet backup
        </h1>
        <p style={{ color: '#555', marginBottom: 24, lineHeight: 1.5 }}>
          Open your wallet&apos;s QR scanner and scan this code to pair with
          our backup server. You&apos;ll see a 24-word recovery phrase next —
          write it down. Without it nobody (including us) can decrypt your
          backup.
        </p>

        {error ? (
          <p
            data-testid="vault-backup-error"
            style={{ color: '#c0392b', fontWeight: 500 }}
          >
            Could not load backup code: {error}
          </p>
        ) : !data ? (
          <p data-testid="vault-backup-loading" style={{ color: '#888' }}>
            Loading backup code…
          </p>
        ) : (
          <>
            <div
              data-testid="vault-backup-qr"
              data-backup-url={data.url}
              data-goal-code={data.goalCode}
              style={{
                background: 'white',
                padding: 16,
                display: 'inline-block',
                borderRadius: 12,
                border: '1px solid #eee',
              }}
            >
              <QRCodeSVG value={data.url} size={280} level="M" />
            </div>
            <p
              data-testid="vault-backup-label"
              style={{ marginTop: 20, color: '#333', fontWeight: 500 }}
            >
              {data.label}
            </p>
            <p
              style={{
                marginTop: 8,
                color: '#999',
                fontSize: 12,
                wordBreak: 'break-all',
              }}
            >
              {data.url}
            </p>
            <p style={{ marginTop: 24, color: '#777', fontSize: 13 }}>
              Already have a backup and need to recover it?{' '}
              <a href="/vaults/restore" style={{ color: '#2563eb' }}>
                Go to restore →
              </a>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
