import { Content, GoogleGenAI, Type } from '@google/genai';
import { MODEL_LAYOUT_TEXT, MODEL_IMAGE_GEN } from '../constants';
import { ChatEditAction, ChatMessage, ChatScope, LayoutBlock, ProcessedPage, SemanticType, SentencePair, TextRole } from '../types';
import { getDefaultRoleForType, harmonizeTypographyForBlocks, withTypographyDefaults } from './typographyService';

const aiClients = new Map<string, GoogleGenAI>();

const ALLOWED_TYPES: SemanticType[] = [
  'header',
  'footer',
  'h1',
  'h2',
  'h3',
  'paragraph',
  'list_item',
  'caption',
  'quote',
  'callout',
  'image',
];

const ALLOWED_ROLES: TextRole[] = ['title', 'subtitle', 'body', 'caption', 'footnote', 'meta', 'quote'];

const getAI = (apiKey: string) => {
  const safeKey = apiKey.trim();
  if (!safeKey) {
    throw new Error('缺少 Gemini 密钥。');
  }

  const cached = aiClients.get(safeKey);
  if (cached) return cached;

  const client = new GoogleGenAI({ apiKey: safeKey });
  aiClients.set(safeKey, client);
  return client;
};

const cleanBase64 = (b64: string) => b64.replace(/^data:image\/\w+;base64,/, '');

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const normalizeType = (value: unknown): SemanticType => {
  if (typeof value === 'string' && ALLOWED_TYPES.includes(value as SemanticType)) {
    return value as SemanticType;
  }
  return 'paragraph';
};

const normalizeRole = (value: unknown, type: SemanticType): TextRole => {
  if (typeof value === 'string' && ALLOWED_ROLES.includes(value as TextRole)) {
    return value as TextRole;
  }
  return getDefaultRoleForType(type);
};

const normalizeSizeLevel = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeBox = (value: unknown): [number, number, number, number] | undefined => {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const box = value.map((num) => Number.parseInt(String(num), 10));
  if (box.some((num) => Number.isNaN(num))) return undefined;
  return [box[0], box[1], box[2], box[3]];
};

const normalizeSentencePairs = (value: unknown): SentencePair[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const pairs = value
    .map((item) => ({
      source: typeof item?.source === 'string' ? item.source : '',
      target: typeof item?.target === 'string' ? item.target : '',
    }))
    .filter((item) => item.source || item.target);
  return pairs.length > 0 ? pairs : undefined;
};

const blockFromModel = (item: any, index: number): LayoutBlock => {
  const type = normalizeType(item?.type);
  const sentencePairs = normalizeSentencePairs(item?.sentencePairs);
  const inferredOriginalContent = sentencePairs?.map((pair) => pair.source).filter(Boolean).join(' ').trim();
  return withTypographyDefaults({
    id: typeof item?.id === 'string' && item.id.trim() ? item.id : `blk-${index}-${Date.now()}`,
    type,
    content: typeof item?.content === 'string' ? item.content : '',
    originalContent: typeof item?.originalContent === 'string' ? item.originalContent : (inferredOriginalContent || undefined),
    sentencePairs,
    box: normalizeBox(item?.box),
    imageUrl: typeof item?.imageUrl === 'string' ? item.imageUrl : undefined,
    textRole: normalizeRole(item?.textRole, type),
    sizeLevel: normalizeSizeLevel(item?.sizeLevel),
  });
};

