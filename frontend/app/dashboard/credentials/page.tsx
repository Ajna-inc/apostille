'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { credentialApi, credentialDefinitionApi, connectionApi, schemaApi, type CredentialDefinitionOverlay } from '../../../lib/api';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { Icon } from '../../components/ui/Icons';

interface Credential {
  id: string;
  state: string;
  createdAt: string;
  connectionId: string;
  credentialDefinitionId?: string;
  attributes?: Record<string, string>;
  metadata?: any;
  threadId?: string;
  revocationId?: string;
  updatedAt?: string;
}

interface Connection {
  id: string;
  state: string;
  role: string;
  theirLabel?: string;
  createdAt: string;
}

interface CredentialDefinition {
  id: string;
  credentialDefinitionId: string;
  tag?: string;
  meta?: { name?: string; description?: string; issuer?: string };
  createdAt?: string;
  schemaId?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeCredentialAttributes(attributes: any): Record<string, string> {
  if (!attributes) return {};

  if (Array.isArray(attributes)) {
    return attributes.reduce((acc: Record<string, string>, attribute: any) => {
      const name = attribute?.name ?? attribute?.key;
      if (!name) return acc;
      const value = attribute?.value;
      acc[name] = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
      return acc;
    }, {});
  }

  if (typeof attributes === 'object') {
    return Object.entries(attributes).reduce((acc: Record<string, string>, [key, value]) => {
      acc[key] = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
      return acc;
    }, {});
  }

  return {};
}

function extractCredentialDefinitionId(input: any): string | null {
  const seen = new WeakSet<object>();

  const walk = (value: any): string | null => {
    if (!value || typeof value !== 'object') return null;
    if (seen.has(value)) return null;
    seen.add(value);

    const direct = value.credentialDefinitionId ?? value.credential_definition_id;
    if (typeof direct === 'string' && direct.trim()) return direct;

    for (const nested of Object.values(value)) {
      const nestedResult = walk(nested);
      if (nestedResult) return nestedResult;
    }

    return null;
  };

  return walk(input);
}

function resolveCredentialCardSvg(
  svgTemplate: string,
  overlay: CredentialDefinitionOverlay | null | undefined,
  credentialAttributes: Record<string, string>
): string {
  const meta = overlay?.meta ?? {};
  const bindings = overlay?.branding?.svg_bindings ?? {};
  const attributeLookup = Object.fromEntries(
    Object.entries(credentialAttributes).map(([key, value]) => [key.toLowerCase(), value])
  );
  const bindingLookup = Object.fromEntries(
    Object.entries(bindings).map(([key, value]) => [key.toLowerCase(), value.toLowerCase()])
  );

  let responsive = svgTemplate
    .replace(/(<svg\b[^>]*?)\s+width="\d+(?:\.\d+)?"/, '$1')
    .replace(/(<svg\b[^>]*?)\s+height="\d+(?:\.\d+)?"/, '$1');

  responsive = responsive.replace(/\{\{([^{}]+)\}\}/g, (_, rawToken: string) => {
    const token = rawToken.trim();
    const lowerToken = token.toLowerCase();

    if (lowerToken.startsWith('meta.')) {
      const key = lowerToken.slice(5);
      const value = meta[key as keyof typeof meta];
      return escapeXml(value ? String(value) : '');
    }

    const mappedAttribute = bindings[token] || bindingLookup[lowerToken] || token;
    const value = credentialAttributes[mappedAttribute] ?? attributeLookup[mappedAttribute.toLowerCase()] ?? '';
    return escapeXml(String(value));
  });

  responsive = responsive.replace(/\{\{META\.([A-Z_]+)\}\}/g, (_, key: string) => {
    const value = meta[key.toLowerCase() as keyof typeof meta];
    return escapeXml(value ? String(value) : '');
  });

  return responsive;
}

export default function CredentialsPage() {
  const { tenantId } = useAuth();
  const searchParams = useSearchParams();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Issue credential states
  const [showIssueModal, setShowIssueModal] = useState<boolean>(false);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [credentialDefinitions, setCredentialDefinitions] = useState<CredentialDefinition[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [selectedCredDefId, setSelectedCredDefId] = useState<string>('');
  const [attributes, setAttributes] = useState<Record<string, string>>({});
  const [schemaAttributes, setSchemaAttributes] = useState<string[]>([]);
  const [isIssuing, setIsIssuing] = useState<boolean>(false);
  const [issueSuccess, setIssueSuccess] = useState<boolean>(false);

  type CredSortKey = 'id' | 'state' | 'createdAt' | 'receiver' | 'tag';
  const [credSort, setCredSort] = useState<{ key: CredSortKey; dir: 'asc' | 'desc' }>({ key: 'createdAt', dir: 'desc' });

  const getTag = (credDefId?: string) => {
    if (!credDefId) return '—';
    const match = credentialDefinitions.find(
      cd => cd.credentialDefinitionId === credDefId || cd.id === credDefId
    );
    return match?.tag || '—';
  };

  const getReceiver = (connectionId: string) =>
    connections.find(cn => cn.id === connectionId)?.theirLabel ?? connectionId.slice(0, 18) + '…';

  const CRED_STATE_RANK: Record<string, number> = {
    done: 0,
    'credential-issued': 1, 'credential-received': 1,
    'offer-sent': 2, 'offer-received': 2,
    'proposal-sent': 3, 'proposal-received': 3,
    abandoned: 4,
  };
  function credStateRank(state: string) { return CRED_STATE_RANK[state?.toLowerCase()] ?? 99; }

  function toggleCredSort(key: CredSortKey) {
    setCredSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' });
  }
  function credSortArrow(key: CredSortKey) {
    if (credSort.key !== key) return <span style={{ color: 'var(--ink-5)', marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{credSort.dir === 'asc' ? '↑' : '↓'}</span>;
  }

  const filteredCredentials = useMemo(() => {
    const q = (searchParams.get('q') ?? '').trim().toLowerCase();
    const filtered = q
      ? credentials.filter(c => {
        const connLabel = connections.find(cn => cn.id === c.connectionId)?.theirLabel ?? '';
        return (
          c.id.toLowerCase().includes(q) ||
          (c.state || '').toLowerCase().includes(q) ||
          connLabel.toLowerCase().includes(q) ||
          Object.values(c.attributes ?? {}).some(v => String(v).toLowerCase().includes(q))
        );
      })
      : credentials;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (credSort.key === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (credSort.key === 'state') {
        cmp = credStateRank(a.state) - credStateRank(b.state);
      } else if (credSort.key === 'id') {
        cmp = a.id.localeCompare(b.id);
      } else if (credSort.key === 'receiver') {
        const la = connections.find(cn => cn.id === a.connectionId)?.theirLabel ?? '';
        const lb = connections.find(cn => cn.id === b.connectionId)?.theirLabel ?? '';
        cmp = la.localeCompare(lb);
      } else if (credSort.key === 'tag') {
        cmp = getTag(a.credentialDefinitionId).localeCompare(getTag(b.credentialDefinitionId));
      }
      return credSort.dir === 'asc' ? cmp : -cmp;
    });
  }, [credentials, connections, credSort, searchParams]);

  // Credential details modal states
  const [selectedCredential, setSelectedCredential] = useState<Credential | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [credentialDetails, setCredentialDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [credentialDefinitionDetails, setCredentialDefinitionDetails] = useState<any>(null);
  const [resolvedCredentialDefinitionId, setResolvedCredentialDefinitionId] = useState<string | null>(null);
  const [credentialCardSvg, setCredentialCardSvg] = useState<string | null>(null);
  const [loadingCardSvg, setLoadingCardSvg] = useState<boolean>(false);
  const credentialAttributeMap = useMemo(
    () => normalizeCredentialAttributes(credentialDetails?.credential?.attributes),
    [credentialDetails]
  );

  useEffect(() => {
    const fetchCredentials = async () => {
      if (!tenantId) return;

      setLoading(true);
      try {
        const response = await credentialApi.getAll();
        setCredentials(response.credentials || []);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching credentials:', err);
        setError(err.message || 'Failed to fetch credentials');
      } finally {
        setLoading(false);
      }
    };

    fetchCredentials();
    fetchConnections();
    fetchCredentialDefinitions();
  }, [tenantId]);

  const fetchConnections = async () => {
    if (!tenantId) return;

    try {
      const response = await connectionApi.getAll();
      setConnections(response.connections || []);
    } catch (err: any) {
      console.error('Error fetching connections:', err);
      setError(err.message || 'Failed to fetch connections');
    }
  };

  const fetchCredentialDefinitions = async () => {

    try {
      const response = await credentialDefinitionApi.getAll();
      setCredentialDefinitions(response.credentialDefinitions || []);
    } catch (err: any) {
      console.error('Error fetching credential definitions:', err);
      setError(err.message || 'Failed to fetch credential definitions');
    }
  };

  const openIssueModal = async () => {
    if (!tenantId) return;

    setError(null);
    setIssueSuccess(false);
    setSelectedConnectionId('');
    setSelectedCredDefId('');
    setAttributes({});
    setSchemaAttributes([]);

    await Promise.all([
      fetchConnections(),
      fetchCredentialDefinitions()
    ]);

    setShowIssueModal(true);
  };

  const closeIssueModal = () => {
    setShowIssueModal(false);
    setSelectedConnectionId('');
    setSelectedCredDefId('');
    setAttributes({});
    setSchemaAttributes([]);
  };

  const handleCredDefChange = async (credDefId: string) => {
    if (!tenantId || !credDefId) {
      setSchemaAttributes([]);
      setAttributes({});
      return;
    }

    setSelectedCredDefId(credDefId);
    setError(null);

    try {
      console.log(`Fetching credential definition: ${credDefId}`);
      const credDefResponse = await credentialDefinitionApi.getById(credDefId);
      console.log('Credential definition response:', credDefResponse);

      if (!credDefResponse || !credDefResponse.credentialDefinition || !credDefResponse.schemaId) {
        console.error('Invalid credential definition response:', credDefResponse);
        setError('Could not retrieve schema information from credential definition');
        return;
      }

      const schemaId = credDefResponse.schemaId;
      console.log(`Fetching schema: ${schemaId}`);

      try {
        const schemaData = await schemaApi.getBySchemaId(schemaId);
        console.log('Schema data:', schemaData);

        if (schemaData.success && schemaData.schema) {
          const attrNames = schemaData.schema.schema?.attrNames || schemaData.schema.attrNames || [];
          console.log('Schema attributes:', attrNames);
          setSchemaAttributes(attrNames);

          // Initialize attributes with empty values
          const newAttributes: Record<string, string> = {};
          attrNames.forEach((attr: string) => {
            newAttributes[attr] = '';
          });

          setAttributes(newAttributes);
        } else {
          console.error('Schema data error:', schemaData);
          setError(`Could not retrieve schema attributes: ${schemaData.message || 'Unknown error'}`);
        }
      } catch (schemaErr: any) {
        console.error(`Error fetching schema with ID ${schemaId}:`, schemaErr);
        setError(`Failed to fetch schema: ${schemaErr.message || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error(`Error fetching credential definition ${credDefId}:`, err);
      setError(`Failed to fetch credential definition: ${err.message || 'Unknown error'}`);
    }
  };

  const handleAttributeChange = (attr: string, value: string) => {
    setAttributes(prev => ({
      ...prev,
      [attr]: value
    }));
  };

  const handleIssueCredential = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!tenantId || !selectedConnectionId || !selectedCredDefId) {
      setError('Connection and credential definition are required');
      return;
    }

    setIsIssuing(true);
    setError(null);

    try {
      await credentialApi.issue(
        selectedConnectionId,
        selectedCredDefId,
        attributes
      );

      setIssueSuccess(true);

      // Refresh credentials list
      const response = await credentialApi.getAll();

      setCredentials(response.credentials || []);

      // Close modal after short delay
      setTimeout(() => {
        closeIssueModal();
      }, 1500);
    } catch (err: any) {
      console.error('Error issuing credential:', err);
      setError(err.message || 'Failed to issue credential');
    } finally {
      setIsIssuing(false);
    }
  };

  const openDetailsModal = async (credential: Credential) => {
    setSelectedCredential(credential);
    setIsDetailsOpen(true);
    setLoadingDetails(true);
    setCredentialDefinitionDetails(null);
    setResolvedCredentialDefinitionId(null);
    setCredentialCardSvg(null);

    try {
      // Fetch detailed credential information
      const detailedCredential = await credentialApi.getById(credential.id);
      console.log('Detailed credential:', detailedCredential);

      // Debug: Log the structure of the credential attributes
      if (detailedCredential && detailedCredential.credential && detailedCredential.credential.attributes) {
        console.log('Credential attributes structure:', JSON.stringify(detailedCredential.credential.attributes, null, 2));

        // Inspect each attribute for complex objects
        Object.entries(detailedCredential.credential.attributes).forEach(([key, value]) => {
          if (typeof value === 'object' && value !== null) {
            console.log(`Complex attribute "${key}":`, value);
          }
        });
      }

      setCredentialDetails(detailedCredential);

      // If there's a credential definition ID, try to get schema info
      const resolvedCredentialDefinitionId =
        credential.credentialDefinitionId ||
        detailedCredential?.credential?.credentialDefinitionId ||
        detailedCredential?.credential?.metadata?.data?.credentialDefinitionId ||
        detailedCredential?.credential?.metadata?.credentialDefinitionId ||
        extractCredentialDefinitionId(detailedCredential?.credential?.metadata) ||
        extractCredentialDefinitionId(detailedCredential?.credential?.metadata?.data);
      setResolvedCredentialDefinitionId(resolvedCredentialDefinitionId || null);

      if (resolvedCredentialDefinitionId) {
        try {
          const credDefResponse = await credentialDefinitionApi.getById(resolvedCredentialDefinitionId);
          console.log('Associated credential definition:', credDefResponse);
          setCredentialDefinitionDetails(credDefResponse);

          if (credDefResponse && credDefResponse.schemaId) {
            const schemaResponse = await schemaApi.getBySchemaId(credDefResponse.schemaId);
            console.log('Associated schema:', schemaResponse);
          }
        } catch (e) {
          console.warn('Could not fetch associated schema/credential definition:', e);
        }
      }
    } catch (err) {
      console.error('Error fetching credential details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeDetailsModal = () => {
    setSelectedCredential(null);
    setIsDetailsOpen(false);
    setCredentialDetails(null);
    setCredentialDefinitionDetails(null);
    setResolvedCredentialDefinitionId(null);
    setCredentialCardSvg(null);
    setLoadingCardSvg(false);
  };

  useEffect(() => {
    if (!isDetailsOpen) {
      setCredentialCardSvg(null);
      setLoadingCardSvg(false);
      return;
    }

    let cancelled = false;

    const loadSvg = async () => {
      setLoadingCardSvg(true);
      try {
        let overlay = credentialDefinitionDetails?.overlay;
        let svgUrl = overlay?.branding?.svg_template_url;

        if (!svgUrl && resolvedCredentialDefinitionId) {
          const overlayResponse = await credentialDefinitionApi.getOverlay(resolvedCredentialDefinitionId);
          overlay = overlayResponse?.overlay || overlay;
          svgUrl = overlay?.branding?.svg_template_url;
        }

        if (!svgUrl) {
          if (!cancelled) {
            setCredentialCardSvg(null);
          }
          return;
        }

        const response = await fetch(svgUrl);
        const svgText = await response.text();
        if (cancelled) return;

        const resolvedSvg = resolveCredentialCardSvg(
          svgText,
          overlay,
          credentialAttributeMap
        );

        setCredentialCardSvg(resolvedSvg);
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load credential card SVG:', error);
          setCredentialCardSvg(null);
        }
      } finally {
        if (!cancelled) {
          setLoadingCardSvg(false);
        }
      }
    };

    loadSvg();

    return () => {
      cancelled = true;
    };
  }, [isDetailsOpen, credentialDefinitionDetails, credentialDetails, resolvedCredentialDefinitionId]);

  // Helper function to safely render credential attribute values
  const renderAttributeValue = (value: any) => {
    if (value === null || value === undefined) {
      return <span className="text-text-tertiary italic">None</span>;
    }

    // For primitive types, just convert to string
    if (typeof value !== 'object') {
      return String(value);
    }

    // For objects, render appropriate representation
    try {
      // Handle special case for AnonCreds formatted attributes
      if ('mime-type' in value) {
        return (
          <div>
            <div className="text-xs text-text-tertiary mb-1">Format: {value['mime-type']}</div>
            {value.name && <div className="text-xs text-text-tertiary mb-1">Name: {value.name}</div>}
            <div className="text-xs font-medium">Value:</div>
            <div className="pl-2 border-l-2 border-border-secondary">
              {typeof value.value === 'object' ?
                <pre className="text-xs overflow-auto max-h-20">{JSON.stringify(value.value, null, 2)}</pre> :
                String(value.value || '')}
            </div>
          </div>
        );
      }

      // Handle objects with a value property
      if ('value' in value && !('mime-type' in value)) {
        return (
          <div>
            <div>Value: {typeof value.value === 'object' ?
              <pre className="text-xs overflow-auto max-h-20">{JSON.stringify(value.value, null, 2)}</pre> :
              String(value.value || '')}
            </div>
            {Object.entries(value)
              .filter(([k]) => k !== 'value')
              .map(([k, v]) => (
                <div key={k} className="text-xs text-text-tertiary">{k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</div>
              ))}
          </div>
        );
      }

      // Default object rendering
      return <pre className="text-xs overflow-auto max-h-24">{JSON.stringify(value, null, 2)}</pre>;
    } catch (e) {
      console.error("Error rendering attribute value:", e);
      return <span className="text-red-500">Error displaying value</span>;
    }
  };

  const credentialOverlay = credentialDefinitionDetails?.overlay || null;
  const credentialOverlayBranding = credentialOverlay?.branding || {};
  const credentialOverlayMeta = credentialOverlay?.meta || {};
  const previewPrimaryColor = credentialOverlayBranding.primary_background_color || '#1e3a5f';
  const previewSecondaryColor = credentialOverlayBranding.secondary_background_color || previewPrimaryColor;
  const previewPrimaryAttr =
    credentialOverlayBranding.primary_attribute ||
    Object.keys(credentialAttributeMap)[0] ||
    '';
  const previewSecondaryAttr =
    credentialOverlayBranding.secondary_attribute ||
    Object.keys(credentialAttributeMap)[1] ||
    '';
  const previewLogoUrl = credentialOverlayBranding.logo || '';
  const previewBackgroundUrl = credentialOverlayBranding.background_image || '';
  const previewMetaName = credentialOverlayMeta.name || credentialDetails?.credential?.schema?.name || 'Credential';
  const previewAttrLines = [
    previewPrimaryAttr,
    previewSecondaryAttr,
    ...Object.keys(credentialAttributeMap).filter((attr) => attr !== previewPrimaryAttr && attr !== previewSecondaryAttr),
  ].filter(Boolean).slice(0, 3);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Credentials</h1>
          <p className="page-sub">Issue, hold, and revoke verifiable credentials over DIDComm.</p>
        </div>
        <button onClick={openIssueModal} className="btn btn-primary">
          <Icon name="plus" size={14} /> Issue Credential
        </button>
      </div>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}><span>{error}</span></div>
      )}

      {loading ? (
        <div className="empty"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      ) : credentials.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCredSort('id')}>
                  Credential{credSortArrow('id')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCredSort('state')}>
                  State{credSortArrow('state')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCredSort('receiver')}>
                  Receiver{credSortArrow('receiver')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCredSort('tag')}>
                  Tag{credSortArrow('tag')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCredSort('createdAt')}>
                  Created{credSortArrow('createdAt')}
                </th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCredentials.map((credential) => (
                <tr key={credential.id} style={{ cursor: 'pointer' }} onClick={() => openDetailsModal(credential)}>
                  <td>
                    <span className="mono" style={{ fontSize: 12 }}>{credential.id.slice(0, 28)}...</span>
                  </td>
                  <td>
                    <span className={`badge ${credential.state === 'offer-received' ? 'amber' :
                      credential.state === 'done' ? 'green' : 'blue'
                      }`}>
                      <span className="badge-dot" />
                      {credential.state}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 13 }}>{getReceiver(credential.connectionId)}</span></td>
                  <td><span className="mono-dim" style={{ fontSize: 12 }}>{getTag(credential.credentialDefinitionId)}</span></td>
                  <td><span className="mono-dim">{new Date(credential.createdAt).toLocaleDateString()}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={(e) => { e.stopPropagation(); openDetailsModal(credential); }} className="btn btn-secondary btn-xs">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <div className="empty-icon"><Icon name="badge" size={22} /></div>
          <div className="empty-title">No credentials found</div>
          <div className="empty-desc">You can issue or receive credentials after creating connections.</div>
          <div className="empty-actions">
            <button onClick={openIssueModal} className="btn btn-primary">Issue Your First Credential</button>
          </div>
        </div>
      )}

      {/* Issue Credential Modal */}
      {showIssueModal && (
        <div className="modal-backdrop">
          <div className="modal-container max-w-2xl">
            <div className="modal-header">
              <h2 className="modal-title">Issue New Credential</h2>
              <button
                onClick={closeIssueModal}
                className="modal-close-button"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="modal-body">
              {issueSuccess ? (
                <div className="alert alert-success mb-4">
                  <span>Credential issued successfully!</span>
                </div>
              ) : (
                <form onSubmit={handleIssueCredential} className="space-y-4">
                  <div>
                    <label className="form-label">
                      Connection
                    </label>
                    <select
                      value={selectedConnectionId}
                      onChange={(e) => setSelectedConnectionId(e.target.value)}
                      className="form-select"
                      required
                    >
                      <option value="">Select Connection</option>
                      {[...connections]
                        .filter(conn => conn.state === 'completed')
                        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                        .map((conn) => (
                          <option key={conn.id} value={conn.id} title={conn.id}>
                            {conn.theirLabel || 'Unknown'} — {new Date(conn.createdAt).toLocaleDateString()}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Credential Definition</span>
                      <a
                        href="/dashboard/credential-definitions"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11.5, color: 'var(--accent)', fontWeight: 500 }}
                      >
                        Create new →
                      </a>
                    </label>
                    <select
                      value={selectedCredDefId}
                      onChange={(e) => handleCredDefChange(e.target.value)}
                      className="form-select"
                      required
                    >
                      <option value="">Select Credential Definition</option>
                      {[...credentialDefinitions]
                        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                        .map((credDef) => {
                          const shortId = credDef.credentialDefinitionId.length > 32
                            ? '...' + credDef.credentialDefinitionId.slice(-28)
                            : credDef.credentialDefinitionId;
                          const dateStr = credDef.createdAt ? new Date(credDef.createdAt).toLocaleDateString() : '';
                          return (
                            <option
                              key={credDef.id}
                              value={credDef.credentialDefinitionId}
                              title={credDef.credentialDefinitionId}
                            >
                              {shortId}{dateStr ? ` — ${dateStr}` : ''}
                            </option>
                          );
                        })}
                    </select>
                  </div>

                  {schemaAttributes.length > 0 && (
                    <div>
                      <h3 className="form-label">
                        Credential Attributes
                      </h3>

                      {schemaAttributes.map((attr) => (
                        <div key={attr} className="mb-3">
                          <label className="form-label">
                            {attr}
                          </label>
                          <input
                            type="text"
                            value={attributes[attr] || ''}
                            onChange={(e) => handleAttributeChange(attr, e.target.value)}
                            className="form-input"
                            placeholder={`Enter ${attr}`}
                            required
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={closeIssueModal}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isIssuing || !selectedConnectionId || !selectedCredDefId || schemaAttributes.length === 0}
                      className="btn btn-primary"
                    >
                      {isIssuing ? (
                        <>
                          <div className="spinner h-4 w-4 mr-2"></div>
                          Issuing...
                        </>
                      ) : (
                        'Issue Credential'
                      )}
                    </button>
                  </div>

                  {error && (
                    <div className="alert alert-error mt-4">
                      <span>{error}</span>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credential Details Modal */}
      <Transition appear show={isDetailsOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeDetailsModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="modal-container max-w-3xl transform text-left align-middle transition-all">
                  <div className="modal-header">
                    <Dialog.Title as="h3" className="modal-title">
                      Credential Details
                    </Dialog.Title>
                    <button
                      type="button"
                      onClick={closeDetailsModal}
                      className="text-text-secondary hover:text-text-primary transition-colors p-1"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="modal-body">
                    {loadingDetails ? (
                      <div className="flex justify-center items-center p-8">
                        <div className="spinner h-8 w-8"></div>
                        <span className="ml-2 text-sm text-text-secondary">Loading credential details...</span>
                      </div>
                    ) : selectedCredential ? (
                      <div>
                        <div className="mb-6 grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-1">ID</h4>
                            <p className="text-sm text-text-secondary break-all">{selectedCredential.id}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-1">State</h4>
                            <p className="text-sm text-text-secondary break-all">
                              <span className={`badge ${selectedCredential.state === 'offer-received' ? 'badge-warning' :
                                selectedCredential.state === 'done' ? 'badge-success' :
                                  'badge-primary'
                                }`}>
                                {selectedCredential.state}
                              </span>
                            </p>
                          </div>
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-1">Connection ID</h4>
                            <p className="text-sm text-text-secondary break-all">{selectedCredential.connectionId}</p>
                          </div>
                          {selectedCredential.credentialDefinitionId && (
                            <div>
                              <h4 className="text-sm font-semibold text-text-primary mb-1">Credential Definition ID</h4>
                              <p className="text-sm text-text-secondary break-all">{selectedCredential.credentialDefinitionId}</p>
                            </div>
                          )}
                          <div>
                            <h4 className="text-sm font-semibold text-text-primary mb-1">Created At</h4>
                            <p className="text-sm text-text-secondary">
                              {new Date(selectedCredential.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {selectedCredential.updatedAt && (
                            <div>
                              <h4 className="text-sm font-semibold text-text-secondary mb-1">Updated At</h4>
                              <p className="text-sm text-text-tertiary">
                                {new Date(selectedCredential.updatedAt).toLocaleString()}
                              </p>
                            </div>
                          )}
                          {selectedCredential.threadId && (
                            <div>
                              <h4 className="text-sm font-semibold text-text-secondary mb-1">Thread ID</h4>
                              <p className="text-sm text-text-tertiary break-all">{selectedCredential.threadId}</p>
                            </div>
                          )}
                          {selectedCredential.revocationId && (
                            <div>
                              <h4 className="text-sm font-semibold text-text-secondary mb-1">Revocation ID</h4>
                              <p className="text-sm text-text-tertiary">{selectedCredential.revocationId}</p>
                            </div>
                          )}
                        </div>

                        {(credentialCardSvg || loadingCardSvg || credentialOverlay) && (
                          <div className="mt-6">
                            <h4 className="text-sm font-semibold text-text-secondary mb-2">Card Preview</h4>
                            <div className="bg-surface-100 p-4 rounded border border-border-secondary">
                              {loadingCardSvg && !credentialCardSvg ? (
                                <div className="flex justify-center items-center w-[306px] h-[187px] mx-auto">
                                  <div className="spinner h-7 w-7"></div>
                                  <span className="ml-2 text-sm text-text-secondary">Loading card preview...</span>
                                </div>
                              ) : (
                                <div className="flex justify-center">
                                  <div
                                    className="w-[306px] h-[187px] rounded-[14px] overflow-hidden relative text-white shadow-lg"
                                    style={{
                                      background: `linear-gradient(135deg, ${previewPrimaryColor}, ${previewSecondaryColor})`,
                                    }}
                                  >
                                    {credentialCardSvg ? (
                                      <div
                                        className="absolute inset-0 w-full h-full"
                                        dangerouslySetInnerHTML={{
                                          __html: credentialCardSvg?.replace(
                                            /<svg\b([^>]*)>/,
                                            (_match, attrs: string) => `<svg${attrs} width="100%" height="100%" preserveAspectRatio="none">`
                                          ) || '',
                                        }}
                                      />
                                    ) : (
                                      <>
                                        {previewBackgroundUrl && (
                                          <img
                                            src={previewBackgroundUrl}
                                            alt=""
                                            className="absolute inset-0 w-full h-full object-cover"
                                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                          />
                                        )}
                                        <div className="relative z-10 flex flex-col justify-between h-full p-4">
                                          <div className="flex justify-between items-start">
                                            <div className="text-[11px] opacity-80 font-medium uppercase tracking-wider">{previewMetaName}</div>
                                            {previewLogoUrl && (
                                              <img
                                                src={previewLogoUrl}
                                                alt=""
                                                className="h-7 w-auto object-contain"
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                                              />
                                            )}
                                          </div>
                                          <div>
                                            <div className="text-[18px] font-semibold mb-1.5">{previewMetaName}</div>
                                            <div className="font-mono text-[11px] opacity-75 leading-relaxed">
                                              {previewAttrLines.map((attr) => (
                                                <div key={attr}>
                                                  {credentialAttributeMap[attr] || `{{${attr}}}`}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Credential Attributes Section */}
                        {credentialDetails && credentialDetails.credential && (
                          <>
                            {/* Display credential content */}
                            {credentialDetails.credential.attributes && (
                              <div className="mt-6">
                                <h4 className="text-sm font-semibold text-text-secondary mb-2">Credential Attributes</h4>
                                <div className="bg-surface-100 p-4 rounded border border-border-secondary">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(credentialDetails.credential.attributes).map(([key, value]: [string, any]) => (
                                      <div key={key} className="p-3 bg-surface-50 rounded shadow-sm">
                                        <h5 className="text-sm font-semibold text-text-secondary mb-2 border-b border-border-secondary pb-1">{key}</h5>
                                        <div className="text-sm text-text-secondary">
                                          {renderAttributeValue(value)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Raw credential data for debugging */}
                            <div className="mt-6">
                              <h4 className="text-sm font-semibold text-text-secondary mb-2">
                                <span>Raw Credential Data</span>
                                <button
                                  onClick={() => console.log('Full credential data:', credentialDetails)}
                                  className="ml-2 text-xs text-primary-600 hover:text-primary-700"
                                >
                                  Log to Console
                                </button>
                              </h4>
                              <div className="bg-surface-100 p-2 rounded border border-border-secondary">
                                <pre className="text-xs overflow-auto max-h-40 text-text-secondary">
                                  {JSON.stringify(
                                    {
                                      ...credentialDetails.credential,
                                      // Exclude large binary data if present
                                      _data: credentialDetails.credential._data ? "[Binary data]" : undefined
                                    },
                                    null, 2
                                  )}
                                </pre>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Metadata Section */}
                        {/* {selectedCredential.metadata && Object.keys(selectedCredential.metadata).length > 0 && (
                        <div className="mt-6">
                          <h4 className="text-sm font-semibold text-text-secondary mb-2">Metadata</h4>
                          <div className="bg-surface-100 p-4 rounded border border-border-secondary">
                            <pre className="text-xs text-text-secondary overflow-auto max-h-40">
                              {JSON.stringify(selectedCredential.metadata, null, 2)}
                            </pre>
                          </div>
                        </div>
                      )} */}

                        <div className="mt-6 flex justify-end">
                          <button
                            type="button"
                            onClick={closeDetailsModal}
                            className="btn btn-primary"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-text-tertiary p-4">No credential information available.</p>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
} 
