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
        <div className="relative overflow-hidden rounded-3xl border-2 border-dashed border-gray-200 bg-white p-8 md:p-9 text-center transition-all duration-300 hover:border-black hover:shadow-2xl hover:-translate-y-1">
          <div className="absolute inset-0 bg-gradient-to-tr from-gray-50 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

          <div className="relative z-10 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-full bg-gray-200 opacity-0 group-hover:opacity-75" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                <UploadCloud className="h-7 w-7" />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-serif text-2xl font-medium text-gray-900">
                上传 PDF 文档
              </h3>
              <p className="font-sans text-xs md:text-sm tracking-wide text-gray-400">
                拖拽文件到此处，或点击选择文件
              </p>
            </div>

            <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-1.5 transition-colors group-hover:bg-gray-200">
              <Sparkles className="h-3 w-3 text-black" />
              <span className="text-xs font-semibold tracking-wide text-gray-600">
                已启用 AI 版式分析
              </span>
            </div>
          </div>
        </div>
      </label>
    </div>
  );
};

export default FileUpload;
