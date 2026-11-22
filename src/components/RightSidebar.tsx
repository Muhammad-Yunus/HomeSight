import { useState } from 'react';
import { Share2, FileText, Check, Send } from 'lucide-react';
import type {
  AfterDarkStatRecord,
  EventNoteRecord,
  ResidentRecord,
  SecurityEventRecord,
} from '../types/homesight';

interface RightSidebarProps {
  activeEvent: SecurityEventRecord | null;
  residents: ResidentRecord[];
  notes: EventNoteRecord[];
  afterDarkStats: AfterDarkStatRecord[];
  onPropertyDurationLabel: string;
  onAddNote: (note: string) => Promise<void>;
}

export function RightSidebar({
  activeEvent,
  residents,
  notes,
  afterDarkStats,
  onPropertyDurationLabel,
  onAddNote,
}: RightSidebarProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [copiedClip, setCopiedClip] = useState(false);

  const homeCount = residents.filter((r) => r.isHome).length;

  const handleShareClip = async () => {
    const shareUrl = `${window.location.origin}/?event=${activeEvent?.id ?? ''}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard fallback ignored
    }
    setCopiedClip(true);
    setTimeout(() => setCopiedClip(false), 2200);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || submittingNote) return;
    setSubmittingNote(true);
    try {
      await onAddNote(noteText.trim());
      setNoteText('');
      setNoteOpen(false);
    } finally {
      setSubmittingNote(false);
    }
  };

  // Build SVG stepped path for "Side passage after dark"
  const chartW = 300;
  const chartH = 92;
  const stats = afterDarkStats.length > 0 ? afterDarkStats : [];
  const maxVal = Math.max(8, ...stats.map((s) => Math.max(s.baselineValue, s.tonightValue)));

  const buildStepPath = () => {
    if (stats.length === 0) return { line: '', area: '' };
    const stepW = chartW / Math.max(1, stats.length - 1);
    let d = '';
    stats.forEach((s, i) => {
      const x = i * stepW;
      const y = chartH - (s.baselineValue / maxVal) * (chartH - 12);
      if (i === 0) {
        d += `M ${x} ${y}`;
      } else {
        const prevY = chartH - (stats[i - 1].baselineValue / maxVal) * (chartH - 12);
        d += ` L ${x} ${prevY} L ${x} ${y}`;
      }
    });
    const area = `${d} L ${chartW} ${chartH} L 0 ${chartH} Z`;
    return { line: d, area };
  };

  const { line: stepLinePath, area: stepAreaPath } = buildStepPath();
  const tonightIndex = stats.findIndex((s) => s.tonightValue > 0);
  const tonightX =
    tonightIndex >= 0 && stats.length > 1
      ? (tonightIndex / (stats.length - 1)) * chartW
      : chartW * 0.52;
  const tonightVal = tonightIndex >= 0 ? stats[tonightIndex].tonightValue : 0;
  const tonightTopY = chartH - (tonightVal / maxVal) * (chartH - 12);
  const tonightHighlightLabel =
    tonightIndex >= 0 ? stats[tonightIndex]?.highlightLabel || stats[tonightIndex]?.hourLabel : null;

  const enteredFormatted = activeEvent?.enteredAt
    ? new Date(activeEvent.enteredAt).toISOString().slice(11, 16)
    : '--:--';

  const statusTagText =
    activeEvent?.status === 'marked_safe'
      ? 'Marked safe'
      : activeEvent?.status === 'alert_sent'
      ? 'Alert dispatched'
      : activeEvent
      ? 'Not recognised'
      : 'Perimeter clear';

  const statusIsSafe = !activeEvent || activeEvent.status === 'marked_safe';

  return (
    <aside className="flex flex-col gap-3.5 w-full">
      {/* 1. Person Recognition & Metrics Card */}
      <section className="bg-[#121417] border border-[#1E2025] rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-[16px] font-semibold text-white truncate">
            {activeEvent?.personLabel || 'No active detection'}
          </h2>
          <div className="flex items-center gap-1.5 text-xs shrink-0">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                statusIsSafe ? 'bg-[#34D399]' : 'bg-[#F25C19]'
              }`}
            />
            <span className={statusIsSafe ? 'text-[#34D399]' : 'text-[#F25C19]'}>
              {statusTagText}
            </span>
          </div>
        </div>

        {activeEvent ? (
          <div className="rounded-xl overflow-hidden bg-[#0D0F12] aspect-[16/9] mb-4">
            <img
              src={activeEvent.snapshotUrl}
              alt={activeEvent.personLabel}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="rounded-xl bg-[#0D0F12] border border-[#1E2025] aspect-[16/9] mb-4 flex items-center justify-center text-xs text-[#6B7280] px-4 text-center">
            Waiting for external detection events via /api/ingest/events
          </div>
        )}

        {/* 3-Column Metrics */}
        <div className="grid grid-cols-3 divide-x divide-[#22252C] mb-4">
          <div className="pr-2">
            <div className="text-[19px] font-semibold text-white tabular-nums leading-tight">
              {activeEvent ? `${activeEvent.matchConfidence}%` : '--'}
            </div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">Person match</div>
          </div>
          <div className="px-3">
            <div className="text-[19px] font-semibold text-white tabular-nums leading-tight">
              {enteredFormatted}
            </div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">Entered</div>
          </div>
          <div className="pl-3">
            <div className="text-[19px] font-semibold text-white tabular-nums leading-tight">
              {onPropertyDurationLabel}
            </div>
            <div className="text-[11px] text-[#6B7280] mt-0.5">On property</div>
          </div>
        </div>

        {/* Share clip & Add note */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={handleShareClip}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#16181C] border border-[#272A32] hover:bg-[#1E2128] text-xs font-medium text-[#E5E7EB] transition-colors whitespace-nowrap"
          >
            {copiedClip ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#34D399]" />
                <span className="text-[#34D399]">Link copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-[#9CA3AF]" />
                <span>Share clip</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setNoteOpen((v) => !v)}
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#16181C] border border-[#272A32] hover:bg-[#1E2128] text-xs font-medium text-[#E5E7EB] transition-colors whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5 text-[#9CA3AF]" />
            <span>Add note</span>
          </button>
        </div>

        {noteOpen && (
          <form onSubmit={handleSaveNote} className="mt-3 pt-3 border-t border-[#1E2025] space-y-2">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Add incident observation..."
              className="w-full rounded-lg bg-[#0D0F12] border border-[#272A32] px-3 py-2 text-xs text-white placeholder-[#6B7280] focus:outline-none focus:border-[#F25C19]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                className="px-2.5 py-1 text-xs text-[#9CA3AF] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingNote || !noteText.trim()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#F25C19] text-white text-xs font-medium disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                <span>Save</span>
              </button>
            </div>
          </form>
        )}

        {notes.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[#1E2025] space-y-2 max-h-28 overflow-y-auto">
            {notes.map((n) => (
              <div key={n.id} className="text-xs text-[#D1D5DB] bg-[#0E1013] rounded-lg px-2.5 py-2">
                <div className="flex items-center justify-between text-[10px] text-[#6B7280] mb-0.5">
                  <span>{n.authorName}</span>
                  <span className="tabular-nums">
                    {new Date(n.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p>{n.note}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Who's home Card */}
      <section className="bg-[#121417] border border-[#1E2025] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-[15px] font-semibold text-white">Who&apos;s home</h2>
          <span className="text-xs text-[#6B7280] tabular-nums">
            {homeCount} of {residents.length}
          </span>
        </div>

        <div className="space-y-3">
          {residents.map((r) => (
            <div key={r.slug} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={r.avatarUrl}
                  alt={r.name}
                  referrerPolicy="no-referrer"
                  className="w-9 h-9 rounded-full object-cover border border-[#272A32] shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[#F3F4F6] truncate">
                    {r.name}
                  </div>
                  <div className="text-[12px] text-[#6B7280] truncate">
                    {r.locationLabel}
                  </div>
                </div>
              </div>

              {r.alertStatus === 'sent' && (
                <span className="text-xs text-[#9CA3AF] shrink-0">Sent</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3. Side passage after dark Histogram Card */}
      <section className="bg-[#121417] border border-[#1E2025] rounded-2xl p-4">
        <h2 className="text-[15px] font-semibold text-white">Side passage after dark</h2>
        <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
          No visits between 23:00 and 05:00 in the last 30 nights
        </p>

        <div className="mt-3">
          <svg viewBox={`0 0 ${chartW} ${chartH + 6}`} className="w-full h-24 overflow-visible">
            <defs>
              <pattern
                id="nightHatch"
                width="6"
                height="6"
                patternTransform="rotate(45 0 0)"
                patternUnits="userSpaceOnUse"
              >
                <line x1="0" y1="0" x2="0" y2="6" stroke="#22262E" strokeWidth="1.5" />
              </pattern>
            </defs>

            {/* Hatched 23:00 - 05:00 zero-visit zone */}
            <rect
              x={chartW * 0.44}
              y={8}
              width={chartW * 0.42}
              height={chartH - 8}
              fill="url(#nightHatch)"
            />

            {/* Stepped 30-night baseline */}
            {stepAreaPath && <path d={stepAreaPath} fill="#1E222A" fillOpacity="0.85" />}
            {stepLinePath && (
              <path d={stepLinePath} fill="none" stroke="#4B5563" strokeWidth="1.25" />
            )}

            {/* Baseline X axis */}
            <line x1="0" y1={chartH} x2={chartW} y2={chartH} stroke="#262A33" strokeWidth="1" />

            {/* Tonight Orange Spike (only rendered when ingested) */}
            {tonightIndex >= 0 && (
              <>
                <line
                  x1={tonightX}
                  y1={tonightTopY}
                  x2={tonightX}
                  y2={chartH}
                  stroke="#F25C19"
                  strokeWidth="3.5"
                  strokeLinecap="butt"
                />
                {tonightHighlightLabel && (
                  <text
                    x={tonightX + 8}
                    y={tonightTopY + 11}
                    fill="#F25C19"
                    fontSize="11"
                    fontWeight="500"
                  >
                    {tonightHighlightLabel}
                  </text>
                )}
              </>
            )}
          </svg>

          <div className="flex items-center justify-between text-[11px] text-[#6B7280] tabular-nums mt-1.5">
            <span>18:00</span>
            <span>22:00</span>
            <span>02:00</span>
            <span>06:00</span>
          </div>
        </div>
      </section>
    </aside>
  );
}
