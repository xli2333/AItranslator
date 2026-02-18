import React, { useState } from 'react';
import { Loader2, Lock, Mail } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

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
      setError('Email and password are required.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
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
        setMessage('Signed in successfully.');
      } else {
        const { error: registerError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (registerError) throw registerError;
        setMessage('Registration successful. If email confirmation is enabled, please verify first.');
      }
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f2f2] text-[#111] flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
        <h1 className="text-2xl font-serif mb-1">Translate Workspace</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in with Supabase email account to access your documents.</p>

        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`px-3 py-1.5 rounded-full text-sm border ${mode === 'login' ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600'}`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`px-3 py-1.5 rounded-full text-sm border ${mode === 'register' ? 'bg-black text-white border-black' : 'border-gray-200 text-gray-600'}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs text-gray-500">Email</span>
            <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50">
              <Mail className="w-4 h-4 text-gray-400" />
              <input
                type="email"
                className="bg-transparent outline-none w-full text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs text-gray-500">Password</span>
            <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50">
              <Lock className="w-4 h-4 text-gray-400" />
              <input
                type="password"
                className="bg-transparent outline-none w-full text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                disabled={loading}
              />
            </div>
          </label>

          {mode === 'register' && (
            <label className="block">
              <span className="text-xs text-gray-500">Confirm Password</span>
              <div className="mt-1 flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2 bg-gray-50">
                <Lock className="w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  className="bg-transparent outline-none w-full text-sm"
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
            className="w-full rounded-xl bg-black text-white py-2.5 text-sm font-semibold hover:bg-gray-800 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>

        {message && <p className="mt-3 text-xs text-green-600">{message}</p>}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
};

export default AuthPanel;
