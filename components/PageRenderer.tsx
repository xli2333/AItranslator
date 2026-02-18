import React, { useState } from 'react';
import { ProcessedPage, LayoutBlock } from '../types';
import { Pencil, Send, X, Loader2 } from 'lucide-react';
import { modifyPageContent } from '../services/geminiService';

interface Props {
  page: ProcessedPage;
  targetLang: string;
  apiKey: string;
  onUpdatePage: (pageId: number, newBlocks: LayoutBlock[]) => void;
}

const BlockRenderer: React.FC<{ block: LayoutBlock }> = ({ block }) => {
  const { type, content, imageUrl } = block;

  switch (type) {
    case 'header':
      return (
        <div className="w-full border-b border-gray-100 pb-2 mb-8 flex justify-between items-center text-[10px] tracking-[0.2em] text-gray-400 font-sans">
          <span>{content}</span>
          <span className="w-2 h-2 rounded-full bg-gray-100" />
        </div>
      );

    case 'footer':
      return (
        <div className="w-full border-t border-gray-100 pt-6 mt-12 flex justify-center text-[10px] text-gray-400 font-sans tracking-wider">
          {content}
        </div>
      );

    case 'h1':
      return <h1 className="text-5xl font-serif font-medium text-gray-900 mb-8 mt-10 leading-none tracking-tight">{content}</h1>;

    case 'h2':
      return <h2 className="text-2xl font-sans font-bold text-black mb-4 mt-12 tracking-wide border-l-4 border-black pl-4">{content}</h2>;

    case 'h3':
      return <h3 className="text-xl font-serif font-bold text-gray-800 mb-3 mt-8">{content}</h3>;

    case 'paragraph':
      return <p className="text-lg font-serif text-gray-600 leading-8 mb-6 text-justify">{content}</p>;

    case 'quote':
      return (
        <blockquote className="my-10 border-l-2 border-accent pl-6 py-2">
          <p className="font-serif text-2xl italic text-gray-800 leading-relaxed">
            “{content}”
          </p>
        </blockquote>
      );

    case 'callout':
      return (
        <div className="my-8 p-8 bg-gray-50 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gray-200/20 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-500" />
          <h4 className="font-sans text-xs font-bold tracking-widest text-gray-400 mb-4">注释</h4>
          <div className="font-serif text-lg text-gray-800 leading-relaxed">
            {content}
          </div>
        </div>
      );

    case 'list_item':
      return (
        <div className="flex items-start gap-4 mb-4 pl-2 group">
          <div className="h-1.5 w-1.5 rounded-full bg-gray-300 mt-2.5 shrink-0 group-hover:bg-black transition-colors" />
          <p className="text-lg font-serif text-gray-700 leading-relaxed">{content}</p>
        </div>
      );

    case 'caption':
      return <p className="text-xs font-sans text-gray-400 text-center tracking-wider mb-8 mt-3 border-b border-gray-100 pb-4 inline-block mx-auto">{content}</p>;

    case 'image':
      return (
        <figure className="my-12 w-[110%] -ml-[5%] flex flex-col items-center print:w-full print:ml-0">
          <div className="relative w-full rounded-lg transition-all duration-500 hover:shadow-xl bg-white">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="页面图像"
                className="w-full h-auto rounded-lg shadow-soft"
              />
            ) : (
              <div className="w-full aspect-video flex flex-col items-center justify-center bg-gray-50/50 rounded-lg border border-gray-100">
                <div className="w-12 h-12 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-4" />
                <span className="text-[10px] font-sans tracking-[0.2em] text-gray-400">正在重绘图像...</span>
              </div>
            )}
          </div>
        </figure>
      );

    default:
      return <p className="text-base text-gray-600 mb-4">{content}</p>;
  }
};

const PageRenderer: React.FC<Props> = ({ page, targetLang, apiKey, onUpdatePage }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    if (!apiKey.trim()) {
      alert('缺少 Gemini API Key，无法执行 AI 编辑。');
      return;
    }

    setLoading(true);
    try {
      const updatedBlocks = await modifyPageContent(page.blocks, prompt, targetLang, apiKey);
      onUpdatePage(page.pageNumber, updatedBlocks);
      setPrompt('');
      setIsEditing(false);
    } catch (err) {
      console.error('Edit failed', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container w-full bg-white shadow-2xl shadow-gray-200/50 rounded-lg mb-24 overflow-hidden relative break-inside-avoid group/page">
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-multiply no-print" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      {page.status === 'done' && !isEditing && (
        <button
          onClick={() => setIsEditing(true)}
          className="absolute top-4 right-4 z-20 p-2 bg-white/80 backdrop-blur rounded-full text-gray-400 hover:text-black hover:bg-white shadow-sm border border-transparent hover:border-gray-200 transition-all opacity-0 group-hover/page:opacity-100 translate-x-4 group-hover/page:translate-x-0 no-print"
          title="使用 AI 编辑此页"
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}

      {isEditing && (
        <div className="absolute top-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200 p-4 shadow-lg animate-fade-in-down no-print">
          <form onSubmit={handleEditSubmit} className="flex gap-2 items-start max-w-2xl mx-auto">
            <div className="flex-1 relative">
              <input
                autoFocus
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="告诉 AI 如何修改此页（例如：删除第二张图，语气更正式）"
                className="w-full bg-gray-100 border-none rounded-xl px-4 py-3 pr-12 text-sm font-sans focus:ring-2 focus:ring-black/5"
                disabled={loading}
              />
              {loading && <Loader2 className="w-4 h-4 absolute right-4 top-3.5 animate-spin text-gray-400" />}
            </div>
            <button
              type="submit"
              disabled={loading || !prompt.trim()}
              className="p-3 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors"
              title="提交修改"
            >
              <Send className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="p-3 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-colors"
              title="取消编辑"
            >
              <X className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {page.status === 'analyzing' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm transition-all duration-500 no-print">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-teal-500 blur-xl opacity-20 animate-pulse" />
            <div className="relative bg-white px-8 py-4 shadow-xl rounded-full flex items-center gap-4">
              <div className="w-2 h-2 bg-black rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-black rounded-full animate-bounce delay-75" />
              <div className="w-2 h-2 bg-black rounded-full animate-bounce delay-150" />
              <span className="font-sans text-xs font-bold tracking-widest">AI 正在重构页面</span>
            </div>
          </div>
        </div>
      )}

      <div className={`page-content px-6 md:px-20 py-16 md:py-24 max-w-[800px] mx-auto transition-opacity duration-1000 ${page.status === 'analyzing' ? 'opacity-10' : 'opacity-100'}`}>
        {page.blocks.length === 0 && page.status === 'done' && (
          <div className="text-center py-20 text-gray-400 italic font-serif">
            未检测到结构化内容。
          </div>
        )}

        {page.blocks.map((block) => (
          <BlockRenderer key={block.id} block={block} />
        ))}
      </div>

      <div className="absolute bottom-6 right-8 text-[10px] font-sans text-gray-300 font-bold tracking-widest no-print">
        {page.pageNumber.toString().padStart(2, '0')}
      </div>
    </div>
  );
};

export default PageRenderer;
