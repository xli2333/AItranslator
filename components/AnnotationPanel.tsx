import React, { useMemo, useState } from 'react';
import { AnnotationRecord, SelectionSnippet } from '../types';
import { Highlighter, Save, Trash2 } from 'lucide-react';

interface Props {
  annotations: AnnotationRecord[];
  activeAnnotationId: string | null;
  pendingSnippet: SelectionSnippet | null;
  onCreate: (note: string, color: string) => Promise<void>;
  onDelete: (annotationId: string) => Promise<void>;
  onUpdateNote: (annotationId: string, note: string) => Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
}

const DEFAULT_COLORS = ['#fde68a', '#bfdbfe', '#fecdd3', '#bbf7d0'];

const AnnotationPanel: React.FC<Props> = ({
  annotations,
  activeAnnotationId,
  pendingSnippet,
  onCreate,
  onDelete,
  onUpdateNote,
  onFocusAnnotation,
}) => {
  const [newNote, setNewNote] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const [editText, setEditText] = useState<Record<string, string>>({});
  const sorted = useMemo(() => {
    return [...annotations].sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
      return a.startOffset - b.startOffset;
    });
  }, [annotations]);

  const handleCreate = async () => {
    if (!pendingSnippet || saving) return;
    setSaving(true);
    try {
      await onCreate(newNote.trim(), newColor);
      setNewNote('');
      setNewColor(DEFAULT_COLORS[0]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="w-full lg:w-80 bg-white border border-gray-200 rounded-2xl shadow-sm h-fit sticky top-24 no-print">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Highlighter className="w-4 h-4" />
        <span className="text-sm font-semibold">Annotations</span>
      </div>

      {pendingSnippet && (
        <div className="p-3 border-b border-gray-100 bg-yellow-50/40">
          <p className="text-xs text-gray-600 mb-2">
            Selected text in page {pendingSnippet.pageNumber}
          </p>
          <p className="text-xs text-gray-700 bg-white border border-yellow-200 rounded-lg px-2 py-1">
            {pendingSnippet.selectedText}
          </p>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Add a note..."
            className="mt-2 w-full h-16 resize-none text-sm border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-5 h-5 rounded-full border ${newColor === color ? 'border-black' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewColor(color)}
                  title={color}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-black text-white text-xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
          </div>
        </div>
      )}

      <div className="max-h-[56vh] overflow-y-auto p-3 space-y-2">
        {sorted.length === 0 && (
          <p className="text-xs text-gray-400">No annotations.</p>
        )}
        {sorted.map((item) => {
          const local = editText[item.id] ?? item.note;
          return (
            <div
              key={item.id}
              className={`rounded-xl border p-2 ${
                item.id === activeAnnotationId ? 'border-black bg-gray-50' : 'border-gray-200'
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onFocusAnnotation(item.id)}
              >
                <div className="text-[11px] text-gray-500">P{item.pageNumber} · {item.blockId}</div>
                <div className="mt-1 text-xs line-clamp-2" style={{ backgroundColor: item.color }}>
                  {item.selectedText}
                </div>
              </button>

              <textarea
                value={local}
                onChange={(e) => setEditText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className="mt-2 w-full h-14 resize-none text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-black"
              />
              <div className="mt-2 flex justify-between">
                <button
                  type="button"
                  className="text-[11px] text-gray-500 hover:text-black"
                  onClick={() => onUpdateNote(item.id, local)}
                >
                  Update
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600"
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export default AnnotationPanel;
