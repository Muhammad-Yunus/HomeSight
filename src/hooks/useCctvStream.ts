import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import type { CameraSlug } from '../types/homesight';

const SLUG_INDEX_TO_NAME: CameraSlug[] = ['side_passage', 'driveway', 'living_room'];

/**
 * Consumes 5 FPS FFmpeg frames delivered over WebRTC DataChannel (primary)
 * with automatic seamless fallback to Socket.IO binary stream if ICE UDP is
 * blocked by an HTTP reverse proxy.
 */
export function useCctvStream(token: string | null, socket: Socket | null) {
  const [frameUrls, setFrameUrls] = useState<Partial<Record<CameraSlug, string>>>({});
  const [transportMode, setTransportMode] = useState<'webrtc' | 'socket' | 'connecting'>('connecting');
  const prevUrlsRef = useRef<Partial<Record<CameraSlug, string>>>({});
  const webrtcActiveRef = useRef(false);

  const pushFrameBytes = (slug: CameraSlug, bytes: ArrayBuffer | Uint8Array) => {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const copy = new Uint8Array(view.byteLength);
    copy.set(view);
    const blob = new Blob([copy.buffer], {
      type: 'image/jpeg',
    });
    const url = URL.createObjectURL(blob);
    const oldUrl = prevUrlsRef.current[slug];
    prevUrlsRef.current[slug] = url;
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
    setFrameUrls((prev) => ({ ...prev, [slug]: url }));
  };

  // Attempt real WebRTC RTCPeerConnection DataChannel handshake
  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    const peerId = `hs_${Math.random().toString(36).slice(2, 10)}`;

    const setupWebRtc = async () => {
      try {
        pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        const dc = pc.createDataChannel('cctv-5fps', { ordered: false, maxRetransmits: 0 });
        dc.binaryType = 'arraybuffer';

        dc.onopen = () => {
          if (!cancelled) {
            webrtcActiveRef.current = true;
            setTransportMode('webrtc');
          }
        };

        dc.onmessage = (ev) => {
          if (cancelled || !(ev.data instanceof ArrayBuffer) || ev.data.byteLength <= 5) return;
          const view = new DataView(ev.data);
          const camIdx = view.getUint8(0);
          const slug = SLUG_INDEX_TO_NAME[camIdx];
          if (!slug) return;
          pushFrameBytes(slug, ev.data.slice(5));
        };

        dc.onclose = () => {
          webrtcActiveRef.current = false;
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait briefly for local ICE candidates
        await new Promise<void>((resolve) => {
          if (!pc || pc.iceGatheringState === 'complete') {
            resolve();
            return;
          }
          const t = setTimeout(resolve, 600);
          pc.onicegatheringstatechange = () => {
            if (pc?.iceGatheringState === 'complete') {
              clearTimeout(t);
              resolve();
            }
          };
        });

        if (cancelled || !pc.localDescription) return;

        const res = await fetch('/api/webrtc/offer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            peerId,
            sdp: pc.localDescription.sdp,
            type: 'offer',
          }),
        });

        if (!res.ok) return;
        const answer = await res.json();
        if (!cancelled && pc && answer.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      } catch {
        // Fallback to Socket.IO 5 FPS stream seamlessly
        webrtcActiveRef.current = false;
      }
    };

    setupWebRtc();

    return () => {
      cancelled = true;
      webrtcActiveRef.current = false;
      if (pc) {
        try {
          pc.close();
        } catch {
          // ignore
        }
      }
    };
  }, [token]);

  // Socket.IO 5 FPS FFmpeg stream listener (active whenever WebRTC DataChannel is not open)
  useEffect(() => {
    if (!socket) return;

    const handleFrame = (payload: {
      slug: CameraSlug;
      buffer: ArrayBuffer | Uint8Array | { type: 'Buffer'; data: number[] };
    }) => {
      if (webrtcActiveRef.current) return;
      setTransportMode('socket');

      let bytes: Uint8Array;
      if (payload.buffer instanceof ArrayBuffer) {
        bytes = new Uint8Array(payload.buffer);
      } else if (payload.buffer instanceof Uint8Array) {
        bytes = payload.buffer;
      } else if (payload.buffer && Array.isArray((payload.buffer as any).data)) {
        bytes = new Uint8Array((payload.buffer as any).data);
      } else {
        return;
      }

      pushFrameBytes(payload.slug, bytes);
    };

    socket.on('camera:frame', handleFrame);
    return () => {
      socket.off('camera:frame', handleFrame);
    };
  }, [socket]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(prevUrlsRef.current)) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, []);

  return { frameUrls, transportMode };
}
