import React, { useEffect, useRef, useState } from 'react';

interface AutoResizingTextProps {
  text: string;
  className?: string;
  minFontSize?: number;
  maxFontSize?: number;
}

const AutoResizingText: React.FC<AutoResizingTextProps> = ({ 
  text, 
  className = "", 
  minFontSize = 8, 
  maxFontSize = 32 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(12); // Initial guess

  useEffect(() => {
    const adjustFontSize = () => {
      const container = containerRef.current;
      const textEl = textRef.current;
      if (!container || !textEl) return;

      let currentSize = fontSize;
      
      // Reset to a baseline to measure
      textEl.style.fontSize = `${currentSize}px`;

      // If text is overflowing, shrink it
      while (
        (textEl.offsetHeight > container.clientHeight || textEl.offsetWidth > container.clientWidth) && 
        currentSize > minFontSize
      ) {
        currentSize -= 0.5;
        textEl.style.fontSize = `${currentSize}px`;
      }

      // If text is way too small and there is space (optional optimization), grow it
      // But purely for "fit", shrinking is the priority. 
      // We'll do a simple grow check only if it was never shrunk
      if (currentSize === fontSize && currentSize < maxFontSize) {
         while (
            textEl.offsetHeight < container.clientHeight && 
            textEl.offsetWidth < container.clientWidth &&
            currentSize < maxFontSize
          ) {
            currentSize += 0.5;
            textEl.style.fontSize = `${currentSize}px`;
            // If we overshoot, step back
            if (textEl.offsetHeight > container.clientHeight || textEl.offsetWidth > container.clientWidth) {
                currentSize -= 0.5;
                textEl.style.fontSize = `${currentSize}px`;
                break;
            }
          }
      }

      setFontSize(currentSize);
    };

    adjustFontSize();
    // Re-run if text changes
  }, [text, containerRef.current?.clientHeight, containerRef.current?.clientWidth]);

  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full overflow-hidden leading-tight flex flex-col justify-start ${className}`}
      style={{ wordBreak: 'break-word' }}
    >
      <span ref={textRef} style={{ fontSize: `${fontSize}px`, transition: 'font-size 0.1s' }}>
        {text}
      </span>
    </div>
  );
};

export default AutoResizingText;