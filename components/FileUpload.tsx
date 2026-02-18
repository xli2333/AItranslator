import React, { useCallback } from 'react';
import { UploadCloud, Sparkles } from 'lucide-react';

interface Props {
  onFileSelect: (file: File) => void;
}

const isPdfFile = (file: File) =>
  file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

const FileUpload: React.FC<Props> = ({ onFileSelect }) => {
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (isPdfFile(file)) {
        onFileSelect(file);
      } else {
        alert('请上传 PDF 文件。');
      }
    }
  }, [onFileSelect]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (isPdfFile(file)) {
        onFileSelect(file);
      } else {
        alert('请上传 PDF 文件。');
      }
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="w-full relative group cursor-pointer"
    >
      <input
        type="file"
        accept="application/pdf"
        onChange={handleChange}
        className="hidden"
        id="pdf-upload"
      />
      <label
        htmlFor="pdf-upload"
        className="block w-full"
      >
        <div className="relative overflow-hidden rounded-[1.8rem] glass-surface-strong p-8 md:p-10 text-center transition-all duration-300 hover:-translate-y-1">
          <div className="absolute -top-12 -right-12 h-40 w-40 bg-black/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-10 h-44 w-44 bg-gray-300/25 rounded-full blur-3xl" />

          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
              <UploadCloud className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h3 className="font-serif text-3xl leading-tight text-[#101116]">
                上传文档
              </h3>
              <p className="font-sans text-xs md:text-sm tracking-[0.16em] text-gray-500">
                拖拽 PDF 到此处，或点击选择文件
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full bg-white/75 px-4 py-1.5">
              <Sparkles className="h-3 w-3 text-black" />
              <span className="text-xs font-medium tracking-[0.1em] text-gray-600">
                已启用版式智能还原
              </span>
            </div>
          </div>
        </div>
      </label>
    </div>
  );
};

export default FileUpload;
