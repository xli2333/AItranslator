import { PDFDocument, PDFFont, PDFImage, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { LayoutBlock, ProcessedPage } from '../types';

type FontPack = {
  sans: PDFFont;
  serif: PDFFont;
};

type FontKind = keyof FontPack;

type TextAlign = 'left' | 'center';

type BaseTextStyle = {
  font: FontKind;
  size: number;
  lineHeight: number;
  color: ReturnType<typeof rgb>;
  marginTop: number;
  marginBottom: number;
  indent: number;
  align: TextAlign;
  imageMaxHeight?: number;
};

type ScaledTextStyle = BaseTextStyle;

type PlannedTextBlock = {
  kind: 'text';
  block: LayoutBlock;
  style: ScaledTextStyle;
  lines: string[];
  lineStep: number;
  totalHeight: number;
};

type PlannedImageBlock = {
  kind: 'image';
  block: LayoutBlock;
  style: ScaledTextStyle;
  image: PDFImage | null;
  drawW: number;
  drawH: number;
  totalHeight: number;
  fallbackLines?: string[];
  fallbackLineStep?: number;
};

type PlannedBlock = PlannedTextBlock | PlannedImageBlock;

type ExportProgress = {
  current: number;
  total: number;
  pageNumber: number;
};

type ExportStructuredPdfOptions = {
  sourceFileName?: string;
  onProgress?: (progress: ExportProgress) => void;
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN_TOP = 40;
const PAGE_MARGIN_BOTTOM = 44;
const PAGE_MARGIN_X = 42;

const CONTENT_WIDTH = A4_WIDTH - PAGE_MARGIN_X * 2;
const CONTENT_HEIGHT = A4_HEIGHT - PAGE_MARGIN_TOP - PAGE_MARGIN_BOTTOM;

const FONT_SERIF_PATH = '/fonts/NotoSerifCJKsc-Regular.otf';

const toRgb = (r: number, g: number, b: number) => rgb(r / 255, g / 255, b / 255);

const baseStyleMap: Record<LayoutBlock['type'], BaseTextStyle> = {
  header: {
    font: 'sans',
    size: 9,
    lineHeight: 1.35,
    color: toRgb(120, 120, 120),
    marginTop: 4,
    marginBottom: 10,
    indent: 0,
    align: 'left',
  },
  footer: {
    font: 'sans',
    size: 9,
    lineHeight: 1.35,
    color: toRgb(130, 130, 130),
    marginTop: 10,
    marginBottom: 4,
    indent: 0,
    align: 'left',
  },
  h1: {
    font: 'serif',
    size: 24,
    lineHeight: 1.25,
    color: toRgb(20, 20, 20),
    marginTop: 10,
    marginBottom: 12,
    indent: 0,
    align: 'left',
  },
  h2: {
    font: 'sans',
    size: 18,
    lineHeight: 1.3,
    color: toRgb(20, 20, 20),
    marginTop: 10,
    marginBottom: 8,
    indent: 0,
    align: 'left',
  },
  h3: {
    font: 'serif',
    size: 15,
    lineHeight: 1.35,
    color: toRgb(40, 40, 40),
    marginTop: 8,
    marginBottom: 8,
    indent: 0,
    align: 'left',
  },
  paragraph: {
    font: 'serif',
    size: 12,
    lineHeight: 1.72,
    color: toRgb(42, 42, 42),
    marginTop: 4,
    marginBottom: 8,
    indent: 0,
    align: 'left',
  },
  list_item: {
    font: 'serif',
    size: 12,
    lineHeight: 1.62,
    color: toRgb(50, 50, 50),
    marginTop: 2,
    marginBottom: 5,
    indent: 14,
    align: 'left',
  },
  caption: {
    font: 'sans',
    size: 9,
    lineHeight: 1.35,
    color: toRgb(122, 122, 122),
    marginTop: 4,
    marginBottom: 10,
    indent: 0,
    align: 'left',
  },
  quote: {
    font: 'serif',
    size: 15,
    lineHeight: 1.6,
    color: toRgb(36, 36, 36),
    marginTop: 8,
    marginBottom: 10,
    indent: 14,
    align: 'left',
  },
  callout: {
    font: 'serif',
    size: 12,
    lineHeight: 1.6,
    color: toRgb(34, 34, 34),
    marginTop: 8,
    marginBottom: 10,
    indent: 0,
    align: 'left',
  },
  image: {
    font: 'sans',
    size: 11,
    lineHeight: 1.5,
    color: toRgb(100, 100, 100),
    marginTop: 8,
    marginBottom: 10,
    indent: 0,
    align: 'center',
    imageMaxHeight: 230,
  },
};

const normalizeText = (value: string) =>
  value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u00A0/g, ' ');

const splitGraphemes = (text: string): string[] => {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
};

const wrapLine = (font: PDFFont, text: string, size: number, maxWidth: number): string[] => {
  if (!text) return [''];

  const segments = splitGraphemes(text);
  const lines: string[] = [];
  let current = '';

  for (const segment of segments) {
    const next = current + segment;
    const width = font.widthOfTextAtSize(next, size);

    if (width <= maxWidth || !current) {
      current = next;
      continue;
    }

    lines.push(current.trimEnd());
    current = segment.trimStart();
  }

  if (current) {
    lines.push(current.trimEnd());
  }

  return lines.length > 0 ? lines : [''];
};

const wrapText = (font: PDFFont, text: string, size: number, maxWidth: number): string[] => {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [''];
  }

  const lines: string[] = [];
  const paragraphs = normalized.split('\n');

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }

    for (const line of wrapLine(font, paragraph, size, maxWidth)) {
      lines.push(line);
    }
  }

  return lines.length > 0 ? lines : [''];
};

