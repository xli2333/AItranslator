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
    <aside className="w-full lg:w-80 h-fit sticky top-24 no-print glass-surface rounded-[1.6rem] overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-2">
        <Highlighter className="w-4 h-4" />
        <span className="font-serif text-lg">标注</span>
      </div>

      {pendingSnippet && (
        <div className="mx-3 mb-2 rounded-2xl bg-white/80 px-3 py-3">
          <p className="text-xs text-gray-500 mb-2">
            第 {pendingSnippet.pageNumber} 页选中文本
          </p>
          <p className="text-xs text-gray-700 rounded-xl px-2 py-2 bg-[#fffbe9]">
            {pendingSnippet.selectedText}
          </p>
          <textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="输入备注"
            className="mt-2 w-full h-16 resize-none text-sm rounded-xl px-2.5 py-2 outline-none bg-white"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-2">
              {DEFAULT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`w-5 h-5 rounded-full transition-transform ${newColor === color ? 'scale-110' : ''}`}
                  style={{
                    backgroundColor: color,
                    boxShadow: newColor === color ? '0 0 0 2px rgba(17,17,17,0.24)' : undefined,
                  }}
                  onClick={() => setNewColor(color)}
                  title={color}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black text-white text-xs tracking-[0.08em] disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              保存
            </button>
          </div>
        </div>
      )}

      <div className="max-h-[58vh] overflow-y-auto p-3 space-y-2">
        {sorted.length === 0 && (
          <p className="text-xs text-gray-400">暂无标注</p>
        )}
        {sorted.map((item) => {
          const local = editText[item.id] ?? item.note;
          return (
            <div
              key={item.id}
              className={`rounded-2xl p-2.5 transition-all ${
                item.id === activeAnnotationId ? 'bg-black text-white' : 'bg-white/80'
              }`}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onFocusAnnotation(item.id)}
              >
                <div className={`text-[11px] ${item.id === activeAnnotationId ? 'text-gray-300' : 'text-gray-500'}`}>
                  第 {item.pageNumber} 页 · 片段 {item.blockId}
                </div>
                <div className="mt-1 text-xs line-clamp-2 rounded px-1.5 py-1" style={{ backgroundColor: item.color, color: '#111' }}>
                  {item.selectedText}
                </div>
              </button>

              <textarea
                value={local}
                onChange={(e) => setEditText((prev) => ({ ...prev, [item.id]: e.target.value }))}
                className={`mt-2 w-full h-14 resize-none text-xs rounded-lg px-2 py-1.5 outline-none ${
                  item.id === activeAnnotationId ? 'bg-white/15 text-white placeholder:text-gray-300' : 'bg-white text-gray-700'
                }`}
                placeholder="编辑备注"
              />
              <div className="mt-2 flex justify-between">
                <button
                  type="button"
                  className={`text-[11px] ${item.id === activeAnnotationId ? 'text-gray-200 hover:text-white' : 'text-gray-500 hover:text-black'}`}
                  onClick={() => onUpdateNote(item.id, local)}
                >
                  更新
                </button>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1 text-[11px] ${
                    item.id === activeAnnotationId ? 'text-red-300 hover:text-red-200' : 'text-red-500 hover:text-red-600'
                  }`}
                  onClick={() => onDelete(item.id)}
                >
                  <Trash2 className="w-3 h-3" />
                  删除
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
