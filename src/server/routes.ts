import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { eq, desc, asc, and, count, lte, isNotNull } from 'drizzle-orm';
import { getDb, isDbConfigured, testDbConnection, schema } from '../db/index.ts';
import {
  type AuthenticatedRequest,
  hashPassword,
  verifyPassword,
  signUserToken,
  requireUserAuth,
  requireIngestApiKey,
  generateRawApiKey,
} from './auth.ts';
import { broadcastToProperty } from './socket.ts';
import { streamManager, type CameraSlug } from './stream-manager.ts';

export const apiRouter = Router();

function ensureDbReady(res: Response): boolean {
  if (!isDbConfigured()) {
    res.status(503).json({
      error: 'Database is not configured. Set DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD in environment secrets.',
      code: 'DB_UNCONFIGURED',
    });
    return false;
  }
  return true;
}

/* ============================================================================
 * HEALTH CHECK
 * ============================================================================ */
apiRouter.get('/health', async (_req: Request, res: Response) => {
  const dbConfigured = isDbConfigured();
  const dbConnected = dbConfigured ? await testDbConnection() : false;
  res.json({
    ok: true,
    service: 'home-sight',
    dbConfigured,
    dbConnected,
    streams: streamManager.getStreamStats(),
    timestamp: new Date().toISOString(),
  });
});

/* ============================================================================
 * 1. APP USER AUTHENTICATION (User-based Login)
 * ============================================================================ */