export const analyzePageLayout = async (
  imageBase64: string,
  sourceLang: string,
  targetLang: string,
  apiKey: string,
  customInstruction?: string,
): Promise<LayoutBlock[]> => {
  const client = getAI(apiKey);

  const instructionPart = customInstruction
    ? `CUSTOM INSTRUCTION: "${customInstruction}".`
    : '';

  const prompt = `
You are an editorial art director and translation layout planner.
Analyze this page image and output a stable single-column translated layout.

${instructionPart}

Rules:
1) Detect semantic blocks: header/footer/h1/h2/h3/paragraph/list_item/caption/quote/callout/image.
2) Translate text from ${sourceLang} to ${targetLang}.
3) Keep reading order coherent.
4) For image blocks include box=[ymin,xmin,ymax,xmax] (0..1000).
5) For each text block output:
   - textRole in [title, subtitle, body, caption, footnote, meta, quote]
   - sizeLevel in [1..5], where 1 is smallest and 5 is largest.
   - originalContent: the source-language text before translation.
   - sentencePairs: sentence-level alignment list [{source, target}] in natural order.
6) Preserve hierarchy:
   - title/subtitle > body
   - caption/footnote/meta < body
   - chart annotations should remain small

Return JSON array only.
`;

  try {
    const response = await client.models.generateContent({
      model: MODEL_LAYOUT_TEXT,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanBase64(imageBase64) } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, nullable: true },
              type: { type: Type.STRING, enum: ALLOWED_TYPES },
              content: { type: Type.STRING },
              originalContent: { type: Type.STRING, nullable: true },
              sentencePairs: {
                type: Type.ARRAY,
                nullable: true,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    source: { type: Type.STRING },
                    target: { type: Type.STRING },
                  },
                  required: ['source', 'target'],
                },
              },
              textRole: { type: Type.STRING, enum: ALLOWED_ROLES, nullable: true },
              sizeLevel: { type: Type.INTEGER, nullable: true },
              box: { type: Type.ARRAY, items: { type: Type.INTEGER }, nullable: true },
            },
            required: ['type', 'content'],
          },
        },
      },
    });

    if (!response.text) return [];
    const parsed = JSON.parse(response.text);
    if (!Array.isArray(parsed)) return [];
    return harmonizeTypographyForBlocks(parsed.map(blockFromModel));
  } catch (error) {
    console.error('Layout analysis error:', error);
    return [];
  }
};

export const translateImageBlock = async (
  imageCropBase64: string,
  targetLang: string,
  apiKey: string,
): Promise<string | null> => {
  const client = getAI(apiKey);

  try {
    const response = await client.models.generateContent({
      model: MODEL_IMAGE_GEN,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: cleanBase64(imageCropBase64) } },
          {
            text: `Redraw this image precisely.
Translate all text inside to ${targetLang}.
Keep text hierarchy:
- title largest
- body medium
- annotation/caption/footnote small
Do not enlarge tiny chart labels.
Keep data, geometry, and colors consistent.
Output image only.`,
          },
        ],
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error('Image translation error:', error);
    return null;
  }
};

type TranslateRetryOptions = {
  retries?: number;
  initialDelayMs?: number;
};

export const translateImageBlockWithRetry = async (
  imageCropBase64: string,
  targetLang: string,
  apiKey: string,
  options?: TranslateRetryOptions,
): Promise<string | null> => {
  const retries = Math.max(0, options?.retries ?? 2);
  const initialDelayMs = Math.max(200, options?.initialDelayMs ?? 900);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const translated = await translateImageBlock(imageCropBase64, targetLang, apiKey);
    if (translated) return translated;

    if (attempt < retries) {
      const jitter = Math.floor(Math.random() * 220);
      await wait(initialDelayMs * 2 ** attempt + jitter);
    }
  }
  return null;
};

export const modifyPageContent = async (
  currentBlocks: LayoutBlock[],
  userPrompt: string,
  targetLang: string,
  apiKey: string,
): Promise<LayoutBlock[]> => {
  const client = getAI(apiKey);

  const prompt = `
You are a content editor. Update page blocks according to user request.

Current blocks JSON:
${JSON.stringify(currentBlocks.map((b) => ({
  id: b.id,
  type: b.type,
  content: b.content,
  textRole: b.textRole,
  sizeLevel: b.sizeLevel,
})))}

User request: "${userPrompt}"
Target language: ${targetLang}

Return full updated JSON array.
Keep existing IDs when possible.
Keep typography hierarchy valid.
`;

  try {
    const response = await client.models.generateContent({
      model: MODEL_LAYOUT_TEXT,
      contents: { text: prompt },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING, nullable: true },
              type: { type: Type.STRING, enum: ALLOWED_TYPES },
              content: { type: Type.STRING },
              textRole: { type: Type.STRING, enum: ALLOWED_ROLES, nullable: true },
              sizeLevel: { type: Type.INTEGER, nullable: true },
            },
            required: ['type', 'content'],
          },
        },
      },
    });

    if (!response.text) return currentBlocks;
    const parsed = JSON.parse(response.text);
    if (!Array.isArray(parsed)) return currentBlocks;

    const merged = parsed.map((raw: any, index: number) => {
      const next = blockFromModel(raw, index);
      const original = next.id ? currentBlocks.find((b) => b.id === next.id) : undefined;
      if (!original) return next;
      return {
        ...original,
        ...next,
        id: original.id,
        originalContent: next.originalContent ?? original.originalContent,
        sentencePairs: next.sentencePairs ?? original.sentencePairs,
        box: original.box,
        imageUrl: original.imageUrl,
      };
    });

    return harmonizeTypographyForBlocks(merged);
  } catch (error) {
    console.error('Modify page error:', error);
    return currentBlocks;
  }
};

