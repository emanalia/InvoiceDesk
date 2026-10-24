import React from 'react';

const riskColors: Record<string, string> = {
  LOW: 'bg-emerald-100 text-emerald-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  HIGH: 'bg-red-100 text-red-700',
};

interface Props {
  level: string;
}

const RiskBadge: React.FC<Props> = ({ level }) => {
  const color = riskColors[level.toUpperCase()] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {level}
    </span>
  );
};

export default RiskBadge;
