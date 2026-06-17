import React from 'react';

export function getStatusBadge(status: string): React.JSX.Element {
  switch (status) {
    case 'pending':
      return <span className="badge badge-warning">Pending</span>;
    case 'token_issued':
      return <span className="badge badge-primary">Token Issued</span>;
    case 'credential_request_received':
      return <span className="badge badge-primary">Request Received</span>;
    case 'credential_issued':
      return <span className="badge badge-success">Credential Issued</span>;
    case 'expired':
      return <span className="badge badge-error">Expired</span>;
    case 'received':
      return <span className="badge badge-primary">Processing</span>;
    case 'verified':
      return <span className="badge badge-success">Verified</span>;
    case 'failed':
      return <span className="badge badge-error">Failed</span>;
    default:
      return <span className="badge badge-gray">{status}</span>;
  }
}
