import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import {
  FileText,
  LayoutDashboard,
  ClipboardCheck,
  Settings,
  ChevronDown,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { getProviderStatus } from '../services/api';
import type { ProviderStatus } from '../types';

const navLinks = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/review', label: 'Review Desk', icon: ClipboardCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const Navbar: React.FC = () => {
  const { tenants, selectedTenant, setSelectedTenant } = useTenant();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus | null>(null);

  useEffect(() => {
    getProviderStatus()
      .then(setProviders)
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Left: Brand Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-sm">
            <FileText size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight text-slate-900">
                Invoice Desk
              </span>
              <span className="hidden rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 sm:inline">
                Fastn Pipeline
              </span>
            </div>
            <p className="hidden text-[11px] text-slate-500 sm:block">
              Dual-AI Verification & Fraud Shield
            </p>
          </div>
        </div>

        {/* Center: Desktop Nav Links */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              <link.icon size={16} />
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Right: Engine Indicator & Tenant Switcher */}
        <div className="flex items-center gap-3">
          {/* Provider status badge */}
          {providers && (
            <div
              className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium lg:flex ${
                providers.model_a.is_live && providers.model_b.is_live
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
              title={`Model A: ${providers.model_a.provider} (${providers.model_a.is_live ? 'LIVE' : 'DEMO'})\nModel B: ${providers.model_b.provider} (${providers.model_b.is_live ? 'LIVE' : 'DEMO'})\nFastn: ${providers.fastn.is_live ? 'AUTHENTICATED' : 'DEMO MODE'}`}
            >
              <Sparkles size={12} />
              <span>
                {providers.model_a.is_live && providers.model_b.is_live
                  ? 'Dual AI: Live'
                  : 'Dual AI: Demo Mode'}
              </span>
            </div>
          )}

          {/* Tenant Selector */}
          <div className="relative">
            <label className="sr-only" htmlFor="tenant-select">
              Select Tenant
            </label>
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs sm:text-sm transition-colors hover:border-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <select
                id="tenant-select"
                className="cursor-pointer appearance-none bg-transparent pr-4 font-semibold text-slate-800 focus:outline-none"
                value={selectedTenant?.id ?? ''}
                onChange={(e) => {
                  const tenant = tenants.find((t) => t.id === e.target.value);
                  if (tenant) setSelectedTenant(tenant);
                }}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.default_currency})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="pointer-events-none text-slate-400" />
            </div>
          </div>

          {/* Mobile hamburger toggle */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                <link.icon size={18} />
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Navbar;
