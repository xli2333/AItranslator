export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export enum Language {
  ZH = '简体中文',
  EN = '英语',
  JA = '日语',
  KO = '韩语',
  FR = '法语',
  DE = '德语',
  ES = '西班牙语',
}

export type SemanticType =
  | 'header'
  | 'footer'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'paragraph'
  | 'list_item'
  | 'caption'
  | 'quote'
  | 'callout'
  | 'image';

export type TextRole = 'title' | 'subtitle' | 'body' | 'caption' | 'footnote' | 'meta' | 'quote';
export type ChatScopeKind = 'document' | 'page' | 'selection';
export type ChatRole = 'user' | 'model';
export type ViewMode = 'translation' | 'bilingual';

export interface SentencePair {
  source: string;
  target: string;
}

export interface ChatMessage {
  role: ChatRole;
  text: string;
  createdAt: number;
}

export interface ChatScope {
  key: string;
  kind: ChatScopeKind;
  label: string;
  pageNumber?: number;
  blockId?: string;
  selectedText?: string;
}

export interface ChatEditAction {
  type: 'update_block_text';
  pageNumber: number;
  blockId: string;
  newContent: string;
}

export interface LayoutBlock {
  id: string;
  type: SemanticType;
  content: string;
  originalContent?: string;
  sentencePairs?: SentencePair[];
  box?: [number, number, number, number];
  imageUrl?: string;
  textRole?: TextRole;
  sizeLevel?: number;
}

export interface ProcessedPage {
  pageNumber: number;
  originalImageUrl: string;
  width: number;
  height: number;
  blocks: LayoutBlock[];
  status: 'pending' | 'analyzing' | 'generating_images' | 'done';
}

export interface SelectionSnippet {
  pageNumber: number;
  blockId: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
  sentenceIndex?: number;
}

export interface AnnotationRecord {
  id: string;
  documentId: string;
  pageNumber: number;
  blockId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  note: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  sourceLang: string;
  targetLang: string;
  sourceFileName: string | null;
  sourceFilePath: string | null;
  exportedFilePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSnapshot {
  document: DocumentSummary;
  pages: ProcessedPage[];
  annotations: AnnotationRecord[];
  scopes: ChatScope[];
  messagesByScopeKey: Record<string, ChatMessage[]>;
}

export interface PersistThreadRecord {
  id: string;
  scopeKey: string;
}
