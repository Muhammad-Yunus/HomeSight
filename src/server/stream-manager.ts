import { spawn, type ChildProcessByStdio } from 'child_process';
import type { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { RTCPeerConnection, RTCSessionDescription } from 'werift';

export type CameraSlug = 'side_passage' | 'driveway' | 'living_room';

export interface CameraStreamConfig {
  slug: CameraSlug;
  defaultImagePath: string;
  alertImagePath?: string;
}

const IMAGE_BASE_DIR = path.resolve(process.cwd(), 'src/assets/images');

const CAMERA_CONFIGS: CameraStreamConfig[] = [
  {
    slug: 'side_passage',
    defaultImagePath: path.join(IMAGE_BASE_DIR, 'cam_side_passage_1795348556055.jpg'),
    alertImagePath: path.join(IMAGE_BASE_DIR, 'cam_side_person_1795348556430.jpg'),
  },
  {
    slug: 'driveway',
    defaultImagePath: path.join(IMAGE_BASE_DIR, 'cam_driveway_ir_1795348557015.jpg'),
  },
  {
    slug: 'living_room',
    defaultImagePath: path.join(IMAGE_BASE_DIR, 'cam_living_room_1795348556746.jpg'),
  },
];

interface WorkerState {
  slug: CameraSlug;
  currentImagePath: string;
  proc: ChildProcessByStdio<null, Readable, Readable> | null;
  latestFrame: Buffer | null;
  frameCount: number;
  lastFrameAt: number;
  fps: number;
}

export class FfmpegWebRtcStreamManager extends EventEmitter {
  private workers = new Map<CameraSlug, WorkerState>();
  private peers = new Map<string, { pc: RTCPeerConnection; channels: Map<string, any> }>();
  private started = false;

  public start(): void {
    if (this.started) return;
    this.started = true;

    for (const cfg of CAMERA_CONFIGS) {
      const resolvedDefault = fs.existsSync(cfg.defaultImagePath)
        ? cfg.defaultImagePath
        : this.findFallbackImage(cfg.slug);

      const state: WorkerState = {
        slug: cfg.slug,
        currentImagePath: resolvedDefault,
        proc: null,
        latestFrame: resolvedDefault && fs.existsSync(resolvedDefault)
          ? fs.readFileSync(resolvedDefault)
          : null,
        frameCount: 0,
        lastFrameAt: Date.now(),
        fps: 5,
      };

      this.workers.set(cfg.slug, state);
      if (resolvedDefault && fs.existsSync(resolvedDefault)) {
        this.spawnFfmpegWorker(state);
      }
    }
  }

  private findFallbackImage(slug: CameraSlug): string {
    if (!fs.existsSync(IMAGE_BASE_DIR)) return '';
    const files = fs.readdirSync(IMAGE_BASE_DIR);
    const match = files.find((f) => f.includes(slug) && f.endsWith('.jpg'));
    return match ? path.join(IMAGE_BASE_DIR, match) : '';
  }

  public setCameraAlertSource(slug: CameraSlug, useAlertImage: boolean): void {
    const cfg = CAMERA_CONFIGS.find((c) => c.slug === slug);
    const state = this.workers.get(slug);
    if (!cfg || !state) return;

    const targetPath =
      useAlertImage && cfg.alertImagePath && fs.existsSync(cfg.alertImagePath)
        ? cfg.alertImagePath
        : cfg.defaultImagePath;

    if (!targetPath || !fs.existsSync(targetPath) || state.currentImagePath === targetPath) {
      return;
    }

    state.currentImagePath = targetPath;
    if (state.proc) {
      state.proc.kill('SIGTERM');
      state.proc = null;
    }
    this.spawnFfmpegWorker(state);
  }

  private spawnFfmpegWorker(state: WorkerState): void {
    if (!this.started) return;
    if (!state.currentImagePath || !fs.existsSync(state.currentImagePath)) return;

    // Real FFmpeg 5 FPS MJPEG pipeline generated from static source image
    // Adds subtle live night-sensor brightness modulation + 5 FPS pacing (-re -framerate 5)
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-re',
      '-loop',
      '1',
      '-framerate',
      '5',
      '-i',
      state.currentImagePath,
      '-vf',
      "fps=5,scale=640:-2,eq=brightness='0.008*sin(2*PI*t/4)'",
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      '-q:v',
      '6',
      'pipe:1',
    ];

    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    state.proc = proc;

    let buffer = Buffer.alloc(0);
    const SOI = Buffer.from([0xff, 0xd8]);
    const EOI = Buffer.from([0xff, 0xd9]);

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (true) {
        const start = buffer.indexOf(SOI);
        if (start === -1) {
          buffer = Buffer.alloc(0);
          break;
        }
        if (start > 0) {
          buffer = buffer.subarray(start);
        }

        const end = buffer.indexOf(EOI, 2);
        if (end === -1) {
          break;
        }

        const frame = buffer.subarray(0, end + 2);
        buffer = buffer.subarray(end + 2);

        state.latestFrame = frame;
        state.frameCount += 1;
        state.lastFrameAt = Date.now();

        this.emit('frame', {
          slug: state.slug,
          frame,
          frameCount: state.frameCount,
          timestamp: state.lastFrameAt,
          fps: 5,
        });

        this.broadcastToWebRtcPeers(state.slug, frame, state.frameCount);
      }
    });

    proc.stderr.on('data', (errChunk: Buffer) => {
      const msg = errChunk.toString().trim();
      if (msg) {
        console.warn(`[FFmpeg:${state.slug}]`, msg);
      }
    });

    proc.on('exit', () => {
      if (state.proc === proc) {
        state.proc = null;
        if (this.started) {
          setTimeout(() => {
            if (this.started && !state.proc) {
              this.spawnFfmpegWorker(state);
            }
          }, 1500);
        }
      }
    });
  }

  private broadcastToWebRtcPeers(slug: CameraSlug, frame: Buffer, seq: number): void {
    if (this.peers.size === 0) return;

    // Header: 1 byte camera index + 4 byte seq + raw JPEG bytes
    const slugIndex = slug === 'side_passage' ? 0 : slug === 'driveway' ? 1 : 2;
    const header = Buffer.alloc(5);
    header.writeUInt8(slugIndex, 0);
    header.writeUInt32BE(seq >>> 0, 1);
    const packet = Buffer.concat([header, frame]);

    for (const [peerId, peer] of this.peers.entries()) {
      const dc = peer.channels.get('cctv-5fps');
      if (dc && dc.readyState === 'open') {
        try {
          if (dc.bufferedAmount < 512 * 1024) {
            dc.send(packet);
          }
        } catch {
          this.cleanupPeer(peerId);
        }
      }
    }
  }

  public async handleWebRtcOffer(
    peerId: string,
    sdp: string,
    type: 'offer' | 'answer',
  ): Promise<{ sdp: string; type: string }> {
    this.cleanupPeer(peerId);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const channels = new Map<string, any>();
    this.peers.set(peerId, { pc, channels });

    pc.onDataChannel.subscribe((dc) => {
      channels.set(dc.label, dc);
    });

    pc.connectionStateChange.subscribe((state) => {
      if (state === 'closed' || state === 'failed' || state === 'disconnected') {
        this.cleanupPeer(peerId);
      }
    });

    await pc.setRemoteDescription(new RTCSessionDescription(sdp, type));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Wait briefly for ICE gathering so SDP answer includes host/srflx candidates
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, 800);
      pc.iceGatheringStateChange.subscribe((s) => {
        if (s === 'complete') {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    return {
      sdp: pc.localDescription?.sdp || answer.sdp,
      type: pc.localDescription?.type || 'answer',
    };
  }

  private cleanupPeer(peerId: string): void {
    const existing = this.peers.get(peerId);
    if (existing) {
      try {
        existing.pc.close();
      } catch {
        // ignore close errors
      }
      this.peers.delete(peerId);
    }
  }

  public getLatestFrame(slug: CameraSlug): Buffer | null {
    return this.workers.get(slug)?.latestFrame || null;
  }

  public getStreamStats(): Array<{
    slug: CameraSlug;
    fps: number;
    frameCount: number;
    lastFrameAt: number;
    active: boolean;
  }> {
    return Array.from(this.workers.values()).map((w) => ({
      slug: w.slug,
      fps: w.fps,
      frameCount: w.frameCount,
      lastFrameAt: w.lastFrameAt,
      active: w.proc !== null,
    }));
  }

  public stop(): void {
    this.started = false;
    for (const state of this.workers.values()) {
      if (state.proc) {
        state.proc.kill('SIGTERM');
        state.proc = null;
      }
    }
    for (const peerId of this.peers.keys()) {
      this.cleanupPeer(peerId);
    }
  }
}

export const streamManager = new FfmpegWebRtcStreamManager();
