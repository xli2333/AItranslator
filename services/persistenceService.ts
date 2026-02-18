import { ChatMessage, ChatScope, DocumentSnapshot, DocumentSummary, LayoutBlock, PersistThreadRecord, ProcessedPage, SelectionSnippet } from '../types';
import { assertSupabaseConfigured, supabase } from './supabaseClient';

type CreateDocumentInput = {
  userId: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  sourceFileName: string | null;
};

type SaveAnnotationInput = {
  documentId: string;
  annotationId?: string;
  snippet: SelectionSnippet;
  note: string;
  color: string;
};

type LoadedChats = {
  scopes: ChatScope[];
  messagesByScopeKey: Record<string, ChatMessage[]>;
  threadsByScopeKey: Record<string, PersistThreadRecord>;
};

const DOCUMENT_BUCKET = 'user-documents';
const STORAGE_SAFE_SEGMENT = /[^a-zA-Z0-9._-]+/g;

const nowIso = () => new Date().toISOString();

const normalizeFileNameForStorage = (
  inputName: string,
  fallbackBase = 'file',
  fallbackExt = 'bin',
): string => {
  const fileName = (inputName || '').split(/[\\/]/).pop() || '';
  const extMatch = fileName.match(/\.([a-zA-Z0-9]{1,10})$/);
  const ext = (extMatch?.[1] || fallbackExt).toLowerCase();
  const rawBase = extMatch ? fileName.slice(0, -extMatch[0].length) : fileName;

  const normalized = rawBase
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(STORAGE_SAFE_SEGMENT, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  const base = normalized || fallbackBase;
  return `${base}.${ext}`;
};

const buildStorageObjectPath = (
  userId: string,
  documentId: string,
  folder: 'source' | 'export',
  originalName: string,
  fallbackBase: string,
  fallbackExt: string,
): string => {
  const safeName = normalizeFileNameForStorage(originalName, fallbackBase, fallbackExt);
  const nonce = Math.random().toString(36).slice(2, 8);
  return `${userId}/${documentId}/${folder}/${Date.now()}-${nonce}-${safeName}`;
};

const sortScopes = (scopes: ChatScope[]): ChatScope[] => {
  return [...scopes].sort((a, b) => {
    const rank = (scope: ChatScope) => {
      if (scope.kind === 'document') return 0;
      if (scope.kind === 'page') return 1;
      return 2;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return (a.pageNumber ?? 0) - (b.pageNumber ?? 0);
  });
};

const fromDocRow = (row: any): DocumentSummary => ({
  id: row.id,
  title: row.title,
  sourceLang: row.source_lang,
  targetLang: row.target_lang,
  sourceFileName: row.source_file_name ?? null,
  sourceFilePath: row.source_file_path ?? null,
  exportedFilePath: row.exported_file_path ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const fromPageRow = (row: any): ProcessedPage => {
  const blocks = Array.isArray(row.blocks_json) ? (row.blocks_json as LayoutBlock[]) : [];
  return {
    pageNumber: row.page_number,
    originalImageUrl: row.original_image_url ?? '',
    width: Number(row.width ?? 0),
    height: Number(row.height ?? 0),
    blocks,
    status: 'done',
  };
};

const toPageRow = (documentId: string, page: ProcessedPage) => ({
  document_id: documentId,
  page_number: page.pageNumber,
  width: page.width,
  height: page.height,
  original_image_url: page.originalImageUrl || null,
  blocks_json: page.blocks,
  updated_at: nowIso(),
});

const buildScopeFromThread = (row: any): ChatScope => {
  if (row.scope_kind === 'page') {
    return {
      key: row.scope_key,
      kind: 'page',
      label: `第 ${row.page_number} 页`,
      pageNumber: row.page_number ?? undefined,
    };
  }

  if (row.scope_kind === 'selection') {
    return {
      key: row.scope_key,
      kind: 'selection',
      label: row.page_number ? `选中 第 ${row.page_number} 页` : '选中文本',
      pageNumber: row.page_number ?? undefined,
      blockId: row.block_id ?? undefined,
      selectedText: row.selected_text ?? undefined,
    };
  }

  return {
    key: row.scope_key,
    kind: 'document',
    label: '全文对话',
  };
};

export const listDocumentsByUser = async (): Promise<DocumentSummary[]> => {
  assertSupabaseConfigured();

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(fromDocRow);
};

export const createDocument = async (input: CreateDocumentInput): Promise<DocumentSummary> => {
  assertSupabaseConfigured();

  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: input.userId,
      title: input.title,
      source_lang: input.sourceLang,
      target_lang: input.targetLang,
      source_file_name: input.sourceFileName,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return fromDocRow(data);
};

export const updateDocumentMeta = async (
  documentId: string,
  patch: Partial<Pick<DocumentSummary, 'title' | 'sourceFilePath' | 'exportedFilePath' | 'targetLang' | 'sourceLang'>>,
) => {
  assertSupabaseConfigured();

  const payload: Record<string, unknown> = {
    updated_at: nowIso(),
  };

  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.sourceLang !== undefined) payload.source_lang = patch.sourceLang;
  if (patch.targetLang !== undefined) payload.target_lang = patch.targetLang;
  if (patch.sourceFilePath !== undefined) payload.source_file_path = patch.sourceFilePath;
  if (patch.exportedFilePath !== undefined) payload.exported_file_path = patch.exportedFilePath;

  const { error } = await supabase.from('documents').update(payload).eq('id', documentId);
  if (error) throw error;
};

export const upsertDocumentPages = async (documentId: string, pages: ProcessedPage[]) => {
  assertSupabaseConfigured();
  if (pages.length === 0) return;

  const rows = pages.map((page) => toPageRow(documentId, page));
  const { error } = await supabase.from('document_pages').upsert(rows, {
    onConflict: 'document_id,page_number',
  });
  if (error) throw error;
};

export const uploadSourcePdf = async (
  userId: string,
  documentId: string,
  file: File,
): Promise<string> => {
  assertSupabaseConfigured();

  const path = buildStorageObjectPath(userId, documentId, 'source', file.name, 'source', 'pdf');
  const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
};

export const uploadExportedPdf = async (
  userId: string,
  documentId: string,
  blob: Blob,
  fileName: string,
): Promise<string> => {
  assertSupabaseConfigured();

  const path = buildStorageObjectPath(userId, documentId, 'export', fileName, 'translation', 'pdf');
  const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'application/pdf',
  });
  if (error) throw error;
  return path;
};

export const getSignedFileUrl = async (path: string, expiresInSec = 3600): Promise<string> => {
  assertSupabaseConfigured();
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
};

export const saveAnnotation = async (input: SaveAnnotationInput) => {
  assertSupabaseConfigured();

  const payload: Record<string, unknown> = {
    document_id: input.documentId,
    page_number: input.snippet.pageNumber,
    block_id: input.snippet.blockId,
    start_offset: input.snippet.startOffset,
    end_offset: input.snippet.endOffset,
    selected_text: input.snippet.selectedText,
    note: input.note,
    color: input.color,
    updated_at: nowIso(),
  };

  if (input.annotationId) {
    payload.id = input.annotationId;
  } else {
    payload.created_at = nowIso();
  }

  const { data, error } = await supabase
    .from('annotations')
    .upsert(payload, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    documentId: data.document_id,
    pageNumber: data.page_number,
    blockId: data.block_id,
    startOffset: data.start_offset,
    endOffset: data.end_offset,
    selectedText: data.selected_text,
    note: data.note ?? '',
    color: data.color ?? '#fde68a',
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
};

export const deleteAnnotation = async (annotationId: string) => {
  assertSupabaseConfigured();
  const { error } = await supabase.from('annotations').delete().eq('id', annotationId);
  if (error) throw error;
};

export const loadAnnotations = async (documentId: string) => {
  assertSupabaseConfigured();
  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    documentId: row.document_id,
    pageNumber: row.page_number,
    blockId: row.block_id,
    startOffset: row.start_offset,
    endOffset: row.end_offset,
    selectedText: row.selected_text,
    note: row.note ?? '',
    color: row.color ?? '#fde68a',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

export const ensureThread = async (
  userId: string,
  documentId: string,
  scope: ChatScope,
): Promise<PersistThreadRecord> => {
  assertSupabaseConfigured();

  const payload = {
    user_id: userId,
    document_id: documentId,
    scope_key: scope.key,
    scope_kind: scope.kind,
    page_number: scope.pageNumber ?? null,
    block_id: scope.blockId ?? null,
    selected_text: scope.selectedText ?? null,
    updated_at: nowIso(),
  };

  const { data, error } = await supabase
    .from('chat_threads')
    .upsert(payload, { onConflict: 'document_id,scope_key' })
    .select('id, scope_key')
    .single();

  if (error) throw error;
  return {
    id: data.id,
    scopeKey: data.scope_key,
  };
};

export const appendChatMessage = async (threadId: string, message: ChatMessage) => {
  assertSupabaseConfigured();

  const { error } = await supabase.from('chat_messages').insert({
    thread_id: threadId,
    role: message.role,
    text: message.text,
    created_at: new Date(message.createdAt).toISOString(),
  });
  if (error) throw error;
};

export const loadChats = async (documentId: string): Promise<LoadedChats> => {
  assertSupabaseConfigured();

  const { data: threads, error: threadError } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: true });
  if (threadError) throw threadError;

  const scopes = sortScopes((threads ?? []).map(buildScopeFromThread));
  const threadsByScopeKey: Record<string, PersistThreadRecord> = {};
  const threadIdToScope: Record<string, string> = {};

  for (const row of threads ?? []) {
    threadsByScopeKey[row.scope_key] = {
      id: row.id,
      scopeKey: row.scope_key,
    };
    threadIdToScope[row.id] = row.scope_key;
  }

  const messagesByScopeKey: Record<string, ChatMessage[]> = {};
  const threadIds = (threads ?? []).map((item) => item.id);

  if (threadIds.length > 0) {
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('*')
      .in('thread_id', threadIds)
      .order('created_at', { ascending: true });
    if (msgError) throw msgError;

    for (const row of messages ?? []) {
      const scopeKey = threadIdToScope[row.thread_id];
      if (!scopeKey) continue;
      const existing = messagesByScopeKey[scopeKey] ?? [];
      existing.push({
        role: row.role,
        text: row.text,
        createdAt: Date.parse(row.created_at),
      });
      messagesByScopeKey[scopeKey] = existing;
    }
  }

  if (!messagesByScopeKey.document) {
    messagesByScopeKey.document = [];
  }

  return { scopes, messagesByScopeKey, threadsByScopeKey };
};

export const loadDocumentSnapshot = async (documentId: string): Promise<DocumentSnapshot> => {
  assertSupabaseConfigured();

  const { data: documentRow, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();
  if (docError) throw docError;

  const { data: pages, error: pageError } = await supabase
    .from('document_pages')
    .select('*')
    .eq('document_id', documentId)
    .order('page_number', { ascending: true });
  if (pageError) throw pageError;

  const [annotations, chats] = await Promise.all([
    loadAnnotations(documentId),
    loadChats(documentId),
  ]);

  const scopeMap = new Map<string, ChatScope>();
  scopeMap.set('document', { key: 'document', kind: 'document', label: '全文对话' });
  for (const scope of chats.scopes) {
    scopeMap.set(scope.key, scope);
  }

  return {
    document: fromDocRow(documentRow),
    pages: (pages ?? []).map(fromPageRow),
    annotations,
    scopes: sortScopes(Array.from(scopeMap.values())),
    messagesByScopeKey: chats.messagesByScopeKey,
  };
};

export const deleteDocument = async (documentId: string) => {
  assertSupabaseConfigured();
  const { error } = await supabase.from('documents').delete().eq('id', documentId);
  if (error) throw error;
};
