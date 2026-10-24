import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Zap,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  HelpCircle,
  Cpu,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { getInvoices, analyzeInvoice, getProviderStatus } from '../services/api';
import type { Invoice, ProviderStatus, VerificationCase } from '../types';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import InvoiceUploadModal from '../components/InvoiceUploadModal';

type StatusFilter = 'ALL' | Invoice['status'];

const VERIFICATION_CASES: VerificationCase[] = [
  {
    id: 'clean',
    title: 'Case 1: Standard Verified Invoice',
    subtitle: 'INV-2024-001 · TechSupply Inc.',
    invoiceNumber: 'INV-2024-001',
    expectedStatus: 'APPROVED',
    riskLevel: 'LOW',
    description: 'Line-item mathematical match, verified tax identifier, standard terms. Successfully passes all 8 verification checks.',
    tags: ['Math Validated', 'Tax Verified', 'Auto-Approved'],
  },
  {
    id: 'discrepancy',
    title: 'Case 2: Mathematical Discrepancy',
    subtitle: 'INV-2024-002 · DataFlow Systems',
    invoiceNumber: 'INV-2024-002',
    expectedStatus: 'NEEDS_REVIEW',
    riskLevel: 'MEDIUM',
    description: 'Line items sum to 3,200.00 while stated subtotal is 3,500.00. Deterministic rule triggers routing to review queue.',
    tags: ['Sum Mismatch', 'Review Queue', 'Arbitration'],
  },
  {
    id: 'suspicious',
    title: 'Case 3: Unverified Bank Routing & Risk Indicators',
    subtitle: 'INV-2024-003 · Global Services LLC',
    invoiceNumber: 'INV-2024-003',
    expectedStatus: 'NEEDS_REVIEW',
    riskLevel: 'CRITICAL',
    description: 'Unverified wire instructions, offshore account, urgent settlement terms, and high-risk payment keywords flagged.',
    tags: ['Account Change', 'Offshore Routing', 'Critical Risk'],
  },
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { selectedTenant } = useTenant();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!selectedTenant) return;
    setLoading(true);
    try {
      const [invoiceData, providerData] = await Promise.all([
        getInvoices(selectedTenant.id),
        getProviderStatus().catch(() => null),
      ]);
      setInvoices(invoiceData);
      if (providerData) setProviders(providerData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAnalyze = async (e: React.MouseEvent, invoiceId: string) => {
    e.stopPropagation();
    if (!selectedTenant) return;
    setAnalyzingIds((prev) => new Set(prev).add(invoiceId));
    try {
      await analyzeInvoice(selectedTenant.id, invoiceId);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(invoiceId);
        return next;
      });
    }
  };

  const formatCurrency = (amount: number, currency: string) =>
    new Intl.NumberFormat(selectedTenant?.locale || 'en-US', {
      style: 'currency',
      currency: currency || selectedTenant?.default_currency || 'USD',
    }).format(amount);

  // Filter & Search
  const filteredInvoices = invoices.filter((inv) => {
    const matchesFilter = filter === 'ALL' || inv.status === filter;
    const matchesSearch =
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.vendor_name?.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const counts = {
    total: invoices.length,
    needs_review: invoices.filter((i) => i.status === 'NEEDS_REVIEW').length,
    approved: invoices.filter((i) => i.status === 'APPROVED').length,
    pending: invoices.filter((i) => i.status === 'PENDING').length,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      {/* Top Welcome & Fastn Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Invoice Desk Dashboard
            </h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              {selectedTenant?.name} ({selectedTenant?.default_currency})
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Automated verification pipeline powered by Fastn connectors and dual-LLM consensus.
          </p>
        </div>

        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700"
        >
          <Plus size={16} /> Upload Invoice
        </button>
      </div>

      {/* Provider Status Pill Bar */}
      {providers && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-slate-500">Engine Telemetry:</span>
            {/* Model A */}
            <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-slate-700 border border-slate-200">
              <span className={`h-2 w-2 rounded-full ${providers.model_a.is_live ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <span className="font-medium">Model A:</span>
              <span className="text-indigo-600 font-semibold">{providers.model_a.provider}</span>
              <span className="text-[10px] text-slate-400">({providers.model_a.is_live ? 'LIVE' : 'DEMO'})</span>
            </div>
            {/* Model B */}
            <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-slate-700 border border-slate-200">
              <span className={`h-2 w-2 rounded-full ${providers.model_b.is_live ? 'bg-emerald-500' : 'bg-amber-400'}`} />
              <span className="font-medium">Model B:</span>
              <span className="text-violet-600 font-semibold">{providers.model_b.provider}</span>
              <span className="text-[10px] text-slate-400">({providers.model_b.is_live ? 'LIVE' : 'DEMO'})</span>
            </div>
            {/* Fastn */}
            <div className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-slate-700 border border-slate-200">
              <span className={`h-2 w-2 rounded-full ${providers.fastn.is_live ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              <span className="font-medium">Fastn Connect:</span>
              <span className="font-semibold text-slate-800">{providers.fastn.is_live ? 'LIVE API' : 'LOCAL DEMO'}</span>
            </div>
          </div>
          <span className="text-[11px] text-slate-400">
            Tenant Isolation: <span className="font-semibold text-emerald-600">Active</span>
          </span>
        </div>
      )}

      {/* Verification Insights */}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-600" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">
              Verification Insights
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            &mdash; Explore representative invoice verification cases and their outcomes.
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {VERIFICATION_CASES.map((sc) => {
            const matchedInv = invoices.find((i) => i.invoice_number === sc.invoiceNumber);
            return (
              <div
                key={sc.id}
                onClick={() => {
                  if (matchedInv) navigate(`/invoices/${matchedInv.id}`);
                }}
                className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all hover:border-indigo-400 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      sc.riskLevel === 'LOW'
                        ? 'bg-emerald-50 text-emerald-700'
                        : sc.riskLevel === 'MEDIUM'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {sc.riskLevel} Risk
                  </span>
                  <div className="flex items-center gap-1 text-xs font-semibold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                    <span>Inspect</span>
                    <ArrowRight size={13} />
                  </div>
                </div>

                <h3 className="mt-2 text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  {sc.title}
                </h3>
                <p className="font-mono text-xs text-slate-400">{sc.subtitle}</p>
                <p className="mt-2 text-xs text-slate-600 leading-relaxed">{sc.description}</p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sc.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Total Invoices</span>
            <FileText size={18} className="text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{counts.total}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Pending Analysis</span>
            <Clock size={18} className="text-slate-400" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-slate-900">{counts.pending}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Needs Review</span>
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-amber-600">{counts.needs_review}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider">Approved</span>
            <CheckCircle2 size={18} className="text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-extrabold text-emerald-600">{counts.approved}</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Status filters */}
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', 'PENDING', 'NEEDS_REVIEW', 'APPROVED', 'REJECTED'] as StatusFilter[]).map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === st
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {st === 'ALL' ? 'All Invoices' : st.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search vendor or invoice #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Invoice Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <LoadingSpinner className="py-20" size={32} />
        ) : filteredInvoices.length === 0 ? (
          <EmptyState
            title="No invoices found"
            message={
              search
                ? 'Try adjusting your search or filters.'
                : 'Upload an invoice or switch tenants to view documents.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Invoice #</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Total Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => navigate(`/invoices/${inv.id}`)}
                    className="cursor-pointer transition-colors hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{inv.vendor_name}</td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {new Date(inv.invoice_date).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-4 font-bold text-slate-900">
                      {formatCurrency(inv.total_amount, inv.currency)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      {inv.status === 'PENDING' ? (
                        <button
                          onClick={(e) => handleAnalyze(e, inv.id)}
                          disabled={analyzingIds.has(inv.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                        >
                          {analyzingIds.has(inv.id) ? (
                            <LoadingSpinner size={13} />
                          ) : (
                            <Zap size={13} />
                          )}
                          Analyze
                        </button>
                      ) : (
                        <button
                          onClick={() => navigate(`/invoices/${inv.id}`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-600"
                        >
                          View Details <ArrowRight size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <InvoiceUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={load}
      />
    </div>
  );
};

export default Dashboard;
