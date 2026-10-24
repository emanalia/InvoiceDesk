import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from 'lucide-react';
import type { DeterministicCheck } from '../types';

interface Props {
  checks: DeterministicCheck[];
}

const severityIcon = {
  INFO: <CheckCircle2 size={18} className="text-emerald-500" />,
  WARNING: <AlertTriangle size={18} className="text-amber-500" />,
  CRITICAL: <XCircle size={18} className="text-rose-500" />,
};

const humanCheckTitles: Record<string, string> = {
  math_sum_check: '1. Mathematical Summation (Line items sum == Subtotal)',
  tax_rate_sanity: '2. Tax Rate Compliance & Standard Jurisdiction Rates',
  duplicate_invoice: '3. Duplicate Invoice Prevention (Invoice # + Vendor)',
  date_validity: '4. Invoice & Payment Terms Date Validity',
  abnormal_amount: '5. Abnormal Amount & Vendor Spike Detection',
  suspicious_keywords: '6. Suspicious Fraud Keywords & Crypto/Offshore Scans',
  missing_fields: '7. Mandatory Tax, Vendor & Banking Field Completeness',
  line_item_math: '8. Line Item Integrity (Qty × Unit Price == Amount)',
};

const DeterministicChecklist: React.FC<Props> = ({ checks }) => {
  const passed = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const ratio = total > 0 ? passed / total : 0;

  let summaryColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
  if (ratio < 1) summaryColor = 'text-amber-700 bg-amber-50 border-amber-200';
  if (ratio < 0.5) summaryColor = 'text-rose-700 bg-rose-50 border-rose-200';

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-800">
              8-Point Deterministic Financial & Fraud Rule Engine
            </h4>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Strict mathematical and compliance verification executed independently of probabilistic AI
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-bold tracking-tight ${summaryColor}`}
        >
          {passed}/{total} Checks Passed
        </span>
      </div>

      <ul className="divide-y divide-slate-100">
        {checks.map((check) => {
          const title = humanCheckTitles[check.check_name] || check.check_name;
          return (
            <li
              key={check.id}
              className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${
                !check.passed
                  ? check.severity === 'CRITICAL'
                    ? 'bg-rose-50/50'
                    : 'bg-amber-50/40'
                  : 'hover:bg-slate-50/50'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {check.passed ? (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                ) : (
                  severityIcon[check.severity]
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-800">{title}</p>
                  {!check.passed && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        check.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {check.severity}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{check.message}</p>
              </div>
            </li>
          );
        })}
        {checks.length === 0 && (
          <li className="px-5 py-8 text-center text-sm text-slate-400">
            No verification checks have been run yet. Click "Analyze" on the invoice to trigger the 8-point engine.
          </li>
        )}
      </ul>
    </div>
  );
};

export default DeterministicChecklist;