const dataUrlToBytes = (dataUrl: string): Uint8Array => {
  const splitIndex = dataUrl.indexOf(',');
  if (splitIndex === -1) {
    throw new Error('非法图片数据，无法导出 PDF。');
  }

  const b64 = dataUrl.slice(splitIndex + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const getEmbeddedImage = async (
  pdfDoc: PDFDocument,
  imageCache: Map<string, PDFImage>,
  imageUrl: string,
): Promise<PDFImage> => {
  const cached = imageCache.get(imageUrl);
  if (cached) {
    return cached;
  }

  const bytes = dataUrlToBytes(imageUrl);
  const image = imageUrl.startsWith('data:image/png')
    ? await pdfDoc.embedPng(bytes)
    : await pdfDoc.embedJpg(bytes);

  imageCache.set(imageUrl, image);
  return image;
};

const scaleStyle = (base: BaseTextStyle, scale: number): ScaledTextStyle => ({
  ...base,
  size: Math.max(base.size * scale, 6),
  marginTop: base.marginTop * scale,
  marginBottom: base.marginBottom * scale,
  indent: base.indent * scale,
  imageMaxHeight: base.imageMaxHeight ? base.imageMaxHeight * scale : undefined,
});

const planTextBlock = (
  block: LayoutBlock,
  style: ScaledTextStyle,
  fonts: FontPack,
): PlannedTextBlock => {
  const font = fonts[style.font];
  const maxWidth = Math.max(CONTENT_WIDTH - style.indent, 20);
  const lines = wrapText(font, block.content, style.size, maxWidth);
  const lineStep = style.size * style.lineHeight;

  const quoteExtra = block.type === 'quote' ? 2 : 0;

  let innerHeight = lines.length * lineStep + quoteExtra;

  if (block.type === 'callout') {
    const labelSize = Math.max(8 * (style.size / 12), 6);
    const insetY = 10 * (style.size / 12);
    innerHeight = insetY * 2 + labelSize + 6 * (style.size / 12) + lines.length * lineStep;
  }

  const totalHeight = style.marginTop + innerHeight + style.marginBottom;

  return {
    kind: 'text',
    block,
    style,
    lines,
    lineStep,
    totalHeight,
  };
};

const planImageBlock = async (
  pdfDoc: PDFDocument,
  imageCache: Map<string, PDFImage>,
  block: LayoutBlock,
  style: ScaledTextStyle,
  fonts: FontPack,
): Promise<PlannedImageBlock> => {
  const maxW = CONTENT_WIDTH;
  const maxH = style.imageMaxHeight ?? 220;

  if (!block.imageUrl) {
    const fallbackText = block.content || '图像未完成生成';
    const lines = wrapText(fonts.sans, fallbackText, style.size, maxW);
    const lineStep = style.size * style.lineHeight;

    return {
      kind: 'image',
      block,
      style,
      image: null,
      drawW: 0,
      drawH: 0,
      totalHeight: style.marginTop + lines.length * lineStep + style.marginBottom,
      fallbackLines: lines,
      fallbackLineStep: lineStep,
    };
  }

  try {
    const image = await getEmbeddedImage(pdfDoc, imageCache, block.imageUrl);
    const ratio = Math.min(maxW / image.width, maxH / image.height, 1);
    const drawW = image.width * ratio;
    const drawH = image.height * ratio;

    return {
      kind: 'image',
      block,
      style,
      image,
      drawW,
      drawH,
      totalHeight: style.marginTop + drawH + style.marginBottom,
    };
  } catch (error) {
    console.error('图像嵌入失败，回退为文本', error);
    const lines = wrapText(fonts.sans, '图像无法嵌入，已跳过。', style.size, maxW);
    const lineStep = style.size * style.lineHeight;

    return {
      kind: 'image',
      block,
      style,
      image: null,
      drawW: 0,
      drawH: 0,
      totalHeight: style.marginTop + lines.length * lineStep + style.marginBottom,
      fallbackLines: lines,
      fallbackLineStep: lineStep,
    };
  }
};

const buildPagePlan = async (
  pdfDoc: PDFDocument,
  imageCache: Map<string, PDFImage>,
  fonts: FontPack,
  blocks: LayoutBlock[],
  scale: number,
): Promise<{ plans: PlannedBlock[]; usedHeight: number }> => {
  const plans: PlannedBlock[] = [];
  let usedHeight = 0;

  for (const block of blocks) {
    const style = scaleStyle(baseStyleMap[block.type] ?? baseStyleMap.paragraph, scale);

    if (block.type === 'image') {
      const planned = await planImageBlock(pdfDoc, imageCache, block, style, fonts);
      plans.push(planned);
      usedHeight += planned.totalHeight;
    } else {
      const planned = planTextBlock(block, style, fonts);
      plans.push(planned);
      usedHeight += planned.totalHeight;
    }
  }

  return { plans, usedHeight };
};

const buildFittedPagePlan = async (
  pdfDoc: PDFDocument,
  imageCache: Map<string, PDFImage>,
  fonts: FontPack,
  blocks: LayoutBlock[],
): Promise<{ plans: PlannedBlock[]; scale: number }> => {
  const base = await buildPagePlan(pdfDoc, imageCache, fonts, blocks, 1);
  if (base.usedHeight <= CONTENT_HEIGHT) {
    return { plans: base.plans, scale: 1 };
  }

  let scale = CONTENT_HEIGHT / base.usedHeight;
  scale = Math.max(Math.min(scale, 1), 0.18);

  let fitted = await buildPagePlan(pdfDoc, imageCache, fonts, blocks, scale);

  let guard = 0;
  while (fitted.usedHeight > CONTENT_HEIGHT && guard < 6) {
    const nextScale = scale * (CONTENT_HEIGHT / fitted.usedHeight) * 0.995;
    scale = Math.max(Math.min(nextScale, scale), 0.12);
    fitted = await buildPagePlan(pdfDoc, imageCache, fonts, blocks, scale);
    guard += 1;
  }

  return { plans: fitted.plans, scale };
};

const drawTextPlan = (page: PDFPage, fonts: FontPack, yTop: number, plan: PlannedTextBlock): number => {
  const { style, lines, lineStep, block } = plan;
  const font = fonts[style.font];

  let y = yTop - style.marginTop;

  if (block.type === 'callout') {
    const insetX = 12 * (style.size / 12);
    const insetY = 10 * (style.size / 12);
    const labelSize = Math.max(8 * (style.size / 12), 6);
    const labelGap = 6 * (style.size / 12);

    const contentHeight = lines.length * lineStep;
    const boxHeight = insetY * 2 + labelSize + labelGap + contentHeight;
    const boxY = y - boxHeight;

    page.drawRectangle({
      x: PAGE_MARGIN_X,
      y: boxY,
      width: CONTENT_WIDTH,
      height: boxHeight,
      borderColor: toRgb(205, 205, 205),
      borderWidth: 1,
      color: toRgb(248, 248, 248),
    });

    page.drawText('注释', {
      x: PAGE_MARGIN_X + insetX,
      y: boxY + boxHeight - insetY - labelSize,
      size: labelSize,
      font: fonts.sans,
      color: toRgb(120, 120, 120),
    });

    let lineY = boxY + boxHeight - insetY - labelSize - labelGap;
    for (const line of lines) {
      lineY -= lineStep;
      page.drawText(line, {
        x: PAGE_MARGIN_X + insetX,
        y: lineY,
        size: style.size,
        font,
        color: style.color,
      });
    }

    return boxY - style.marginBottom;
  }

  const quoteTop = y;

  for (const line of lines) {
    y -= lineStep;

    if (block.type === 'list_item' && line === lines[0]) {
      page.drawText('•', {
        x: PAGE_MARGIN_X,
        y: y + 0.15 * style.size,
        size: style.size,
        font,
        color: style.color,
      });
    }

    const textWidth = font.widthOfTextAtSize(line, style.size);
    const centeredX = PAGE_MARGIN_X + (CONTENT_WIDTH - textWidth) / 2;
    const minX = PAGE_MARGIN_X;
    const maxX = PAGE_MARGIN_X + Math.max(CONTENT_WIDTH - textWidth, 0);
    const x = style.align === 'center'
      ? Math.min(Math.max(centeredX, minX), maxX)
      : PAGE_MARGIN_X + style.indent;

    page.drawText(line, {
      x,
      y,
      size: style.size,
      font,
      color: style.color,
    });
  }

  if (block.type === 'quote') {
    page.drawLine({
      start: { x: PAGE_MARGIN_X + 4, y: quoteTop - 2 },
      end: { x: PAGE_MARGIN_X + 4, y: y - 2 },
      thickness: Math.max(1.2 * (style.size / 15), 0.8),
      color: toRgb(70, 70, 70),
    });
  }

  return y - style.marginBottom;
};

const drawImagePlan = (page: PDFPage, fonts: FontPack, yTop: number, plan: PlannedImageBlock): number => {
  const { style } = plan;
  let y = yTop - style.marginTop;

  if (plan.image) {
    const imageY = y - plan.drawH;
    page.drawImage(plan.image, {
      x: PAGE_MARGIN_X + (CONTENT_WIDTH - plan.drawW) / 2,
      y: imageY,
      width: plan.drawW,
      height: plan.drawH,
    });
    return imageY - style.marginBottom;
  }

  const lines = plan.fallbackLines ?? ['图像缺失'];
  const lineStep = plan.fallbackLineStep ?? style.size * style.lineHeight;

  for (const line of lines) {
    y -= lineStep;
    const textWidth = fonts.sans.widthOfTextAtSize(line, style.size);
    page.drawText(line, {
      x: PAGE_MARGIN_X + (CONTENT_WIDTH - textWidth) / 2,
      y,
      size: style.size,
      font: fonts.sans,
      color: toRgb(120, 120, 120),
    });
  }

  return y - style.marginBottom;
};

const drawPageFooterNumber = (page: PDFPage, fonts: FontPack, pageNumber: number) => {
  const text = String(pageNumber).padStart(2, '0');
  const size = 9;
  const textWidth = fonts.sans.widthOfTextAtSize(text, size);

  page.drawText(text, {
    x: A4_WIDTH - PAGE_MARGIN_X - textWidth,
    y: 18,
    size,
    font: fonts.sans,
    color: toRgb(145, 145, 145),
  });
};

const loadFonts = async (pdfDoc: PDFDocument): Promise<FontPack> => {
  pdfDoc.registerFontkit(fontkit);

  const serifRes = await fetch(FONT_SERIF_PATH);
  if (!serifRes.ok) {
    throw new Error('衬线中文字体加载失败，请确认 public/fonts 字体文件完整。');
  }

  const serifBytes = await serifRes.arrayBuffer();
  const serif = await pdfDoc.embedFont(serifBytes, { subset: false });

  // 导出只使用一套衬线字体，减少 PDF 体积并统一字形。
  return { sans: serif, serif };
};

const sanitizeFileName = (name: string) =>
  name
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const normalizeOptions = (
  options?: string | ExportStructuredPdfOptions,
): ExportStructuredPdfOptions => {
  if (!options) return {};
  if (typeof options === 'string') {
    return { sourceFileName: options };
  }
  return options;
};

export const exportStructuredPdf = async (
  pages: ProcessedPage[],
  options?: string | ExportStructuredPdfOptions,
): Promise<string> => {
  if (!pages.length) {
    throw new Error('暂无可导出的页面内容。');
  }

  const { sourceFileName, onProgress } = normalizeOptions(options);

  const sortedPages = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);

  const pdfDoc = await PDFDocument.create();
  const fonts = await loadFonts(pdfDoc);
  const imageCache = new Map<string, PDFImage>();

  for (let i = 0; i < sortedPages.length; i += 1) {
    const processed = sortedPages[i];

    onProgress?.({
      current: i + 1,
      total: sortedPages.length,
      pageNumber: processed.pageNumber,
    });

    const blocks = processed.blocks.length > 0
      ? processed.blocks
      : [{
          id: `empty-${processed.pageNumber}`,
          type: 'paragraph' as const,
          content: '该页面没有可导出的结构化内容。',
        }];

    const { plans } = await buildFittedPagePlan(pdfDoc, imageCache, fonts, blocks);

    const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    let y = A4_HEIGHT - PAGE_MARGIN_TOP;

    for (const plan of plans) {
      if (plan.kind === 'image') {
        y = drawImagePlan(page, fonts, y, plan);
      } else {
        y = drawTextPlan(page, fonts, y, plan);
      }
    }

    drawPageFooterNumber(page, fonts, processed.pageNumber);
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  const baseName = sanitizeFileName(sourceFileName || '导出文档');
  anchor.href = url;
  anchor.download = `${baseName || '导出文档'}-结构化导出.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);

  return anchor.download;
};
