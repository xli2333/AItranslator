import React, { useMemo, useState } from 'react';
import { ChatMessage, ChatScope } from '../types';
import { MessageCircle, Send, Bot, User, Loader2 } from 'lucide-react';

interface Props {
  scopes: ChatScope[];
  activeScopeKey: string;
  messages: ChatMessage[];
  loading: boolean;
  onSwitchScope: (scopeKey: string) => void;
  onSendMessage: (text: string) => Promise<void>;
}

const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const TranslationChatPanel: React.FC<Props> = ({
  scopes,
  activeScopeKey,
  messages,
  loading,
  onSwitchScope,
  onSendMessage,
}) => {
  const [input, setInput] = useState('');

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

  return (
    <aside className="fixed right-3 md:right-6 bottom-24 md:bottom-8 z-50 w-[min(96vw,430px)] rounded-[1.4rem] glass-surface-strong no-print overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-gray-600" />
          <span className="font-serif text-base text-[#16171b]">对话编辑</span>
        </div>
      </div>

      <div className="px-3 py-2 flex flex-wrap gap-2">
        {scopes.map((scope) => (
          <button
            key={scope.key}
            onClick={() => onSwitchScope(scope.key)}
            className={`px-3 py-1 rounded-full text-[11px] tracking-[0.12em] transition-colors ${
              scope.key === activeScopeKey
                ? 'bg-black text-white'
                : 'bg-white/85 text-gray-600 hover:bg-white'
            }`}
            type="button"
          >
            {scope.label}
          </button>
        ))}
      </div>

      {activeScope?.kind === 'selection' && activeScope.selectedText && (
        <div className="px-4 py-2 text-[11px] text-gray-500">
          当前选中：{activeScope.selectedText}
        </div>
      )}

      <div className="h-72 overflow-y-auto px-4 py-3 bg-gradient-to-b from-white/90 via-white/60 to-white/80">
        {messages.length === 0 && (
          <p className="text-xs text-gray-400">
            在当前范围内提问或发起改写指令
          </p>
        )}

        <div className="space-y-3">
          {messages.map((msg, idx) => (
            <div key={`${msg.role}-${msg.createdAt}-${idx}`} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && (
                <div className="w-7 h-7 rounded-full bg-white text-gray-500 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
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
                <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="p-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入你的要求"
          className="flex-1 resize-none h-20 bg-white/90 rounded-xl px-3 py-2 text-sm outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          className="h-11 w-11 rounded-xl bg-black text-white flex items-center justify-center disabled:opacity-50"
          disabled={loading || !input.trim()}
          title="发送"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </aside>
  );
};

export default TranslationChatPanel;
