import React, { useState } from 'react';
import { X, KeyRound, ExternalLink, ShieldCheck, CheckCircle2 } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import { getFastnSessionToken } from '../services/api';
import { useTenant } from '../context/TenantContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FastnEmbedModal: React.FC<Props> = ({ open, onClose }) => {
  const { selectedTenant } = useTenant();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !selectedTenant) return;
    setLoading(true);
    setError(null);
    getFastnSessionToken(selectedTenant.id)
      .then((res) => setToken(res.token))
      .catch((err) =>
        setError(
          err.message || 'Fastn API key not configured on server. Set FASTN_API_KEY in .env.'
        )
      )
      .finally(() => setLoading(false));
  }, [open, selectedTenant]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Fastn Embedded Connect Portal</h2>
              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                Tenant: {selectedTenant?.name}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Customer-facing OAuth widget for authenticating Gmail, Google Drive, Sheets, Slack & HubSpot
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="min-h-[380px] p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
              <LoadingSpinner size={32} />
              <p className="text-xs text-slate-500">Requesting isolated Fastn session token…</p>
            </div>
          )}

          {error && !loading && (
            <div className="py-6">
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                    <KeyRound size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">
                      Fastn API Configuration Required
                    </h3>
                    <p className="mt-1 text-xs text-amber-800 leading-relaxed">
                      {error}
                    </p>
                  </div>
                </div>

                <div className="mt-5 border-t border-amber-200/60 pt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    How to enable the Live Embedded Widget:
                  </h4>
                  <ol className="mt-2 space-y-2 text-xs text-amber-900">
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-amber-700">1.</span>
                      <span>
                        Log in to your Fastn developer console at{' '}
                        <a
                          href="https://app.fastn.ai"
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-indigo-700 underline inline-flex items-center gap-1"
                        >
                          app.fastn.ai <ExternalLink size={11} />
                        </a>
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-amber-700">2.</span>
                      <span>Copy your Workspace API Key into <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">backend/.env</code> as <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[11px]">FASTN_API_KEY=...</code></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="font-bold text-amber-700">3.</span>
                      <span>Re-open this modal. Fastn will issue an isolated session token and render the secure OAuth modal directly in this window.</span>
                    </li>
                  </ol>
                </div>
              </div>

              {/* Architecture & Security Notice */}
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 border border-slate-200">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <span>
                  <strong>Server-Side Security:</strong> Your Fastn API key is never exposed to the browser. Tokens are scoped strictly to the current tenant ID (<code className="font-mono text-[11px]">{selectedTenant?.id}</code>).
                </span>
              </div>
            </div>
          )}

          {token && !loading && !error && (
            <div>
              <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                  <CheckCircle2 size={14} /> Session Token Active
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  Token: {token.slice(0, 12)}…
                </span>
              </div>
              <iframe
                title="Fastn Connect Portal"
                src={`https://connect.fastn.ai/embed?token=${encodeURIComponent(token)}`}
                className="h-[420px] w-full rounded-xl border border-slate-200 shadow-inner"
              />
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default FastnEmbedModal;
