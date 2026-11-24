import { AlertTriangle, CheckCircle2, FileText, FileUp, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DocumentRecord, WorkspaceState } from '../shared/types';

interface DocumentsViewProps {
  workspace: WorkspaceState;
  globalSearch: string;
  onUploadDocument: (file: File, docType: DocumentRecord['type']) => Promise<void>;
}

export function DocumentsView({
  workspace,
  globalSearch,
  onUploadDocument,
}: DocumentsViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string>(workspace.documents[0]?.id ?? '');
  const [docType, setDocType] = useState<DocumentRecord['type']>('invoice');
  const [localSearch, setLocalSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
    setUploading(true);
    try {
      await onUploadDocument(file, docType);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Document upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload & Filter Bar */}
      <section className="bg-white border border-[#E8ECF3] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-[15px] font-semibold text-[#172033]">
            Document Intelligence & OCR Vault
          </h2>
          <p className="text-[12.5px] text-[#64748B]">
            Upload PDF invoices, warranty certificates, screenshots, or payment receipts for structured extraction and contradiction checking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <select
            aria-label="Document category for upload"
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentRecord['type'])}
            className="h-9 px-3 text-[13px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] focus:outline-none focus:border-[#635BFF]"
          >
            <option value="invoice">Invoice</option>
            <option value="warranty">Warranty Policy</option>
            <option value="receipt">Payment Receipt</option>
            <option value="upload">Supporting Screenshot</option>
          </select>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*,.txt,.csv"
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
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#635BFF] text-white text-[13px] font-semibold hover:bg-[#5249F5] disabled:opacity-50 whitespace-nowrap"
          >
            <FileUp className="h-4 w-4" />
            <span>{uploading ? 'Extracting...' : 'Upload Document'}</span>
          </button>
        </div>
      </section>

      {uploadError && (
        <div role="alert" className="p-3.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-[13px] text-[#DC2626]">
          {uploadError}
        </div>
      )}

      {/* Vault Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 bg-white border border-[#E8ECF3] rounded-xl overflow-hidden">
          <div className="p-3.5 border-b border-[#E8ECF3]">
            <div className="relative">
              <Search className="h-4 w-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                aria-label="Search uploaded documents"
                placeholder="Search filenames or extracted text..."
                className="w-full h-9 pl-9 pr-3 text-[13px] bg-[#F8FAFC] border border-[#E8ECF3] rounded-lg text-[#172033] focus:outline-none focus:border-[#635BFF]"
              />
            </div>
          </div>

          <div className="divide-y divide-[#E8ECF3]">
            {filteredDocs.map((doc) => {
              const isSelected = activeDoc?.id === doc.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => setSelectedDocId(doc.id)}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected ? 'bg-[#635BFF]/[0.05]' : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[13.5px] font-semibold text-[#172033]">{doc.title}</p>
                    <span className="text-[11.5px] font-medium text-[#16A34A] whitespace-nowrap">
                      {doc.ocrStatus}
                    </span>
                  </div>
                  <p className="font-mono text-[11.5px] text-[#64748B] mt-1 truncate">
                    {doc.fileName}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-[12px] text-[#64748B]">
                    <span className="capitalize">{doc.type}</span>
                    {doc.contradictions.length > 0 && (
                      <span className="text-[#F59E0B] font-semibold flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {doc.contradictions.length} Contradiction
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Document Detail Inspector */}
        {activeDoc && (
          <div className="lg:col-span-7 bg-white border border-[#E8ECF3] rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-medium text-[#635BFF] capitalize">
                  {activeDoc.type} · OCR {activeDoc.ocrStatus}
                </p>
                <h3 className="font-display text-[18px] font-bold text-[#172033] mt-0.5">
                  {activeDoc.title}
                </h3>
                <p className="font-mono text-[12px] text-[#64748B] mt-0.5">
                  {activeDoc.fileName} · {activeDoc.uploadedAt.slice(0, 10)}
                </p>
              </div>
            </div>

            {/* Visual Scan Preview if image/previewUrl available */}
            {activeDoc.previewUrl ? (
              <div className="rounded-lg overflow-hidden border border-[#E8ECF3] bg-[#F8FAFC] p-2">
                <img
                  src={activeDoc.previewUrl}
                  alt={activeDoc.title}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-80 object-contain mx-auto rounded"
                />
              </div>
            ) : (
              <div className="rounded-lg border border-[#E8ECF3] bg-[#F8FAFC] p-5 flex items-center gap-3">
                <FileText className="h-8 w-8 text-[#635BFF] shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-[#172033]">{activeDoc.fileName}</p>
                  <p className="text-[12px] text-[#64748B]">
                    Structured text & OCR layer indexed by Document MCP
                  </p>
                </div>
              </div>
            )}

            {/* Contradiction Detection */}
            {activeDoc.contradictions.length > 0 && (
              <div className="p-4 rounded-lg bg-[#FFFBEB] border border-[#FDE68A] space-y-1.5">
                <p className="text-[13px] font-semibold text-[#B45309] flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4" />
                  Contradiction Detected Across Linked Documents
                </p>
                {activeDoc.contradictions.map((c) => (
                  <p key={c.id} className="text-[12.5px] text-[#92400E]">
                    <span className="font-semibold">{c.field}: </span>
                    {c.description}
                  </p>
                ))}
              </div>
            )}

            {/* Extracted Fields */}
            <div>
              <h4 className="text-[13px] font-semibold text-[#172033] mb-3">
                Extracted Structured Metadata
              </h4>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-[13px] p-4 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3]">
                <div>
                  <dt className="text-[11.5px] text-[#64748B]">Merchant / Issuer</dt>
                  <dd className="font-medium text-[#172033]">{activeDoc.extractedFields.merchant ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B]">Product</dt>
                  <dd className="font-medium text-[#172033]">{activeDoc.extractedFields.product ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B]">Purchase Date</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#172033]">
                    {activeDoc.extractedFields.purchaseDate ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B]">Invoice / Order #</dt>
                  <dd className="font-mono font-medium text-[#172033]">
                    {activeDoc.extractedFields.invoiceNumber ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B]">Total Amount</dt>
                  <dd className="font-mono tabular-nums font-semibold text-[#172033]">
                    {activeDoc.extractedFields.totalAmount ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] text-[#64748B]">Warranty Expiration</dt>
                  <dd className="font-mono tabular-nums font-medium text-[#172033]">
                    {activeDoc.extractedFields.warrantyExpiration ?? activeDoc.extractedFields.warrantyPeriod ?? '—'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Citations & Extracted OCR Text */}
            <div className="space-y-2">
              <h4 className="text-[13px] font-semibold text-[#172033]">Source Citations</h4>
              <ul className="space-y-1.5 text-[12.5px] text-[#475569]">
                {activeDoc.citations.map((cit, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0 mt-0.5" />
                    <span>{cit}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-1.5">
              <h4 className="text-[13px] font-semibold text-[#172033]">Extracted Document Text</h4>
              <p className="p-3.5 rounded-lg bg-[#F8FAFC] border border-[#E8ECF3] text-[12.5px] text-[#475569] leading-relaxed">
                {activeDoc.rawText}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
