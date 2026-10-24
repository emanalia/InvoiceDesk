import type { Tenant, Invoice, FastnConnection, ProviderStatus } from '../types';

const BASE_URL = 'http://localhost:3001/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
  tenantId?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (tenantId) {
    headers['X-Tenant-ID'] = tenantId;
  }

  // Only set Content-Type for non-FormData bodies
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { error: body };
    }
    throw new Error(parsed.error || `API error ${res.status}`);
  }

  return res.json();
}

/* ── Providers & System Status ──────────────────────── */

export async function getProviderStatus(): Promise<ProviderStatus> {
  const res = await request<any>('/config/providers');
  return res.providers;
}

/* ── Tenants ────────────────────────────────────────── */

export async function getTenants(): Promise<Tenant[]> {
  const res = await request<any>('/tenants');
  return res.tenants || res;
}

export async function createTenant(data: {
  name: string;
  slug: string;
  default_currency?: string;
  locale?: string;
  tax_rate?: number;
}): Promise<Tenant> {
  const res = await request<any>('/tenants', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.tenant || res;
}

/* ── Invoices ───────────────────────────────────────── */

export async function getInvoices(tenantId: string): Promise<Invoice[]> {
  const res = await request<any>('/invoices', {}, tenantId);
  return res.invoices || res;
}

export async function getInvoice(tenantId: string, invoiceId: string): Promise<Invoice> {
  const res = await request<any>(`/invoices/${invoiceId}`, {}, tenantId);
  const inv = res.invoice || res;
  return {
    ...inv,
    line_items: res.line_items || inv.line_items || [],
    analyses: res.analyses || inv.analyses || [],
    deterministic_checks: res.checks || res.deterministic_checks || inv.deterministic_checks || [],
    audit_trail: res.audit_trail || inv.audit_trail || [],
  };
}

export async function uploadInvoice(tenantId: string, file: File): Promise<Invoice> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await request<any>('/invoices/upload', { method: 'POST', body: formData }, tenantId);
  return res.invoice || res;
}

export async function analyzeInvoice(tenantId: string, invoiceId: string): Promise<any> {
  return request<any>(`/invoices/${invoiceId}/analyze`, { method: 'POST' }, tenantId);
}

export async function approveInvoice(tenantId: string, invoiceId: string): Promise<Invoice> {
  const res = await request<any>(`/invoices/${invoiceId}/approve`, { method: 'POST' }, tenantId);
  return res.invoice || res;
}

export async function rejectInvoice(
  tenantId: string,
  invoiceId: string,
  reason: string,
): Promise<Invoice> {
  const res = await request<any>(
    `/invoices/${invoiceId}/reject`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    tenantId,
  );
  return res.invoice || res;
}

export async function getAuditTrail(tenantId: string, invoiceId: string): Promise<any[]> {
  const res = await request<any>(`/invoices/${invoiceId}/audit`, {}, tenantId);
  return res.audit_trail || res;
}

/* ── Fastn ──────────────────────────────────────────── */

export async function getFastnSessionToken(tenantId: string): Promise<{ token: string }> {
  return request<{ token: string }>('/fastn/session-token', {}, tenantId);
}

export async function getFastnConnections(tenantId: string): Promise<FastnConnection[]> {
  const res = await request<any>('/fastn/connections', {}, tenantId);
  return res.connectors || res.connections || res;
}

export async function triggerConnectorSync(tenantId: string, provider: string): Promise<any> {
  return request<any>(`/fastn/sync/${provider}`, { method: 'POST' }, tenantId);
}
