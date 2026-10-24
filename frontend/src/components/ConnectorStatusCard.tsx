import React, { useState } from 'react';
import {
  Mail,
  FolderOpen,
  Table,
  MessageSquare,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  Play,
  ExternalLink,
} from 'lucide-react';
import type { FastnConnection } from '../types';

interface Props {
  connection?: FastnConnection;
  provider: string;
  onConnect: () => void;
  onSync: (provider: string) => Promise<void>;
}

const providerIcons: Record<string, React.ElementType> = {
  gmail: Mail,
  gdrive: FolderOpen,
  gsheets: Table,
  slack: MessageSquare,
  hubspot: Users,
};

const ConnectorStatusCard: React.FC<Props> = ({ connection, provider, onConnect, onSync }) => {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; error: boolean } | null>(null);

  const key = provider.toLowerCase().replace(/ /g, '');
  const Icon = providerIcons[key] || providerIcons[provider.toLowerCase()] || Mail;

  const isAuth = connection?.auth_status === 'authenticated' || connection?.status === 'connected';
  const isWorkflow = connection?.workflow_status === 'published';
  const executionStatus = connection?.execution_status || (isAuth ? 'ready' : 'awaiting_auth');

  const handleTestSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      await onSync(provider);
      setSyncMsg({ text: 'Workflow dispatched successfully via Fastn API', error: false });
    } catch (err: any) {
      setSyncMsg({ text: err.message || 'Execution failed', error: true });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-slate-300">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Icon & Connector Role */}
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              isAuth
                ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Icon size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900">{connection?.name || provider}</h4>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                {connection?.role || 'Integration'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {connection?.description || `Fastn connector workflow for ${provider}`}
            </p>
            {connection?.workflow_name && (
              <p className="mt-1 font-mono text-[11px] text-indigo-600">
                Target: {connection.workflow_name}
              </p>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <button
            onClick={handleTestSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
            title="Execute workflow action through Fastn"
          >
            <Play size={13} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Dispatching…' : 'Run Pipeline'}
          </button>
          {!isAuth ? (
            <button
              onClick={onConnect}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-700"
            >
              <ExternalLink size={13} />
              Connect via Fastn
            </button>
          ) : (
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              Active
            </span>
          )}
        </div>
      </div>

      {/* Tri-Status Genuine Badge Row */}
      <div className="mt-4 grid grid-cols-1 gap-2 rounded-lg bg-slate-50/70 p-2.5 sm:grid-cols-3 text-xs">
        {/* 1. Auth Status */}
        <div className="flex items-center gap-2">
          {isAuth ? (
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
          ) : (
            <AlertCircle size={15} className="text-slate-400 shrink-0" />
          )}
          <span className="text-slate-500">Auth:</span>
          <span
            className={`font-semibold ${
              isAuth ? 'text-emerald-700' : 'text-slate-600'
            }`}
          >
            {isAuth ? 'Authenticated' : 'Not Connected'}
          </span>
        </div>

        {/* 2. Workflow Publication */}
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              isWorkflow ? 'bg-indigo-500' : 'bg-slate-300'
            }`}
          />
          <span className="text-slate-500">Workflow:</span>
          <span
            className={`font-semibold ${
              isWorkflow ? 'text-indigo-700' : 'text-slate-500'
            }`}
          >
            {isWorkflow ? 'Published in Fastn' : 'Unpublished (Draft)'}
          </span>
        </div>

        {/* 3. Execution Status */}
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-slate-400 shrink-0" />
          <span className="text-slate-500">Execution:</span>
          <span className="font-semibold text-slate-700 capitalize">
            {executionStatus === 'ready'
              ? 'Ready to execute'
              : executionStatus === 'executed'
              ? 'Last run logged'
              : 'Awaiting Fastn OAuth'}
          </span>
        </div>
      </div>

      {/* Sync feedback message */}
      {syncMsg && (
        <div
          className={`mt-3 rounded-lg p-2.5 text-xs font-medium ${
            syncMsg.error
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          {syncMsg.text}
        </div>
      )}
    </div>
  );
};

export default ConnectorStatusCard;
