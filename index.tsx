import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Initialize PDF.js worker
// @ts-ignore
if (window.pdfjsLib) {
  // @ts-ignore
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('未找到用于挂载应用的根节点');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
