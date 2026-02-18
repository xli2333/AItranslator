// Mapping based on user request:
// Layout & Text Translation -> Gemini 3 Pro
// Image Translation -> Gemini 3 Pro Image

export const MODEL_LAYOUT_TEXT = 'gemini-3-pro-preview';
export const MODEL_IMAGE_GEN = 'gemini-3-pro-image-preview';

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en-US', label: '英语' },
  { code: 'ja-JP', label: '日语' },
  { code: 'ko-KR', label: '韩语' },
  { code: 'fr-FR', label: '法语' },
  { code: 'de-DE', label: '德语' },
  { code: 'es-ES', label: '西班牙语' },
];

export const MAX_FILE_SIZE_MB = 10;
