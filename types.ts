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

export type SemanticType = 'header' | 'footer' | 'h1' | 'h2' | 'h3' | 'paragraph' | 'list_item' | 'caption' | 'quote' | 'callout' | 'image';

export interface LayoutBlock {
  id: string;
  type: SemanticType;
  content: string;
  originalContent?: string;
  box?: [number, number, number, number];
  imageUrl?: string;
}

export interface ProcessedPage {
  pageNumber: number;
  originalImageUrl: string;
  width: number;
  height: number;
  blocks: LayoutBlock[];
  status: 'pending' | 'analyzing' | 'generating_images' | 'done';
}
