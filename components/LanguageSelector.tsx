import React from 'react';
import { SUPPORTED_LANGUAGES } from '../constants';

interface Props {
  sourceLang: string;
  targetLang: string;
  setSourceLang: (l: string) => void;
  setTargetLang: (l: string) => void;
  disabled: boolean;
}

const LanguageSelector: React.FC<Props> = ({
  sourceLang,
  targetLang,
  setSourceLang,
  setTargetLang,
  disabled,
}) => {
  return (
    <div className="rounded-[1.4rem] glass-surface px-4 py-4">
      <div className="flex flex-col md:flex-row items-center justify-center gap-5 md:gap-10">
        <div className="flex flex-col items-center">
          <label className="text-[10px] text-gray-500 tracking-[0.24em] mb-2">源语言</label>
          <div className="relative">
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              disabled={disabled}
              className="appearance-none bg-transparent text-2xl md:text-[2rem] font-serif text-[#0e0f14] outline-none text-center cursor-pointer"
            >
              <option value="自动检测">自动检测</option>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={`src-${l.code}`} value={l.label}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="h-px w-16 bg-black/20 md:w-px md:h-12" />

        <div className="flex flex-col items-center">
          <label className="text-[10px] text-gray-500 tracking-[0.24em] mb-2">目标语言</label>
          <div className="relative">
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              disabled={disabled}
              className="appearance-none bg-transparent text-2xl md:text-[2rem] font-serif text-[#0e0f14] outline-none text-center cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={`tgt-${l.code}`} value={l.label}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LanguageSelector;
