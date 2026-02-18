import React, { useMemo, useState } from 'react';
import { AnnotationRecord, LayoutBlock, ProcessedPage, SelectionSnippet, ViewMode } from '../types';
import { Loader2, MessageCircle, Pencil, Send, X } from 'lucide-react';
import { modifyPageContent } from '../services/geminiService';
import { getTypographyScale } from '../services/typographyService';
import { ensureSentencePairs, findSentenceIndexByOffset, findSentenceIndexByText, SentenceSegment, splitSentences } from '../services/sentenceAlignService';

interface Props {
  page: ProcessedPage;
  targetLang: string;
  apiKey: string;
  viewMode: ViewMode;
  onUpdatePage: (pageId: number, newBlocks: LayoutBlock[]) => void;
  onStartPageChat: (pageNumber: number) => void;
  onSelectSnippet: (payload: SelectionSnippet) => void;
  annotationsByBlockId: Record<string, AnnotationRecord[]>;
  activeAnnotationId: string | null;
  onActivateAnnotation: (annotationId: string) => void;
}

const WEB_BASE_FONT_SIZE: Record<LayoutBlock['type'], number> = {
  header: 10,
  footer: 10,
  h1: 48,
  h2: 30,
  h3: 24,
  paragraph: 18,
  list_item: 18,
  caption: 12,
  quote: 30,
  callout: 18,
  image: 12,
};

const WEB_BASE_LINE_HEIGHT: Record<LayoutBlock['type'], number> = {
  header: 1.35,
  footer: 1.35,
  h1: 1.05,
  h2: 1.2,
  h3: 1.3,
  paragraph: 1.75,
  list_item: 1.65,
  caption: 1.45,
  quote: 1.45,
  callout: 1.65,
  image: 1.5,
};

const resolveTypographyStyle = (block: LayoutBlock): React.CSSProperties => {
  const baseSize = WEB_BASE_FONT_SIZE[block.type] ?? 16;
  const fontSize = Math.max(10, Math.min(baseSize * getTypographyScale(block), 72));
  const lineHeight = WEB_BASE_LINE_HEIGHT[block.type] ?? 1.6;
  return { fontSize: `${fontSize.toFixed(1)}px`, lineHeight };
};

const clamp = (num: number, min: number, max: number) => Math.min(max, Math.max(min, num));

const normalize = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.!?。！？；;]+$/g, '');

const renderAnnotatedText = (
  content: string,
  annotations: AnnotationRecord[],
  activeAnnotationId: string | null,
  onActivate: (annotationId: string) => void,
) => {
  if (!annotations.length) return <>{content}</>;

  const sorted = [...annotations].sort((a, b) => a.startOffset - b.startOffset);
  const nodes: React.ReactNode[] = [];
  let cursor = 0;

  for (const annotation of sorted) {
    const start = clamp(annotation.startOffset, 0, content.length);
    const end = clamp(annotation.endOffset, start, content.length);
    if (start > cursor) {
      nodes.push(<React.Fragment key={`${annotation.id}-pre`}>{content.slice(cursor, start)}</React.Fragment>);
    }
    const slice = content.slice(start, end);
    if (slice) {
      nodes.push(
        <mark
          key={annotation.id}
          className={`cursor-pointer rounded px-0.5 ${annotation.id === activeAnnotationId ? 'ring-1 ring-black' : ''}`}
          style={{ backgroundColor: annotation.color || '#fde68a' }}
          title={annotation.note || 'annotation'}
          onClick={() => onActivate(annotation.id)}
        >
          {slice}
        </mark>,
      );
    }
    cursor = Math.max(cursor, end);
  }

  if (cursor < content.length) {
    nodes.push(<React.Fragment key="tail">{content.slice(cursor)}</React.Fragment>);
  }

  return <>{nodes}</>;
};

const sentenceOverlapWithAnnotations = (sentence: SentenceSegment, annotations: AnnotationRecord[]) => {
  return annotations.some((item) => !(sentence.end <= item.startOffset || sentence.start >= item.endOffset));
};

const resolveSourceSentenceIndex = (
  block: LayoutBlock,
  targetSentenceIndex: number,
  sourceSentences: SentenceSegment[],
  targetSentences: SentenceSegment[],
) => {
  if (sourceSentences.length === 0) return -1;
  if (targetSentences.length === 0) return 0;

  const pairs = ensureSentencePairs(block);
  if (pairs.length > 0 && targetSentenceIndex >= 0 && targetSentenceIndex < targetSentences.length) {
    const targetSentence = targetSentences[targetSentenceIndex];
    const match = pairs.find((item) => {
      const targetNorm = normalize(item.target);
      if (!targetNorm) return false;
      const sentenceNorm = normalize(targetSentence.text);
      return sentenceNorm.includes(targetNorm) || targetNorm.includes(sentenceNorm);
    });
    if (match?.source) {
      const sourceNorm = normalize(match.source);
      const idx = sourceSentences.findIndex((item) => {
        const sentenceNorm = normalize(item.text);
        return sentenceNorm.includes(sourceNorm) || sourceNorm.includes(sentenceNorm);
      });
      if (idx >= 0) return idx;
    }
  }

  return clamp(Math.floor((targetSentenceIndex * sourceSentences.length) / targetSentences.length), 0, sourceSentences.length - 1);
};

