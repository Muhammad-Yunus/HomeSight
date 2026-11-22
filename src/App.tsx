import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopBar } from './components/TopBar';
import { ViewportTimeline } from './components/ViewportTimeline';
import { HouseScene3D } from './components/HouseScene3D';
import { CameraFeedRow } from './components/CameraFeedRow';
import { RightSidebar } from './components/RightSidebar';
import { EventsView } from './components/EventsView';
import { PeopleView } from './components/PeopleView';
import { ApiKeysModal } from './components/ApiKeysModal';
import { AuthScreen } from './components/AuthScreen';
import { useSocket } from './hooks/useSocket';
import { useCctvStream } from './hooks/useCctvStream';
import type {
  AuthUser,
  CameraSlug,
  PropertyFullState,
  PropertyRecord,
  SecurityEventRecord,
} from './types/homesight';

function computeReplayWindow(
  progress: number,
  enteredAtIso?: string,
  trajectoryPoints: { recordedAt: string }[] = [],
): {
  windowStartMs: number;
  windowEndMs: number;
  enteredAtMs: number;
  replayTimeMs: number;
  replayClock: string;
  onPropertyDuration: string;
} {
  const fallbackStart = new Date('2026-11-22T23:37:00Z').getTime();
  const enteredAtMs = enteredAtIso ? new Date(enteredAtIso).getTime() : fallbackStart + 60_000;
  const windowStartMs = enteredAtMs - 60_000;

  let maxPtMs = enteredAtMs + 210_000; // default 4m30s span
  for (const pt of trajectoryPoints) {
    const t = new Date(pt.recordedAt).getTime();
    if (t + 48_000 > maxPtMs) maxPtMs = t + 48_000;
  }
  const windowEndMs = Math.max(windowStartMs + 270_000, maxPtMs);
  const replayTimeMs = Math.round(windowStartMs + progress * (windowEndMs - windowStartMs));

  const d = new Date(replayTimeMs);
  const hh = d.getUTCHours().toString().padStart(2, '0');
  const mm = d.getUTCMinutes().toString().padStart(2, '0');
  const ss = d.getUTCSeconds().toString().padStart(2, '0');
  const replayClock = `${hh}:${mm}:${ss}`;

  const diffSec = Math.max(0, Math.round((replayTimeMs - enteredAtMs) / 1000));
  const dMin = Math.floor(diffSec / 60);
  const dSec = diffSec % 60;
  return {
    windowStartMs,
    windowEndMs,
    enteredAtMs,
    replayTimeMs,
    replayClock,
    onPropertyDuration: `${dMin}:${dSec.toString().padStart(2, '0')}`,
  };
}

function computeLiveHeadProgress(
  enteredAtIso?: string,
  trajectoryPoints: { recordedAt: string }[] = [],
): number {
  if (trajectoryPoints.length === 0) return 0.822;
  const { windowStartMs, windowEndMs } = computeReplayWindow(1, enteredAtIso, trajectoryPoints);
  const lastMs = new Date(trajectoryPoints[trajectoryPoints.length - 1].recordedAt).getTime();
  const span = Math.max(1, windowEndMs - windowStartMs);
  return Math.min(0.98, Math.max(0.1, (lastMs - windowStartMs) / span));
}

