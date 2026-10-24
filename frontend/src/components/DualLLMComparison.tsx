import React from 'react';
import type { LLMAnalysis, ArbitrationResult } from '../types';
import { CheckCircle2, AlertTriangle, XCircle, Sparkles, ShieldAlert, Cpu } from 'lucide-react';

interface Props {
  analyses: LLMAnalysis[];
  arbitration?: ArbitrationResult;
}

function matchStatus(a: any, b: any): 'match' | 'fuzzy' | 'mismatch' {
  if (a === b) return 'match';
  if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.toLowerCase().trim() === b.toLowerCase().trim()
  ) {
    return 'fuzzy';
  }
  // Numerical comparison (tolerating floating point rounding)
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.01) {
    return 'match';
  }
  return 'mismatch';
}

const statusColor = {
  match: 'bg-emerald-50/70 border-emerald-200 text-slate-800',
  fuzzy: 'bg-amber-50/70 border-amber-200 text-slate-800',
  mismatch: 'bg-rose-50 border-rose-200 text-rose-950 font-medium',
};

const DualLLMComparison: React.FC<Props> = ({ analyses, arbitration }) => {
  // Separate individual models from arbitration consensus record
  const standardAnalyses = analyses.filter((a) => a.model_name !== 'arbitration_consensus');
  const modelA = standardAnalyses[0];
  const modelB = standardAnalyses[1];

  // If arbitration not provided directly via props, check if stored in analyses
  const storedArbitration = analyses.find((a) => a.model_name === 'arbitration_consensus');
  const effectiveArbitration: ArbitrationResult | undefined =
    arbitration ||
    (storedArbitration?.raw_response ? JSON.parse(storedArbitration.raw_response) : undefined);

  if (!modelA) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-xs">
        <Cpu className="mx-auto h-10 w-10 text-slate-300" />
        <h3 className="mt-3 text-sm font-semibold text-slate-700">No Dual-LLM Analysis Found</h3>
        <p className="mt-1 text-xs text-slate-500">
          Click the <span className="font-semibold text-indigo-600">"Analyze"</span> button to run
          independent extraction (Model A) and fraud auditing (Model B).
        </p>
      </div>
    );
  }

  const extractedA = modelA.extracted_data ?? {};
  const extractedB = modelB?.extracted_data ?? {};

  // Check if live or demo
  const isDemoA =
    modelA.risk_flags?.some((f: string) => f.includes('[DEMO MODE]') || f.includes('_mock')) ||
    modelA.model_name.includes('demo') ||
    modelA.model_name.includes('heuristic');
  const isDemoB =
    modelB?.risk_flags?.some((f: string) => f.includes('[DEMO MODE]') || f.includes('_mock')) ||
    modelB?.model_name.includes('demo') ||
    modelB?.model_name.includes('heuristic');

  // Fields to compare
  const candidateKeys = [
    'vendor_name',
    'vendor_tax_id',
    'invoice_number',
    'invoice_date',
    'due_date',
    'currency',
    'subtotal',
    'tax_amount',
    'total_amount',
    'payment_terms',
    'bank_details',
  ];
  const allKeys = Array.from(
    new Set([
      ...candidateKeys,
      ...Object.keys(extractedA).filter((k) => k !== 'line_items' && k !== 'provider_info'),
      ...Object.keys(extractedB).filter((k) => k !== 'line_items' && k !== 'provider_info'),
    ])
  ).filter((k) => k !== 'line_items' && k !== 'provider_info');

  return (
    <div className="space-y-6">
      {/* Mode / Authenticity Banner */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50/30 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">
              Dual-Model Independent Analysis Engine
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                !isDemoA
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              Model A: {!isDemoA ? 'Live Gemini / Cloud' : 'Demo Local Engine'}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                !isDemoB
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              Model B: {!isDemoB ? 'Live OpenRouter / Cloud' : 'Demo Local Engine'}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Model A extracts structural invoice data independently. Model B audits risk, contractual
          terms, and bank alterations in parallel without cross-contamination.
        </p>
      </div>

      {/* Model Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Model A Card */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
              Model A &middot; Extraction Specialist
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                !isDemoA ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {!isDemoA ? 'Live Inference' : 'Local Heuristic'}
            </span>
          </div>
          <h4 className="mt-1 text-base font-semibold text-slate-900">{modelA.model_name}</h4>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-600">
              <span>Extraction Confidence</span>
              <span className="font-semibold text-slate-900">
                {(modelA.confidence_score * 100).toFixed(0)}%
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${(modelA.confidence_score * 100).toFixed(0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Model B Card */}
        {modelB && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-600">
                Model B &middot; Auditor & Risk Analyst
              </span>
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  !isDemoB ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {!isDemoB ? 'Live Inference' : 'Local Heuristic'}
              </span>
            </div>
            <h4 className="mt-1 text-base font-semibold text-slate-900">{modelB.model_name}</h4>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Auditor Confidence</span>
                <span className="font-semibold text-slate-900">
                  {(modelB.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-violet-600 transition-all duration-500"
                  style={{ width: `${(modelB.confidence_score * 100).toFixed(0)}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Field Comparison Table */}
      {modelB && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-3">
            <h4 className="text-sm font-semibold text-slate-800">
              Field-by-Field Cross Verification Diff
            </h4>
            <p className="text-xs text-slate-500">
              Green indicates consensus. Red highlights critical model discrepancies requiring
              arbitration.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/40 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Field</th>
                  <th className="px-5 py-3">Model A (Extractor)</th>
                  <th className="px-5 py-3">Model B (Auditor)</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allKeys.map((key) => {
                  const valA = extractedA[key];
                  const valB = extractedB[key];
                  const status = matchStatus(valA, valB);
                  return (
                    <tr key={key} className={`transition-colors ${statusColor[status]}`}>
                      <td className="px-5 py-3 font-medium capitalize text-slate-900">
                        {key.replace(/_/g, ' ')}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {valA !== undefined && valA !== '' ? String(valA) : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {valB !== undefined && valB !== '' ? String(valB) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        {status === 'match' && (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                            <CheckCircle2 size={12} /> Match
                          </span>
                        )}
                        {status === 'fuzzy' && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            <AlertTriangle size={12} /> Format diff
                          </span>
                        )}
                        {status === 'mismatch' && (
                          <span className="inline-flex items-center gap-1 rounded bg-rose-200 px-2 py-0.5 text-xs font-bold text-rose-900">
                            <XCircle size={12} /> Discrepancy
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Risk Flags & Audit Observations */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[modelA, modelB].filter(Boolean).map((model) => (
          <div key={model!.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-slate-600" />
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Observations & Flags &middot; {model!.model_name}
              </h5>
            </div>
            {model!.risk_flags.length === 0 ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                <CheckCircle2 size={16} /> No risk factors or contractual anomalies detected
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {model!.risk_flags.map((flag, i) => (
                  <li
                    key={i}
                    className={`flex items-start gap-2 rounded-lg p-2.5 text-xs leading-relaxed ${
                      flag.includes('[DEMO MODE]')
                        ? 'bg-slate-50 text-slate-600 border border-slate-200'
                        : flag.includes('CRITICAL') || flag.includes('HIGH RISK')
                        ? 'bg-rose-50 text-rose-800 border border-rose-200 font-medium'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Arbitration Consensus Result */}
      {effectiveArbitration && (
        <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-violet-50/50 p-5 shadow-xs">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h4 className="text-sm font-bold text-indigo-900">
                Consensus & Arbitration Decision
              </h4>
              <p className="text-xs text-indigo-700">
                Automated field reconciliation engine comparing Model A vs Model B
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-indigo-600">Consensus Score</p>
                <p className="text-lg font-extrabold text-indigo-950">
                  {(effectiveArbitration.overall_confidence * 100).toFixed(0)}%
                </p>
              </div>
              <span
                className={`rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  effectiveArbitration.recommendation === 'APPROVED'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500 text-white'
                }`}
              >
                {effectiveArbitration.recommendation}
              </span>
            </div>
          </div>

          {effectiveArbitration.discrepancies.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3">
              <h5 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                Discrepancies Arbitrated ({effectiveArbitration.discrepancies.length})
              </h5>
              <ul className="mt-2 space-y-1.5 text-xs text-amber-900">
                {effectiveArbitration.discrepancies.map((d, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <XCircle size={14} className="text-rose-600 shrink-0" />
                    <span className="font-semibold capitalize">{d.field.replace(/_/g, ' ')}:</span>
                    <span>Model A: {String(d.model_a)}</span>
                    <span className="text-slate-400">vs</span>
                    <span>Model B: {String(d.model_b)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DualLLMComparison;
