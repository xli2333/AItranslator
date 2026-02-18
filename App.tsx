import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Download, KeyRound, Loader2, LogOut, Square } from 'lucide-react';
import {
  AnnotationRecord,
  AppStatus,
  ChatMessage,
  ChatScope,
  DocumentSummary,
  Language,
  LayoutBlock,
  ProcessedPage,
  SelectionSnippet,
  ViewMode,
} from './types';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import {
  appendChatMessage,
  createDocument,
  deleteAnnotation,
  deleteChatScope,
  deleteDocument,
  ensureThread,
  listDocumentsByUser,
  loadDocumentSnapshot,
  saveAnnotation,
  updateDocumentMeta,
  uploadExportedPdf,
  uploadSourcePdf,
  upsertDocumentPages,
} from './services/persistenceService';
import { harmonizeTypographyForBlocks } from './services/typographyService';
import { analyzePageLayout, chatWithTranslation, translateImageBlockWithRetry } from './services/geminiService';
import AuthPanel from './components/AuthPanel';
import DocumentLibrary from './components/DocumentLibrary';
import AnnotationPanel from './components/AnnotationPanel';
import TranslationChatPanel from './components/TranslationChatPanel';
import PageRenderer from './components/PageRenderer';
import FileUpload from './components/FileUpload';
import LanguageSelector from './components/LanguageSelector';

const GEMINI_KEY_STORAGE_KEY = 'fluxtranslate_gemini_key';
const createDocumentScope = (): ChatScope => ({ key: 'document', kind: 'document', label: '全文对话' });

const localizeScopeLabel = (scope: ChatScope): ChatScope => {
  if (scope.kind === 'document') return { ...scope, label: '全文对话' };
  if (scope.kind === 'page') return { ...scope, label: `第 ${scope.pageNumber ?? '-'} 页` };
  return { ...scope, label: `选中 第 ${scope.pageNumber ?? '-'} 页` };
};

const sortScopes = (scopes: ChatScope[]) => [...scopes].sort((a, b) => {
  const rank = (s: ChatScope) => (s.kind === 'document' ? 0 : s.kind === 'page' ? 1 : 2);
  const diff = rank(a) - rank(b);
  if (diff) return diff;
  return (a.pageNumber ?? 0) - (b.pageNumber ?? 0);
});

