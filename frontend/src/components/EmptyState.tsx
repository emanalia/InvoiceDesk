import React from 'react';
import { Inbox } from 'lucide-react';

interface Props {
  title?: string;
  message?: string;
}

const EmptyState: React.FC<Props> = ({
  title = 'No data yet',
  message = "There's nothing here right now.",
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
    <Inbox size={48} strokeWidth={1.5} />
    <h3 className="mt-4 text-lg font-semibold text-slate-600">{title}</h3>
    <p className="mt-1 text-sm">{message}</p>
  </div>
);

export default EmptyState;