type TranslationAssistantParams = {
  scope: ChatScope;
  pages: ProcessedPage[];
  history: ChatMessage[];
  userMessage: string;
  targetLang: string;
  apiKey: string;
};

export type TranslationAssistantResult = {
  assistantReply: string;
  actions: ChatEditAction[];
};

const toGeminiHistory = (history: ChatMessage[]): Content[] =>
  history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

const serializeScopeContext = (scope: ChatScope, pages: ProcessedPage[]) => {
  const compactBlock = (block: LayoutBlock) => ({
    id: block.id,
    type: block.type,
    originalContent: block.originalContent,
    content: block.content,
    textRole: block.textRole,
    sizeLevel: block.sizeLevel,
  });

  if (scope.kind === 'page' && scope.pageNumber) {
    const page = pages.find((p) => p.pageNumber === scope.pageNumber);
    return {
      scope,
      pages: page ? [{ pageNumber: page.pageNumber, blocks: page.blocks.map(compactBlock) }] : [],
    };
  }

  if (scope.kind === 'selection') {
    const page = scope.pageNumber ? pages.find((p) => p.pageNumber === scope.pageNumber) : undefined;
    return {
      scope,
      selection: {
        pageNumber: scope.pageNumber,
        blockId: scope.blockId,
        selectedText: scope.selectedText,
      },
      page: page ? { pageNumber: page.pageNumber, blocks: page.blocks.map(compactBlock) } : null,
    };
  }

  return {
    scope,
    pages: pages.map((p) => ({ pageNumber: p.pageNumber, blocks: p.blocks.map(compactBlock) })),
  };
};

const sanitizeAssistantActions = (actions: any[]): ChatEditAction[] => {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((item) => ({
      type: item?.type,
      pageNumber: Number.parseInt(String(item?.pageNumber), 10),
      blockId: String(item?.blockId || ''),
      newContent: typeof item?.newContent === 'string' ? item.newContent : '',
    }))
    .filter((item): item is ChatEditAction => (
      item.type === 'update_block_text'
      && Number.isFinite(item.pageNumber)
      && item.pageNumber > 0
      && item.blockId.length > 0
    ));
};

export const chatWithTranslation = async ({
  scope,
  pages,
  history,
  userMessage,
  targetLang,
  apiKey,
}: TranslationAssistantParams): Promise<TranslationAssistantResult> => {
  const client = getAI(apiKey);
  const contextPayload = serializeScopeContext(scope, pages);

  const systemInstruction = `
You are a translation layout copilot.
Current scope = ${scope.kind}. Only edit blocks inside this scope.

Output JSON:
{
  "assistantReply": "string",
  "actions": [
    {
      "type": "update_block_text",
      "pageNumber": 1,
      "blockId": "blk-id",
      "newContent": "..."
    }
  ]
}

If no edits, return actions=[].
Default answer language is ${targetLang} unless user asks otherwise.
`;

  const chat = client.chats.create({
    model: MODEL_LAYOUT_TEXT,
    history: toGeminiHistory(history),
    config: {
      systemInstruction,
      temperature: 0.25,
    },
  });

  const response = await chat.sendMessage({
    message: `Context:\n${JSON.stringify(contextPayload)}\n\nUser:\n${userMessage}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          assistantReply: { type: Type.STRING },
          actions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['update_block_text'] },
                pageNumber: { type: Type.INTEGER },
                blockId: { type: Type.STRING },
                newContent: { type: Type.STRING },
              },
              required: ['type', 'pageNumber', 'blockId', 'newContent'],
            },
          },
        },
        required: ['assistantReply', 'actions'],
      },
    },
  });

  if (!response.text) {
    return { assistantReply: '本次未获得有效回复，请重试。', actions: [] };
  }

  try {
    const parsed = JSON.parse(response.text);
    return {
      assistantReply: typeof parsed?.assistantReply === 'string' ? parsed.assistantReply : '处理完成。',
      actions: sanitizeAssistantActions(parsed?.actions ?? []),
    };
  } catch {
    return { assistantReply: response.text, actions: [] };
  }
};
