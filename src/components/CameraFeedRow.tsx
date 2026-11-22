import { useState } from 'react';
import { X, Radio } from 'lucide-react';
import type { CameraRecord, CameraSlug, TrajectoryPointRecord } from '../types/homesight';

interface CameraFeedRowProps {
  cameras: CameraRecord[];
  frameUrls: Partial<Record<CameraSlug, string>>;
  transportMode: 'webrtc' | 'socket' | 'connecting';
  replayTimeMs: number;
  isLiveMode: boolean;
  isEventActive: boolean;
  activeCameraSlug: string | null;
  trajectory: TrajectoryPointRecord[];
  focusedCameraSlug: CameraSlug | null;
  onSelectCamera: (slug: CameraSlug | null) => void;
}

export function CameraFeedRow({
  cameras,
  frameUrls,
  transportMode,
  replayTimeMs,
  isLiveMode,
  isEventActive,
  activeCameraSlug,
  trajectory,
  focusedCameraSlug,
  onSelectCamera,
}: CameraFeedRowProps) {
  const [expandedCamera, setExpandedCamera] = useState<CameraRecord | null>(null);

  const isDetectedAtReplayTime = (() => {
    if (!isEventActive) return false;
    if (isLiveMode || trajectory.length === 0) return true;
    let activePt = trajectory[0];
    for (const pt of trajectory) {
      if (new Date(pt.recordedAt).getTime() <= replayTimeMs) {
        activePt = pt;
      }
    }
    return Boolean(activePt?.cameraDetected);
  })();

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {cameras.map((cam) => {
          const isTargetCam = activeCameraSlug ? cam.slug === activeCameraSlug : cam.slug === 'side_passage';
          const showPersonBox =
            isTargetCam && cam.status === 'person_in_view' && isDetectedAtReplayTime;
          const statusLabel = showPersonBox ? 'Person in view' : 'Clear';

          const liveSrc = frameUrls[cam.slug] || cam.staticImagePath;
          const isFocused = focusedCameraSlug === cam.slug;

          return (
            <button
              key={cam.slug}
              type="button"
              onClick={() => {
                onSelectCamera(cam.slug);
                setExpandedCamera(cam);
              }}
              className={`group text-left rounded-xl overflow-hidden bg-[#121417] border transition-colors ${
                isFocused
                  ? 'border-[#F25C19]'
                  : 'border-[#1E2025] hover:border-[#2E323B]'
              }`}
            >
              <div className="relative aspect-[16/9] w-full bg-[#0D0F12] overflow-hidden">
                <img
                  src={liveSrc}
                  alt={cam.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />

                {/* Orange detection bounding box matching Screenshot 1 */}
                {showPersonBox && (
                  <div
                    style={{
                      left: `${(cam.personBoxJson?.x ?? 0.56) * 100}%`,
                      top: `${(cam.personBoxJson?.y ?? 0.16) * 100}%`,
                      width: `${(cam.personBoxJson?.w ?? 0.12) * 100}%`,
                      height: `${(cam.personBoxJson?.h ?? 0.68) * 100}%`,
                    }}
                    className="absolute border-2 border-[#F25C19] rounded-[3px] shadow-[0_0_12px_rgba(242,92,25,0.4)] pointer-events-none"
                  />
                )}
              </div>

              <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-[#F3F4F6] truncate">
                  {cam.name}
                </span>

                <div className="flex items-center gap-1.5 text-xs shrink-0">
                  {showPersonBox ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F25C19]" />
                      <span className="text-[#F25C19] font-medium">{statusLabel}</span>
                    </>
                  ) : (
                    <span className="text-[#6B7280]">{statusLabel}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded Live 5 FPS Camera Modal */}
      {expandedCamera && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-[#121417] border border-[#24272F] rounded-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-[#1E2025] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-white">
                  {expandedCamera.name}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-[#9CA3AF]">
                  <Radio className="w-3.5 h-3.5 text-[#34D399]" />
                  FFmpeg 5 FPS ({transportMode === 'webrtc' ? 'WebRTC' : 'Socket.IO'})
                </span>
              </div>
              <button
                type="button"
                aria-label="Close camera preview"
                onClick={() => setExpandedCamera(null)}
                className="p-1.5 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-[#1D2027]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative aspect-[16/9] bg-black">
              <img
                src={frameUrls[expandedCamera.slug] || expandedCamera.staticImagePath}
                alt={expandedCamera.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              {(activeCameraSlug ? expandedCamera.slug === activeCameraSlug : expandedCamera.slug === 'side_passage') &&
                expandedCamera.status === 'person_in_view' &&
                isDetectedAtReplayTime && (
                  <div
                    style={{
                      left: `${(expandedCamera.personBoxJson?.x ?? 0.56) * 100}%`,
                      top: `${(expandedCamera.personBoxJson?.y ?? 0.16) * 100}%`,
                      width: `${(expandedCamera.personBoxJson?.w ?? 0.12) * 100}%`,
                      height: `${(expandedCamera.personBoxJson?.h ?? 0.68) * 100}%`,
                    }}
                    className="absolute border-2 border-[#F25C19] rounded-[3px]"
                  />
                )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
