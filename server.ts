import 'dotenv/config';
import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { apiRouter, runAutoAlertSweep } from './src/server/routes.ts';
import { initSocketServer } from './src/server/socket.ts';
import { streamManager } from './src/server/stream-manager.ts';
import { swaggerDocument } from './src/server/swagger.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  if (IS_PROD && (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim().length < 16)) {
    console.warn('[Home Sight] Warning: JWT_SECRET is unset or <16 chars; using ephemeral session key (sessions will reset on restart).');
  }
  const app = express();
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '2mb' }));

  // Serve Swagger OpenAPI JSON and interactive UI
  app.get('/api-docs/swagger.json', (_req, res) => {
    res.json(swaggerDocument);
  });
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'Home Sight — API & External Ingest Docs',
      customCss: '.swagger-ui .topbar { display: none }',
    }),
  );

  // Serve generated images & static assets reliably in both dev and prod
  const srcImagesDir = path.resolve(process.cwd(), 'src/assets/images');
  if (fs.existsSync(srcImagesDir)) {
    app.use('/src/assets/images', express.static(srcImagesDir));
  }

  // API routes + clean JSON 404 for unknown /api/* paths
  app.use('/api', apiRouter);
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const httpServer = http.createServer(app);

  // Initialize Socket.IO WebSocket server
  initSocketServer(httpServer);

  // Start 5 FPS FFmpeg static-image CCTV stream pipelines
  streamManager.start();

  // Server-authoritative auto-alert expiration check every 2s
  const sweepTimer = setInterval(() => {
    runAutoAlertSweep().catch(() => {});
  }, 2000);

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(distDir)) {
      console.warn('[Home Sight] Warning: dist/ folder not found. Run `npm run build` before starting in production.');
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Home Sight] Server listening on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
    console.log(`[Home Sight] Swagger docs available at http://0.0.0.0:${PORT}/api-docs`);
  });

  const shutdown = () => {
    clearInterval(sweepTimer);
    streamManager.stop();
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

startServer().catch((err) => {
  console.error('[Home Sight] Fatal startup error:', err);
  process.exit(1);
});
