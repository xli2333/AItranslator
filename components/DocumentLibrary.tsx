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
    <aside className="w-full lg:w-72 h-fit sticky top-24 no-print glass-surface rounded-[1.6rem] px-3 py-3">
      <div className="px-2 py-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <BookOpen className="w-4 h-4" />
          <span className="font-serif text-lg">文档库</span>
        </div>
        <button
          type="button"
          className="p-2 rounded-full hover:bg-black/5 text-gray-500"
          onClick={onReload}
          title="刷新文档"
          disabled={loading}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-2 pt-2 pb-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-2xl bg-black text-white py-2.5 text-sm tracking-[0.12em] hover:bg-[#22242a] transition-colors"
        >
          新建翻译任务
        </button>
      </div>

      <div className="max-h-[62vh] overflow-y-auto pb-1">
        {documents.length === 0 && (
          <p className="px-3 py-3 text-xs text-gray-400">暂时还没有文档</p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`mx-2 mb-2 rounded-2xl px-3 py-3 transition-all ${
              activeDocumentId === doc.id
                ? 'bg-black text-white shadow-lg'
                : 'bg-white/80 text-[#17181d] hover:bg-white'
            }`}
          >
            <button type="button" className="w-full text-left" onClick={() => onOpen(doc.id)}>
              <div className="text-sm font-medium line-clamp-1">{doc.title}</div>
              <div className={`text-[11px] mt-1 line-clamp-1 ${activeDocumentId === doc.id ? 'text-gray-300' : 'text-gray-500'}`}>
                {doc.sourceLang} → {doc.targetLang}
              </div>
              <div className={`text-[10px] mt-1 ${activeDocumentId === doc.id ? 'text-gray-400' : 'text-gray-400'}`}>{formatTime(doc.updatedAt)}</div>
            </button>
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onDelete(doc.id)}
                className={`p-1.5 rounded-full transition-colors ${
                  activeDocumentId === doc.id
                    ? 'text-gray-300 hover:text-red-300 hover:bg-white/10'
                    : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                }`}
                title="删除文档"
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
