import React, { useEffect, useState } from 'react';
import { 
  ChevronLeft, 
  UploadCloud, 
  FileText, 
  Download, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertTriangle, 
  Lock, 
  File, 
  Image as ImageIcon,
  Plus,
  X
} from 'lucide-react';
import api, { errorMessage } from '../../services/api';
import { fmtDate } from '../../services/format';
import type { EmployeeDocument } from '../../types';

interface MyDocumentsModalProps {
  onClose: () => void;
}

const DOC_TYPES = [
  { value: 'ID_CARD', label: 'Company ID Card' },
  { value: 'APPOINTMENT_LETTER', label: 'Appointment / Offer Letter' },
  { value: 'ID_PROOF', label: 'Government ID Proof (PAN / Voter ID)' },
  { value: 'CERTIFICATE', label: 'Degree / Technical Certificate' },
  { value: 'PAYSLIP', label: 'Salary Payslip' },
  { value: 'OTHER', label: 'Other Official Document' },
];

export default function MyDocumentsModal({ onClose }: MyDocumentsModalProps) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Upload Modal State
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [docType, setDocType] = useState('ID_PROOF');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const fetchDocuments = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<EmployeeDocument[]>('/me/documents/');
      setDocuments(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }
    // Validate size (max 5 MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Selected file exceeds maximum limit of 5 MB.');
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
    // Validate type (PDF, JPEG, PNG)
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png)$/i)) {
      setError('Only PDF, JPG, and PNG files are accepted.');
      setSelectedFile(null);
      e.target.value = '';
      return;
    }
    setError('');
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a document file to upload.');
      return;
    }
    setUploading(true);
    setError('');
    setSuccessMsg('');
    try {
      const formData = new FormData();
      formData.append('doc_type', docType);
      formData.append('file', selectedFile);

      await api.post('/me/documents/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccessMsg('Document uploaded successfully and queued for HR verification.');
      setIsUploadOpen(false);
      setSelectedFile(null);
      await fetchDocuments();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: EmployeeDocument) => {
    setDownloadingId(doc.id);
    setError('');
    try {
      const response = await api.get(`/me/documents/${doc.id}/download/`, {
        responseType: 'blob',
      });
      // Create download blob URL
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.file_name || `document_${doc.id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status: EmployeeDocument['status']) => {
    switch (status) {
      case 'VERIFIED':
        return { label: 'Verified', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 };
      case 'REJECTED':
        return { label: 'Rejected', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', icon: XCircle };
      case 'PENDING':
      default:
        return { label: 'Pending Verification', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4">
      <div className="bg-slate-50 w-full max-w-md h-[95vh] sm:h-[840px] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
        
        {/* Sticky Header */}
        <header className="px-4 py-3.5 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm z-10">
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={onClose}
              aria-label="Back to Profile"
              className="w-10 h-10 -ml-1 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition-all"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">My Documents</h2>
              <p className="text-[11px] text-slate-500">Secure Vault & Identity Files</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Upload
          </button>
        </header>

        {/* Security Banner */}
        <div className="bg-emerald-50/70 border-b border-emerald-100 px-4 py-2.5 flex items-center gap-2 text-xs text-emerald-900 shrink-0">
          <Lock className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span className="text-[11px] leading-tight">
            Encrypted private storage. Documents are accessible strictly via authenticated sessions.
          </span>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {loading && (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs">Loading documents...</p>
            </div>
          )}

          {!loading && documents.length === 0 && (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">No Documents Uploaded</h4>
              <p className="text-xs text-slate-400 mt-1">
                Upload your ID proof, degree certificates, or appointment letter.
              </p>
            </div>
          )}

          {documents.map(doc => {
            const badge = getStatusBadge(doc.status);
            const StatusIcon = badge.icon;
            const docName = doc.file_name || doc.title || `document_${doc.id}`;
            const isPdf = (doc.mime_type || '').includes('pdf') || docName.toLowerCase().endsWith('.pdf');

            return (
              <div key={doc.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
                      {isPdf ? <FileText className="w-5 h-5 text-rose-600" /> : <ImageIcon className="w-5 h-5 text-blue-600" />}
                    </div>
                    <div>
                      <span className="font-bold text-sm text-slate-900 block leading-tight">
                        {doc.doc_type_display || doc.title || 'Document'}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono truncate max-w-[160px] block mt-0.5">
                        {docName}
                      </span>
                    </div>
                  </div>

                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${badge.bg} ${badge.text} ${badge.border}`}>
                    <StatusIcon className="w-3 h-3" />
                    {badge.label}
                  </span>
                </div>

                {doc.reviewer_notes && (
                  <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-xs text-slate-600">
                    <strong className="block text-[10px] text-slate-400 uppercase tracking-wider">HR Remark:</strong>
                    "{doc.reviewer_notes}"
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                  <span>Uploaded {fmtDate(doc.created_at)} · {(doc.file_size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    onClick={() => handleDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 font-bold p-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloadingId === doc.id ? 'Downloading...' : 'Download'}
                  </button>
                </div>
              </div>
            );
          })}

        </div>

        {/* Upload Drawer / Modal */}
        {isUploadOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-center items-end sm:items-center sm:p-4 animate-in fade-in duration-150">
            <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-bold text-slate-900 text-base">Upload Official Document</h3>
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1" htmlFor="doc-type-select">
                    Document Category *
                  </label>
                  <select
                    id="doc-type-select"
                    value={docType}
                    onChange={e => setDocType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    required
                  >
                    {DOC_TYPES.map(dt => (
                      <option key={dt.value} value={dt.value}>{dt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select File (PDF, JPG, PNG - Max 5 MB) *
                  </label>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    onChange={handleFileChange}
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                    required
                  />
                  {selectedFile && (
                    <div className="mt-2 text-xs text-slate-600 font-mono bg-slate-50 p-2 rounded-lg border border-slate-200">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
                    </div>
                  )}
                </div>

                <div className="p-2.5 bg-blue-50/70 border border-blue-200/70 rounded-xl text-[11px] text-blue-900">
                  Documents are reviewed by HR before being marked Verified. No government ID numbers are stored in plain text.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsUploadOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
                  >
                    <UploadCloud className="w-4 h-4" />
                    {uploading ? 'Uploading...' : 'Upload & Submit'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
