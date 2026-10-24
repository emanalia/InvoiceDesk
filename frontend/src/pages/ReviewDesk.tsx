import React, { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { getInvoices, approveInvoice, rejectInvoice, getInvoice } from '../services/api';
import type { Invoice } from '../types';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import DualLLMComparison from '../components/DualLLMComparison';
import DeterministicChecklist from '../components/DeterministicChecklist';
import { CheckCircle2, XCircle, ChevronRight, X, ShieldAlert, Sparkles, ArrowRight } from 'lucide-react';

const ReviewDesk: React.FC = () => {
  const { selectedTenant } = useTenant();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!selectedTenant) return;
    setLoading(true);
    try {
      const data = await getInvoices(selectedTenant.id);
      const reviewQueue = data.filter((i) => i.status === 'NEEDS_REVIEW');
      setInvoices(reviewQueue);
      if (reviewQueue.length > 0 && !selected) {
        // Auto-select first in queue
        selectInvoice(reviewQueue[0]);
      } else if (reviewQueue.length === 0) {
        setSelected(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant]);

  useEffect(() => {
    load();
  }, [load]);

  const selectInvoice = async (inv: Invoice) => {
    if (!selectedTenant) return;
    setDetailLoading(true);
    try {
      const detail = await getInvoice(selectedTenant.id, inv.id);
      setSelected(detail);
    } catch {
      setSelected(inv);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selected || !selectedTenant) return;
    setActionLoading(true);
    try {
      await approveInvoice(selectedTenant.id, selected.id);
      setSelected(null);
      await load();
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected || !selectedTenant) return;
    setActionLoading(true);
    try {
      await rejectInvoice(selectedTenant.id, selected.id, rejectReason);
      setRejectModalOpen(false);
      setRejectReason('');
      setSelected(null);
      await load();
    } finally {
      setActionLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat(selectedTenant?.locale || 'en-US', {
      style: 'currency',
      currency: currency || selectedTenant?.default_currency || 'USD',
    }).format(amount);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Review & Arbitration Desk
            </h1>
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
              {invoices.length} Flagged
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Adjudicate invoices flagged by deterministic financial checks or dual-model AI discrepancies.
          </p>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner className="mt-20" size={32} />
      ) : invoices.length === 0 ? (
        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-12 text-center shadow-xs">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h2 className="mt-4 text-base font-bold text-slate-900">Review Queue is Clear!</h2>
          <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
            All invoices for {selectedTenant?.name} have either been automatically approved or verified.
            To test adjudication, analyze a discrepancy or suspicious invoice from the Dashboard.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          {/* Left Column: Queue List */}
          <div className="w-full lg:w-80 shrink-0 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Awaiting Human Adjudication ({invoices.length})
            </h3>
            {invoices.map((inv) => (
              <button
                key={inv.id}
                onClick={() => selectInvoice(inv)}
                className={`w-full text-left rounded-xl border p-4 shadow-2xs transition-all ${
                  selected?.id === inv.id
                    ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-100'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-slate-900">{inv.invoice_number}</span>
                  <StatusBadge status={inv.status} />
                </div>
                <p className="mt-1 text-xs text-slate-600 truncate">{inv.vendor_name}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-bold text-sm text-indigo-950">
                    {formatCurrency(inv.total_amount, inv.currency)}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(inv.invoice_date).toLocaleDateString()}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Right Column: Split Inspection Detail Pane */}
          {selected && (
            <div className="flex-1 space-y-6">
              {detailLoading ? (
                <LoadingSpinner className="mt-20" size={32} />
              ) : (
                <>
                  {/* Action Banner */}
                  <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-lg font-bold text-slate-900">
                          {selected.invoice_number}
                        </h2>
                        <StatusBadge status={selected.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Vendor: <span className="font-semibold text-slate-800">{selected.vendor_name}</span> &middot; Total:{' '}
                        <span className="font-bold text-slate-900">
                          {formatCurrency(selected.total_amount, selected.currency)}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleApprove}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={15} /> Adjudicate & Approve
                      </button>
                      <button
                        onClick={() => setRejectModalOpen(true)}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle size={15} /> Reject
                      </button>
                    </div>
                  </div>

                  {/* Dual-AI Comparison */}
                  <DualLLMComparison analyses={selected.analyses ?? []} />

                  {/* Deterministic Verification Results */}
                  <DeterministicChecklist checks={selected.deterministic_checks ?? []} />

                  {/* Line Items Table */}
                  {selected.line_items && selected.line_items.length > 0 && (
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                      <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                        <h4 className="text-sm font-bold text-slate-800">Extracted Line Items</h4>
                      </div>
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50/30 text-xs font-semibold uppercase text-slate-500">
                            <th className="px-5 py-3">Description</th>
                            <th className="px-5 py-3 text-center">Qty</th>
                            <th className="px-5 py-3 text-right">Price</th>
                            <th className="px-5 py-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selected.line_items.map((li) => (
                            <tr key={li.id}>
                              <td className="px-5 py-3 text-slate-800">{li.description}</td>
                              <td className="px-5 py-3 text-center text-slate-600">{li.quantity}</td>
                              <td className="px-5 py-3 text-right font-mono text-slate-700">
                                {formatCurrency(li.unit_price, selected.currency)}
                              </td>
                              <td className="px-5 py-3 text-right font-mono font-bold text-slate-900">
                                {formatCurrency(li.amount, selected.currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Reject Invoice</h3>
              <button onClick={() => setRejectModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Provide an official compliance reason for this rejection.
            </p>
            <textarea
              className="mt-4 w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              rows={3}
              placeholder="e.g. Discrepancy between stated subtotal and extracted line items."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || actionLoading}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {actionLoading ? 'Recording…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewDesk;
