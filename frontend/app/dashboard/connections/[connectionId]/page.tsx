'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../context/AuthContext';
import { connectionApi, credentialApi, proofApi, workflowApi, credentialDefinitionApi, pdfSigningApi } from '@/lib/api';
import { useNotifications } from '../../../context/NotificationContext';
import { useCall } from '../../../context/CallContext';
import { Icon } from '../../../components/ui/Icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConnItem {
  id: string;
  type: 'credential' | 'proof' | 'workflow' | 'pdf';
  name: string;
  meta: string;
  status: string;
  flow: 'sent' | 'received';
  owner: 'you' | 'them';
  date: string;
  claims?: Array<[string, string]>;
  credentialId?: string;
  attrs?: string[];
  proofId?: string;
  steps?: { step: number; total: number };
  instanceId?: string;
}

interface Message {
  id: string;
  content: string;
  role: 'sender' | 'receiver';
  sentTime?: string;
  createdAt?: string;
}

type DrawerState = null | 'message' | 'credential' | 'proof' | 'workflow' | { item: ConnItem };

interface Connection {
  id: string;
  state: string;
  role: string;
  theirLabel?: string;
  theirDid?: string;
  createdAt: string;
  enc?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ART = {
  credential: { icon: 'badge' as const, tone: 'blue', label: 'Credential' },
  proof: { icon: 'shieldCheck' as const, tone: 'violet', label: 'Proof' },
  workflow: { icon: 'workflow' as const, tone: 'green', label: 'Workflow' },
  pdf: { icon: 'fileSig' as const, tone: 'amber', label: 'Document' },
};

const STATUS_TONE: Record<string, string> = {
  active: 'green', accepted: 'blue', pending: 'amber', awaiting: 'amber',
  completed: 'green', verified: 'green', requested: 'amber', signed: 'green',
  done: 'green', revoked: 'red', abandoned: 'red',
  'offer-sent': 'amber', 'offer-received': 'amber',
  'request-sent': 'amber', 'request-received': 'amber',
  'presentation-sent': 'blue', 'presentation-received': 'blue',
  'credential-issued': 'blue', 'credential-received': 'blue',
};

const AVATAR_CLASSES = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
const TABS: Array<[string, string, React.ComponentProps<typeof Icon>['name']]> = [
  ['all', 'All', 'layout'],
  ['credential', 'Credentials', 'badge'],
  ['proof', 'Proofs', 'shieldCheck'],
  ['workflow', 'Workflows', 'workflow'],
  ['pdf', 'PDFs', 'fileSig'],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAvatarClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_CLASSES[h % AVATAR_CLASSES.length];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function isActive(it: ConnItem): boolean {
  if (it.type === 'credential') return ['offer-sent', 'offer-received', 'pending', 'awaiting'].includes(it.status);
  if (it.type === 'proof') return ['request-sent', 'request-received', 'requested'].includes(it.status);
  if (it.type === 'workflow') return ['active', 'awaiting'].includes(it.status);
  if (it.type === 'pdf') return it.status === 'awaiting';
  return false;
}

function parseWfSteps(meta: string): { step: number; total: number } | null {
  const m = /Step (\d+) of (\d+)/.exec(meta || '');
  return m ? { step: +m[1], total: +m[2] } : null;
}

function wfDesc(meta: string): string {
  return meta && meta.indexOf('· ') >= 0 ? meta.split('· ').slice(1).join('· ') : meta || '';
}

function isSystemMessage(content: string): boolean {
  try {
    const p = JSON.parse(content);
    return typeof p === 'object' && p !== null && (p.type === 'kem-key-exchange' || p.type?.startsWith('pdf-signing') || p.type?.startsWith('webrtc'));
  } catch {
    return false;
  }
}

// ─── Data mapping ─────────────────────────────────────────────────────────────

function mapCredentials(credentials: any[], connectionId: string): ConnItem[] {
  return credentials
    .filter(c => c.connectionId === connectionId)
    .map(c => {
      const isSent = c.role === 'issuer';
      const owner: 'you' | 'them' = c.state === 'offer-received' ? 'you' : 'them';
      const shortName = c.credentialDefinition?.tag || c.tag
        || (c.credentialDefinitionId
          ? c.credentialDefinitionId.split(':').filter(Boolean).slice(-2, -1)[0] || 'Credential'
          : 'Credential');
      const claims: Array<[string, string]> = c.attributes
        ? Object.entries(c.attributes).map(([k, v]) => [k, String(v)] as [string, string])
        : [];
      return {
        id: 'cred-' + c.id,
        credentialId: c.id,
        type: 'credential' as const,
        name: shortName,
        meta: c.credentialDefinitionId || '',
        status: c.state,
        flow: isSent ? 'sent' : 'received',
        owner,
        date: c.createdAt ? fmtDate(c.createdAt) : '',
        claims: claims.length > 0 ? claims : undefined,
      };
    });
}

function mapProofs(proofs: any[], connectionId: string): ConnItem[] {
  return proofs
    .filter(p => p.connectionId === connectionId)
    .map(p => {
      // role is now returned by the backend: 'verifier' | 'prover'
      const isSent = p.role === 'verifier';
      // owner = who needs to act next
      const owner: 'you' | 'them' = p.state === 'request-received' ? 'you' : 'them';
      return {
        id: 'proof-' + p.id,
        proofId: p.id,
        type: 'proof' as const,
        name: isSent ? 'Proof Request' : 'Proof Response',
        meta: p.state,
        status: p.state,
        flow: isSent ? 'sent' : 'received',
        owner,
        date: p.createdAt ? fmtDate(p.createdAt) : '',
        // attrs populated only when available (e.g. from getById later)
      };
    });
}

function mapWorkflows(instances: any[]): ConnItem[] {
  return instances.map(inst => {
    const active = inst.status === 'active';
    const steps = (inst.current_step && inst.total_steps)
      ? { step: inst.current_step as number, total: inst.total_steps as number }
      : null;
    const stepsLabel = steps ? `Step ${steps.step} of ${steps.total} · ${inst.state || 'In progress'}` : (inst.state || inst.status || '');
    return {
      id: 'wf-' + inst.instance_id,
      instanceId: inst.instance_id,
      type: 'workflow' as const,
      name: inst.template_id || 'Workflow',
      meta: stepsLabel,
      status: inst.status || 'active',
      flow: 'sent' as const,
      owner: active ? ('them' as const) : ('them' as const),
      date: inst.created_at ? fmtDate(inst.created_at) : '',
      steps: steps || undefined,
    };
  });
}

function mapPdfs(vaults: any, connectionId: string): ConnItem[] {
  const all: any[] = [
    ...(vaults.pendingToShare || []),
    ...(vaults.awaitingSignature || []),
    ...(vaults.signed || []),
    ...(vaults.toSign || []),
    ...(vaults.signedToReturn || []),
    ...(vaults.completed || []),
  ];
  return all
    .filter(v => v.signerConnectionId === connectionId || v.ownerConnectionId === connectionId)
    .map(v => {
      const isSent = v.role === 'owner';
      const isDone = !!v.ownerAckAt || v.status === 'completed';
      const statusLabel = isDone ? 'completed'
        : v.isSigned ? 'signed'
        : isSent ? 'awaiting'
        : 'to-sign';
      return {
        id: 'pdf-' + v.vaultId,
        type: 'pdf' as const,
        name: v.filename || v.description || 'Document',
        meta: v.description || '',
        status: statusLabel,
        flow: isSent ? 'sent' as const : 'received' as const,
        owner: isSent ? 'them' as const : 'you' as const,
        date: v.createdAt ? fmtDate(v.createdAt) : '',
      };
    });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] || '';
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {status}
    </span>
  );
}

