/**
 * Wallet restore landing page.
 *
 * Public — no login required. A user who has lost their phone scans this
 * page's QR code with a fresh wallet install. The QR is a permanent
 * multi-use DIDComm OOB invitation tagged with goal-code `vault.restore`;
 * the wallet recognises it and starts the restore flow (asks for the
 * 24-word phrase, fetches the vault, decrypts, opens).
 *
 * Nothing user-specific is on this page. Every restoring wallet scans the
 * same QR; the seed phrase is what identifies the specific backup.
 */
'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import runtimeConfig from '../../../lib/runtimeConfig';

interface RestoreQrResponse {
  url: string;
  label: string;
  goalCode: string;
}

export default function VaultRestorePage() {
  const [data, setData] = useState<RestoreQrResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${runtimeConfig.API_URL}/api/vaults/restore-qr`, {
          method: 'GET',
          headers: { accept: 'application/json' },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as RestoreQrResponse;
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
      data-testid="vault-restore-page"
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
          Restore your wallet
        </h1>
        <p style={{ color: '#555', marginBottom: 24, lineHeight: 1.5 }}>
          Open your wallet&apos;s QR scanner, scan this code, then enter your
          24-word recovery phrase. We never see your phrase — it stays on
          your device.
        </p>

        {error ? (
          <p
            data-testid="vault-restore-error"
            style={{ color: '#c0392b', fontWeight: 500 }}
          >
            Could not load restore code: {error}
          </p>
        ) : !data ? (
          <p data-testid="vault-restore-loading" style={{ color: '#888' }}>
            Loading restore code…
          </p>
        ) : (
          <>
            <div
              data-testid="vault-restore-qr"
              data-restore-url={data.url}
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
              data-testid="vault-restore-label"
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
          </>
        )}
      </section>
    </main>
  );
}
