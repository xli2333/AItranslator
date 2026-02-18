import React, { useState } from 'react';
import { Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

const toChineseAuthError = (err: any) => {
  const msg = String(err?.message ?? '').toLowerCase();
  if (!msg) return '认证失败，请稍后重试。';
  if (msg.includes('invalid login credentials')) return '邮箱或密码不正确，请重新输入。';
  if (msg.includes('email not confirmed')) return '邮箱尚未验证，请先完成邮箱验证。';
  if (msg.includes('user already registered')) return '该邮箱已注册，请直接登录。';
  if (msg.includes('password should be at least')) return '密码长度至少需要 6 位。';
  if (msg.includes('rate limit')) return '请求过于频繁，请稍后再试。';
  if (msg.includes('network')) return '网络异常，请检查网络后重试。';
  return '认证失败，请稍后重试。';
};

const AuthPanel: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim() || !password.trim()) {
      setError('请输入邮箱和密码。');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致。');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (loginError) throw loginError;
        setMessage('登录成功，正在进入工作台。');
      } else {
        const { error: registerError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (registerError) throw registerError;
        setMessage('注册成功。若启用邮箱验证，请先完成验证后再登录。');
      }
    } catch (err: any) {
      setError(toChineseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 text-[#111]">
      <div className="w-full max-w-6xl rounded-[2rem] overflow-hidden glass-surface-strong grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="hidden lg:flex flex-col justify-between px-10 py-12 bg-gradient-to-br from-white/90 via-white/35 to-transparent">
          <div className="inline-flex items-center gap-2 w-fit rounded-full bg-white/80 px-4 py-2 text-xs tracking-[0.2em] text-gray-500">
            <ShieldCheck className="w-4 h-4" />
            私有工作区
          </div>
          <div>
            <p className="text-sm tracking-[0.22em] text-gray-500">智能文档翻译工作台</p>
            <h1 className="mt-3 text-6xl leading-[1.02] font-serif text-[#0f1013]">译构</h1>
            <p className="mt-6 max-w-md text-sm leading-7 text-gray-600">
              使用同一账户管理你的翻译文档、批注和上下文对话。
              每一次编辑都自动保存，回到这里即可继续。
            </p>
          </div>
          <p className="text-xs tracking-[0.16em] text-gray-400">仅限已注册用户访问</p>
        </section>

        <section className="px-6 py-7 sm:px-9 sm:py-10 bg-white/55">
          <p className="text-xs tracking-[0.22em] text-gray-500">账户入口</p>
          <h2 className="mt-2 text-3xl font-serif text-[#111217]">{mode === 'login' ? '登录' : '注册'}</h2>
          <p className="mt-2 text-sm text-gray-500">使用邮箱与密码进入你的个人空间</p>

          <div className="mt-6 inline-flex gap-1 rounded-full bg-black/5 p-1">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`px-4 py-1.5 rounded-full text-xs tracking-[0.14em] transition-all ${
                mode === 'login' ? 'bg-black text-white shadow-lg' : 'text-gray-500'
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`px-4 py-1.5 rounded-full text-xs tracking-[0.14em] transition-all ${
                mode === 'register' ? 'bg-black text-white shadow-lg' : 'text-gray-500'
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-xs tracking-[0.14em] text-gray-500">邮箱</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-3 shadow-sm focus-within:shadow-md">
                <Mail className="w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  className="w-full bg-transparent outline-none text-sm"
                  placeholder="请输入邮箱"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs tracking-[0.14em] text-gray-500">密码</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-3 shadow-sm focus-within:shadow-md">
                <Lock className="w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  className="w-full bg-transparent outline-none text-sm"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  disabled={loading}
                />
              </div>
            </label>

            {mode === 'register' && (
              <label className="block">
                <span className="text-xs tracking-[0.14em] text-gray-500">确认密码</span>
                <div className="mt-1.5 flex items-center gap-2 rounded-2xl bg-white/85 px-3 py-3 shadow-sm focus-within:shadow-md">
                  <Lock className="w-4 h-4 text-gray-400" />
                  <input
                    type="password"
                    className="w-full bg-transparent outline-none text-sm"
                    placeholder="请再次输入密码"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                </div>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-black text-white py-3 text-sm font-medium tracking-[0.14em] disabled:opacity-60 transition-colors hover:bg-[#1e1f24] flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? '进入工作台' : '创建账户'}
            </button>
          </form>

          {message && <p className="mt-3 text-xs text-emerald-700">{message}</p>}
          {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
        </section>
      </div>
    </div>
  );
};

export default AuthPanel;
