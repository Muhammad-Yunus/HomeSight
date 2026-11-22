import { useState } from 'react';
import { Search, ShieldCheck, AlertTriangle, Clock } from 'lucide-react';
import type { SecurityEventRecord } from '../types/homesight';

interface EventsViewProps {
  events: SecurityEventRecord[];
  onInspectEvent: (event: SecurityEventRecord) => void;
}

export function EventsView({ events, onInspectEvent }: EventsViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'marked_safe' | 'alert_sent'>('all');

  const filtered = events.filter((e) => {
    const matchesStatus = statusFilter === 'all' || e.status === statusFilter;
    const matchesQuery =
      !query.trim() ||
      e.title.toLowerCase().includes(query.toLowerCase()) ||
      e.personLabel.toLowerCase().includes(query.toLowerCase());
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#121417] border border-[#1E2025] rounded-2xl p-4">
        <div>
          <h1 className="text-lg font-semibold text-white">Security Events</h1>
          <p className="text-xs text-[#6B7280] mt-0.5">
            Ingested perimeter detections and operator dispositions stored in PostgreSQL
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#6B7280] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter events..."
              className="pl-8 pr-3 py-1.5 text-xs bg-[#0D0F12] border border-[#24272E] rounded-lg text-white placeholder-[#6B7280] focus:outline-none focus:border-[#F25C19]"
            />
          </div>

          <div className="flex items-center p-0.5 bg-[#0D0F12] border border-[#24272E] rounded-lg">
            {(['all', 'active', 'marked_safe', 'alert_sent'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === s
                    ? 'bg-[#252830] text-white font-medium'
                    : 'text-[#9CA3AF] hover:text-white'
                }`}
              >
                {s === 'all'
                  ? 'All'
                  : s === 'active'
                  ? 'Active'
                  : s === 'marked_safe'
                  ? 'Safe'
                  : 'Alerted'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#121417] border border-[#1E2025] rounded-2xl p-10 text-center">
          <p className="text-sm text-[#9CA3AF]">
            No ingested security events match your filter yet. Push events via{' '}
            <code className="font-mono text-xs text-[#F25C19]">POST /api/ingest/events</code>.
          </p>
        </div>
      ) : (
        <div className="bg-[#121417] border border-[#1E2025] rounded-2xl overflow-hidden divide-y divide-[#1E2025]">
          {filtered.map((evt) => (
            <div
              key={evt.id}
              className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-[#16191D] transition-colors"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <img
                  src={evt.snapshotUrl}
                  alt={evt.personLabel}
                  referrerPolicy="no-referrer"
                  className="w-20 h-12 rounded-lg object-cover border border-[#24272E] shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">{evt.title}</div>
                  <div className="flex items-center gap-2 text-xs text-[#6B7280] mt-0.5 tabular-nums">
                    <span>{evt.personLabel}</span>
                    <span>·</span>
                    <span>{evt.matchConfidence}% match</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(evt.enteredAt).toISOString().slice(11, 16)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                    evt.status === 'marked_safe'
                      ? 'text-[#34D399]'
                      : evt.status === 'alert_sent'
                      ? 'text-[#F25C19]'
                      : 'text-[#F59E0B]'
                  }`}
                >
                  {evt.status === 'marked_safe' ? (
                    <ShieldCheck className="w-3.5 h-3.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5" />
                  )}
                  {evt.status === 'marked_safe'
                    ? 'Marked safe'
                    : evt.status === 'alert_sent'
                    ? 'Monitoring alerted'
                    : 'Active alert'}
                </span>

                <button
                  type="button"
                  onClick={() => onInspectEvent(evt)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#181A1F] border border-[#2A2D35] text-white hover:bg-[#22252C] transition-colors whitespace-nowrap"
                >
                  Inspect 3D replay
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