// ─── Detail Content (Active + History) ────────────────────────────────────────

function DetailContent({ items, tab, onOpenItem, onRemind }: {
  items: ConnItem[];
  tab: string;
  onOpenItem: (it: ConnItem) => void;
  onRemind: (it: ConnItem) => void;
}) {
  const scoped = tab === 'all' ? items : items.filter(i => i.type === tab);
  const active = scoped.filter(isActive);
  const history = scoped.filter(i => !isActive(i));
  const yours = active.filter(i => i.owner === 'you');
  const theirs = active.filter(i => i.owner !== 'you');
  const [histOpen, setHistOpen] = useState(history.length <= 5);

  const Card = ({ it }: { it: ConnItem }) => {
    const a = ART[it.type];
    const ws = it.type === 'workflow' ? (it.steps || parseWfSteps(it.meta)) : null;
    const isView = it.type === 'workflow';
    return (
      <div
        className={'cdp-card cdp-card-active' + (it.owner === 'you' ? ' you' : '')}
        onClick={() => onOpenItem(it)}
      >
        <span className={`cdp-ico ${a.tone}`}><Icon name={a.icon} size={17} /></span>
        <div className="cdp-card-mid">
          <div className="cdp-card-name">
            {it.name}
            <span className="cdp-type">{a.label}</span>
          </div>
          {ws ? (
            <div className="cdp-wf">
              <div className="cdp-wfbar">
                <div className="cdp-wfbar-fill" style={{ width: Math.round(ws.step / ws.total * 100) + '%' }} />
              </div>
              <span className="cdp-wf-label">Step {ws.step}/{ws.total} · {wfDesc(it.meta)}</span>
            </div>
          ) : (
            <div className="cdp-card-meta">{it.meta}</div>
          )}
        </div>
        <StatusBadge status={it.status} />
        <button
          className={`btn btn-xs ${isView ? 'btn-secondary' : 'btn-accent'}`}
          onClick={e => { e.stopPropagation(); isView ? onOpenItem(it) : onRemind(it); }}
        >
          {isView ? 'View' : 'Remind'}
        </button>
      </div>
    );
  };

  return (
    <>
      <section className="cdp-section">
        <div className="cdp-section-h">
          <span className="cdp-section-title">Active</span>
          {active.length > 0 && <span className="cdp-tab-count">{active.length}</span>}
        </div>

        {active.length === 0 && <div className="cdp-quiet">No active items.</div>}

        {yours.length > 0 && (
          <div className="cdp-turn-group">
            <div className="cdp-turn you">
              <span className="cdp-turn-dot" />
              Your turn
              <span className="cdp-turn-c">{yours.length}</span>
            </div>
            <div className="cdp-list">{yours.map(it => <Card key={it.id} it={it} />)}</div>
          </div>
        )}

        {theirs.length > 0 && (
          <div className="cdp-turn-group">
            <div className="cdp-turn">
              <span className="cdp-turn-dot" />
              Their turn
              <span className="cdp-turn-c">{theirs.length}</span>
            </div>
            <div className="cdp-list">{theirs.map(it => <Card key={it.id} it={it} />)}</div>
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section className="cdp-section">
          <button className="cdp-hist-h" onClick={() => setHistOpen(o => !o)}>
            <span className="cdp-section-title">History</span>
            <span className="cdp-tab-count">{history.length}</span>
            <div style={{ flex: 1 }} />
            <span className={`cdp-chev${histOpen ? ' open' : ''}`}>
              <Icon name="chevDown" size={15} />
            </span>
          </button>
          {histOpen && (
            <div className="cdp-hist-list">
              {history.map(it => {
                const a = ART[it.type];
                return (
                  <div className="cdp-hist-row" key={it.id} onClick={() => onOpenItem(it)}>
                    <span className={`cdp-hist-ico ${a.tone}`}><Icon name={a.icon} size={13} /></span>
                    <span className="cdp-hist-name">{it.name}</span>
                    <span className="cdp-hist-type">{a.label}</span>
                    <span className={`cdp-flow ${it.flow}`}>{it.flow === 'sent' ? 'Sent' : 'Received'}</span>
                    <span className="cdp-hist-date mono">{it.date}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {scoped.length === 0 && <div className="cdp-quiet">Nothing here yet.</div>}
    </>
  );
}

// ─── Message Drawer ────────────────────────────────────────────────────────────

function CdpMessage({ conn, onClose, onCall }: {
  conn: Connection;
  onClose: () => void;
  onCall: () => void;
}) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const { notifications } = useNotifications();
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    connectionApi.getMessages(conn.id).then((res: any) => {
      if (res.success) {
        const sorted = (res.messages as Message[])
          .filter(m => !isSystemMessage(m.content))
          .sort((a, b) => Date.parse(a.sentTime || a.createdAt || '') - Date.parse(b.sentTime || b.createdAt || ''));
        setMsgs(sorted);
      }
    }).finally(() => setLoading(false));
  }, [conn.id]);

  useEffect(() => {
    if (!notifications?.length) return;
    const next: Message[] = [];
    for (const n of notifications) {
      if (processedRef.current.has(n.id)) continue;
      const t = String(n.type || '');
      if (t !== 'AppMessageReceived' && t !== 'AppMessageSent') continue;
      const d: any = n.data || {};
      if (d.connectionId !== conn.id) continue;
      if (isSystemMessage(d.content || '')) { processedRef.current.add(n.id); continue; }
      next.push({
        id: String(d.id || n.id),
        content: String(d.content || ''),
        role: t === 'AppMessageReceived' ? 'receiver' : 'sender',
        sentTime: d.sentTime || n.createdAt || new Date().toISOString(),
        createdAt: d.sentTime || n.createdAt || new Date().toISOString(),
      });
      processedRef.current.add(n.id);
    }
    if (next.length > 0) {
      setMsgs(prev => [...prev, ...next].sort((a, b) =>
        Date.parse(a.sentTime || a.createdAt || '') - Date.parse(b.sentTime || b.createdAt || '')
      ));
    }
  }, [notifications, conn.id]);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = async () => {
    const t = draft.trim();
    if (!t) return;
    setSending(true);
    setDraft('');
    try {
      await connectionApi.sendMessage(conn.id, t);
    } finally {
      setSending(false);
    }
  };

  const kemActive = conn.enc === 'KEM-Active';

  return (
    <>
      <div className="cdp-dh">
        <div className={`avatar avatar-sm ${getAvatarClass(conn.theirLabel || conn.id)}`}>
          {(conn.theirLabel || 'UN').slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
          <div className="cdp-dh-name">{conn.theirLabel || 'Connection'}</div>
          <div className="cdp-dh-sub">
            {kemActive ? (
              <><Icon name="lock" size={10} />&nbsp;Encrypted over DIDComm</>
            ) : (
              'DIDComm channel'
            )}
          </div>
        </div>
        <button className="cdp-icon-btn sm" onClick={onCall} title="Audio call"><Icon name="phone" size={15} /></button>
        <button className="cdp-icon-btn sm" onClick={onClose} title="Close"><Icon name="close" size={15} /></button>
      </div>

      <div className="cdp-chat" ref={bodyRef}>
        {loading ? (
          <div style={{ margin: 'auto', color: 'var(--ink-4)', fontSize: 13 }}>Loading messages…</div>
        ) : (
          <>
            <div className="cdp-day"><span>Today</span></div>
            {msgs.length === 0 && (
              <div style={{ margin: 'auto', color: 'var(--ink-4)', fontSize: 13 }}>No messages yet. Start the conversation!</div>
            )}
            {msgs.map((m, i) => (
              <div key={m.id + i} className={`cdp-msg ${m.role === 'sender' ? 'me' : 'them'}`}>
                <div className="cdp-bubble">{m.content}</div>
                <div className="cdp-mtime mono">{fmtTime(m.sentTime || m.createdAt)}</div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="cdp-dfoot">
        <input
          className="cdp-input"
          placeholder="Message over DIDComm…"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          disabled={sending}
        />
        <button className="cdp-send" onClick={send} disabled={sending || !draft.trim()} title="Send">
          <Icon name="send" size={16} />
        </button>
      </div>
    </>
  );
}

// ─── Item Detail Drawer ────────────────────────────────────────────────────────

function CdpItemDetail({ item, conn, onClose, onToast, onRemove }: {
  item: ConnItem;
  conn: Connection;
  onClose: () => void;
  onToast: (msg: string, undo?: () => void) => void;
  onRemove: (id: string) => void;
}) {
  const a = ART[item.type];
  const ws = item.type === 'workflow' ? (item.steps || parseWfSteps(item.meta)) : null;
  const act = (msg: string, removeId?: string) => {
    if (removeId) onRemove(removeId);
    onToast(msg);
    onClose();
  };

  let foot: React.ReactNode = null;
  if (item.type === 'credential') {
    foot = item.flow === 'sent'
      ? (
        <>
          <button className="btn btn-ghost" onClick={() => act('Credential revoked', item.id)}>Revoke</button>
          <button className="btn btn-accent" onClick={() => act(item.status === 'offer-sent' ? 'Offer re-sent to ' + conn.theirLabel : 'Opening credential…')}>
            <Icon name={item.status === 'offer-sent' ? 'send' : 'eye'} size={14} />
            {item.status === 'offer-sent' ? 'Resend offer' : 'View credential'}
          </button>
        </>
      )
      : (
        <button className="btn btn-accent" onClick={() => act('Credential verified')}>
          <Icon name="shieldCheck" size={14} /> Verify
        </button>
      );
  } else if (item.type === 'proof') {
    foot = ['request-sent', 'request-received', 'requested'].includes(item.status)
      ? (
        <>
          <button className="btn btn-ghost" onClick={() => act('Proof request cancelled', item.id)}>Cancel request</button>
          <button className="btn btn-accent" onClick={() => act('Reminder sent to ' + conn.theirLabel)}>
            <Icon name="send" size={14} /> Send reminder
          </button>
        </>
      )
      : (
        <button className="btn btn-accent" onClick={() => act('Opening presentation…')}>
          <Icon name="eye" size={14} /> View presentation
        </button>
      );
  } else if (item.type === 'workflow') {
    foot = (
      <>
        <button className="btn btn-secondary" onClick={() => act('Opening in Workflows…')}>
          <Icon name="external" size={14} /> Open in Workflows
        </button>
        {isActive(item) && (
          <button className="btn btn-accent" onClick={() => act('Step advanced')}>
            <Icon name="arrowRight" size={14} /> Advance step
          </button>
        )}
      </>
    );
  } else {
    foot = item.status === 'awaiting'
      ? (
        <>
          <button className="btn btn-secondary" onClick={() => act('Opening document…')}><Icon name="eye" size={14} /> Open</button>
          <button className="btn btn-accent" onClick={() => act('Reminder sent to ' + conn.theirLabel)}>
            <Icon name="send" size={14} /> Send reminder
          </button>
        </>
      )
      : (
        <>
          <button className="btn btn-secondary" onClick={() => act('Opening document…')}><Icon name="eye" size={14} /> Open</button>
          <button className="btn btn-accent" onClick={() => act('Download started')}>
            <Icon name="download" size={14} /> Download
          </button>
        </>
      );
  }

  return (
    <>
      <div className="cdp-dh">
        <span className={`cdp-ico ${a.tone}`}><Icon name={a.icon} size={17} /></span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
          <div className="cdp-dh-name">{item.name}</div>
          <div className="cdp-dh-sub">
            {a.label} · {item.flow === 'sent' ? 'Sent to ' : 'Received from '}{conn.theirLabel}
          </div>
        </div>
        <button className="cdp-icon-btn sm" onClick={onClose} title="Close"><Icon name="close" size={15} /></button>
      </div>

      <div className="cdp-dbody">
        <div className="cdp-spec">
          <div className="cdp-spec-row"><span>Status</span><StatusBadge status={item.status} /></div>
          <div className="cdp-spec-row"><span>Direction</span><b>{item.flow === 'sent' ? 'Sent' : 'Received'}</b></div>
          <div className="cdp-spec-row"><span>Date</span><b className="mono">{item.date}</b></div>
        </div>

        {item.claims && item.claims.length > 0 && (
          <div className="cdp-block">
            <div className="cdp-block-h">Claims</div>
            <div className="cdp-claims">
              {item.claims.map(([k, v]) => (
                <div className="cdp-claim" key={k}>
                  <span className="cdp-claim-k">{k}</span>
                  <span className="cdp-claim-v mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {item.attrs && item.attrs.length > 0 && (
          <div className="cdp-block">
            <div className="cdp-block-h">Requested attributes</div>
            <div className="cdp-claims">
              {item.attrs.map(at => (
                <div className="cdp-claim" key={at}>
                  <span className="cdp-claim-k" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--violet-ink)', display: 'grid', placeItems: 'center' }}>
                      <Icon name="shieldCheck" size={13} />
                    </span>
                    {at}
                  </span>
                  <span className="cdp-claim-v" style={{ color: item.status === 'done' ? 'var(--green-ink)' : 'var(--ink-4)' }}>
                    {item.status === 'done' ? 'disclosed' : 'pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {ws && (
          <div className="cdp-block">
            <div className="cdp-block-h">Steps</div>
            <div className="cdp-steps">
              {Array.from({ length: ws.total }).map((_, i) => {
                const n = i + 1;
                const state = n < ws.step ? 'done' : n === ws.step ? 'cur' : 'todo';
                return (
                  <div className={`cdp-step ${state}`} key={n}>
                    <span className="cdp-step-dot">
                      {state === 'done' ? <Icon name="check" size={11} /> : n}
                    </span>
                    <span className="cdp-step-l">
                      {n === ws.step ? wfDesc(item.meta) : `Step ${n}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {item.type === 'pdf' && (
          <div className="cdp-block">
            <div className="cdp-block-h">Document</div>
            <div className="cdp-pdf-preview">
              <Icon name="fileSig" size={26} />
              <span className="mono">{item.name}</span>
              <span className="cdp-pdf-meta">{item.meta}</span>
            </div>
          </div>
        )}

        <div className="cdp-deliver">
          <Icon name="lock" size={13} />
          Exchanged over the {conn.enc === 'KEM-Active' ? 'KEM-encrypted ' : ''}DIDComm channel with {conn.theirLabel}.
        </div>
      </div>

      <div className="cdp-dfoot end">{foot}</div>
    </>
  );
}

// ─── Action Drawer (Issue / Proof / Workflow) ─────────────────────────────────

function CdpAction({ type, conn, onClose, onIssue, onRequest, onStart }: {
  type: 'credential' | 'proof' | 'workflow';
  conn: Connection;
  onClose: () => void;
  onIssue: (name: string, meta: string, credDefId: string, attrs: Record<string, string>) => void;
  onRequest: (meta: string) => void;
  onStart: (name: string, templateId: string) => void;
}) {
  const [credDefs, setCredDefs] = useState<any[]>([]);
  const [wfTemplates, setWfTemplates] = useState<any[]>([]);
  const [selectedCredDef, setSelectedCredDef] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedAttrs, setSelectedAttrs] = useState<string[]>([]);
  const [schemaAttrs, setSchemaAttrs] = useState<string[]>([]);
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaResolved, setSchemaResolved] = useState(false);
  const [schemaError, setSchemaError] = useState(false);
  const [manualRows, setManualRows] = useState<{ key: string; val: string }[]>([{ key: '', val: '' }]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (type === 'credential') {
      credentialDefinitionApi.getAll().then((res: any) => {
        const defs = res.credentialDefinitions || res.definitions || [];
        setCredDefs(defs);
        // no auto-selection — user must explicitly choose
      }).catch(() => { });
    }
    if (type === 'workflow') {
      workflowApi.listTemplates().then((res: any) => {
        const ts = res.templates || [];
        setWfTemplates(ts);
        if (ts.length > 0) setSelectedTemplate(ts[0].template_id || ts[0].id);
      }).catch(() => { });
    }
  }, [type]);

  useEffect(() => {
    if (type !== 'credential' || !selectedCredDef) {
      setSchemaAttrs([]);
      setAttrValues({});
      setSchemaResolved(false);
      setSchemaError(false);
      return;
    }
    const def = credDefs.find((d: any) => (d.credentialDefinitionId || d.id) === selectedCredDef);
    if (!def) return;

    setSchemaResolved(false);
    setSchemaError(false);
    setManualRows([{ key: '', val: '' }]);

    // OID4VC/mdoc defs store schema attrs directly; for AnonCreds fetch from schema
    const direct: string[] = def.schemaAttributes || def.attributes || [];
    if (direct.length > 0) {
      setSchemaAttrs(direct);
      setAttrValues(Object.fromEntries(direct.map((a: string) => [a, ''])));
      setSchemaResolved(true);
      return;
    }

    // AnonCreds: look up schema to get attrNames
    const schemaId = def.credentialDefinition?.schemaId || def.schemaId;
    if (!schemaId) {
      setSchemaAttrs([]);
      setAttrValues({});
      setSchemaResolved(true);
      return;
    }
    setSchemaLoading(true);
    import('@/lib/api').then(({ schemaApi }) =>
      schemaApi.getBySchemaId(schemaId)
        .then((res: any) => {
          const attrs: string[] = res?.schema?.attrNames || res?.attrNames || [];
          setSchemaAttrs(attrs);
          setAttrValues(Object.fromEntries(attrs.map((a: string) => [a, ''])));
          setSchemaResolved(true);
        })
        .catch(() => { setSchemaError(true); })
        .finally(() => setSchemaLoading(false))
    );
  }, [selectedCredDef, credDefs, type]);

  const META = {
    credential: { title: 'Issue Credential', icon: 'badge' as const, tone: 'blue', cta: 'Send offer' },
    proof: { title: 'Request Proof', icon: 'shieldCheck' as const, tone: 'violet', cta: 'Send request' },
    workflow: { title: 'Start Workflow', icon: 'workflow' as const, tone: 'green', cta: 'Start workflow' },
  }[type];

  const submit = async () => {
    setSubmitting(true);
    try {
      if (type === 'credential') {
        const def = credDefs.find((d: any) => (d.credentialDefinitionId || d.id) === selectedCredDef);
        const attrs = useManualEntry
          ? Object.fromEntries(manualRows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.val.trim()]))
          : attrValues;
        onIssue(
          def?.overlay?.meta?.name || def?.name || def?.tag || def?.credentialDefinition?.tag || selectedCredDef.split(':').filter(Boolean).slice(-2, -1)[0] || selectedCredDef,
          selectedCredDef,
          selectedCredDef,
          attrs,
        );
      }
      if (type === 'proof') {
        onRequest(selectedAttrs.join(', ').toLowerCase());
      }
      if (type === 'workflow') {
        const t = wfTemplates.find((w: any) => (w.template_id || w.id) === selectedTemplate);
        onStart(t?.name || selectedTemplate, t?.template_id || selectedTemplate);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const useManualEntry = schemaError || (schemaResolved && schemaAttrs.length === 0);
  const allAttrsFilled = schemaAttrs.every(a => attrValues[a]?.trim());
  const manualAttrsFilled = manualRows.length > 0 && manualRows.every(r => r.key.trim() && r.val.trim());
  const canSubmit =
    type === 'credential'
      ? !!selectedCredDef && !schemaLoading && (
          useManualEntry ? manualAttrsFilled : (schemaResolved && allAttrsFilled)
        )
      :
      type === 'proof' ? selectedAttrs.length > 0 :
        !!selectedTemplate;

  return (
    <>
      <div className="cdp-dh">
        <span className={`cdp-ico ${META.tone}`}><Icon name={META.icon} size={17} /></span>
        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
          <div className="cdp-dh-name">{META.title}</div>
          <div className="cdp-dh-sub">to <b style={{ color: 'var(--ink-2)' }}>{conn.theirLabel}</b></div>
        </div>
        <button className="cdp-icon-btn sm" onClick={onClose} title="Close"><Icon name="close" size={15} /></button>
      </div>

      <div className="cdp-dbody">
        {type === 'credential' && (
          <div className="field">
            <div className="cdp-field-label">Credential template</div>
            {credDefs.length === 0
              ? <div className="cdp-quiet">No credential definitions found.</div>
              : (
                <div className="cdp-choices">
                  {credDefs.map((d: any) => {
                    const id = d.credentialDefinitionId || d.id;
                    const nm = d.overlay?.meta?.name || d.name || d.tag || d.credentialDefinition?.tag || id.split(':').filter(Boolean).slice(-2, -1)[0] || id;
                    return (
                      <button key={id} className={`cdp-choice${selectedCredDef === id ? ' on' : ''}`} onClick={() => setSelectedCredDef(id)}>
                        <span className="cdp-ico blue"><Icon name="badge" size={15} /></span>
                        <span className="cdp-choice-mid">
                          <span className="cdp-choice-n">{nm}</span>
                          <span className="cdp-choice-s mono">{id.slice(0, 40)}</span>
                        </span>
                        <span className={`cdp-radio${selectedCredDef === id ? ' on' : ''}`} />
                      </button>
                    );
                  })}
                </div>
              )
            }
            {selectedCredDef && (
              <div style={{ marginTop: 16 }}>
                {schemaLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-4)', fontSize: 13 }}>
                    <div className="spinner" style={{ width: 14, height: 14, flexShrink: 0 }} />
                    Loading attribute fields…
                  </div>
                ) : useManualEntry ? (
                  <div>
                    <div className="cdp-field-label" style={{ marginBottom: 6 }}>
                      Attribute values
                      {schemaError && <span style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 400 }}> (schema unavailable — enter manually)</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {manualRows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            className="input"
                            style={{ flex: 1 }}
                            value={row.key}
                            onChange={e => setManualRows(prev => prev.map((r, j) => j === i ? { ...r, key: e.target.value } : r))}
                            placeholder="Attribute name"
                          />
                          <input
                            className="input"
                            style={{ flex: 1 }}
                            value={row.val}
                            onChange={e => setManualRows(prev => prev.map((r, j) => j === i ? { ...r, val: e.target.value } : r))}
                            placeholder="Value"
                          />
                          {manualRows.length > 1 && (
                            <button className="cdp-icon-btn sm" onClick={() => setManualRows(prev => prev.filter((_, j) => j !== i))} title="Remove">
                              <Icon name="close" size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: 6, fontSize: 12 }}
                      onClick={() => setManualRows(prev => [...prev, { key: '', val: '' }])}
                    >
                      + Add attribute
                    </button>
                  </div>
                ) : schemaAttrs.length > 0 ? (
                  <>
                    <div className="cdp-field-label">Attribute values</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {schemaAttrs.map(attr => (
                        <div key={attr} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <label style={{ fontSize: 12, color: 'var(--ink-3)' }}>{attr}</label>
                          <input
                            className="input"
                            value={attrValues[attr] || ''}
                            onChange={e => setAttrValues(prev => ({ ...prev, [attr]: e.target.value }))}
                            placeholder={`Enter ${attr}…`}
                          />
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        )}

        {type === 'workflow' && (
          <div className="field">
            <div className="cdp-field-label">Workflow template</div>
            {wfTemplates.length === 0
              ? <div className="cdp-quiet">No workflow templates found.</div>
              : (
                <div className="cdp-choices">
                  {wfTemplates.map((t: any) => {
                    const id = t.template_id || t.id;
                    const nm = t.name || id;
                    return (
                      <button key={id} className={`cdp-choice${selectedTemplate === id ? ' on' : ''}`} onClick={() => setSelectedTemplate(id)}>
                        <span className="cdp-ico green"><Icon name="workflow" size={15} /></span>
                        <span className="cdp-choice-mid">
                          <span className="cdp-choice-n">{nm}</span>
                          <span className="cdp-choice-s">{t.description || ''}</span>
                        </span>
                        <span className={`cdp-radio${selectedTemplate === id ? ' on' : ''}`} />
                      </button>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {type === 'proof' && (
          <div className="field">
            <div className="cdp-field-label">Attributes to request</div>
            <div className="cdp-quiet" style={{ marginBottom: 10 }}>
              Enter attribute names to request from this connection.
            </div>
            <AddableAttrs selected={selectedAttrs} onChange={setSelectedAttrs} />
            {selectedAttrs.length > 0 && (
              <div className="cdp-field-hint">{selectedAttrs.length} attribute{selectedAttrs.length === 1 ? '' : 's'} · selective disclosure over DIDComm.</div>
            )}
          </div>
        )}

        <div className="cdp-deliver">
          <Icon name="send" size={13} />
          Delivered over the existing {conn.enc === 'KEM-Active' ? 'KEM-encrypted ' : ''}DIDComm channel.
        </div>
      </div>

      <div className="cdp-dfoot end">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-accent" onClick={submit} disabled={!canSubmit || submitting}>
          <Icon name="send" size={14} />
          {submitting ? 'Sending…' : META.cta}
        </button>
      </div>
    </>
  );
}

function AddableAttrs({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const t = input.trim();
    if (t && !selected.includes(t)) onChange([...selected, t]);
    setInput('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="input"
          placeholder="e.g. full_name"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ flex: 1 }}
        />
        <button className="btn btn-secondary btn-sm" onClick={add} disabled={!input.trim()}>Add</button>
      </div>
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selected.map(a => (
            <span key={a} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 10px', background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderRadius: 99, fontSize: 12.5, fontWeight: 500 }}>
              {a}
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-ink)', padding: 0, lineHeight: 1 }} onClick={() => onChange(selected.filter(x => x !== a))}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Drawer Shell ─────────────────────────────────────────────────────────────

function CdpDrawer({ drawer, conn, onClose, onCall, onIssue, onRequest, onStart, onToast, onRemove }: {
  drawer: DrawerState;
  conn: Connection;
  onClose: () => void;
  onCall: () => void;
  onIssue: (name: string, meta: string, credDefId: string, attrs: Record<string, string>) => void;
  onRequest: (meta: string) => void;
  onStart: (name: string, templateId: string) => void;
  onToast: (msg: string, undo?: () => void) => void;
  onRemove: (id: string) => void;
}) {
  const isItem = drawer && typeof drawer === 'object';
  return (
    <div className="cdp-scrim" onClick={onClose}>
      <div className="cdp-drawer" onClick={e => e.stopPropagation()}>
        {isItem
          ? <CdpItemDetail item={(drawer as { item: ConnItem }).item} conn={conn} onClose={onClose} onToast={onToast} onRemove={onRemove} />
          : drawer === 'message'
            ? <CdpMessage conn={conn} onClose={onClose} onCall={onCall} />
            : <CdpAction type={drawer as 'credential' | 'proof' | 'workflow'} conn={conn} onClose={onClose} onIssue={onIssue} onRequest={onRequest} onStart={onStart} />
        }
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConnectionDetailPage() {
  const params = useParams();
  const connectionId = params.connectionId as string;
  const router = useRouter();
  const { tenantId } = useAuth();
  const { startCall } = useCall();

  const [conn, setConn] = useState<Connection | null>(null);
  const [items, setItems] = useState<ConnItem[]>([]);
  const [tab, setTab] = useState('all');
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [kemStatus, setKemStatus] = useState<{ hasLocalKey: boolean; hasPeerKey: boolean; ready: boolean; hasPendingRequest?: boolean } | null>(null);
  const [isExchangingKeys, setIsExchangingKeys] = useState(false);
  const [isAcceptingKeys, setIsAcceptingKeys] = useState(false);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const flash = (msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4200);
  };

  useEffect(() => {
    if (!tenantId || !connectionId) return;
    setLoading(true);
    Promise.all([
      connectionApi.getById(connectionId),
      credentialApi.getAll(),
      proofApi.getAll(),
      workflowApi.listInstances(connectionId).catch(() => ({ instances: [] })),
      connectionApi.getKemStatus(connectionId).catch(() => ({ status: null })),
      pdfSigningApi.getStatus().catch(() => ({ vaults: {} })),
    ]).then(([connRes, credRes, proofRes, wfRes, kemRes, pdfRes]: any[]) => {
      if (connRes.success && connRes.connection) {
        const ks = kemRes?.status ?? null;
        setKemStatus(ks);
        setConn({ ...connRes.connection, enc: ks?.ready ? 'KEM-Active' : undefined });
      }
      const creds = mapCredentials(credRes.credentials || credRes.records || [], connectionId);
      const proofs = mapProofs(proofRes.proofs || proofRes.records || [], connectionId);
      const wfs = mapWorkflows(wfRes.instances || []);
      const pdfs = mapPdfs(pdfRes.vaults || {}, connectionId);
      setItems([...creds, ...proofs, ...wfs, ...pdfs]);
    }).catch(console.error).finally(() => setLoading(false));
  }, [tenantId, connectionId]);

  const copyDid = () => {
    const did = conn?.theirDid;
    if (did) { try { navigator.clipboard.writeText(did); } catch { } }
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  };

  const handleCall = () => {
    if (conn) {
      startCall({ id: conn.id, theirLabel: conn.theirLabel, state: conn.state });
    }
    setDrawer(null);
  };

  const add = (it: Omit<ConnItem, 'id' | 'date'>) => {
    const id = 'new-' + Date.now();
    setItems(s => [{ id, date: 'Just now', ...it } as ConnItem, ...s]);
    return id;
  };

  const onIssue = async (name: string, _meta: string, credDefId: string, attrs: Record<string, string>) => {
    const id = add({ type: 'credential', name, meta: credDefId, status: 'offer-sent', flow: 'sent', owner: 'them' });
    flash('Credential offer sent to ' + conn?.theirLabel, () => {
      setItems(s => s.filter(i => i.id !== id));
      setToast(null);
    });
    try {
      await credentialApi.issue(connectionId, credDefId, attrs);
    } catch (e) {
      console.error('Issue credential failed', e);
    }
  };

  const onRequest = async (meta: string) => {
    const id = add({ type: 'proof', name: 'Proof request', meta, status: 'request-sent', flow: 'sent', owner: 'them' });
    flash('Proof request sent to ' + conn?.theirLabel, () => {
      setItems(s => s.filter(i => i.id !== id));
      setToast(null);
    });
    try {
      const attrList = meta.split(', ').filter(Boolean).map(name => ({ name }));
      await proofApi.requestProof(connectionId, attrList);
    } catch (e) {
      console.error('Request proof failed', e);
    }
  };

  const onStart = async (name: string, templateId: string) => {
    const id = add({ type: 'workflow', name, meta: 'Starting…', status: 'active', flow: 'sent', owner: 'them' });
    flash(`Workflow "${name}" started`, () => {
      setItems(s => s.filter(i => i.id !== id));
      setToast(null);
    });
    try {
      await workflowApi.start({ template_id: templateId, connection_id: connectionId });
    } catch (e) {
      console.error('Start workflow failed', e);
    }
  };

  const onRemove = (id: string) => setItems(s => s.filter(i => i.id !== id));

  const handleDeleteConnection = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await connectionApi.delete(connectionId);
      router.push('/dashboard/connections');
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete connection');
      setIsDeleting(false);
    }
  };

  const handleExchangeKeys = async () => {
    setIsExchangingKeys(true);
    try {
      const res: any = await connectionApi.exchangeKeys(connectionId);
      if (res.success) {
        setKemStatus(res.status);
        setConn(c => c ? { ...c, enc: res.status?.ready ? 'KEM-Active' : c.enc } : c);
        flash('Key exchange initiated — waiting for peer to accept.');
      }
    } catch (err: any) {
      flash(err.message || 'Key exchange failed');
    } finally {
      setIsExchangingKeys(false);
    }
  };

  const handleAcceptKeyExchange = async () => {
    setIsAcceptingKeys(true);
    try {
      const res: any = await connectionApi.acceptKeyExchange(connectionId);
      if (res.success) {
        setKemStatus({ ...res.status, hasPendingRequest: false, pendingRequest: null });
        setConn(c => c ? { ...c, enc: res.status?.ready ? 'KEM-Active' : c.enc } : c);
        flash('Key exchange accepted — channel is now KEM-encrypted.');
      }
    } catch (err: any) {
      flash(err.message || 'Failed to accept key exchange');
    } finally {
      setIsAcceptingKeys(false);
    }
  };

  const activeCount = (t: string) => items.filter(i => (t === 'all' || i.type === t) && isActive(i)).length;
  const totalCount = (t: string) => t === 'all' ? items.length : items.filter(i => i.type === t).length;

  if (loading) {
    return (
      <div className="cdp-root">
        <div className="empty"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
      </div>
    );
  }

  if (!conn) {
    return (
      <div className="cdp-root">
        <div className="empty">
          <div className="empty-title">Connection not found</div>
          <button className="btn btn-secondary" onClick={() => router.push('/dashboard/connections')}>Back to Connections</button>
        </div>
      </div>
    );
  }

  const label = conn.theirLabel || 'Unknown';
  const avatarClass = getAvatarClass(label);
  const isComplete = conn.state === 'completed' || conn.state === 'complete';

  return (
    <div className="cdp-root">
      {/* Header */}
      <div className="cdp-head">
        <button className="cdp-back" onClick={() => router.push('/dashboard/connections')}>
          <Icon name="arrowRight" size={15} />
          Connections
        </button>

        <div className="cdp-id-row">
          <div className={`avatar avatar-lg ${avatarClass}`}>
            {label.slice(0, 2).toUpperCase()}
          </div>
          <div className="cdp-id-mid">
            <div className="cdp-name-row">
              <span className="cdp-name">{label}</span>
              <span className={`badge ${isComplete ? 'green' : 'amber'}`}>
                <span className="badge-dot" />{conn.state}
              </span>
            </div>
            {conn.theirDid && (
              <button className="cdp-did" onClick={copyDid} title="Copy DID">
                <span className="mono">{conn.theirDid.slice(0, 32)}…</span>
                <span className="cdp-copy">
                  <Icon name={copied ? 'check' : 'copy'} size={13} />
                </span>
                {copied && <span className="cdp-copied" role="status">Copied</span>}
              </button>
            )}
          </div>

          <div className="cdp-actions">
            {isComplete && (
              <>
                <button className="cdp-icon-btn" onClick={() => setDrawer('message')} title="Message">
                  <Icon name="msg" size={16} />
                </button>
                <button className="cdp-icon-btn" onClick={handleCall} title="Video call">
                  <Icon name="video" size={16} />
                </button>
                <div className="cdp-sep" />
                <button className="btn btn-secondary btn-sm" onClick={() => setDrawer('proof')}>
                  <Icon name="shieldCheck" size={14} /> Request Proof
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setDrawer('workflow')}>
                  <Icon name="workflow" size={14} /> Start Workflow
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/dashboard/pdf-signing?connection=${connectionId}`)}>
                  <Icon name="fileSig" size={14} /> Send PDF
                </button>
                <button className="btn btn-accent btn-sm" onClick={() => setDrawer('credential')}>
                  <Icon name="plus" size={14} /> Issue Credential
                </button>
                <div className="cdp-sep" />
              </>
            )}
            {/* Exchange Keys + Delete — stacked column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' }}>
              {isComplete && kemStatus && !kemStatus.ready && (
                kemStatus.hasPendingRequest ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleAcceptKeyExchange}
                    disabled={isAcceptingKeys}
                  >
                    <Icon name="lock" size={14} />
                    {isAcceptingKeys ? 'Accepting…' : 'Accept Key Exchange'}
                  </button>
                ) : kemStatus.hasLocalKey ? (
                  <button className="btn btn-secondary btn-sm" disabled>
                    <Icon name="lock" size={14} /> Awaiting Peer
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleExchangeKeys}
                    disabled={isExchangingKeys}
                  >
                    <Icon name="lock" size={14} />
                    {isExchangingKeys ? 'Initiating…' : 'Exchange Keys'}
                  </button>
                )
              )}
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--red, #ef4444)' }}
                onClick={() => { setDeleteError(null); setShowDeleteModal(true); }}
              >
                <Icon name="trash" size={14} /> Delete Connection
              </button>
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div className="cdp-tabs">
          {TABS.map(([id, lbl, ic]) => {
            const ac = activeCount(id), total = totalCount(id);
            return (
              <button
                key={id}
                className={`cdp-tab${tab === id ? ' on' : ''}`}
                onClick={() => setTab(id)}
                title={ac > 0 ? ac + ' need attention' : total + ' total'}
              >
                <Icon name={ic} size={15} />
                {lbl}
                {ac > 0
                  ? <span className="cdp-tab-count attn">{ac}</span>
                  : <span className="cdp-tab-count">{total}</span>
                }
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="cdp-body">
        <div className="cdp-content">
          <DetailContent
            key={connectionId + tab}
            items={items}
            tab={tab}
            onOpenItem={it => setDrawer({ item: it })}
            onRemind={it => {
              const msg = it.type === 'pdf'
                ? `Reminder: Please sign the document "${it.name}".`
                : it.type === 'credential'
                ? `Reminder: Please accept the credential offer.`
                : it.type === 'proof'
                ? `Reminder: Please respond to the proof request.`
                : `Reminder: Action needed.`;
              connectionApi.sendMessage(connectionId, msg).catch(console.error);
              flash('Reminder sent to ' + label);
            }}
          />
        </div>
      </div>

      {/* Drawer */}
      {drawer && (
        <CdpDrawer
          drawer={drawer}
          conn={conn}
          onClose={() => setDrawer(null)}
          onCall={handleCall}
          onIssue={onIssue}
          onRequest={onRequest}
          onStart={onStart}
          onToast={flash}
          onRemove={onRemove}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="cdp-toast">
          <Icon name="checkCircle" size={15} />
          {toast.msg}
          {toast.undo && (
            <button className="cdp-toast-undo" onClick={toast.undo}>Undo</button>
          )}
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div className="modal-backdrop" onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div className="modal-container" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Delete Connection</h2>
              <button
                className="modal-close-button"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 8 }}>
                Are you sure you want to delete the connection with <strong>{conn?.theirLabel || 'this peer'}</strong>?
              </p>
              <p style={{ fontSize: 13, color: 'var(--ink-4)' }}>
                This will permanently remove the connection record. Any credentials or proofs exchanged over this connection will remain.
              </p>
              {deleteError && (
                <div className="alert alert-error" style={{ marginTop: 12 }}>
                  <span>{deleteError}</span>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '0 24px 20px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: 'var(--red, #ef4444)', color: 'white', border: 'none' }}
                onClick={handleDeleteConnection}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <><span className="spinner" style={{ width: 14, height: 14 }} /> Deleting…</>
                ) : (
                  'Delete Connection'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
