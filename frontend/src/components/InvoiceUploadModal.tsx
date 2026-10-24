import React, { useState, useRef } from 'react';
import { X, Upload, FileUp, CheckCircle2 } from 'lucide-react';
import { uploadInvoice } from '../services/api';
import { useTenant } from '../context/TenantContext';
import LoadingSpinner from './LoadingSpinner';

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

const InvoiceUploadModal: React.FC<Props> = ({ open, onClose, onUploaded }) => {
  const { selectedTenant } = useTenant();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File) => {
    setFile(f);
    setError(null);
    setSuccess(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!file || !selectedTenant) return;
    setUploading(true);
    setError(null);
    try {
      await uploadInvoice(selectedTenant.id, file);
      setSuccess(true);
      setTimeout(() => {
        onUploaded();
        onClose();
        setFile(null);
        setSuccess(false);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-800">Upload Invoice</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {/* Drop zone */}
          <div
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
              dragging
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-slate-300 bg-slate-50 hover:border-slate-400'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp size={36} className="text-slate-400" />
            <p className="mt-3 text-sm text-slate-600">
              Drag & drop or <span className="font-semibold text-indigo-600">browse</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">.pdf, .png, .jpg, .jpeg</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>

          {/* Selected file */}
          {file && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700">
              <Upload size={16} className="text-indigo-500" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-xs text-slate-400">
                {(file.size / 1024).toFixed(0)} KB
              </span>
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

          {success && (
            <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle2 size={18} /> Uploaded successfully!
            </div>
          )}

          <button
            disabled={!file || uploading}
            onClick={handleUpload}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? <LoadingSpinner size={18} /> : <Upload size={16} />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceUploadModal;
