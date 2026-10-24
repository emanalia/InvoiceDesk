import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Tenant } from '../types';
import { getTenants } from '../services/api';

interface TenantContextValue {
  tenants: Tenant[];
  selectedTenant: Tenant | null;
  setSelectedTenant: (tenant: Tenant) => void;
  loading: boolean;
  reload: () => void;
}

const TenantContext = createContext<TenantContextValue>({
  tenants: [],
  selectedTenant: null,
  setSelectedTenant: () => {},
  loading: true,
  reload: () => {},
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTenants();
      setTenants(data);
      if (data.length > 0 && !selectedTenant) {
        setSelectedTenant(data[0]);
      }
    } catch (err) {
      console.error('Failed to load tenants', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TenantContext.Provider
      value={{ tenants, selectedTenant, setSelectedTenant, loading, reload: load }}
    >
      {children}
    </TenantContext.Provider>
  );
};
