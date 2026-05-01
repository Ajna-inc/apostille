'use client';

/**
 * Wire Payload Inspector — RI value-add.
 *
 * Renders the four payloads observed during an OID4VCI flow:
 *   1. Credential Offer (with key_correctness_proof)
 *   2. Token Response (with c_nonce)
 *   3. Credential Request (with blinded_ms + correctness proof)
 *   4. Credential Response (with blind CL signature)
 *
 * Backed by GET /api/oid4vci/offers/:offerId/wire-trace. Polled while the
 * offer is in flight so wallet vendors can watch their bytes appear.
 */

import React, { useEffect, useState } from 'react';
import { oid4vciApi } from '../../../lib/api';

interface WireTrace {
  offer?: unknown;
  tokenResponse?: unknown;
  credentialRequest?: unknown;
  credentialResponse?: unknown;
}

interface WirePayloadInspectorProps {
  offerId: string;
  status: string;
}

const sectionLabel = {
  offer: 'Credential Offer',
  tokenResponse: 'Token Response',
  credentialRequest: 'Credential Request (blinded_ms)',
  credentialResponse: 'Credential Response (blind signature)',
} as const;

export default function WirePayloadInspector({
  offerId,
  status,
}: WirePayloadInspectorProps) {
  const [trace, setTrace] = useState<WireTrace | null>(null);
  const [open, setOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchTrace = async () => {
      try {
        const data = await oid4vciApi.getWireTrace(offerId);
        if (!cancelled) setTrace((data?.wireTrace as WireTrace) || {});
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to fetch wire trace');
      }
    };

    fetchTrace();
    // Poll while issuance is still in motion.
    const interval =
      status === 'credential_issued' || status === 'expired'
        ? null
        : setInterval(fetchTrace, 2000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [offerId, status]);

  return (
    <div className="border border-border-primary rounded-lg mt-6 bg-surface-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center p-3 text-sm font-medium text-text-secondary hover:bg-surface-200 rounded-t-lg"
      >
        <span>Wire Payload Inspector</span>
        <span className="text-xs text-text-tertiary">{open ? 'hide' : 'show'}</span>
      </button>
      {open && (
        <div className="p-4 space-y-4">
          {error && <div className="alert alert-error text-sm">{error}</div>}
          {!trace && !error && (
            <div className="text-sm text-text-tertiary">Loading…</div>
          )}
          {trace &&
            (Object.keys(sectionLabel) as Array<keyof typeof sectionLabel>).map(
              (key) => {
                const value = (trace as any)[key];
                return (
                  <details key={key} open={!!value} className="text-sm">
                    <summary className="cursor-pointer text-text-primary font-medium">
                      {sectionLabel[key]} {value ? '' : '(awaiting…)'}
                    </summary>
                    {value && (
                      <pre className="mt-2 p-3 bg-surface-200 rounded text-xs overflow-auto max-h-64">
                        {JSON.stringify(value, null, 2)}
                      </pre>
                    )}
                  </details>
                );
              },
            )}
        </div>
      )}
    </div>
  );
}
