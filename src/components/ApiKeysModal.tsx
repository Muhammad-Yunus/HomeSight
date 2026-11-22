import { useEffect, useState } from 'react';
import { X, Plus, Trash2, Copy, Check, KeyRound, BookOpen } from 'lucide-react';
import type { ApiKeyInfo } from '../types/homesight';

interface ApiKeysModalProps {
  token: string;
  onClose: () => void;
}

export function ApiKeysModal({ token, onClose }: ApiKeysModalProps) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [newName, setNewName] = useState('');
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/api-keys', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setKeys(data.keys || []);
      else setError(data.error || 'Failed to load API keys');
    } catch {
      setError('Network error loading API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    const res = await fetch('/api/api-keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: newName.trim() }),
    });
    const data = await res.json();
    if (res.ok) {
      setCreatedRawKey(data.rawKey);
      setNewName('');
      loadKeys();
    } else {
      setError(data.error || 'Failed to create API key');
    }
  };

  const handleRevoke = async (id: number) => {
    await fetch(`/api/api-keys/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    loadKeys();
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#121417] border border-[#24272F] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-[#1E2025] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-[#F25C19]" />
            <h2 className="text-base font-semibold text-white">External Ingest API Keys</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#1D2027]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-[#9CA3AF] leading-relaxed">
            External systems authenticate exclusively via <code className="font-mono text-white">X-API-Key</code> on{' '}
            <code className="font-mono text-white">/api/ingest/*</code> routes. App login tokens are never accepted for ingest.
          </p>

          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Integration name (e.g. Frigate Edge NVR)"
              className="flex-1 rounded-lg bg-[#0D0F12] border border-[#272A32] px-3 py-2 text-xs text-white placeholder-[#6B7280] focus:outline-none focus:border-[#F25C19]"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-lg bg-[#F25C19] hover:bg-[#E04E0D] text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Generate key</span>
            </button>
          </form>

          {error && <div className="text-xs text-[#F87171]">{error}</div>}

          {createdRawKey && (
            <div className="p-3 rounded-xl bg-[#0D0F12] border border-[#F25C19]/60 space-y-2">
              <div className="text-xs font-medium text-[#F25C19]">
                Copy your new API key now — it will not be displayed again:
              </div>
              <div className="flex items-center justify-between gap-2 bg-[#16181C] rounded-lg px-3 py-2">
                <code className="text-xs font-mono text-white break-all">{createdRawKey}</code>
                <button
                  type="button"
                  onClick={() => handleCopy(createdRawKey)}
                  className="p-1.5 rounded bg-[#23262E] text-white shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#34D399]" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          <div className="border border-[#1E2025] rounded-xl divide-y divide-[#1E2025] max-h-56 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-xs text-[#6B7280]">Loading API keys...</div>
            ) : keys.length === 0 ? (
              <div className="p-4 text-xs text-[#6B7280]">No database API keys created yet.</div>
            ) : (
              keys.map((k) => (
                <div key={k.id} className="px-3.5 py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-medium text-white">{k.name}</div>
                    <div className="text-[11px] font-mono text-[#6B7280] mt-0.5">
                      {k.keyPrefix}••••••••
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[11px] ${k.isActive ? 'text-[#34D399]' : 'text-[#6B7280]'}`}>
                      {k.isActive ? 'Active' : 'Revoked'}
                    </span>
                    {k.isActive && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(k.id)}
                        className="p-1 text-[#9CA3AF] hover:text-[#F87171]"
                        title="Revoke key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-[#1E2025]">
            <a
              href="/api-docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#F25C19] hover:underline"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Open Swagger OpenAPI Documentation (/api-docs)</span>
            </a>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg bg-[#181A1F] border border-[#2A2D35] text-xs text-white"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
