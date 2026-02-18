import React from 'react';
import { DocumentSummary } from '../types';
import { BookOpen, Loader2, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  documents: DocumentSummary[];
  activeDocumentId: string | null;
  loading: boolean;
  onReload: () => void;
  onOpen: (documentId: string) => void;
  onDelete: (documentId: string) => void;
  onNew: () => void;
}

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return date.toLocaleString();
};

const DocumentLibrary: React.FC<Props> = ({
  documents,
  activeDocumentId,
  loading,
  onReload,
  onOpen,
  onDelete,
  onNew,
}) => {
  return (
    <aside className="w-full lg:w-72 bg-white border border-gray-200 rounded-2xl shadow-sm h-fit sticky top-24 no-print">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BookOpen className="w-4 h-4" />
          My Documents
        </div>
        <button
          type="button"
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
          onClick={onReload}
          title="Reload"
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-xl border border-dashed border-gray-300 py-2 text-sm text-gray-700 hover:border-black hover:text-black transition-colors"
        >
          New Translation Session
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto pb-2">
        {documents.length === 0 && (
          <p className="px-4 pb-4 text-xs text-gray-400">No documents yet.</p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`mx-3 mb-2 rounded-xl border px-3 py-2 ${
              activeDocumentId === doc.id ? 'border-black bg-gray-50' : 'border-gray-200 bg-white'
            }`}
          >
            <button type="button" className="w-full text-left" onClick={() => onOpen(doc.id)}>
              <div className="text-sm font-semibold line-clamp-1">{doc.title}</div>
              <div className="text-[11px] text-gray-500 mt-1 line-clamp-1">
                {doc.sourceLang} {'->'} {doc.targetLang}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">{formatTime(doc.updatedAt)}</div>
            </button>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onDelete(doc.id)}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default DocumentLibrary;
