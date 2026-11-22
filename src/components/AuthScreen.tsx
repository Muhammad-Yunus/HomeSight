import { useEffect, useState } from 'react';
import { Lock, BookOpen } from 'lucide-react';
import type { AuthUser } from '../types/homesight';

interface AuthScreenProps {
  dbConfigured: boolean;
  dbConnected: boolean;
  onAuthenticated: (user: AuthUser, token: string) => void;
}

export function AuthScreen({ dbConfigured, dbConnected, onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [hasUsers, setHasUsers] = useState<boolean | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!dbConfigured || !dbConnected) return;
    fetch('/api/auth/bootstrap-status')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.hasUsers === 'boolean') {
          setHasUsers(d.hasUsers);
          if (!d.hasUsers) setMode('register');
        }
      })
      .catch(() => {});
  }, [dbConfigured, dbConnected]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const body =
        mode === 'register'
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        return;
      }

      onAuthenticated(data.user, data.token);
    } catch {
      setError('Unable to reach Home Sight server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F3F4F6] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#121417] border border-[#1E2025] rounded-2xl p-6 sm:p-7 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#181A1E] border border-[#2B2E36] flex items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
              >
                <path d="M5 7h14" />
                <path d="M9 7v10" />
                <path d="M15 7v10" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">Home Sight</span>
          </div>

          <a
            href="/api-docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-white transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>API Docs</span>
          </a>
        </div>

        {!dbConfigured || !dbConnected ? (
          <div className="p-3.5 rounded-xl bg-[#1A1310] border border-[#F25C19]/50 text-xs text-[#F3F4F6] space-y-1.5 mb-5">
            <div className="font-semibold text-[#F25C19]">PostgreSQL Connection Required</div>
            <p className="text-[#9CA3AF] leading-relaxed">
              Set <code className="font-mono text-white">DB_HOST</code>,{' '}
              <code className="font-mono text-white">DB_PORT</code>,{' '}
              <code className="font-mono text-white">DB_NAME</code>,{' '}
              <code className="font-mono text-white">DB_USER</code>, and{' '}
              <code className="font-mono text-white">DB_PASSWORD</code> in Settings → Secrets to connect your PostgreSQL database via Drizzle ORM.
            </p>
          </div>
        ) : null}

        <div className="mb-5">
          <h1 className="text-xl font-semibold text-white">
            {hasUsers === false
              ? 'Create primary operator account'
              : mode === 'register'
              ? 'Create operator account'
              : 'Sign in to monitoring'}
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            {hasUsers === false
              ? 'First registered account becomes the property administrator.'
              : 'User-based JWT authentication separated from external ingest API keys.'}
          </p>
        </div>

        <div className="grid grid-cols-2 p-1 bg-[#0D0F12] border border-[#1E2025] rounded-xl mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'login' ? 'bg-[#252830] text-white' : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'register' ? 'bg-[#252830] text-white' : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Full name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Daniel Novak"
                className="w-full rounded-xl bg-[#0D0F12] border border-[#24272E] px-3.5 py-2.5 text-sm text-white placeholder-[#4B5563] focus:outline-none focus:border-[#F25C19]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@homesight.local"
              className="w-full rounded-xl bg-[#0D0F12] border border-[#24272E] px-3.5 py-2.5 text-sm text-white placeholder-[#4B5563] focus:outline-none focus:border-[#F25C19]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9CA3AF] mb-1.5">Password</label>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter password'}
              className="w-full rounded-xl bg-[#0D0F12] border border-[#24272E] px-3.5 py-2.5 text-sm text-white placeholder-[#4B5563] focus:outline-none focus:border-[#F25C19]"
            />
          </div>

          {error && (
            <div className="text-xs text-[#F87171] bg-[#241214] border border-[#7F1D1D] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !dbConfigured || !dbConnected}
            className="w-full py-2.5 px-4 rounded-xl bg-[#F25C19] hover:bg-[#E04E0D] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>
              {loading
                ? 'Authenticating...'
                : mode === 'register'
                ? 'Create account & enter'
                : 'Sign in'}
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}