const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [progress, setProgress] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [sourceLang, setSourceLang] = useState<string>('自动检测');
  const [targetLang, setTargetLang] = useState<string>(Language.ZH);
  const [viewMode, setViewMode] = useState<ViewMode>('translation');
  const [customInstruction, setCustomInstruction] = useState('');
  const [pageRange, setPageRange] = useState('全部');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [pages, setPages] = useState<ProcessedPage[]>([]);
  const [annotations, setAnnotations] = useState<AnnotationRecord[]>([]);
  const [pendingSnippet, setPendingSnippet] = useState<SelectionSnippet | null>(null);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);

  const [chatScopes, setChatScopes] = useState<Record<string, ChatScope>>({ document: createDocumentScope() });
  const [chatMessages, setChatMessages] = useState<Record<string, ChatMessage[]>>({ document: [] });
  const [activeChatKey, setActiveChatKey] = useState('document');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const processingRef = useRef(false);
  const stopRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const confirmApiKey = () => {
    const trimmed = apiKeyDraft.trim();
    if (!trimmed) {
      alert('请输入 Gemini 密钥。');
      return;
    }
    setApiKey(trimmed);
    setApiKeyDraft(trimmed);
    window.localStorage.setItem(GEMINI_KEY_STORAGE_KEY, trimmed);
  };

  const refreshDocuments = async () => {
    if (!session?.user) return;
    setDocumentsLoading(true);
    try {
      setDocuments(await listDocumentsByUser());
    } finally {
      setDocumentsLoading(false);
    }
  };

  useEffect(() => {
    const stored = window.localStorage.getItem(GEMINI_KEY_STORAGE_KEY)?.trim();
    if (stored) {
      setApiKey(stored);
      setApiKeyDraft(stored);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthReady(true);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_evt, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activeDocumentId || !pages.length) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      upsertDocumentPages(activeDocumentId, pages).catch(console.error);
      updateDocumentMeta(activeDocumentId, { sourceLang, targetLang }).catch(console.error);
    }, 900);
  }, [pages, activeDocumentId, sourceLang, targetLang]);

  const parsePageRange = (rangeStr: string, totalPages: number) => {
    const clean = rangeStr.trim().toLowerCase();
    if (!clean || clean === 'all' || clean === '全部') return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pagesSet = new Set<number>();
    clean.split(/[,，]/).forEach((part) => {
      if (!part.trim()) return;
      if (part.includes('-')) {
        const [s, e] = part.split('-').map((n) => parseInt(n, 10));
        if (!Number.isNaN(s) && !Number.isNaN(e)) for (let i = s; i <= e; i += 1) if (i >= 1 && i <= totalPages) pagesSet.add(i);
      } else {
        const n = parseInt(part, 10);
        if (!Number.isNaN(n) && n >= 1 && n <= totalPages) pagesSet.add(n);
      }
    });
    return Array.from(pagesSet).sort((a, b) => a - b);
  };

  const cropImage = async (base64Page: string, box: [number, number, number, number]): Promise<string> => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const [ymin, xmin, ymax, xmax] = box;
      const canvas = document.createElement('canvas');
      const x = (xmin / 1000) * img.width;
      const y = (ymin / 1000) * img.height;
      const w = ((xmax - xmin) / 1000) * img.width;
      const h = ((ymax - ymin) / 1000) * img.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve('');
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = base64Page;
  });

  const processPipeline = async (initialPages: ProcessedPage[], docId: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (let i = 0; i < initialPages.length; i += 1) {
        if (stopRef.current) break;
        setProgress(`正在分析第 ${initialPages[i].pageNumber} 页...`);
        setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, status: 'analyzing' } : p)));

        const blocks = harmonizeTypographyForBlocks(await analyzePageLayout(initialPages[i].originalImageUrl, sourceLang, targetLang, apiKey, customInstruction));
        setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, status: 'generating_images', blocks } : p)));

        const updated = [...blocks];
        const imageBlocks = blocks.filter((b) => b.type === 'image' && b.box);
        for (const imgBlock of imageBlocks) {
          if (stopRef.current) break;
          const crop = await cropImage(initialPages[i].originalImageUrl, imgBlock.box!);
          const translated = await translateImageBlockWithRetry(crop, targetLang, apiKey, { retries: 3, initialDelayMs: 900 });
          const idx = updated.findIndex((b) => b.id === imgBlock.id);
          if (idx >= 0) updated[idx] = { ...updated[idx], imageUrl: translated ?? crop };
          setPages((curr) => curr.map((p, pi) => (pi === i ? { ...p, blocks: updated } : p)));
        }

        setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, status: 'done' } : p)));
      }
      setStatus(AppStatus.COMPLETED);
      setProgress(stopRef.current ? '已停止' : '处理完成');
      await upsertDocumentPages(docId, pages);
    } catch (error) {
      console.error(error);
      setStatus(AppStatus.ERROR);
      setProgress('处理失败');
    } finally {
      processingRef.current = false;
    }
  };

  const resetWorkspace = () => {
    setStatus(AppStatus.IDLE);
    setPages([]);
    setAnnotations([]);
    setPendingSnippet(null);
    setActiveAnnotationId(null);
    setActiveDocumentId(null);
    setChatScopes({ document: createDocumentScope() });
    setChatMessages({ document: [] });
    setActiveChatKey('document');
    setSelectedFile(null);
    setChatOpen(false);
  };

  const startProcessing = async (file: File) => {
    if (!apiKey.trim()) return alert('请先在左侧输入并确认 Gemini 密钥。');
    if (!session?.user) return alert('请先登录。');
    setStatus(AppStatus.PROCESSING);
    setProgress('正在准备文档...');
    setAnnotations([]);
    setPendingSnippet(null);
    setChatScopes({ document: createDocumentScope() });
    setChatMessages({ document: [] });
    setActiveChatKey('document');
    setChatOpen(false);
    stopRef.current = false;

    const doc = await createDocument({
      userId: session.user.id,
      title: file.name.replace(/\.pdf$/i, ''),
      sourceLang,
      targetLang,
      sourceFileName: file.name,
    });
    setActiveDocumentId(doc.id);
    setDocuments((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)]);
    const sourcePath = await uploadSourcePdf(session.user.id, doc.id, file);
    await updateDocumentMeta(doc.id, { sourceFilePath: sourcePath });

    const reader = new FileReader();
    reader.onload = async function onLoad() {
      // @ts-ignore
      const pdf = await window.pdfjsLib.getDocument(new Uint8Array(this.result as ArrayBuffer)).promise;
      const targetPages = parsePageRange(pageRange, pdf.numPages);
      const parsed: ProcessedPage[] = [];
      for (const pageNum of targetPages) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        if (!ctx) continue;
        await page.render({ canvasContext: ctx, viewport }).promise;
        parsed.push({
          pageNumber: pageNum,
          originalImageUrl: canvas.toDataURL('image/jpeg', 0.8),
          width: viewport.width,
          height: viewport.height,
          blocks: [],
          status: 'pending',
        });
      }
      setPages(parsed);
      processPipeline(parsed, doc.id);
    };
    reader.readAsArrayBuffer(file);
  };

  const loadDocument = async (documentId: string) => {
    const snapshot = await loadDocumentSnapshot(documentId);
    setActiveDocumentId(documentId);
    setStatus(snapshot.pages.length ? AppStatus.COMPLETED : AppStatus.IDLE);
    setPages(snapshot.pages.map((p) => ({ ...p, status: 'done', blocks: harmonizeTypographyForBlocks(p.blocks) })));
    setAnnotations(snapshot.annotations);
    setSourceLang(snapshot.document.sourceLang);
    setTargetLang(snapshot.document.targetLang);
    const scopes: Record<string, ChatScope> = { document: createDocumentScope() };
    snapshot.scopes.forEach((s) => { scopes[s.key] = localizeScopeLabel(s); });
    setChatScopes(scopes);
    setChatMessages({ document: snapshot.messagesByScopeKey.document ?? [], ...snapshot.messagesByScopeKey });
    setActiveChatKey('document');
    setChatOpen(false);
  };

  const sendChat = async (text: string) => {
    if (!apiKey.trim()) return alert('请先在左侧输入并确认 Gemini 密钥。');
    const scope = chatScopes[activeChatKey] ?? createDocumentScope();
    const history = chatMessages[scope.key] ?? [];
    const userTurn: ChatMessage = { role: 'user', text, createdAt: Date.now() };
    setChatMessages((prev) => ({ ...prev, [scope.key]: [...(prev[scope.key] ?? []), userTurn] }));
    setChatLoading(true);
    try {
      const result = await chatWithTranslation({ scope, pages, history, userMessage: text, targetLang, apiKey });
      const modelTurn: ChatMessage = { role: 'model', text: result.assistantReply, createdAt: Date.now() };
      setChatMessages((prev) => ({ ...prev, [scope.key]: [...(prev[scope.key] ?? []), modelTurn] }));
      if (session?.user && activeDocumentId) {
        const thread = await ensureThread(session.user.id, activeDocumentId, scope);
        await appendChatMessage(thread.id, userTurn);
        await appendChatMessage(thread.id, modelTurn);
      }
    } finally {
      setChatLoading(false);
    }
  };

  const createOrSelectScope = (scope: ChatScope) => {
    const localized = localizeScopeLabel(scope);
    setChatScopes((prev) => ({ ...prev, [localized.key]: localized }));
    setChatMessages((prev) => (prev[localized.key] ? prev : { ...prev, [localized.key]: [] }));
    setActiveChatKey(localized.key);
    setChatOpen(true);
  };

  const removeScopeFromState = (scopeKey: string) => {
    setChatScopes((prev) => {
      const next = { ...prev };
      delete next[scopeKey];
      return next;
    });
    setChatMessages((prev) => {
      const next = { ...prev };
      delete next[scopeKey];
      return next;
    });
    if (activeChatKey === scopeKey) {
      setActiveChatKey('document');
    }
  };

  const handleDeleteScope = async (scopeKey: string) => {
    if (scopeKey === 'document') return;
    if (!window.confirm('确认删除该对话会话及其历史消息吗？')) return;
    if (activeDocumentId) {
      await deleteChatScope(activeDocumentId, scopeKey);
    }
    removeScopeFromState(scopeKey);
  };

  const onSnippet = (snippet: SelectionSnippet) => {
    setPendingSnippet(snippet);
    createOrSelectScope({
      key: `selection-${snippet.pageNumber}-${snippet.blockId}-${snippet.startOffset}-${snippet.endOffset}`,
      kind: 'selection',
      pageNumber: snippet.pageNumber,
      blockId: snippet.blockId,
      selectedText: snippet.selectedText,
      label: `选中 第 ${snippet.pageNumber} 页`,
    });
  };

  const saveSnippetAnnotation = async (note: string, color: string) => {
    if (!activeDocumentId || !pendingSnippet) return;
    const created = await saveAnnotation({ documentId: activeDocumentId, snippet: pendingSnippet, note, color });
    setAnnotations((prev) => [...prev, created]);
    setActiveAnnotationId(created.id);
    setPendingSnippet(null);
  };

  const updateAnnotationNote = async (annotationId: string, note: string) => {
    const item = annotations.find((a) => a.id === annotationId);
    if (!item) return;
    const updated = await saveAnnotation({
      documentId: item.documentId,
      annotationId: item.id,
      snippet: {
        pageNumber: item.pageNumber,
        blockId: item.blockId,
        selectedText: item.selectedText,
        startOffset: item.startOffset,
        endOffset: item.endOffset,
      },
      note,
      color: item.color,
    });
    setAnnotations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const focusAnnotation = (annotationId: string) => {
    setActiveAnnotationId(annotationId);
    const targetAnnotation = annotations.find((item) => item.id === annotationId);
    if (!targetAnnotation) return;

    const escapeAttr = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const pageEl = document.getElementById(`page-${targetAnnotation.pageNumber}`);
        const selector = `[data-block-id="${escapeAttr(targetAnnotation.blockId)}"]`;
        const blockEl = pageEl?.querySelector<HTMLElement>(selector)
          ?? document.querySelector<HTMLElement>(`#page-${targetAnnotation.pageNumber} ${selector}`);

        (blockEl ?? pageEl)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 30);
    });
  };

  const exportPdf = async () => {
    if (!pages.length || isExporting) return;
    setIsExporting(true);
    const { exportStructuredPdf } = await import('./services/pdfExportService');
    await exportStructuredPdf(pages, {
      sourceFileName: selectedFile?.name || 'document',
      onBlob: async (blob, filename) => {
        if (!session?.user || !activeDocumentId) return;
        const path = await uploadExportedPdf(session.user.id, activeDocumentId, blob, filename);
        await updateDocumentMeta(activeDocumentId, { exportedFilePath: path });
      },
    });
    setIsExporting(false);
  };

  const annotationByBlock = useMemo(() => {
    const map: Record<string, AnnotationRecord[]> = {};
    annotations.forEach((item) => {
      map[item.blockId] = map[item.blockId] ?? [];
      map[item.blockId].push(item);
    });
    return map;
  }, [annotations]);

  if (!isSupabaseConfigured) {
    return <div className="min-h-screen flex items-center justify-center text-sm">缺少 Supabase 环境变量，请配置后重启。</div>;
  }
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (!session) return <AuthPanel />;

  return (
    <div className="min-h-screen text-[#111]">
      <header className="fixed top-0 left-0 right-0 z-50 px-4 md:px-6 py-3 flex justify-between items-center backdrop-blur-md bg-white/50">
        <div>
          <div className="text-[11px] tracking-[0.24em] text-gray-500">智能文档翻译系统</div>
          <div className="font-serif text-xl leading-none mt-1">译构工作台</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportPdf}
            className="px-3 py-2 rounded-full bg-black text-white text-xs tracking-[0.12em] disabled:opacity-50 inline-flex items-center gap-1.5"
            disabled={isExporting || !pages.length}
          >
            {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            导出译文
          </button>
          <button
            onClick={() => {
              if (!window.confirm('是否确定退出登录？')) return;
              supabase.auth.signOut();
            }}
            className="p-2 rounded-full bg-white/90 text-gray-700 hover:text-black"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="pt-24 px-4 pb-20 max-w-[1720px] mx-auto grid grid-cols-1 lg:grid-cols-[290px_1fr_330px] gap-4 md:gap-5">
        <section className="space-y-3">
          <div className="glass-surface rounded-[1.6rem] p-3 no-print">
            <div className="flex items-center gap-2 mb-2">
              <KeyRound className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium">Gemini 密钥</span>
            </div>
            <input
              type="password"
              className="w-full rounded-xl px-3 py-2 text-sm bg-white/90 outline-none"
              placeholder="输入后点确定，旧任务聊天也可用"
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[11px] text-gray-500">{apiKey ? '已确认密钥' : '未确认密钥'}</span>
              <button
                type="button"
                onClick={confirmApiKey}
                className="px-3 py-1.5 rounded-lg bg-black text-white text-xs tracking-[0.08em]"
              >
                确定
              </button>
            </div>
          </div>

          <DocumentLibrary
            documents={documents}
            activeDocumentId={activeDocumentId}
            loading={documentsLoading}
            onReload={refreshDocuments}
            onOpen={loadDocument}
            onDelete={async (id) => {
              if (!window.confirm('确认删除该文档及其全部标注和对话记录吗？')) return;
              await deleteDocument(id);
              setDocuments((prev) => prev.filter((d) => d.id !== id));
              if (activeDocumentId === id) {
                resetWorkspace();
              }
            }}
            onNew={resetWorkspace}
          />
        </section>

        <section>
          {status === AppStatus.IDLE && (
            <div className="space-y-4 glass-surface rounded-[1.8rem] p-4 md:p-6">
              <LanguageSelector sourceLang={sourceLang} targetLang={targetLang} setSourceLang={setSourceLang} setTargetLang={setTargetLang} disabled={false} />
              <input
                className="w-full rounded-2xl px-4 py-3 bg-white/85 outline-none text-sm"
                placeholder="页码范围：全部 或 1-3,8"
                value={pageRange}
                onChange={(e) => setPageRange(e.target.value)}
              />
              <textarea
                className="w-full h-20 rounded-2xl px-4 py-3 bg-white/85 outline-none text-sm resize-none"
                placeholder="补充翻译要求（可选）"
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
              />
              {!selectedFile ? <FileUpload onFileSelect={setSelectedFile} /> : (
                <div className="space-y-3 rounded-2xl bg-white/80 p-4">
                  <div className="text-sm text-gray-600">已选择：{selectedFile.name}</div>
                  <button className="px-5 py-2.5 rounded-xl bg-black text-white text-sm tracking-[0.12em]" onClick={() => startProcessing(selectedFile)}>开始翻译</button>
                </div>
              )}
            </div>
          )}

          {status !== AppStatus.IDLE && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-black text-white px-4 py-3 rounded-2xl text-xs tracking-[0.1em]">
                <span>{progress}</span>
                {status === AppStatus.PROCESSING && (
                  <button onClick={() => { stopRef.current = true; }} title="停止任务"><Square className="w-3 h-3" /></button>
                )}
              </div>
              <div className="inline-flex items-center gap-2 p-1 rounded-full bg-white/70">
                <button
                  type="button"
                  className={`px-4 py-1.5 text-xs rounded-full transition-colors ${viewMode === 'translation' ? 'bg-black text-white' : 'text-gray-600 hover:bg-white'}`}
                  onClick={() => setViewMode('translation')}
                >
                  译文视图
                </button>
                <button
                  type="button"
                  className={`px-4 py-1.5 text-xs rounded-full transition-colors ${viewMode === 'bilingual' ? 'bg-black text-white' : 'text-gray-600 hover:bg-white'}`}
                  onClick={() => setViewMode('bilingual')}
                >
                  双语对照
                </button>
              </div>
              {pages.map((page) => (
                <PageRenderer
                  key={page.pageNumber}
                  page={page}
                  targetLang={targetLang}
                  apiKey={apiKey}
                  viewMode={viewMode}
                  onUpdatePage={(pageNumber, blocks) => setPages((prev) => prev.map((p) => (p.pageNumber === pageNumber ? { ...p, blocks } : p)))}
                  onStartPageChat={(pageNumber) => createOrSelectScope({ key: `page-${pageNumber}`, kind: 'page', pageNumber, label: `第 ${pageNumber} 页` })}
                  onSelectSnippet={onSnippet}
                  annotationsByBlockId={annotationByBlock}
                  activeAnnotationId={activeAnnotationId}
                  onActivateAnnotation={setActiveAnnotationId}
                />
              ))}
            </div>
          )}
        </section>

        <AnnotationPanel
          annotations={annotations}
          activeAnnotationId={activeAnnotationId}
          pendingSnippet={pendingSnippet}
          onCreate={saveSnippetAnnotation}
          onDelete={async (id) => {
            await deleteAnnotation(id);
            setAnnotations((prev) => prev.filter((a) => a.id !== id));
          }}
          onUpdateNote={updateAnnotationNote}
          onFocusAnnotation={focusAnnotation}
          onCancelPending={() => setPendingSnippet(null)}
        />
      </main>

      {pages.length > 0 && (
        <TranslationChatPanel
          scopes={sortScopes(Object.values(chatScopes))}
          activeScopeKey={activeChatKey}
          messages={chatMessages[activeChatKey] ?? []}
          loading={chatLoading}
          isOpen={chatOpen}
          onOpen={() => setChatOpen(true)}
          onClose={() => setChatOpen(false)}
          onSwitchScope={setActiveChatKey}
          onDeleteScope={handleDeleteScope}
          onSendMessage={sendChat}
        />
      )}
    </div>
  );
};

export default App;
