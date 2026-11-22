import { useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import type { TrajectoryPointRecord } from '../types/homesight';

interface ViewportTimelineProps {
  title: string;
  isReplaying: boolean;
  isLiveMode: boolean;
  progress: number; // 0..1
  windowStartMs: number;
  windowEndMs: number;
  enteredAtMs: number;
  trajectory: TrajectoryPointRecord[];
  onToggleReplay: () => void;
  onJumpLive: () => void;
  onSeekProgress: (progress: number) => void;
}

function formatHmUtc(ms: number): string {
  const d = new Date(ms);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function ViewportTimeline({
  title,
  isReplaying,
  isLiveMode,
  progress,
  windowStartMs,
  windowEndMs,
  enteredAtMs,
  trajectory,
  onToggleReplay,
  onJumpLive,
  onSeekProgress,
}: ViewportTimelineProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const updateFromPointer = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onSeekProgress(ratio);
  };

  const spanMs = Math.max(60_000, windowEndMs - windowStartMs);
  const enteredPct = Math.min(
    90,
    Math.max(5, ((enteredAtMs - windowStartMs) / spanMs) * 100),
  );

  const markers = trajectory
    .map((pt) => {
      const t = new Date(pt.recordedAt).getTime();
      const pos = Math.min(0.95, Math.max(0.05, (t - windowStartMs) / spanMs));
      return { id: pt.id, pos, hasLabel: Boolean(pt.label) || pt.cameraDetected };
    })
    .filter((_, idx, arr) => idx === 1 || idx === arr.length - 1 || idx === Math.floor(arr.length / 2));

  const playheadPct = Math.min(100, Math.max(4, progress * 100));
  const midMs = windowStartMs + spanMs / 2;

  return (
    <div className="px-4 sm:px-5 pt-4 pb-3 flex flex-wrap items-center justify-between gap-4 border-b border-[#1A1C21]">
      <h1 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-white">
        {title}
      </h1>

      <div className="flex items-center gap-4 flex-1 justify-end min-w-[260px]">
        {/* Replay Button */}
        <button
          type="button"
          onClick={onToggleReplay}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#16181C] border border-[#F25C19]/75 hover:border-[#F25C19] text-[13px] font-medium text-white transition-colors whitespace-nowrap shrink-0"
        >
          {isReplaying ? (
            <Pause className="w-3.5 h-3.5 text-[#F25C19] fill-[#F25C19]" />
          ) : (
            <Play className="w-3.5 h-3.5 text-[#F25C19] fill-[#F25C19]" />
          )}
          <span>{isReplaying ? 'Pause' : 'Replay'}</span>
        </button>

        {/* Interactive Scrubber */}
        <div className="flex flex-col flex-1 max-w-[320px] min-w-[180px]">
          <div
            ref={trackRef}
            role="slider"
            aria-label="Event replay timeline"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            tabIndex={0}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              updateFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.buttons === 1) {
                updateFromPointer(e.clientX);
              }
            }}
            className="relative h-6 flex items-center cursor-pointer group"
          >
            {/* Base track line */}
            <div className="w-full h-[2px] bg-[#2B2F37] rounded-full relative">
              {/* Tick marks */}
              {[0, 20, 40, 60, 80, 100].map((pct) => (
                <div
                  key={pct}
                  style={{ left: `${pct}%` }}
                  className="absolute top-1/2 -translate-y-1/2 w-[1px] h-2 bg-[#3A3F4A]"
                />
              ))}

              {/* Active orange segment from gate entry to playhead */}
              <div
                style={{
                  left: `${enteredPct}%`,
                  width: `${Math.max(0, playheadPct - enteredPct)}%`,
                }}
                className="absolute top-0 h-[2px] bg-[#F25C19]"
              />

              {/* Event marker circles */}
              {markers.map((m, idx) => {
                const isReached = m.pos * 100 <= playheadPct + 2;
                return (
                  <div
                    key={m.id || idx}
                    style={{ left: `${m.pos * 100}%` }}
                    className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#111316] border-2 ${
                      isReached ? 'border-[#F25C19]' : 'border-[#4B5563]'
                    }`}
                  />
                );
              })}

              {/* White vertical playhead bar */}
              <div
                style={{ left: `${playheadPct}%` }}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-[2.5px] h-4 bg-white rounded-full shadow"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-[#6B7280] tabular-nums -mt-1">
            <span>{formatHmUtc(windowStartMs)}</span>
            <span>{formatHmUtc(midMs)}</span>
            <span>{formatHmUtc(windowEndMs)}</span>
          </div>
        </div>

        {/* Live Toggle */}
        <button
          type="button"
          onClick={onJumpLive}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
            isLiveMode ? 'text-[#F25C19]' : 'text-[#9CA3AF] hover:text-white'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isLiveMode ? 'bg-[#F25C19]' : 'bg-[#6B7280]'
            }`}
          />
          <span>Live</span>
        </button>
      </div>
    </div>
  );
}
