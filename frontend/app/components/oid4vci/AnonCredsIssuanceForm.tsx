'use client';

/**
 * AnonCreds Issuance Form for OID4VCI 1.0.
 *
 * Renders one input per schema attribute and emits the raw values to its
 * parent. Encoding (raw + integer encoded pairs) happens server-side, so
 * this form only deals with strings the user types.
 *
 * Spec: docs/specs/anoncreds-oid4vci-profile.md §6
 */

import React from 'react';

interface AnonCredsIssuanceFormProps {
  attributes: string[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export default function AnonCredsIssuanceForm({
  attributes,
  values,
  onChange,
}: AnonCredsIssuanceFormProps) {
  if (!attributes || attributes.length === 0) {
    return (
      <div className="alert alert-warning text-sm">
        This credential definition does not list any attributes. Re-create it
        with attributes before issuing.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {attributes.map((attr) => (
        <div key={attr}>
          <label className="block text-xs text-text-tertiary mb-1">
            {attr}
          </label>
          <input
            type="text"
            value={values[attr] || ''}
            onChange={(e) => onChange({ ...values, [attr]: e.target.value })}
            className="input w-full"
            placeholder={`Enter ${attr}`}
          />
        </div>
      ))}
      <div className="md:col-span-2 text-xs text-text-tertiary">
        Values are signed as a blind CL signature over your link secret.
        Numeric strings are kept as integers; everything else is hashed
        (SHA-256, big-endian) per Aries RFC 0036/0037.
      </div>
    </div>
  );
}
