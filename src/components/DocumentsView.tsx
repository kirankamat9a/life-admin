import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FileUp,
  Search,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { extractDocumentPreviewApi } from '../api/client';
import { validateDocumentUploadMeta } from '../shared/domainLogic';
import type { DocumentExtractPreview, DocumentRecord, WorkspaceState } from '../shared/types';
import { HelpTip } from './HelpTip';

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

interface DocumentsViewProps {
  workspace: WorkspaceState;
  globalSearch: string;
  onSaveExtractedDocument: (params: {
    fileName: string;
    mimeType: string;
    base64Data: string;
    type: DocumentRecord['type'];
    extractedFields: DocumentRecord['extractedFields'];
    rawText: string;
    citations: string[];
  }) => Promise<void>;
}

export function DocumentsView({
  workspace,
  globalSearch,
  onSaveExtractedDocument,
}: DocumentsViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>(workspace.documents[0]?.id ?? '');
  const [docType, setDocType] = useState<DocumentRecord['type']>('invoice');
  const [localSearch, setLocalSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<{
    preview: DocumentExtractPreview;
    base64Data: string;
  } | null>(null);
  const [savingReview, setSavingReview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const query = (localSearch || globalSearch).toLowerCase().trim();
  const filteredDocs = workspace.documents.filter(
    (d) =>
      !query ||
      d.title.toLowerCase().includes(query) ||
      d.fileName.toLowerCase().includes(query) ||
      d.rawText.toLowerCase().includes(query)
  );

  const activeDoc =
    filteredDocs.find((d) => d.id === selectedDocId) ?? filteredDocs[0] ?? workspace.documents[0];

  const handleFile = async (file: File) => {
    setUploadError(null);
    const validation = validateDocumentUploadMeta({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!validation.valid) {
      setUploadError(validation.error ?? 'Invalid document.');
      return;
    }

    setUploadProgress(25);
    try {
      const base64Data = await readFileAsBase64(file);
      setUploadProgress(60);
      const preview = await extractDocumentPreviewApi({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
        type: docType,
      });
      setUploadProgress(100);
      setReviewDraft({ preview, base64Data });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not analyze this document.');
    } finally {
      setTimeout(() => setUploadProgress(null), 300);
    }
  };

  const handleSaveReviewed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewDraft) return;
    setSavingReview(true);
    setUploadError(null);
    try {
      await onSaveExtractedDocument({
        fileName: reviewDraft.preview.fileName,
        mimeType: reviewDraft.preview.mimeType,
        base64Data: reviewDraft.base64Data,
        type: reviewDraft.preview.type,
        extractedFields: reviewDraft.preview.extractedFields,
        rawText: reviewDraft.preview.rawText,
        citations: reviewDraft.preview.citations,
      });
      setReviewDraft(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to save document.');
    } finally {
      setSavingReview(false);
    }
  };

  const updateField = (key: keyof DocumentRecord['extractedFields'], value: string) => {
    setReviewDraft((prev) =>
      prev
        ? {
            ...prev,
            preview: {
              ...prev.preview,
              extractedFields: {
                ...prev.preview.extractedFields,
                [key]: value,
              },
            },
          }
        : null
    );
  };

  return (
    <div className="space-y-6">
      {/* Drag-and-Drop Upload Section (Part A.6, C.2, C.4) */}
      <section className="bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-[15px] font-semibold text-[#172033] dark:text-slate-100">
                Document Vault &amp; Smart Scan
              </h2>
              <HelpTip
                title="How Document Scanning Works"
                description="Drop an invoice, receipt, or warranty PDF/image (max 10 MB). We extract the merchant, invoice number, total, and warranty dates so you can review and fix any detail before saving."
              />
            </div>
            <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
              Upload PDF invoices, warranty certificates, images, or text receipts (max 10 MB) to extract fields and check for date mismatches.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <select
              aria-label="Document category for upload"
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocumentRecord['type'])}
              className="h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#635BFF]"
            >
              <option value="invoice">Invoice</option>
              <option value="warranty">Warranty Policy</option>
              <option value="receipt">Payment Receipt</option>
              <option value="upload">Supporting Screenshot</option>
            </select>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
              className="hidden"
              aria-label="Upload invoice or warranty file"
            />

            <button
              type="button"
              disabled={uploadProgress !== null}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] disabled:opacity-50 whitespace-nowrap"
            >
              <FileUp className="h-4 w-4" />
              <span>{uploadProgress !== null ? 'Scanning...' : 'Choose File'}</span>
            </button>
          </div>
        </div>

        {/* Drag-and-Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
            dragging
              ? 'border-[#635BFF] bg-[#635BFF]/[0.06]'
              : 'border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800/50'
          }`}
        >
          <UploadCloud className="h-6 w-6 text-[#635BFF] mx-auto mb-1.5" />
          <p className="text-[13px] font-medium text-[#172033] dark:text-slate-200">
            Drag and drop a file here, or click <span className="font-semibold text-[#635BFF] dark:text-indigo-300">Choose File</span>
          </p>
          <p className="text-[11.5px] text-[#64748B] dark:text-slate-400 mt-0.5">
            Supported: PDF, PNG, JPG, WEBP, TXT, CSV · Up to 10 MB
          </p>

          {uploadProgress !== null && (
            <div className="mt-3 max-w-sm mx-auto space-y-1">
              <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className="h-full bg-[#635BFF] transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-[11.5px] text-[#635BFF] dark:text-indigo-300 font-medium">
                Extracting structured fields ({uploadProgress}%)…
              </p>
            </div>
          )}
        </div>
      </section>

      {uploadError && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-[#FEF2F2] dark:bg-red-950/80 border border-[#FECACA] dark:border-red-800 text-[13px] text-[#DC2626] dark:text-red-200 flex items-center justify-between gap-3"
        >
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-[12px] font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Review & Confirm Extracted Fields Panel (Part C.2, C.4) */}
      {reviewDraft && (
        <section
          aria-label="Review extracted document fields before saving"
          className="bg-white dark:bg-slate-900 border-2 border-[#635BFF]/40 rounded-xl p-6 space-y-5 shadow-md"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Review Extracted Details Before Saving
              </p>
              <h3 className="font-display text-[17px] font-bold text-[#172033] dark:text-slate-100 mt-0.5">
                {reviewDraft.preview.fileName}
              </h3>
              {reviewDraft.preview.fallbackUsed && (
                <p className="text-[12px] text-[#B45309] dark:text-amber-300 mt-0.5">
                  Extracted using local rules ({reviewDraft.preview.geminiWarning ?? 'AI offline'}). Check or update any field below before saving.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setReviewDraft(null)}
              aria-label="Discard uploaded draft"
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#172033] dark:text-slate-400 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSaveReviewed} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Preview column */}
            <div className="lg:col-span-5 rounded-lg border border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 p-4 space-y-3">
              {reviewDraft.preview.previewUrl ? (
                <img
                  src={reviewDraft.preview.previewUrl}
                  alt={reviewDraft.preview.fileName}
                  className="w-full max-h-64 object-contain rounded"
                />
              ) : (
                <div className="flex items-center gap-3">
                  <FileText className="h-7 w-7 text-[#635BFF] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#172033] dark:text-slate-100 truncate">
                      {reviewDraft.preview.fileName}
                    </p>
                    <p className="text-[11.5px] text-[#64748B] dark:text-slate-400">
                      {reviewDraft.preview.mimeType}
                    </p>
                  </div>
                </div>
              )}
              <div className="text-[12px] text-[#475569] dark:text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-[#E8ECF3] dark:border-slate-700 pt-2.5">
                {reviewDraft.preview.rawText}
              </div>
            </div>

            {/* Editable structured fields */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="rev-merchant" className="block text-[11.5px] font-medium text-[#64748B] dark:text-slate-400 mb-1">
                    Merchant / Store
                  </label>
                  <input
                    id="rev-merchant"
                    type="text"
                    value={reviewDraft.preview.extractedFields.merchant ?? ''}
                    onChange={(e) => updateField('merchant', e.target.value)}
                    className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="rev-product" className="block text-[11.5px] font-medium text-[#64748B] dark:text-slate-400 mb-1">
                    Product / Item
                  </label>
                  <input
                    id="rev-product"
                    type="text"
                    value={reviewDraft.preview.extractedFields.product ?? ''}
                    onChange={(e) => updateField('product', e.target.value)}
                    className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="rev-date" className="block text-[11.5px] font-medium text-[#64748B] dark:text-slate-400 mb-1">
                    Purchase Date
                  </label>
                  <input
                    id="rev-date"
                    type="text"
                    value={reviewDraft.preview.extractedFields.purchaseDate ?? ''}
                    onChange={(e) => updateField('purchaseDate', e.target.value)}
                    className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="rev-inv" className="block text-[11.5px] font-medium text-[#64748B] dark:text-slate-400 mb-1">
                    Invoice / Order #
                  </label>
                  <input
                    id="rev-inv"
                    type="text"
                    value={reviewDraft.preview.extractedFields.invoiceNumber ?? ''}
                    onChange={(e) => updateField('invoiceNumber', e.target.value)}
                    className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="rev-total" className="block text-[11.5px] font-medium text-[#64748B] dark:text-slate-400 mb-1">
                    Total Amount
                  </label>
                  <input
                    id="rev-total"
                    type="text"
                    value={reviewDraft.preview.extractedFields.totalAmount ?? ''}
                    onChange={(e) => updateField('totalAmount', e.target.value)}
                    className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="rev-warranty" className="block text-[11.5px] font-medium text-[#64748B] dark:text-slate-400 mb-1">
                    Warranty Period / Expiration
                  </label>
                  <input
                    id="rev-warranty"
                    type="text"
                    value={
                      reviewDraft.preview.extractedFields.warrantyExpiration ??
                      reviewDraft.preview.extractedFields.warrantyPeriod ??
                      ''
                    }
                    onChange={(e) => updateField('warrantyPeriod', e.target.value)}
                    className="w-full h-9 px-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  disabled={savingReview}
                  onClick={() => setReviewDraft(null)}
                  className="px-4 py-2 rounded-lg border border-[#E8ECF3] dark:border-slate-700 text-[13px] font-semibold text-[#172033] dark:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingReview}
                  className="px-4 py-2 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] disabled:opacity-50"
                >
                  {savingReview ? 'Saving...' : 'Save to Document Vault'}
                </button>
              </div>
            </div>
          </form>
        </section>
      )}

      {/* Vault Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-3.5 border-b border-[#E8ECF3] dark:border-slate-800">
            <div className="relative">
              <Search className="h-4 w-4 text-[#64748B] dark:text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                aria-label="Search uploaded documents"
                placeholder="Search filenames or extracted text..."
                className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 rounded-lg text-[#172033] dark:text-slate-100 focus:outline-none focus:border-[#635BFF]"
              />
            </div>
          </div>

          <div className="divide-y divide-[#E8ECF3] dark:divide-slate-800">
            {filteredDocs.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-[14px] font-semibold text-[#172033] dark:text-slate-100">
                  No matching documents found
                </p>
                <p className="text-[12.5px] text-[#64748B] dark:text-slate-400">
                  Clear your search filter or upload a new invoice or receipt above.
                </p>
                {localSearch && (
                  <button
                    type="button"
                    onClick={() => setLocalSearch('')}
                    className="mt-1 px-3 py-1.5 rounded-lg border border-[#E8ECF3] dark:border-slate-700 text-[12px] font-semibold text-[#635BFF] dark:text-indigo-300"
                  >
                    Clear filter
                  </button>
                )}
              </div>
            ) : (
              filteredDocs.map((doc) => {
                const isSelected = activeDoc?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setSelectedDocId(doc.id)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected
                        ? 'bg-[#635BFF]/[0.06] dark:bg-[#635BFF]/15'
                        : 'hover:bg-[#F8FAFC] dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-[#172033] dark:text-slate-100">
                        {doc.title}
                      </p>
                      <span className="text-[11.5px] font-medium text-[#16A34A] whitespace-nowrap">
                        {doc.ocrStatus}
                      </span>
                    </div>
                    <p className="font-mono text-[11.5px] text-[#64748B] dark:text-slate-400 mt-1 truncate">
                      {doc.fileName}
                    </p>
                    <div className="flex items-center justify-between mt-2 text-[12px] text-[#64748B] dark:text-slate-400">
                      <span className="capitalize">{doc.type}</span>
                      {doc.contradictions.length > 0 && (
                        <span className="text-[#F59E0B] font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {doc.contradictions.length} Mismatch
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Document Detail Inspector */}
        {activeDoc && (
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E8ECF3] dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-medium text-[#635BFF] dark:text-indigo-300 capitalize">
                  {activeDoc.type} · Scan {activeDoc.ocrStatus}
                </p>
                <h3 className="font-display text-[18px] font-bold text-[#172033] dark:text-slate-100 mt-0.5">
                  {activeDoc.title}
                </h3>
                <p className="font-mono text-[12px] text-[#64748B] dark:text-slate-400 mt-0.5">
                  {activeDoc.fileName} · {activeDoc.uploadedAt.slice(0, 10)}
                </p>
              </div>
            </div>

            {activeDoc.previewUrl ? (
              <div className="rounded-lg overflow-hidden border border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 p-2">
                <img
                  src={activeDoc.previewUrl}
                  alt={activeDoc.title}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-80 object-contain mx-auto rounded"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-[#E8ECF3] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 p-5 flex items-center gap-3">
                <FileText className="h-8 w-8 text-[#635BFF] shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                    {activeDoc.fileName}
                  </p>
                  <p className="text-[12px] text-[#64748B] dark:text-slate-400">
                    Structured text &amp; metadata indexed in your Document Vault
                  </p>
                </div>
              </div>
            )}

            {activeDoc.contradictions.length > 0 && (
              <div className="p-4 rounded-lg bg-[#FFFBEB] dark:bg-amber-950/50 border border-[#FDE68A] dark:border-amber-800 space-y-1.5">
                <p className="text-[13px] font-semibold text-[#B45309] dark:text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Date or Detail Mismatch Detected
                </p>
                {activeDoc.contradictions.map((c) => (
                  <p key={c.id} className="text-[12.5px] text-[#92400E] dark:text-amber-200">
                    <span className="font-semibold">{c.field}: </span>
                    {c.description}
                  </p>
                ))}
              </div>
            )}

            <div>
              <h4 className="text-[13px] font-semibold text-[#172033] dark:text-slate-100 mb-3">
                Extracted Details
              </h4>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[13px] p-4 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700">
                <div>
                  <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Merchant / Store</dt>
                  <dd className="font-medium text-[#172033] dark:text-slate-100">
                    {activeDoc.extractedFields.merchant ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Product</dt>
                  <dd className="font-medium text-[#172033] dark:text-slate-100">
                    {activeDoc.extractedFields.product ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Purchase Date</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#172033] dark:text-slate-100">
                    {activeDoc.extractedFields.purchaseDate ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Invoice / Order #</dt>
                  <dd className="font-mono font-medium text-[#172033] dark:text-slate-100">
                    {activeDoc.extractedFields.invoiceNumber ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Total Amount</dt>
                  <dd className="font-mono tabular-nums font-semibold text-[#172033] dark:text-slate-100">
                    {activeDoc.extractedFields.totalAmount ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B] dark:text-slate-400">Warranty Expiration</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#172033] dark:text-slate-100">
                    {activeDoc.extractedFields.warrantyExpiration ?? activeDoc.extractedFields.warrantyPeriod ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-2">
              <h4 className="text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                Source Citations
              </h4>
              <ul className="space-y-1.5 text-[12.5px] text-[#475569] dark:text-slate-300">
                {activeDoc.citations.map((cit, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0 mt-0.5" />
                    <span>{cit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-[13px] font-semibold text-[#172033] dark:text-slate-100">
                Extracted Text
              </h4>
              <p className="p-3.5 rounded-lg bg-[#F8FAFC] dark:bg-slate-800 border border-[#E8ECF3] dark:border-slate-700 text-[12.5px] text-[#475569] dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {activeDoc.rawText}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
