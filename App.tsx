import React, { useRef, useState } from 'react';
import { AppStatus, ProcessedPage, Language, LayoutBlock } from './types';
import { analyzePageLayout, translateImageBlock } from './services/geminiService';
import FileUpload from './components/FileUpload';
import LanguageSelector from './components/LanguageSelector';
import PageRenderer from './components/PageRenderer';
import { Download, Square, ArrowRight, FileText, Trash2, Layers, Loader2, KeyRound } from 'lucide-react';

const App: React.FC = () => {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [pages, setPages] = useState<ProcessedPage[]>([]);
  const [sourceLang, setSourceLang] = useState<string>('自动检测');
  const [targetLang, setTargetLang] = useState<string>(Language.ZH);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [pageRange, setPageRange] = useState<string>('全部');
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const processingRef = useRef(false);
  const shouldStopRef = useRef(false);

  const parsePageRange = (rangeStr: string, totalPages: number): number[] => {
    const cleanStr = rangeStr.trim().toLowerCase();
    if (!cleanStr || cleanStr === 'all' || cleanStr === '全部') {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const result = new Set<number>();
    const parts = cleanStr.split(/[,，]/);

    parts.forEach((part) => {
      const p = part.trim();
      if (p.includes('-')) {
        const [start, end] = p.split('-').map((num) => parseInt(num, 10));
        if (!Number.isNaN(start) && !Number.isNaN(end)) {
          for (let i = start; i <= end; i += 1) {
            if (i >= 1 && i <= totalPages) result.add(i);
          }
        }
      } else {
        const pageNum = parseInt(p, 10);
        if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
          result.add(pageNum);
        }
      }
    });

    return Array.from(result).sort((a, b) => a - b);
  };

  const cropImageFromPage = async (base64Page: string, box: [number, number, number, number]): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const PAD = 0;
        let [ymin, xmin, ymax, xmax] = box;

        ymin = Math.max(0, ymin - PAD);
        xmin = Math.max(0, xmin - PAD);
        ymax = Math.min(1000, ymax + PAD);
        xmax = Math.min(1000, xmax + PAD);

        const width = img.width;
        const height = img.height;

        const realX = (xmin / 1000) * width;
        const realY = (ymin / 1000) * height;
        const realW = ((xmax - xmin) / 1000) * width;
        const realH = ((ymax - ymin) / 1000) * height;

        canvas.width = realW;
        canvas.height = realH;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, realX, realY, realW, realH, 0, 0, realW, realH);
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve('');
        }
      };
      img.src = base64Page;
    });
  };

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
  };

  const processPdf = async (file: File) => {
    const runtimeApiKey = geminiApiKey.trim();
    if (!runtimeApiKey) {
      alert('请先输入 Gemini API Key。');
      return;
    }

    setStatus(AppStatus.PROCESSING);
    setPages([]);
    setProgressMsg('正在读取 PDF...');
    shouldStopRef.current = false;

    const fileReader = new FileReader();
    fileReader.onload = async function onLoad() {
      const typedarray = new Uint8Array(this.result as ArrayBuffer);

      try {
        // @ts-ignore
        const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
        const totalPages = pdf.numPages;

        const targetPageNumbers = parsePageRange(pageRange, totalPages);

        if (targetPageNumbers.length === 0) {
          alert('未找到有效页码，请检查页码范围。');
          setStatus(AppStatus.IDLE);
          return;
        }

        const newPages: ProcessedPage[] = [];

        for (const pageNum of targetPageNumbers) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            await page.render({ canvasContext: context, viewport }).promise;
            newPages.push({
              pageNumber: pageNum,
              originalImageUrl: canvas.toDataURL('image/jpeg', 0.8),
              width: viewport.width,
              height: viewport.height,
              blocks: [],
              status: 'pending',
            });
          }
        }

        setPages(newPages);
        processPipeline(newPages, runtimeApiKey);
      } catch (err) {
        console.error(err);
        setStatus(AppStatus.ERROR);
        setProgressMsg('处理失败，请重试。');
      }
    };
    fileReader.readAsArrayBuffer(file);
  };

  const processPipeline = async (initialPages: ProcessedPage[], apiKey: string) => {
    if (processingRef.current) return;
    processingRef.current = true;

    const pagesCopy = [...initialPages];

    try {
      for (let i = 0; i < pagesCopy.length; i += 1) {
        if (shouldStopRef.current) break;

        setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, status: 'analyzing' } : p)));
        setProgressMsg(`第 ${pagesCopy[i].pageNumber} 页：结构分析中...`);

        const blocks = await analyzePageLayout(
          pagesCopy[i].originalImageUrl,
          sourceLang,
          targetLang,
          apiKey,
          customInstruction,
        );

        if (shouldStopRef.current) {
          setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, status: 'pending' } : p)));
          break;
        }

        setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, blocks, status: 'generating_images' } : p)));

        const imageBlocks = blocks.filter((b) => b.type === 'image' && b.box);

        if (imageBlocks.length > 0) {
          setProgressMsg(`第 ${pagesCopy[i].pageNumber} 页：图像重绘中（${imageBlocks.length} 张）...`);

          const updatedBlocks = [...blocks];

          for (const imgBlock of imageBlocks) {
            if (shouldStopRef.current) break;
            if (!imgBlock.box) continue;

            const croppedBase64 = await cropImageFromPage(pagesCopy[i].originalImageUrl, imgBlock.box);
            const translatedImgUrl = await translateImageBlock(croppedBase64, targetLang, apiKey);

            if (translatedImgUrl) {
              const blockIndex = updatedBlocks.findIndex((b) => b.id === imgBlock.id);
              if (blockIndex !== -1) {
                updatedBlocks[blockIndex] = { ...imgBlock, imageUrl: translatedImgUrl };
                setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, blocks: updatedBlocks } : p)));
              }
            }
          }
        }

        setPages((curr) => curr.map((p, idx) => (idx === i ? { ...p, status: 'done' } : p)));
      }
    } catch (err) {
      console.error('Pipeline Error', err);
    } finally {
      setStatus(AppStatus.COMPLETED);
      setProgressMsg(shouldStopRef.current ? '已暂停' : '处理完成');
      processingRef.current = false;
    }
  };

  const handleStop = () => {
    shouldStopRef.current = true;
    setProgressMsg('正在停止...');
  };

  const handleExportPDF = async () => {
    if (isExporting || pages.length === 0) return;

    setIsExporting(true);
    setProgressMsg('正在生成结构化 PDF...');

    try {
      const { exportStructuredPdf } = await import('./services/pdfExportService');
      await exportStructuredPdf(pages, {
        sourceFileName: selectedFile?.name,
        onProgress: ({ current, total, pageNumber }) => {
          setProgressMsg(`正在导出第 ${current}/${total} 页（原文第 ${pageNumber} 页）...`);
        },
      });
      setProgressMsg('PDF 导出完成');
    } catch (error) {
      console.error('PDF 导出失败', error);
      alert('导出失败，请稍后重试。');
    } finally {
      setIsExporting(false);
    }
  };

  const handleUpdatePage = (pageNumber: number, newBlocks: LayoutBlock[]) => {
    setPages((curr) => curr.map((p) => (p.pageNumber === pageNumber ? { ...p, blocks: newBlocks } : p)));
  };

  return (
    <div className="min-h-screen bg-[#f2f2f2] text-[#111]">
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 md:px-8 py-4 flex justify-between items-center bg-[#f2f2f2]/90 backdrop-blur-sm border-b border-gray-200/50 no-print">
        <div className="flex items-center gap-4">
          <div className="font-serif font-bold text-xl tracking-tighter">译构 PDF</div>
          <div className="hidden md:block w-px h-4 bg-gray-300" />
          <div className="hidden md:block font-sans text-[10px] tracking-[0.2em] text-gray-400">AI 版式重构</div>
        </div>

        {status === AppStatus.COMPLETED && (
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="group flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-full hover:bg-gray-800 transition-all active:scale-95 shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span className="text-xs font-bold tracking-wider">{isExporting ? '生成中...' : '结构化导出 PDF'}</span>
          </button>
        )}
      </nav>

      <main className="pt-24 md:pt-28 px-4 max-w-6xl mx-auto pb-12">
        {status === AppStatus.IDLE && (
          <div className="animate-fade-in-up mt-3 md:mt-4 no-print">
            <h1 className="text-4xl md:text-5xl font-serif font-thin text-center mb-3 tracking-tight leading-[0.95]">
              重构
              <br />
              <span className="text-gray-400 italic">文档阅读体验</span>
            </h1>
            <p className="text-center font-sans text-xs tracking-[0.12em] text-gray-400 mb-4">PDF 智能解析与网页化排版</p>

            <LanguageSelector
              sourceLang={sourceLang}
              targetLang={targetLang}
              setSourceLang={setSourceLang}
              setTargetLang={setTargetLang}
              disabled={false}
            />

            <div className="max-w-4xl mx-auto mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/75 rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3 justify-center">
                  <KeyRound className="w-3 h-3 text-gray-400" />
                  <label className="text-[10px] font-sans text-gray-400 tracking-[0.2em]">Gemini API Key</label>
                </div>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="请输入你的 Gemini API Key"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full text-center bg-transparent border-b border-gray-200 py-1.5 text-base font-sans focus:border-black focus:outline-none transition-colors placeholder:text-gray-300"
                />
                <p className="text-center text-[10px] text-gray-400 mt-1.5">仅在当前页面内存中使用，不写入代码和构建产物。</p>
              </div>

              <div className="bg-white/75 rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3 justify-center">
                  <Layers className="w-3 h-3 text-gray-400" />
                  <label className="text-[10px] font-sans text-gray-400 tracking-[0.2em]">页码范围</label>
                </div>
                <input
                  type="text"
                  value={pageRange}
                  onChange={(e) => setPageRange(e.target.value)}
                  placeholder="例如：1-5，8，11-13（默认：全部）"
                  className="w-full text-center bg-transparent border-b border-gray-200 py-1.5 text-lg font-serif focus:border-black focus:outline-none transition-colors placeholder:text-gray-300"
                />
                <p className="text-center text-[10px] text-gray-400 mt-1.5">留空或填写“全部”表示整份文档，也可输入区间。</p>
              </div>
            </div>

            <div className="max-w-3xl mx-auto mt-4">
              {!selectedFile ? (
                <FileUpload onFileSelect={handleFileSelect} />
              ) : (
                <div className="flex flex-col items-center gap-6 animate-fade-in">
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-gray-100 shadow-soft w-full max-w-lg transition-transform hover:scale-[1.01]">
                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-gray-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-serif text-base truncate text-gray-900">{selectedFile.name}</h3>
                      <p className="text-[10px] tracking-wider text-gray-400 font-sans">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <button
                      onClick={() => setSelectedFile(null)}
                      className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors group"
                      title="移除文件"
                    >
                      <Trash2 className="w-5 h-5 transition-colors" />
                    </button>
                  </div>

                  <button
                    onClick={() => processPdf(selectedFile)}
                    disabled={!geminiApiKey.trim()}
                    title={!geminiApiKey.trim() ? '请先输入 Gemini API Key' : '开始重构'}
                    className="group relative flex items-center gap-3 px-3 py-1.5 text-2xl font-serif text-black hover:opacity-70 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <span className="relative">
                      开始重构
                      <span className="absolute left-0 bottom-0 w-full h-0.5 bg-black scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
                    </span>
                    <ArrowRight className="w-6 h-6 transition-transform duration-300 group-hover:translate-x-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="max-w-3xl mx-auto mt-3">
              <label className="block text-[10px] font-sans text-gray-400 tracking-[0.2em] mb-2 text-center">AI 自定义要求（可选）</label>
              <textarea
                value={customInstruction}
                onChange={(e) => setCustomInstruction(e.target.value)}
                placeholder="例如：保留专有名词、使用正式语气、忽略图片内容等。"
                className="w-full h-16 md:h-20 bg-white border border-gray-200 rounded-2xl px-4 py-2.5 text-sm font-sans resize-none focus:outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-all shadow-soft"
              />
            </div>
          </div>
        )}

        {(status === AppStatus.PROCESSING || status === AppStatus.COMPLETED) && (
          <div className="animate-fade-in flex flex-col gap-12 items-center">
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 status-pill no-print flex gap-2">
              <div className="bg-black/90 backdrop-blur text-white pl-6 pr-2 py-2 rounded-full shadow-2xl flex items-center gap-3 min-w-[300px] justify-between">
                <div className="flex items-center gap-3">
                  {status === AppStatus.PROCESSING && <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />}
                  <p className="font-sans text-[10px] font-bold tracking-widest uppercase truncate max-w-[200px]">{progressMsg}</p>
                </div>

                {status === AppStatus.PROCESSING && (
                  <button
                    onClick={handleStop}
                    className="bg-white/10 hover:bg-red-500/80 p-2 rounded-full transition-colors group"
                    title="停止并结束"
                  >
                    <Square className="w-3 h-3 text-white fill-white" />
                  </button>
                )}
              </div>
            </div>

            <div className="w-full flex flex-col items-center gap-8">
              {pages.map((page) => (
                <PageRenderer
                  key={page.pageNumber}
                  page={page}
                  targetLang={targetLang}
                  apiKey={geminiApiKey}
                  onUpdatePage={handleUpdatePage}
                />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;




