import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { TenantProvider } from './context/TenantContext';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import ReviewDesk from './pages/ReviewDesk';
import InvoiceDetail from './pages/InvoiceDetail';
import Settings from './pages/Settings';

const App: React.FC = () => {
  return (
    <TenantProvider>
      <div className="min-h-screen bg-slate-50">
        <Navbar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/review" element={<ReviewDesk />} />
          <Route path="/invoices/:id" element={<InvoiceDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </TenantProvider>
  );
};

export default App;
