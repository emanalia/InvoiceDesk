import React from 'react';
import { CheckCircle2, XCircle, Bot, User, FileText } from 'lucide-react';
import type { AuditEntry } from '../types';

interface Props {
  entries: AuditEntry[];
}

function actionIcon(action: string) {
  if (action.toLowerCase().includes('approve'))
    return <CheckCircle2 size={16} className="text-emerald-500" />;
  if (action.toLowerCase().includes('reject'))
    return <XCircle size={16} className="text-red-500" />;
  if (action.toLowerCase().includes('system') || action.toLowerCase().includes('analyz'))
    return <Bot size={16} className="text-blue-500" />;
  if (action.toLowerCase().includes('upload'))
    return <FileText size={16} className="text-indigo-500" />;
  return <User size={16} className="text-slate-400" />;
}

function dotColor(action: string) {
  if (action.toLowerCase().includes('approve')) return 'bg-emerald-500';
  if (action.toLowerCase().includes('reject')) return 'bg-red-500';
  if (action.toLowerCase().includes('system') || action.toLowerCase().includes('analyz'))
    return 'bg-blue-500';
  return 'bg-slate-300';
}

const AuditTimeline: React.FC<Props> = ({ entries }) => {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">
        No audit trail entries yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h4 className="mb-4 text-sm font-semibold text-slate-800">Audit Trail</h4>
      <ol className="relative border-l-2 border-slate-200">
        {sorted.map((entry, idx) => (
          <li key={entry.id} className="mb-6 ml-6 last:mb-0">
            <span
              className={`absolute -left-[9px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${dotColor(
                entry.action,
              )}`}
            />
            <div className="flex items-start gap-2">
              {actionIcon(entry.action)}
              <div>
                <p className="text-sm font-medium text-slate-700">{entry.action}</p>
                <p className="text-xs text-slate-500">
                  by <span className="font-medium">{entry.actor}</span> &middot;{' '}
                  {new Date(entry.created_at).toLocaleString()}
                </p>
                {entry.details && typeof entry.details === 'object' && Object.keys(entry.details).length > 0 && (
                  <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-xs text-slate-500">
                    {JSON.stringify(entry.details)}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};

export default AuditTimeline;
