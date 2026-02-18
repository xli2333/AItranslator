import React, { useMemo, useState } from 'react';
import { ChatMessage, ChatScope } from '../types';
import { MessageCircle, Send, Bot, User, Loader2, Minimize2, Trash2, X } from 'lucide-react';

interface Props {
  scopes: ChatScope[];
  activeScopeKey: string;
  messages: ChatMessage[];
  loading: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSwitchScope: (scopeKey: string) => void;
  onDeleteScope: (scopeKey: string) => Promise<void>;
  onSendMessage: (text: string) => Promise<void>;
}

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const TranslationChatPanel: React.FC<Props> = ({
  scopes,
  activeScopeKey,
  messages,
  loading,
  isOpen,
  onOpen,
  onClose,
  onSwitchScope,
  onDeleteScope,
  onSendMessage,
}) => {
  const [input, setInput] = useState('');
  const [deletingScopeKey, setDeletingScopeKey] = useState<string | null>(null);

  const activeScope = useMemo(
    () => scopes.find((scope) => scope.key === activeScopeKey) ?? scopes[0],
    [activeScopeKey, scopes],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    await onSendMessage(text);
  };

  const handleDeleteScope = async (scopeKey: string) => {
    if (scopeKey === 'document' || deletingScopeKey) return;
    setDeletingScopeKey(scopeKey);
    try {
      await onDeleteScope(scopeKey);
    } finally {
      setDeletingScopeKey(null);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="fixed right-4 md:right-6 bottom-6 z-50 h-12 w-12 rounded-full bg-black text-white flex items-center justify-center shadow-lg no-print"
        title="打开学习对话"
      >
        <MessageCircle className="w-5 h-5" />
      </button>
    );
  }

  return (
    <aside className="fixed right-4 md:right-6 bottom-6 z-50 w-[min(90vw,320px)] h-[min(62vh,480px)] rounded-2xl glass-surface-strong no-print overflow-hidden flex flex-col">
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-gray-600" />
          <span className="font-serif text-sm text-[#16171b]">文章学习对话</span>
        </div>
        <div className="flex items-center gap-1">
          {activeScope && activeScope.key !== 'document' && (
            <button
              type="button"
              className="h-7 w-7 rounded-full text-gray-500 hover:bg-red-50 hover:text-red-600 flex items-center justify-center"
              title="删除当前会话"
              onClick={() => handleDeleteScope(activeScope.key)}
              disabled={deletingScopeKey === activeScope.key}
            >
              {deletingScopeKey === activeScope.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center"
            title="收起对话"
          >
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2 flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <div
            key={scope.key}
            className={`inline-flex items-center rounded-full ${
              scope.key === activeScopeKey ? 'bg-black text-white' : 'bg-white/90 text-gray-600'
            }`}
          >
            <button
              onClick={() => onSwitchScope(scope.key)}
              className="px-3 py-1 text-[11px] tracking-[0.08em]"
              type="button"
            >
              {scope.label}
            </button>
            {scope.key !== 'document' && (
              <button
                type="button"
                onClick={() => handleDeleteScope(scope.key)}
                className={`mr-1 h-4 w-4 rounded-full flex items-center justify-center ${
                  scope.key === activeScopeKey ? 'hover:bg-white/15' : 'hover:bg-black/10'
                }`}
                title="删除会话"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {activeScope?.kind === 'selection' && activeScope.selectedText && (
        <div className="px-3 py-2 text-[11px] text-gray-500 line-clamp-2">
          选中文本：{activeScope.selectedText}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-2 bg-gradient-to-b from-white/90 via-white/60 to-white/80">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400 leading-5">
            可以向我提问这篇文章的概念、逻辑、论证结构和关键词含义。
          </p>
        )}

        <div className="space-y-2.5">
          {messages.map((msg, idx) => (
            <div key={`${msg.role}-${msg.createdAt}-${idx}`} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && (
                <div className="w-6 h-6 rounded-full bg-white text-gray-500 flex items-center justify-center shrink-0">
                  <Bot className="w-3.5 h-3.5" />
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-5 whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-black text-white rounded-br-md'
                  : 'bg-white text-[#2a2b31] rounded-bl-md'
              }`}
              >
                {msg.text}
                <div className={`mt-1 text-[10px] ${msg.role === 'user' ? 'text-gray-300' : 'text-gray-400'}`}>
                  {formatTime(msg.createdAt)}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                  <User className="w-3.5 h-3.5" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="p-2.5 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入问题，辅助理解文章"
          className="flex-1 resize-none h-16 bg-white/95 rounded-xl px-3 py-2 text-xs outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          className="h-9 w-9 rounded-xl bg-black text-white flex items-center justify-center disabled:opacity-50"
          disabled={loading || !input.trim()}
          title="发送"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
    </aside>
  );
};

export default TranslationChatPanel;