const TOKEN_STORAGE_KEY = 'homesight_token';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [authChecking, setAuthChecking] = useState<boolean>(() => {
    try {
      return Boolean(window.sessionStorage.getItem(TOKEN_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [health, setHealth] = useState({ dbConfigured: true, dbConnected: true });

  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [state, setState] = useState<PropertyFullState | null>(null);
  const [loadingState, setLoadingState] = useState(false);

  const [activeTab, setActiveTab] = useState<'live' | 'events' | 'people'>('live');
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0.822);
  const [focusedCameraSlug, setFocusedCameraSlug] = useState<CameraSlug | null>(null);
  const [autoAlertRemainingSec, setAutoAlertRemainingSec] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [apiKeysOpen, setApiKeysOpen] = useState(false);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => {
        setHealth({
          dbConfigured: Boolean(d.dbConfigured),
          dbConnected: Boolean(d.dbConnected),
        });
      })
      .catch(() => {});
  }, []);

  // Restore user session if a token is present in sessionStorage
  useEffect(() => {
    if (!token || user) {
      setAuthChecking(false);
      return;
    }
    let cancelled = false;
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Unauthorized');
        const data = await res.json();
        if (!cancelled && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          try {
            window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          } catch {
            // ignore
          }
          setToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const fetchPropertiesAndState = useCallback(
    async (authToken: string, propIdOverride?: number) => {
      setLoadingState(true);
      try {
        const propsRes = await fetch('/api/properties', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!propsRes.ok) return;
        const propsData = await propsRes.json();
        const propList: PropertyRecord[] = propsData.properties || [];
        setProperties(propList);

        const targetId = propIdOverride || selectedPropertyId || propList[0]?.id;
        if (!targetId) {
          setState(null);
          return;
        }
        setSelectedPropertyId(targetId);

        const stateRes = await fetch(`/api/properties/${targetId}/state`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (stateRes.ok) {
          const full: PropertyFullState = await stateRes.json();
          const sharedEventParam = new URLSearchParams(window.location.search).get('event');
          const sharedId = sharedEventParam ? Number(sharedEventParam) : NaN;
          if (Number.isInteger(sharedId) && sharedId > 0 && full.activeEvent?.id !== sharedId) {
            const evtRes = await fetch(`/api/events/${sharedId}`, {
              headers: { Authorization: `Bearer ${authToken}` },
            });
            if (evtRes.ok) {
              const evtData = await evtRes.json();
              full.activeEvent = evtData.event;
              full.trajectory = evtData.trajectory;
              full.notes = evtData.notes;
            }
          }
          setState(full);
          setReplayProgress(computeLiveHeadProgress(full.activeEvent?.enteredAt, full.trajectory));
        }
      } finally {
        setLoadingState(false);
      }
    },
    [selectedPropertyId],
  );

  useEffect(() => {
    if (token && user) {
      fetchPropertiesAndState(token);
    }
  }, [token, user]);

  // Real-time Socket.IO synchronization
  const { socket } = useSocket({
    token,
    propertyId: selectedPropertyId,
    onPropertySynced: (fullState) => {
      setState(fullState);
    },
    onPropertyMode: (updatedProp) => {
      setProperties((prev) =>
        prev.map((p) => (p.id === updatedProp.id ? updatedProp : p)),
      );
      setState((prev) => (prev ? { ...prev, property: updatedProp } : prev));
    },
    onEventIngested: ({ event, trajectory, cameras }) => {
      setState((prev) => {
        if (!prev) return prev;
        const exists = prev.events.some((e) => e.id === event.id);
        const events = exists
          ? prev.events.map((e) => (e.id === event.id ? event : e))
          : [event, ...prev.events];
        return {
          ...prev,
          activeEvent: event,
          events,
          trajectory,
          cameras,
        };
      });
      setIsLiveMode(true);
      setIsReplaying(false);
      setReplayProgress(computeLiveHeadProgress(event.enteredAt, trajectory));
    },
    onEventUpdated: ({ event, cameras }) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          activeEvent: prev.activeEvent?.id === event.id ? event : prev.activeEvent,
          events: prev.events.map((e) => (e.id === event.id ? event : e)),
          cameras: cameras ?? prev.cameras,
        };
      });
    },
    onTrajectoryAppended: ({ eventId, point }) => {
      setState((prev) => {
        if (!prev || prev.activeEvent?.id !== eventId) return prev;
        if (prev.trajectory.some((p) => p.id === point.id)) return prev;
        return {
          ...prev,
          trajectory: [...prev.trajectory, point],
        };
      });
    },
    onCameraStatus: ({ camera }) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cameras: prev.cameras.map((c) => (c.slug === camera.slug ? camera : c)),
        };
      });
    },
    onResidentUpdated: ({ resident }) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          residents: prev.residents.map((r) => (r.slug === resident.slug ? resident : r)),
        };
      });
    },
    onNoteCreated: ({ note }) => {
      setState((prev) => {
        if (!prev || prev.activeEvent?.id !== note.eventId) return prev;
        if (prev.notes.some((n) => n.id === note.id)) return prev;
        return {
          ...prev,
          notes: [note, ...prev.notes],
        };
      });
    },
    onReconnectResync: () => {
      if (token && selectedPropertyId) {
        fetchPropertiesAndState(token, selectedPropertyId);
      }
    },
  });

  // 5 FPS FFmpeg WebRTC / Socket.IO Video Stream Consumer
  const { frameUrls, transportMode } = useCctvStream(token, socket);

  // Real auto-alert countdown clock driven by activeEvent.autoAlertAt
  useEffect(() => {
    const targetIso = state?.activeEvent?.autoAlertAt;
    if (!targetIso || state?.activeEvent?.status !== 'active') {
      setAutoAlertRemainingSec(null);
      return;
    }

    const updateTimer = () => {
      const diffSec = Math.max(
        0,
        Math.ceil((new Date(targetIso).getTime() - Date.now()) / 1000),
      );
      setAutoAlertRemainingSec(diffSec);
    };

    updateTimer();
    const id = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(id);
  }, [state?.activeEvent?.autoAlertAt, state?.activeEvent?.status]);

  // Keep playhead synced to latest trajectory head whenever Live mode is active
  useEffect(() => {
    if (isLiveMode && !isReplaying && state?.activeEvent) {
      setReplayProgress(
        computeLiveHeadProgress(state.activeEvent.enteredAt, state.trajectory),
      );
    }
  }, [
    isLiveMode,
    isReplaying,
    state?.activeEvent?.id,
    state?.activeEvent?.enteredAt,
    state?.trajectory,
  ]);

  // Smooth Replay playback loop when user toggles Replay button
  useEffect(() => {
    if (!isReplaying) return;
    const id = window.setInterval(() => {
      setReplayProgress((prev) => {
        const next = prev + 0.008;
        if (next >= 1) {
          setIsReplaying(false);
          setIsLiveMode(true);
          return computeLiveHeadProgress(state?.activeEvent?.enteredAt, state?.trajectory || []);
        }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [isReplaying]);

  const handleMarkSafe = async () => {
    if (!token || !state?.activeEvent) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/events/${state.activeEvent.id}/mark-safe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setState((prev) =>
          prev
            ? {
                ...prev,
                activeEvent: data.event,
                cameras: data.cameras ?? prev.cameras,
                events: prev.events.map((e) => (e.id === data.event.id ? data.event : e)),
              }
            : prev,
        );
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAlertCentre = async () => {
    if (!token || !state?.activeEvent) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/events/${state.activeEvent.id}/alert`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setState((prev) =>
          prev
            ? {
                ...prev,
                activeEvent: data.event,
                notes: data.note ? [data.note, ...prev.notes] : prev.notes,
                events: prev.events.map((e) => (e.id === data.event.id ? data.event : e)),
              }
            : prev,
        );
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeMode = async (mode: PropertyRecord['securityMode']) => {
    if (!token || !state?.property) return;
    await fetch(`/api/properties/${state.property.id}/mode`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ securityMode: mode }),
    });
  };

  const handleAddNote = async (note: string) => {
    if (!token || !state?.activeEvent) return;
    const res = await fetch(`/api/events/${state.activeEvent.id}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ note }),
    });
    if (res.ok) {
      const data = await res.json();
      setState((prev) => {
        if (!prev) return prev;
        if (prev.notes.some((n) => n.id === data.note.id)) return prev;
        return { ...prev, notes: [data.note, ...prev.notes] };
      });
    }
  };

  const handleInspectEvent = async (evt: SecurityEventRecord) => {
    if (!token) return;
    const res = await fetch(`/api/events/${evt.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setState((prev) =>
        prev
          ? {
              ...prev,
              activeEvent: data.event,
              trajectory: data.trajectory,
              notes: data.notes,
            }
          : prev,
      );
      setActiveTab('live');
      setIsLiveMode(false);
      setReplayProgress(computeLiveHeadProgress(data.event?.enteredAt, data.trajectory || []));
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0B0C0E] text-[#9CA3AF] flex items-center justify-center text-sm">
        Connecting to Home Sight...
      </div>
    );
  }

  if (!user || !token) {
    return (
      <AuthScreen
        dbConfigured={health.dbConfigured}
        dbConnected={health.dbConnected}
        onAuthenticated={(u, t) => {
          try {
            window.sessionStorage.setItem(TOKEN_STORAGE_KEY, t);
          } catch {
            // ignore
          }
          setUser(u);
          setToken(t);
        }}
      />
    );
  }

  const activeEvent = state?.activeEvent || null;
  const {
    windowStartMs,
    windowEndMs,
    enteredAtMs,
    replayTimeMs,
    replayClock,
    onPropertyDuration,
  } = computeReplayWindow(
    replayProgress,
    activeEvent?.enteredAt,
    state?.trajectory || [],
  );

  const emmaResident = state?.residents.find((r) => r.marker3dJson) || state?.residents[0] || null;
  const sideCam = state?.cameras.find((c) => c.slug === 'side_passage');

  const gateTimeLabel = activeEvent?.gateOpenedAt
    ? new Date(activeEvent.gateOpenedAt).toISOString().slice(11, 16)
    : activeEvent?.gateLabel
    ? new Date(activeEvent.enteredAt).toISOString().slice(11, 16)
    : null;

  return (
    <div className="min-h-screen bg-[#0B0C0E] text-[#F3F4F6] flex flex-col">
      <TopBar
        user={user}
        properties={properties}
        activeProperty={state?.property || null}
        activeEvent={activeEvent}
        activeTab={activeTab}
        autoAlertRemainingSec={autoAlertRemainingSec}
        onSelectTab={setActiveTab}
        onSelectProperty={(id) => {
          setSelectedPropertyId(id);
          fetchPropertiesAndState(token, id);
        }}
        onChangeMode={handleChangeMode}
        onMarkSafe={handleMarkSafe}
        onAlertCentre={handleAlertCentre}
        onOpenApiKeys={() => setApiKeysOpen(true)}
        onLogout={() => {
          try {
            window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
          } catch {
            // ignore
          }
          setUser(null);
          setToken(null);
          setState(null);
        }}
        actionLoading={actionLoading}
      />

      {activeTab === 'events' ? (
        <EventsView events={state?.events || []} onInspectEvent={handleInspectEvent} />
      ) : activeTab === 'people' ? (
        <PeopleView residents={state?.residents || []} events={state?.events || []} />
      ) : (
        <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 lg:px-6 py-4">
          {!loadingState && !state ? (
            <div className="bg-[#121417] border border-[#1E2025] rounded-2xl p-8 text-center space-y-3">
              <h2 className="text-base font-semibold text-white">
                No property telemetry ingested yet
              </h2>
              <p className="text-xs text-[#9CA3AF] max-w-lg mx-auto leading-relaxed">
                This database is waiting for external ingest events via{' '}
                <code className="font-mono text-[#F25C19]">POST /api/ingest/bootstrap</code> and{' '}
                <code className="font-mono text-[#F25C19]">POST /api/ingest/events</code>. Open{' '}
                <button
                  type="button"
                  onClick={() => setApiKeysOpen(true)}
                  className="text-white underline"
                >
                  Ingest API Keys
                </button>{' '}
                or view{' '}
                <a href="/api-docs" target="_blank" rel="noreferrer" className="text-[#F25C19] underline">
                  Swagger API Docs
                </a>{' '}
                or run the external simulator script.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_365px] gap-4 items-start">
              {/* Left Column: 3D Spatial Viewport + 3 Live 5 FPS Camera Cards */}
              <div className="flex flex-col gap-3.5 min-w-0">
                <section className="bg-[#121417] border border-[#1E2025] rounded-2xl overflow-hidden">
                  <ViewportTimeline
                    title={activeEvent?.title || 'Perimeter monitoring nominal'}
                    isReplaying={isReplaying}
                    isLiveMode={isLiveMode}
                    progress={replayProgress}
                    windowStartMs={windowStartMs}
                    windowEndMs={windowEndMs}
                    enteredAtMs={enteredAtMs}
                    trajectory={state?.trajectory || []}
                    onToggleReplay={() => {
                      if (isReplaying) {
                        setIsReplaying(false);
                      } else {
                        setIsLiveMode(false);
                        setReplayProgress((p) => (p >= 0.95 ? 0.15 : p));
                        setIsReplaying(true);
                      }
                    }}
                    onJumpLive={() => {
                      setIsReplaying(false);
                      setIsLiveMode(true);
                      setReplayProgress(
                        computeLiveHeadProgress(activeEvent?.enteredAt, state?.trajectory || []),
                      );
                    }}
                    onSeekProgress={(p) => {
                      setIsReplaying(false);
                      setIsLiveMode(false);
                      setReplayProgress(p);
                    }}
                  />

                  <HouseScene3D
                    trajectory={state?.trajectory || []}
                    replayProgress={replayProgress}
                    replayTimeLabel={replayClock}
                    gateLabel={activeEvent?.gateLabel || null}
                    gateTimeLabel={gateTimeLabel}
                    residentMarkerLabel={
                      emmaResident ? `${emmaResident.name.split(' ')[0]}, upstairs` : null
                    }
                    residentMarkerPos={emmaResident?.marker3dJson || null}
                    cameraPosition={{
                      x: sideCam?.positionX ?? -3.55,
                      y: sideCam?.positionY ?? 2.35,
                      z: sideCam?.positionZ ?? -2.0,
                    }}
                    onCameraClick={() => setFocusedCameraSlug('side_passage')}
                  />
                </section>

                <CameraFeedRow
                  cameras={state?.cameras || []}
                  frameUrls={frameUrls}
                  transportMode={transportMode}
                  replayTimeMs={replayTimeMs}
                  isLiveMode={isLiveMode}
                  isEventActive={activeEvent?.status === 'active'}
                  activeCameraSlug={activeEvent?.cameraSlug || null}
                  trajectory={state?.trajectory || []}
                  focusedCameraSlug={focusedCameraSlug}
                  onSelectCamera={setFocusedCameraSlug}
                />
              </div>

              {/* Right Column: Person Snapshot, Who's home, Side passage after dark */}
              <RightSidebar
                activeEvent={activeEvent}
                residents={state?.residents || []}
                notes={state?.notes || []}
                afterDarkStats={state?.afterDarkStats || []}
                onPropertyDurationLabel={onPropertyDuration}
                onAddNote={handleAddNote}
              />
            </div>
          )}
        </main>
      )}

      {apiKeysOpen && (
        <ApiKeysModal token={token} onClose={() => setApiKeysOpen(false)} />
      )}
    </div>
  );
}