apiRouter.get('/auth/bootstrap-status', async (_req: Request, res: Response) => {
  if (!ensureDbReady(res)) return;
  try {
    const db = getDb();
    const [row] = await db.select({ value: count() }).from(schema.users);
    res.json({ hasUsers: (row?.value ?? 0) > 0 });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(150),
  password: z.string().min(8).max(128),
});

apiRouter.post('/auth/register', async (req: Request, res: Response) => {
  if (!ensureDbReady(res)) return;
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid registration payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const db = getDb();
    const emailLower = parsed.data.email.toLowerCase();
    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const [userCountRow] = await db.select({ value: count() }).from(schema.users);
    const role = (userCountRow?.value ?? 0) === 0 ? 'admin' : 'member';
    const passwordHash = await hashPassword(parsed.data.password);

    const [created] = await db
      .insert(schema.users)
      .values({
        name: parsed.data.name,
        email: emailLower,
        passwordHash,
        role,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        name: schema.users.name,
        role: schema.users.role,
        createdAt: schema.users.createdAt,
      });

    const token = signUserToken({
      userId: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
    });

    res.status(201).json({ user: created, token });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  if (!ensureDbReady(res)) return;
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email and password are required.' });
    return;
  }

  try {
    const db = getDb();
    const emailLower = parsed.data.email.toLowerCase();
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, emailLower))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const ok = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = signUserToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get('/auth/me', requireUserAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

/* ============================================================================
 * 2. API KEY MANAGEMENT (User-authenticated, generates keys for Ingest API)
 * ============================================================================ */
apiRouter.get('/api-keys', requireUserAuth, async (_req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        keyPrefix: schema.apiKeys.keyPrefix,
        isActive: schema.apiKeys.isActive,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .orderBy(desc(schema.apiKeys.createdAt));

    res.json({ keys: rows });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const createKeySchema = z.object({
  name: z.string().trim().min(2).max(80),
});

apiRouter.post('/api-keys', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const parsed = createKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Key name is required.' });
    return;
  }

  try {
    const db = getDb();
    const { rawKey, prefix, keyHash } = generateRawApiKey();
    const [created] = await db
      .insert(schema.apiKeys)
      .values({
        name: parsed.data.name,
        keyPrefix: prefix,
        keyHash,
        isActive: true,
        createdByUserId: req.user?.userId ?? null,
      })
      .returning({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        keyPrefix: schema.apiKeys.keyPrefix,
        isActive: schema.apiKeys.isActive,
        createdAt: schema.apiKeys.createdAt,
      });

    res.status(201).json({ key: created, rawKey });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.delete('/api-keys/:id', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'Invalid API key ID.' });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.apiKeys)
      .set({ isActive: false })
      .where(eq(schema.apiKeys.id, id))
      .returning({ id: schema.apiKeys.id, isActive: schema.apiKeys.isActive });

    if (!updated) {
      res.status(404).json({ error: 'API key not found.' });
      return;
    }

    res.json({ revoked: true, id: updated.id });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ============================================================================
 * 3. DASHBOARD STATE & OPERATOR ACTIONS (User-authenticated)
 * ============================================================================ */
apiRouter.get('/properties', requireUserAuth, async (_req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  try {
    const db = getDb();
    const list = await db.select().from(schema.properties).orderBy(asc(schema.properties.id));
    res.json({ properties: list });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

async function loadPropertyFullState(propertyId: number) {
  const db = getDb();
  const [property] = await db
    .select()
    .from(schema.properties)
    .where(eq(schema.properties.id, propertyId))
    .limit(1);

  if (!property) return null;

  const [cameraList, residentList, eventsList, statsList] = await Promise.all([
    db
      .select()
      .from(schema.cameras)
      .where(eq(schema.cameras.propertyId, propertyId))
      .orderBy(asc(schema.cameras.id)),
    db
      .select()
      .from(schema.residents)
      .where(eq(schema.residents.propertyId, propertyId))
      .orderBy(asc(schema.residents.id)),
    db
      .select()
      .from(schema.securityEvents)
      .where(eq(schema.securityEvents.propertyId, propertyId))
      .orderBy(desc(schema.securityEvents.enteredAt))
      .limit(30),
    db
      .select()
      .from(schema.afterDarkStats)
      .where(eq(schema.afterDarkStats.propertyId, propertyId))
      .orderBy(asc(schema.afterDarkStats.slotIndex)),
  ]);

  const activeEvent =
    eventsList.find((e) => e.status === 'active') || eventsList[0] || null;

  let trajectory: Array<typeof schema.trajectoryPoints.$inferSelect> = [];
  let notes: Array<typeof schema.eventNotes.$inferSelect> = [];

  if (activeEvent) {
    [trajectory, notes] = await Promise.all([
      db
        .select()
        .from(schema.trajectoryPoints)
        .where(eq(schema.trajectoryPoints.eventId, activeEvent.id))
        .orderBy(asc(schema.trajectoryPoints.recordedAt), asc(schema.trajectoryPoints.id)),
      db
        .select()
        .from(schema.eventNotes)
        .where(eq(schema.eventNotes.eventId, activeEvent.id))
        .orderBy(desc(schema.eventNotes.createdAt)),
    ]);
  }

  return {
    property,
    cameras: cameraList,
    residents: residentList,
    events: eventsList,
    activeEvent,
    trajectory,
    notes,
    afterDarkStats: statsList,
  };
}

apiRouter.get('/properties/:id/state', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const propertyId = Number(req.params.id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    res.status(400).json({ error: 'Invalid property ID.' });
    return;
  }

  try {
    const state = await loadPropertyFullState(propertyId);
    if (!state) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }

    // Ensure FFmpeg stream source matches active camera state
    const sideCam = state.cameras.find((c) => c.slug === 'side_passage');
    if (sideCam) {
      streamManager.setCameraAlertSource('side_passage', sideCam.status === 'person_in_view');
    }

    res.json(state);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const modeSchema = z.object({
  securityMode: z.enum(['armed_night', 'armed_away', 'disarmed']),
});

apiRouter.patch('/properties/:id/mode', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const propertyId = Number(req.params.id);
  const parsed = modeSchema.safeParse(req.body);
  if (!Number.isInteger(propertyId) || !parsed.success) {
    res.status(400).json({ error: 'Invalid property mode update.' });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.properties)
      .set({ securityMode: parsed.data.securityMode })
      .where(eq(schema.properties.id, propertyId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }

    broadcastToProperty(propertyId, 'property:mode', { property: updated });
    res.json({ property: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.get('/events/:id', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    res.status(400).json({ error: 'Invalid event ID.' });
    return;
  }

  try {
    const db = getDb();
    const [event] = await db
      .select()
      .from(schema.securityEvents)
      .where(eq(schema.securityEvents.id, eventId))
      .limit(1);

    if (!event) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const [trajectory, notes] = await Promise.all([
      db
        .select()
        .from(schema.trajectoryPoints)
        .where(eq(schema.trajectoryPoints.eventId, event.id))
        .orderBy(asc(schema.trajectoryPoints.recordedAt)),
      db
        .select()
        .from(schema.eventNotes)
        .where(eq(schema.eventNotes.eventId, event.id))
        .orderBy(desc(schema.eventNotes.createdAt)),
    ]);

    res.json({ event, trajectory, notes });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post('/events/:id/mark-safe', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    res.status(400).json({ error: 'Invalid event ID.' });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.securityEvents)
      .set({
        status: 'marked_safe',
        recognitionStatus: 'cleared',
        autoAlertAt: null,
      })
      .where(eq(schema.securityEvents.id, eventId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    if (updated.cameraSlug) {
      await db
        .update(schema.cameras)
        .set({ status: 'clear', personBoxJson: null, updatedAt: new Date() })
        .where(
          and(
            eq(schema.cameras.propertyId, updated.propertyId),
            eq(schema.cameras.slug, updated.cameraSlug),
          ),
        );

      if (updated.cameraSlug === 'side_passage') {
        streamManager.setCameraAlertSource('side_passage', false);
      }
    }

    const fullState = await loadPropertyFullState(updated.propertyId);
    broadcastToProperty(updated.propertyId, 'event:updated', {
      event: updated,
      cameras: fullState?.cameras ?? [],
    });

    res.json({ event: updated, cameras: fullState?.cameras ?? [] });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

apiRouter.post('/events/:id/alert', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const eventId = Number(req.params.id);
  if (!Number.isInteger(eventId)) {
    res.status(400).json({ error: 'Invalid event ID.' });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.securityEvents)
      .set({
        status: 'alert_sent',
        autoAlertAt: null,
      })
      .where(eq(schema.securityEvents.id, eventId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const [createdNote] = await db
      .insert(schema.eventNotes)
      .values({
        eventId: updated.id,
        authorUserId: req.user?.userId ?? null,
        authorName: req.user?.name || 'Operator',
        note: 'Escalated to monitoring centre for immediate dispatch.',
      })
      .returning();

    broadcastToProperty(updated.propertyId, 'event:updated', { event: updated });
    broadcastToProperty(updated.propertyId, 'note:created', { note: createdNote });

    res.json({ event: updated, note: createdNote });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const noteSchema = z.object({
  note: z.string().trim().min(1).max(600),
});

apiRouter.post('/events/:id/notes', requireUserAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const eventId = Number(req.params.id);
  const parsed = noteSchema.safeParse(req.body);
  if (!Number.isInteger(eventId) || !parsed.success) {
    res.status(400).json({ error: 'Valid note text is required.' });
    return;
  }

  try {
    const db = getDb();
    const [event] = await db
      .select()
      .from(schema.securityEvents)
      .where(eq(schema.securityEvents.id, eventId))
      .limit(1);

    if (!event) {
      res.status(404).json({ error: 'Event not found.' });
      return;
    }

    const [created] = await db
      .insert(schema.eventNotes)
      .values({
        eventId,
        authorUserId: req.user?.userId ?? null,
        authorName: req.user?.name || 'Operator',
        note: parsed.data.note,
      })
      .returning();

    broadcastToProperty(event.propertyId, 'note:created', { note: created });
    res.status(201).json({ note: created });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ============================================================================
 * 4. LIVE FFMPEG FRAME SNAPSHOTS & WEBRTC SIGNALING
 * ============================================================================ */
apiRouter.get('/cameras/:slug/frame', requireUserAuth, (req: Request, res: Response) => {
  const slug = req.params.slug as CameraSlug;
  if (!['side_passage', 'driveway', 'living_room'].includes(slug)) {
    res.status(404).json({ error: 'Camera not found.' });
    return;
  }

  const frame = streamManager.getLatestFrame(slug);
  if (!frame) {
    res.status(503).json({ error: 'Stream warming up.' });
    return;
  }

  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'no-store');
  res.send(frame);
});

const webrtcOfferSchema = z.object({
  peerId: z.string().min(4).max(80),
  sdp: z.string().min(10),
  type: z.literal('offer'),
});

apiRouter.post('/webrtc/offer', requireUserAuth, async (req: Request, res: Response) => {
  const parsed = webrtcOfferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid WebRTC SDP offer payload.' });
    return;
  }

  try {
    const answer = await streamManager.handleWebRtcOffer(
      parsed.data.peerId,
      parsed.data.sdp,
      parsed.data.type,
    );
    res.json(answer);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/* ============================================================================
 * 5. EXTERNAL INGEST API (API Key Auth ONLY — NO dummy data generated in backend)
 * ============================================================================ */
const bootstrapIngestSchema = z.object({
  property: z.object({
    slug: z.string().min(2).max(100),
    name: z.string().min(2).max(120),
    securityMode: z.enum(['armed_night', 'armed_away', 'disarmed']).default('armed_night'),
    autoAlertSeconds: z.number().int().min(10).max(600).default(45),
  }),
  cameras: z.array(
    z.object({
      slug: z.enum(['side_passage', 'driveway', 'living_room']),
      name: z.string().min(1).max(100),
      status: z.enum(['clear', 'person_in_view', 'offline']).default('clear'),
      positionX: z.number().default(0),
      positionY: z.number().default(2.4),
      positionZ: z.number().default(0),
      staticImagePath: z.string().min(1),
      personBox: z
        .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
        .nullable()
        .optional(),
    }),
  ),
  residents: z.array(
    z.object({
      slug: z.string().min(1).max(100),
      name: z.string().min(1).max(100),
      locationLabel: z.string().min(1).max(120),
      isHome: z.boolean(),
      distanceKm: z.number().nullable().optional(),
      alertStatus: z.enum(['sent', 'none', 'acknowledged']).default('sent'),
      avatarUrl: z.string().min(1),
      marker3d: z
        .object({ x: z.number(), y: z.number(), z: z.number() })
        .nullable()
        .optional(),
    }),
  ),
  afterDarkStats: z
    .array(
      z.object({
        cameraSlug: z.string(),
        slotIndex: z.number().int(),
        hourLabel: z.string(),
        baselineValue: z.number().int().min(0),
        tonightValue: z.number().int().min(0),
        highlightLabel: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

apiRouter.post('/ingest/bootstrap', requireIngestApiKey, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const parsed = bootstrapIngestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid bootstrap ingest payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const db = getDb();
    const { property: pInput, cameras: camInputs, residents: resInputs, afterDarkStats: statInputs } =
      parsed.data;

    const [existingProp] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.slug, pInput.slug))
      .limit(1);

    let prop;
    if (existingProp) {
      [prop] = await db
        .update(schema.properties)
        .set({
          name: pInput.name,
          securityMode: pInput.securityMode,
          autoAlertSeconds: pInput.autoAlertSeconds,
        })
        .where(eq(schema.properties.id, existingProp.id))
        .returning();
    } else {
      [prop] = await db
        .insert(schema.properties)
        .values({
          slug: pInput.slug,
          name: pInput.name,
          securityMode: pInput.securityMode,
          autoAlertSeconds: pInput.autoAlertSeconds,
        })
        .returning();
    }

    for (const cam of camInputs) {
      const [existingCam] = await db
        .select()
        .from(schema.cameras)
        .where(eq(schema.cameras.slug, cam.slug))
        .limit(1);

      if (existingCam) {
        await db
          .update(schema.cameras)
          .set({
            propertyId: prop.id,
            name: cam.name,
            status: cam.status,
            positionX: cam.positionX,
            positionY: cam.positionY,
            positionZ: cam.positionZ,
            staticImagePath: cam.staticImagePath,
            personBoxJson: cam.personBox ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.cameras.id, existingCam.id));
      } else {
        await db.insert(schema.cameras).values({
          propertyId: prop.id,
          slug: cam.slug,
          name: cam.name,
          status: cam.status,
          positionX: cam.positionX,
          positionY: cam.positionY,
          positionZ: cam.positionZ,
          staticImagePath: cam.staticImagePath,
          personBoxJson: cam.personBox ?? null,
        });
      }

      if (cam.slug === 'side_passage') {
        streamManager.setCameraAlertSource('side_passage', cam.status === 'person_in_view');
      }
    }

    for (const r of resInputs) {
      const [existingRes] = await db
        .select()
        .from(schema.residents)
        .where(eq(schema.residents.slug, r.slug))
        .limit(1);

      if (existingRes) {
        await db
          .update(schema.residents)
          .set({
            propertyId: prop.id,
            name: r.name,
            locationLabel: r.locationLabel,
            isHome: r.isHome,
            distanceKm: r.distanceKm ?? null,
            alertStatus: r.alertStatus,
            avatarUrl: r.avatarUrl,
            marker3dJson: r.marker3d ?? null,
            updatedAt: new Date(),
          })
          .where(eq(schema.residents.id, existingRes.id));
      } else {
        await db.insert(schema.residents).values({
          propertyId: prop.id,
          slug: r.slug,
          name: r.name,
          locationLabel: r.locationLabel,
          isHome: r.isHome,
          distanceKm: r.distanceKm ?? null,
          alertStatus: r.alertStatus,
          avatarUrl: r.avatarUrl,
          marker3dJson: r.marker3d ?? null,
        });
      }
    }

    if (statInputs && statInputs.length > 0) {
      await db
        .delete(schema.afterDarkStats)
        .where(eq(schema.afterDarkStats.propertyId, prop.id));

      await db.insert(schema.afterDarkStats).values(
        statInputs.map((s) => ({
          propertyId: prop.id,
          cameraSlug: s.cameraSlug,
          slotIndex: s.slotIndex,
          hourLabel: s.hourLabel,
          baselineValue: s.baselineValue,
          tonightValue: s.tonightValue,
          highlightLabel: s.highlightLabel ?? null,
        })),
      );
    }

    const fullState = await loadPropertyFullState(prop.id);
    broadcastToProperty(prop.id, 'property:synced', fullState);

    res.json({ ok: true, propertyId: prop.id, ingestedBy: req.ingestKeyName });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const ingestEventSchema = z.object({
  externalEventId: z.string().min(1).max(120).optional(),
  propertySlug: z.string().min(1).max(100),
  cameraSlug: z.enum(['side_passage', 'driveway', 'living_room']).optional(),
  title: z.string().min(2).max(160),
  personLabel: z.string().min(1).max(100),
  recognitionStatus: z.enum(['not_recognised', 'recognised', 'cleared']).default('not_recognised'),
  matchConfidence: z.number().int().min(0).max(100).default(94),
  enteredAt: z.string().datetime({ offset: true }).or(z.string().min(10)),
  snapshotUrl: z.string().min(1),
  autoAlertSeconds: z.number().int().min(0).max(600).optional(),
  gateOpenedAt: z.string().nullable().optional(),
  gateLabel: z.string().nullable().optional(),
  personBox: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .nullable()
    .optional(),
  trajectory: z
    .array(
      z.object({
        x: z.number(),
        y: z.number().default(0.14),
        z: z.number(),
        recordedAt: z.string(),
        label: z.string().nullable().optional(),
        cameraDetected: z.boolean().default(true),
      }),
    )
    .optional(),
});

apiRouter.post('/ingest/events', requireIngestApiKey, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const parsed = ingestEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid ingest event payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const db = getDb();
    const data = parsed.data;

    const [prop] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.slug, data.propertySlug))
      .limit(1);

    if (!prop) {
      res.status(404).json({ error: `Property '${data.propertySlug}' not found.` });
      return;
    }

    const enteredAtDate = new Date(data.enteredAt);
    const autoAlertAt =
      typeof data.autoAlertSeconds === 'number' && data.autoAlertSeconds > 0
        ? new Date(Date.now() + data.autoAlertSeconds * 1000)
        : null;

    let eventRow;
    if (data.externalEventId) {
      const [existing] = await db
        .select()
        .from(schema.securityEvents)
        .where(eq(schema.securityEvents.externalEventId, data.externalEventId))
        .limit(1);

      if (existing) {
        [eventRow] = await db
          .update(schema.securityEvents)
          .set({
            cameraSlug: data.cameraSlug ?? existing.cameraSlug,
            title: data.title,
            personLabel: data.personLabel,
            recognitionStatus: data.recognitionStatus,
            matchConfidence: data.matchConfidence,
            enteredAt: enteredAtDate,
            snapshotUrl: data.snapshotUrl,
            status: 'active',
            autoAlertAt,
            gateOpenedAt: data.gateOpenedAt ? new Date(data.gateOpenedAt) : existing.gateOpenedAt,
            gateLabel: data.gateLabel ?? existing.gateLabel,
          })
          .where(eq(schema.securityEvents.id, existing.id))
          .returning();

        if (data.trajectory && data.trajectory.length > 0) {
          await db
            .delete(schema.trajectoryPoints)
            .where(eq(schema.trajectoryPoints.eventId, existing.id));
        }
      }
    }

    if (!eventRow) {
      [eventRow] = await db
        .insert(schema.securityEvents)
        .values({
          externalEventId: data.externalEventId ?? null,
          propertyId: prop.id,
          cameraSlug: data.cameraSlug ?? null,
          title: data.title,
          personLabel: data.personLabel,
          recognitionStatus: data.recognitionStatus,
          matchConfidence: data.matchConfidence,
          enteredAt: enteredAtDate,
          snapshotUrl: data.snapshotUrl,
          status: 'active',
          autoAlertAt,
          gateOpenedAt: data.gateOpenedAt ? new Date(data.gateOpenedAt) : null,
          gateLabel: data.gateLabel ?? null,
        })
        .returning();
    }

    let insertedTrajectory: Array<typeof schema.trajectoryPoints.$inferSelect> = [];
    if (data.trajectory && data.trajectory.length > 0) {
      insertedTrajectory = await db
        .insert(schema.trajectoryPoints)
        .values(
          data.trajectory.map((pt) => ({
            eventId: eventRow.id,
            recordedAt: new Date(pt.recordedAt),
            x: pt.x,
            y: pt.y,
            z: pt.z,
            label: pt.label ?? null,
            cameraDetected: pt.cameraDetected,
          })),
        )
        .returning();
    }

    let updatedCameras = [];
    if (data.cameraSlug) {
      await db
        .update(schema.cameras)
        .set({
          status: 'person_in_view',
          personBoxJson: data.personBox ?? { x: 0.56, y: 0.16, w: 0.12, h: 0.68 },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.cameras.propertyId, prop.id),
            eq(schema.cameras.slug, data.cameraSlug),
          ),
        );

      if (data.cameraSlug === 'side_passage') {
        streamManager.setCameraAlertSource('side_passage', true);
      }
    }

    updatedCameras = await db
      .select()
      .from(schema.cameras)
      .where(eq(schema.cameras.propertyId, prop.id))
      .orderBy(asc(schema.cameras.id));

    broadcastToProperty(prop.id, 'event:ingested', {
      event: eventRow,
      trajectory: insertedTrajectory,
      cameras: updatedCameras,
    });

    res.status(201).json({
      ok: true,
      event: eventRow,
      trajectoryCount: insertedTrajectory.length,
      ingestedBy: req.ingestKeyName,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const trajectoryAppendSchema = z.object({
  x: z.number(),
  y: z.number().default(0.14),
  z: z.number(),
  recordedAt: z.string(),
  label: z.string().nullable().optional(),
  cameraDetected: z.boolean().default(true),
  personBox: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .nullable()
    .optional(),
});

apiRouter.post(
  '/ingest/events/:externalEventId/trajectory',
  requireIngestApiKey,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!ensureDbReady(res)) return;
    const parsed = trajectoryAppendSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid trajectory point payload', details: parsed.error.flatten() });
      return;
    }

    try {
      const db = getDb();
      const [event] = await db
        .select()
        .from(schema.securityEvents)
        .where(eq(schema.securityEvents.externalEventId, req.params.externalEventId))
        .limit(1);

      if (!event) {
        res.status(404).json({ error: 'External event ID not found.' });
        return;
      }

      const [point] = await db
        .insert(schema.trajectoryPoints)
        .values({
          eventId: event.id,
          recordedAt: new Date(parsed.data.recordedAt),
          x: parsed.data.x,
          y: parsed.data.y,
          z: parsed.data.z,
          label: parsed.data.label ?? null,
          cameraDetected: parsed.data.cameraDetected,
        })
        .returning();

      if (event.cameraSlug && parsed.data.personBox !== undefined) {
        const [updatedCam] = await db
          .update(schema.cameras)
          .set({
            status: parsed.data.cameraDetected ? 'person_in_view' : 'clear',
            personBoxJson: parsed.data.personBox,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.cameras.propertyId, event.propertyId),
              eq(schema.cameras.slug, event.cameraSlug),
            ),
          )
          .returning();

        if (event.cameraSlug === 'side_passage') {
          streamManager.setCameraAlertSource('side_passage', parsed.data.cameraDetected);
        }

        if (updatedCam) {
          broadcastToProperty(event.propertyId, 'camera:status', { camera: updatedCam });
        }
      }

      broadcastToProperty(event.propertyId, 'trajectory:appended', {
        eventId: event.id,
        point,
      });

      res.status(201).json({ ok: true, point });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

const cameraStatusSchema = z.object({
  cameraSlug: z.enum(['side_passage', 'driveway', 'living_room']),
  status: z.enum(['clear', 'person_in_view', 'offline']),
  personBox: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .nullable()
    .optional(),
});

apiRouter.post('/ingest/cameras/status', requireIngestApiKey, async (req: AuthenticatedRequest, res: Response) => {
  if (!ensureDbReady(res)) return;
  const parsed = cameraStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid camera status payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const db = getDb();
    const [updated] = await db
      .update(schema.cameras)
      .set({
        status: parsed.data.status,
        personBoxJson:
          parsed.data.status === 'person_in_view'
            ? (parsed.data.personBox ?? { x: 0.56, y: 0.16, w: 0.12, h: 0.68 })
            : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.cameras.slug, parsed.data.cameraSlug))
      .returning();

    if (!updated) {
      res.status(404).json({ error: 'Camera not found.' });
      return;
    }

    if (parsed.data.cameraSlug === 'side_passage') {
      streamManager.setCameraAlertSource('side_passage', parsed.data.status === 'person_in_view');
    }

    broadcastToProperty(updated.propertyId, 'camera:status', { camera: updated });
    res.json({ ok: true, camera: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

const residentPresenceSchema = z.object({
  residentSlug: z.string().min(1).max(100),
  isHome: z.boolean(),
  locationLabel: z.string().min(1).max(120).optional(),
  distanceKm: z.number().nullable().optional(),
  alertStatus: z.enum(['sent', 'none', 'acknowledged']).optional(),
});

apiRouter.post(
  '/ingest/residents/presence',
  requireIngestApiKey,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!ensureDbReady(res)) return;
    const parsed = residentPresenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid resident presence payload', details: parsed.error.flatten() });
      return;
    }

    try {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(schema.residents)
        .where(eq(schema.residents.slug, parsed.data.residentSlug))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'Resident not found.' });
        return;
      }

      const [updated] = await db
        .update(schema.residents)
        .set({
          isHome: parsed.data.isHome,
          locationLabel: parsed.data.locationLabel ?? existing.locationLabel,
          distanceKm:
            parsed.data.distanceKm !== undefined ? parsed.data.distanceKm : existing.distanceKm,
          alertStatus: parsed.data.alertStatus ?? existing.alertStatus,
          updatedAt: new Date(),
        })
        .where(eq(schema.residents.id, existing.id))
        .returning();

      broadcastToProperty(updated.propertyId, 'resident:updated', { resident: updated });
      res.json({ ok: true, resident: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

const afterDarkIngestSchema = z.object({
  propertySlug: z.string().min(1).max(100),
  cameraSlug: z.enum(['side_passage', 'driveway', 'living_room']).default('side_passage'),
  stats: z
    .array(
      z.object({
        slotIndex: z.number().int(),
        hourLabel: z.string(),
        baselineValue: z.number().int().min(0),
        tonightValue: z.number().int().min(0),
        highlightLabel: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

apiRouter.post(
  '/ingest/stats/after-dark',
  requireIngestApiKey,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!ensureDbReady(res)) return;
    const parsed = afterDarkIngestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid after-dark stats payload', details: parsed.error.flatten() });
      return;
    }

    try {
      const db = getDb();
      const [prop] = await db
        .select()
        .from(schema.properties)
        .where(eq(schema.properties.slug, parsed.data.propertySlug))
        .limit(1);

      if (!prop) {
        res.status(404).json({ error: `Property '${parsed.data.propertySlug}' not found.` });
        return;
      }

      await db
        .delete(schema.afterDarkStats)
        .where(
          and(
            eq(schema.afterDarkStats.propertyId, prop.id),
            eq(schema.afterDarkStats.cameraSlug, parsed.data.cameraSlug),
          ),
        );

      const inserted = await db
        .insert(schema.afterDarkStats)
        .values(
          parsed.data.stats.map((s) => ({
            propertyId: prop.id,
            cameraSlug: parsed.data.cameraSlug,
            slotIndex: s.slotIndex,
            hourLabel: s.hourLabel,
            baselineValue: s.baselineValue,
            tonightValue: s.tonightValue,
            highlightLabel: s.highlightLabel ?? null,
          })),
        )
        .returning();

      const fullState = await loadPropertyFullState(prop.id);
      if (fullState) {
        broadcastToProperty(prop.id, 'property:synced', fullState);
      }

      res.json({ ok: true, count: inserted.length });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

export async function runAutoAlertSweep(): Promise<void> {
  if (!isDbConfigured()) return;
  const db = getDb();
  const now = new Date();

  const expired = await db
    .select()
    .from(schema.securityEvents)
    .where(
      and(
        eq(schema.securityEvents.status, 'active'),
        isNotNull(schema.securityEvents.autoAlertAt),
        lte(schema.securityEvents.autoAlertAt, now),
      ),
    );

  for (const evt of expired) {
    const [updated] = await db
      .update(schema.securityEvents)
      .set({ status: 'alert_sent', autoAlertAt: null })
      .where(and(eq(schema.securityEvents.id, evt.id), eq(schema.securityEvents.status, 'active')))
      .returning();

    if (updated) {
      const [note] = await db
        .insert(schema.eventNotes)
        .values({
          eventId: updated.id,
          authorUserId: null,
          authorName: 'System Auto-Alert',
          note: 'Auto-alert timer expired. Dispatched alert to monitoring centre.',
        })
        .returning();

      broadcastToProperty(updated.propertyId, 'event:updated', { event: updated });
      broadcastToProperty(updated.propertyId, 'note:created', { note });
    }
  }
}
