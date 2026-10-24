import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  XCircle,
  X,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { getInvoice, analyzeInvoice, approveInvoice, rejectInvoice } from '../services/api';
import type { Invoice } from '../types';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import DualLLMComparison from '../components/DualLLMComparison';
import DeterministicChecklist from '../components/DeterministicChecklist';
import AuditTimeline from '../components/AuditTimeline';

type Tab = 'overview' | 'line_items' | 'ai' | 'verification' | 'ocr' | 'audit';

const tabs: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'line_items', label: 'Line Items' },
  { key: 'ai', label: 'Dual-AI Analysis' },
  { key: 'verification', label: '8-Point Checks' },
  { key: 'ocr', label: 'Document OCR Text' },
  { key: 'audit', label: 'Audit Trail' },
];

const InvoiceDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedTenant } = useTenant();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [analyzing, setAnalyzing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    if (!selectedTenant || !id) return;
    setLoading(true);
    try {
      const data = await getInvoice(selectedTenant.id, id);
      setInvoice(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant, id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAnalyze = async () => {
    if (!selectedTenant || !id) return;
    setAnalyzing(true);
    try {
      await analyzeInvoice(selectedTenant.id, id);
      await load();
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedTenant || !id) return;
    setActionLoading(true);
    try {
      await approveInvoice(selectedTenant.id, id);
      await load();
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedTenant || !id) return;
    setActionLoading(true);
    try {
      await rejectInvoice(selectedTenant.id, id, rejectReason);
      setRejectOpen(false);
      setRejectReason('');
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

  if (loading) return <LoadingSpinner className="mt-24" size={32} />;
  if (!invoice) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-16 text-center text-slate-500">
        Invoice not found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {invoice.invoice_number}
              </h1>
              <StatusBadge status={invoice.status} />
            </div>
            <p className="text-xs text-slate-500">
              {invoice.vendor_name} &middot; Added {new Date(invoice.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {invoice.status === 'PENDING' && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50"
            >
              {analyzing ? <LoadingSpinner size={14} /> : <Zap size={14} />}
              Run Dual-AI Analysis
            </button>
          )}
          {(invoice.status === 'PENDING' || invoice.status === 'NEEDS_REVIEW') && (
            <>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> Approve & Dispatch
              </button>
              <button
                onClick={() => setRejectOpen(true)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
              >
                <XCircle size={14} /> Reject
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex overflow-x-auto gap-1 border-b border-slate-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-xs font-bold transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Metadata */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900">Invoice Information</h3>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3.5 text-xs sm:text-sm">
                <dt className="text-slate-500">Invoice Number</dt>
                <dd className="font-semibold text-slate-800">{invoice.invoice_number}</dd>
                <dt className="text-slate-500">Ingestion Channel</dt>
                <dd className="capitalize text-slate-700">{invoice.source}</dd>
                <dt className="text-slate-500">Original Scan</dt>
                <dd className="font-mono text-slate-700">{invoice.original_filename || '—'}</dd>
                <dt className="text-slate-500">Invoice Date</dt>
                <dd className="text-slate-700">
                  {new Date(invoice.invoice_date).toLocaleDateString()}
                </dd>
                <dt className="text-slate-500">Due Date</dt>
                <dd className="text-slate-700">
                  {new Date(invoice.due_date).toLocaleDateString()}
                </dd>
                <dt className="text-slate-500">Currency</dt>
                <dd className="font-semibold text-slate-800">{invoice.currency}</dd>
              </dl>
            </div>

            {/* Vendor & Amounts */}
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900">Vendor Profile</h3>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3.5 text-xs sm:text-sm">
                  <dt className="text-slate-500">Vendor Name</dt>
                  <dd className="font-semibold text-slate-800">{invoice.vendor_name}</dd>
                  <dt className="text-slate-500">Billing Email</dt>
                  <dd className="text-slate-700">{invoice.vendor_email || '—'}</dd>
                  <dt className="text-slate-500">Tax ID</dt>
                  <dd className="font-mono text-slate-700">{invoice.vendor_tax_id || '—'}</dd>
                </dl>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900">Financial Breakdown</h3>
                <dl className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd className="font-semibold text-slate-800">
                      {formatCurrency(invoice.subtotal, invoice.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Computed Tax</dt>
                    <dd className="text-slate-800">
                      {formatCurrency(invoice.tax_amount, invoice.currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-3">
                    <dt className="font-bold text-slate-900">Total Billed</dt>
                    <dd className="text-xl font-extrabold text-indigo-950">
                      {formatCurrency(invoice.total_amount, invoice.currency)}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'line_items' && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            {invoice.line_items && invoice.line_items.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3 text-center">Quantity</th>
                    <th className="px-5 py-3 text-right">Unit Price</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.line_items.map((li, idx) => (
                    <tr
                      key={li.id || idx}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="px-5 py-3.5 font-medium text-slate-800">{li.description}</td>
                      <td className="px-5 py-3.5 text-center text-slate-600">{li.quantity}</td>
                      <td className="px-5 py-3.5 text-right font-mono text-slate-700">
                        {formatCurrency(li.unit_price, invoice.currency)}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(li.amount, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-16 text-center text-sm text-slate-400">
                No line items extracted yet. Run Dual-AI Analysis to parse items.
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <DualLLMComparison analyses={invoice.analyses ?? []} />
        )}

        {activeTab === 'verification' && (
          <DeterministicChecklist checks={invoice.deterministic_checks ?? []} />
        )}

        {activeTab === 'ocr' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <FileCode size={18} className="text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Extracted OCR Document Text</h3>
            </div>
            <pre className="mt-4 max-h-[500px] overflow-auto rounded-lg bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800 border border-slate-200 whitespace-pre-wrap">
              {invoice.raw_ocr_text || 'No raw OCR text available.'}
            </pre>
          </div>
        )}

        {activeTab === 'audit' && (
          <AuditTimeline entries={invoice.audit_trail ?? []} />
        )}
      </div>

      {/* Reject Modal */}
      {rejectOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Reject Invoice</h3>
              <button onClick={() => setRejectOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Provide an official compliance explanation for this rejection. This will be permanently recorded in the audit trail.
            </p>
            <textarea
              className="mt-4 w-full rounded-lg border border-slate-300 p-3 text-xs text-slate-800 focus:border-indigo-500 focus:outline-none"
              rows={3}
              placeholder="e.g. Mathematical discrepancy between line items and subtotal"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setRejectOpen(false)}
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

export default InvoiceDetail;
