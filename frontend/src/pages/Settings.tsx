import React, { useState, useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { getFastnConnections, triggerConnectorSync } from '../services/api';
import type { FastnConnection } from '../types';
import ConnectorStatusCard from '../components/ConnectorStatusCard';
import FastnEmbedModal from '../components/FastnEmbedModal';
import LoadingSpinner from '../components/LoadingSpinner';
import { Building2, Key, Info, HelpCircle } from 'lucide-react';

const PROVIDERS = ['Gmail', 'Google Drive', 'Google Sheets', 'Slack', 'HubSpot'];

const Settings: React.FC = () => {
  const { selectedTenant } = useTenant();
  const [connections, setConnections] = useState<FastnConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [fastnOpen, setFastnOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedTenant) return;
    setLoading(true);
    try {
      const data = await getFastnConnections(selectedTenant.id);
      setConnections(data);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [selectedTenant]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSyncConnector = async (provider: string) => {
    if (!selectedTenant) return;
    setActionNotice(null);
    try {
      await triggerConnectorSync(selectedTenant.id, provider);
      await load();
    } catch (err: any) {
      throw err;
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Organization & Integrations
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure regional compliance, tax policies, and Fastn-powered pipeline connectors.
        </p>
      </div>

      {/* Tenant Regional Profile */}
      {selectedTenant && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Building2 size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">{selectedTenant.name}</h2>
                <p className="text-xs text-slate-500">
                  Tenant Slug: <span className="font-mono font-medium">{selectedTenant.slug}</span> &middot; ID: {selectedTenant.id}
                </p>
              </div>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Default Currency
              </dt>
              <dd className="mt-1 text-base font-bold text-slate-900">
                {selectedTenant.default_currency}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Locale & Region
              </dt>
              <dd className="mt-1 text-base font-bold text-slate-900">{selectedTenant.locale}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Standard Tax Rate
              </dt>
              <dd className="mt-1 text-base font-bold text-slate-900">
                {selectedTenant.tax_rate > 1
                  ? selectedTenant.tax_rate.toFixed(1)
                  : (selectedTenant.tax_rate * 100).toFixed(1)}
                %
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Registered Since
              </dt>
              <dd className="mt-1 text-sm font-medium text-slate-700">
                {new Date(selectedTenant.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* Fastn Integration Pipeline Section */}
      <div className="mt-10">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Fastn Connector Hub</h2>
              <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-800">
                5 Active Pipelines
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Bi-directional ingestion, ledger synchronizations, and Slack alerts managed via Fastn
            </p>
          </div>

          <button
            onClick={() => setFastnOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-indigo-700"
          >
            <Key size={14} /> Open Fastn Connect Widget
          </button>
        </div>

        {/* Next Steps / Integration Guidance Banner */}
        <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs text-indigo-950">
          <div className="flex items-start gap-2.5">
            <Info size={16} className="mt-0.5 shrink-0 text-indigo-600" />
            <div>
              <p className="font-semibold text-indigo-900">Fastn Integration Honesty & Instructions</p>
              <p className="mt-0.5 leading-relaxed text-indigo-800">
                Each connector shows real-time authentication and workflow execution status. To authenticate with live credentials:
              </p>
              <ol className="mt-2 list-inside list-decimal space-y-1 font-mono text-[11px] text-indigo-900">
                <li>Configure <span className="font-bold">FASTN_API_KEY</span> in your server <span className="font-bold">.env</span> file.</li>
                <li>Click <span className="font-bold">"Open Fastn Connect Widget"</span> to authenticate Gmail, Google Drive, Sheets, Slack, or HubSpot.</li>
                <li>Fastn webhooks will automatically activate the connection records in SQLite and enable live dispatching.</li>
              </ol>
            </div>
          </div>
        </div>

        {actionNotice && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
            {actionNotice}
          </div>
        )}

        {/* Connector Cards */}
        {loading ? (
          <LoadingSpinner className="mt-12" size={32} />
        ) : (
          <div className="mt-6 space-y-3.5">
            {PROVIDERS.map((provider) => {
              const conn = connections.find(
                (c) =>
                  c.provider.toLowerCase() === provider.toLowerCase().replace(/ /g, '') ||
                  c.provider.toLowerCase() === provider.toLowerCase()
              );
              return (
                <ConnectorStatusCard
                  key={provider}
                  provider={provider}
                  connection={conn}
                  onConnect={() => setFastnOpen(true)}
                  onSync={handleSyncConnector}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Embedded Connect Modal */}
      <FastnEmbedModal
        open={fastnOpen}
        onClose={() => {
          setFastnOpen(false);
          load();
        }}
      />
    </div>
  );
};

export default Settings;
