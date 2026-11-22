import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyUserToken } from './auth.ts';
import { streamManager, type CameraSlug } from './stream-manager.ts';

let io: SocketIOServer | null = null;

export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  if (io) return io;

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authenticate browser WebSocket connections using user-based JWT
  io.use((socket, next) => {
    const token =
      typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : '';

    const payload = verifyUserToken(token);
    if (!payload) {
      next(new Error('Unauthorized Socket.IO connection'));
      return;
    }

    socket.data.user = payload;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('property:join', (propertyId: number | string) => {
      const room = `property:${propertyId}`;
      socket.join(room);
      socket.emit('stream:status', streamManager.getStreamStats());
    });

    socket.on('stream:subscribe', (slugs: CameraSlug[]) => {
      if (Array.isArray(slugs)) {
        for (const slug of slugs) {
          socket.join(`camera:${slug}`);
          const latest = streamManager.getLatestFrame(slug);
          if (latest) {
            socket.emit('camera:frame', {
              slug,
              buffer: latest,
              timestamp: Date.now(),
              fps: 5,
            });
          }
        }
      }
    });
  });

  // Relay 5 FPS FFmpeg frames to subscribed Socket.IO camera rooms
  streamManager.on(
    'frame',
    (payload: {
      slug: CameraSlug;
      frame: Buffer;
      frameCount: number;
      timestamp: number;
      fps: number;
    }) => {
      if (!io) return;
      io.to(`camera:${payload.slug}`).emit('camera:frame', {
        slug: payload.slug,
        buffer: payload.frame,
        frameCount: payload.frameCount,
        timestamp: payload.timestamp,
        fps: payload.fps,
      });
    },
  );

  return io;
}

export function broadcastToProperty(
  propertyId: number,
  eventName: string,
  data: unknown,
): void {
  if (!io) return;
  io.to(`property:${propertyId}`).emit(eventName, data);
}

export function getIo(): SocketIOServer | null {
  return io;
}
