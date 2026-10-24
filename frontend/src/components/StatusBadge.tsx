import React from 'react';

const statusConfig: Record<string, { bg: string; text: string; dot?: string }> = {
  PENDING: { bg: 'bg-slate-100', text: 'text-slate-700' },
  PROCESSING: { bg: 'bg-blue-100', text: 'text-blue-700', dot: 'animate-pulse' },
  NEEDS_REVIEW: { bg: 'bg-amber-100', text: 'text-amber-700' },
  APPROVED: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
};

interface Props {
  status: string;
}

const StatusBadge: React.FC<Props> = ({ status }) => {
  const config = statusConfig[status] ?? { bg: 'bg-slate-100', text: 'text-slate-600' };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.bg} ${config.text}`}
    >
      {config.dot && (
        <span className={`inline-block h-1.5 w-1.5 rounded-full bg-current ${config.dot}`} />
      )}
      {status.replace('_', ' ')}
    </span>
  );
};

export default StatusBadge;