const BilingualTextBlock: React.FC<{
  block: LayoutBlock;
  annotations: AnnotationRecord[];
  activeAnnotationId: string | null;
  linkedSourceSentence: number;
  linkedTargetSentence: number;
}> = ({
  block,
  annotations,
  activeAnnotationId,
  linkedSourceSentence,
  linkedTargetSentence,
}) => {
  const sourceText = block.originalContent?.trim() || '';
  const targetText = block.content || '';
  const sourceSentences = splitSentences(sourceText);
  const targetSentences = splitSentences(targetText);

  const sourceFallback = sourceSentences.length === 0 && sourceText ? [sourceText] : [];
  const targetFallback = targetSentences.length === 0 && targetText ? [targetText] : [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2">English Source</div>
        {sourceSentences.length > 0 ? sourceSentences.map((sentence) => (
          <span
            key={`src-${block.id}-${sentence.index}`}
            data-column="source"
            data-sentence-index={sentence.index}
            className={`inline ${linkedSourceSentence === sentence.index ? 'bg-blue-200/80 rounded px-0.5' : ''}`}
          >
            {sentence.text}
            {' '}
          </span>
        )) : sourceFallback}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-gray-400 mb-2">Chinese Translation</div>
        <div data-block-text="true" data-column="target">
          {targetSentences.length > 0 ? targetSentences.map((sentence) => (
            <span
              key={`tgt-${block.id}-${sentence.index}`}
              data-column="target"
              data-sentence-index={sentence.index}
              className={`inline ${linkedTargetSentence === sentence.index ? 'bg-blue-200/80 rounded px-0.5' : ''} ${
                sentenceOverlapWithAnnotations(sentence, annotations) ? 'underline decoration-yellow-400 decoration-2' : ''
              }`}
            >
              {sentence.text}
              {' '}
            </span>
          )) : targetFallback}
        </div>

        {annotations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {annotations.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`text-left block w-full rounded-md px-2 py-1 text-xs ${
                  item.id === activeAnnotationId ? 'bg-gray-100 text-black' : 'text-gray-500 hover:bg-gray-50'
                }`}
                onClick={(e) => e.preventDefault()}
              >
                {item.note || item.selectedText}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const BlockRenderer: React.FC<{
  block: LayoutBlock;
  annotations: AnnotationRecord[];
  activeAnnotationId: string | null;
  onActivateAnnotation: (annotationId: string) => void;
  viewMode: ViewMode;
  linkedSourceSentence: number;
  linkedTargetSentence: number;
}> = ({
  block,
  annotations,
  activeAnnotationId,
  onActivateAnnotation,
  viewMode,
  linkedSourceSentence,
  linkedTargetSentence,
}) => {
  const typoStyle = resolveTypographyStyle(block);
  const calloutLabelSize = Math.max(Number.parseFloat(String(typoStyle.fontSize || 18)) * 0.55, 9);

  const translationText = (
    <span data-block-text="true" data-column="target">
      {renderAnnotatedText(block.content, annotations, activeAnnotationId, onActivateAnnotation)}
    </span>
  );

  if (viewMode === 'bilingual' && block.type !== 'image') {
    return (
      <div style={typoStyle}>
        <BilingualTextBlock
          block={block}
          annotations={annotations}
          activeAnnotationId={activeAnnotationId}
          linkedSourceSentence={linkedSourceSentence}
          linkedTargetSentence={linkedTargetSentence}
        />
      </div>
    );
  }

  switch (block.type) {
    case 'header':
      return (
        <div className="w-full border-b border-gray-100 pb-2 mb-8 flex justify-between items-center tracking-[0.2em] text-gray-400 font-sans" style={typoStyle}>
          {translationText}
          <span className="w-2 h-2 rounded-full bg-gray-100" />
        </div>
      );
    case 'footer':
      return (
        <div className="w-full border-t border-gray-100 pt-6 mt-12 flex justify-center text-gray-400 font-sans tracking-wider" style={typoStyle}>
          {translationText}
        </div>
      );
    case 'h1':
      return <h1 className="font-serif font-medium text-gray-900 mb-8 mt-10 tracking-tight" style={typoStyle}>{translationText}</h1>;
    case 'h2':
      return <h2 className="font-sans font-bold text-black mb-4 mt-12 tracking-wide border-l-4 border-black pl-4" style={typoStyle}>{translationText}</h2>;
    case 'h3':
      return <h3 className="font-serif font-bold text-gray-800 mb-3 mt-8" style={typoStyle}>{translationText}</h3>;
    case 'paragraph':
      return <p className="font-serif text-gray-600 mb-6 text-justify" style={typoStyle}>{translationText}</p>;
    case 'quote':
      return (
        <blockquote className="my-10 border-l-2 border-accent pl-6 py-2">
          <p className="font-serif italic text-gray-800" style={typoStyle}>{translationText}</p>
        </blockquote>
      );
    case 'callout':
      return (
        <div className="my-8 p-8 bg-gray-50 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gray-200/20 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-150 duration-500" />
          <h4 className="font-sans font-bold tracking-widest text-gray-400 mb-4" style={{ fontSize: `${calloutLabelSize.toFixed(1)}px` }}>Note</h4>
          <div className="font-serif text-gray-800" style={typoStyle}>{translationText}</div>
        </div>
      );
    case 'list_item':
      return (
        <div className="flex items-start gap-4 mb-4 pl-2 group">
          <div className="h-1.5 w-1.5 rounded-full bg-gray-300 mt-2.5 shrink-0 group-hover:bg-black transition-colors" />
          <p className="font-serif text-gray-700" style={typoStyle}>{translationText}</p>
        </div>
      );
    case 'caption':
      return (
        <p className="font-sans text-gray-400 text-center tracking-wider mb-8 mt-3 border-b border-gray-100 pb-4 inline-block mx-auto" style={typoStyle}>
          {translationText}
        </p>
      );
    case 'image':
      return (
        <figure className="my-12 w-[110%] -ml-[5%] flex flex-col items-center print:w-full print:ml-0">
          <div className="relative w-full rounded-lg transition-all duration-500 hover:shadow-xl bg-white">
            {block.imageUrl ? (
              <img src={block.imageUrl} alt="translated visual block" className="w-full h-auto rounded-lg shadow-soft" />
            ) : (
              <div className="w-full aspect-video flex flex-col items-center justify-center bg-gray-50/50 rounded-lg border border-gray-100">
                <div className="w-12 h-12 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-4" />
                <span className="font-sans tracking-[0.2em] text-gray-400" style={typoStyle}>Rendering image...</span>
              </div>
            )}
          </div>
        </figure>
      );
    default:
      return <p className="text-base text-gray-600 mb-4">{translationText}</p>;
  }
};

const PageRenderer: React.FC<Props> = ({
  page,
  targetLang,
  apiKey,
  viewMode,
  onUpdatePage,
  onStartPageChat,
  onSelectSnippet,
  annotationsByBlockId,
  activeAnnotationId,
  onActivateAnnotation,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkedByBlock, setLinkedByBlock] = useState<Record<string, { source: number; target: number }>>({});

  const blockById = useMemo(() => {
    const map = new Map<string, LayoutBlock>();
    for (const block of page.blocks) map.set(block.id, block);
    return map;
  }, [page.blocks]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    if (!apiKey.trim()) {
      alert('Gemini API key is required for page edit.');
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

  const handleContentMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const selectedTextRaw = range.toString();
    const selectedText = selectedTextRaw.trim();
    if (!selectedText) return;

    const anchorNode = selection.anchorNode;
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const blockElement = anchorElement?.closest<HTMLElement>('[data-block-id]');
    if (!blockElement) return;

    const blockId = blockElement.getAttribute('data-block-id');
    if (!blockId) return;

    const columnElement = anchorElement?.closest<HTMLElement>('[data-column]');
    const column = columnElement?.getAttribute('data-column');
    if (viewMode === 'bilingual' && column === 'source') {
      return;
    }

    const textContainer = blockElement.querySelector<HTMLElement>('[data-block-text="true"][data-column="target"]')
      ?? blockElement.querySelector<HTMLElement>('[data-block-text="true"]')
      ?? blockElement;
    if (!textContainer.contains(range.startContainer) || !textContainer.contains(range.endContainer)) return;

    const preRange = document.createRange();
    preRange.selectNodeContents(textContainer);
    preRange.setEnd(range.startContainer, range.startOffset);

    let startOffset = preRange.toString().length;
    let endOffset = startOffset + selectedTextRaw.length;

    const leadingWhitespace = selectedTextRaw.length - selectedTextRaw.trimStart().length;
    const trailingWhitespace = selectedTextRaw.length - selectedTextRaw.trimEnd().length;
    startOffset += leadingWhitespace;
    endOffset -= trailingWhitespace;

    const block = blockById.get(blockId);
    if (!block) return;

    startOffset = clamp(startOffset, 0, block.content.length);
    endOffset = clamp(endOffset, startOffset, block.content.length);
    if (!selectedText) return;

    const targetSentences = splitSentences(block.content);
    const sourceSentences = splitSentences(block.originalContent || '');
    const sentenceIndexFromDom = (() => {
      const sentenceEl = anchorElement?.closest<HTMLElement>('[data-sentence-index]');
      if (!sentenceEl) return -1;
      const raw = sentenceEl.getAttribute('data-sentence-index');
      if (raw === null) return -1;
      const parsed = Number.parseInt(raw, 10);
      return Number.isNaN(parsed) ? -1 : parsed;
    })();

    let sentenceIndex = sentenceIndexFromDom;
    if (sentenceIndex < 0) {
      sentenceIndex = findSentenceIndexByOffset(targetSentences, startOffset);
    }
    if (sentenceIndex < 0) {
      sentenceIndex = findSentenceIndexByText(targetSentences, selectedText);
    }

    if (viewMode === 'bilingual' && sentenceIndex >= 0) {
      const sourceSentenceIndex = resolveSourceSentenceIndex(block, sentenceIndex, sourceSentences, targetSentences);
      setLinkedByBlock((prev) => ({
        ...prev,
        [blockId]: { source: sourceSentenceIndex, target: sentenceIndex },
      }));
    }

    onSelectSnippet({
      pageNumber: page.pageNumber,
      blockId,
      selectedText,
      startOffset,
      endOffset,
      sentenceIndex: sentenceIndex >= 0 ? sentenceIndex : undefined,
    });
  };

  return (
    <div className="page-container w-full bg-white shadow-2xl shadow-gray-200/50 rounded-lg mb-24 overflow-hidden relative break-inside-avoid group/page" id={`page-${page.pageNumber}`}>
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-multiply no-print" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

      {page.status === 'done' && !isEditing && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 opacity-0 group-hover/page:opacity-100 transition-all no-print">
          <button
            onClick={() => onStartPageChat(page.pageNumber)}
            className="p-2 bg-white/80 backdrop-blur rounded-full text-gray-400 hover:text-black hover:bg-white shadow-sm border border-transparent hover:border-gray-200 transition-all"
            title="Chat this page"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="p-2 bg-white/80 backdrop-blur rounded-full text-gray-400 hover:text-black hover:bg-white shadow-sm border border-transparent hover:border-gray-200 transition-all"
            title="Edit this page"
          >
            <Pencil className="w-4 h-4" />
          </button>
        </div>
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
                placeholder="Tell AI how to update this page..."
                className="w-full bg-gray-100 border-none rounded-xl px-4 py-3 pr-12 text-sm font-sans focus:ring-2 focus:ring-black/5"
                disabled={loading}
              />
              {loading && <Loader2 className="w-4 h-4 absolute right-4 top-3.5 animate-spin text-gray-400" />}
            </div>
            <button type="submit" disabled={loading || !prompt.trim()} className="p-3 bg-black text-white rounded-xl hover:bg-gray-800 disabled:opacity-50 transition-colors" title="Submit update">
              <Send className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => setIsEditing(false)} className="p-3 text-gray-400 hover:text-black hover:bg-gray-100 rounded-xl transition-colors" title="Cancel">
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
              <span className="font-sans text-xs font-bold tracking-widest">AI is analyzing page</span>
            </div>
          </div>
        </div>
      )}

      <div className={`page-content px-6 md:px-20 py-16 md:py-24 max-w-[1000px] mx-auto transition-opacity duration-1000 ${page.status === 'analyzing' ? 'opacity-10' : 'opacity-100'}`} onMouseUp={handleContentMouseUp}>
        {page.blocks.length === 0 && page.status === 'done' && (
          <div className="text-center py-20 text-gray-400 italic font-serif">
            No structured content was detected on this page.
          </div>
        )}

        {page.blocks.map((block) => (
          <div key={block.id} data-block-id={block.id}>
            <BlockRenderer
              block={block}
              annotations={annotationsByBlockId[block.id] ?? []}
              activeAnnotationId={activeAnnotationId}
              onActivateAnnotation={onActivateAnnotation}
              viewMode={viewMode}
              linkedSourceSentence={linkedByBlock[block.id]?.source ?? -1}
              linkedTargetSentence={linkedByBlock[block.id]?.target ?? -1}
            />
          </div>
        ))}
      </div>

      <div className="absolute bottom-6 right-8 text-[10px] font-sans text-gray-300 font-bold tracking-widest no-print">
        {page.pageNumber.toString().padStart(2, '0')}
      </div>
    </div>
  );
};

export default PageRenderer;
