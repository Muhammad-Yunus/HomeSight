import 'dotenv/config';

/**
 * External System Ingest Simulator for Home Sight
 * ------------------------------------------------
 * Sends real HTTP requests authenticated via X-API-Key to /api/ingest/*
 * (never generates dummy data inside the browser or backend).
 *
 * Usage:
 *   INGEST_API_KEY=<your_key> npx tsx scripts/simulate-ingest.ts --seed
 *   INGEST_API_KEY=<your_key> npx tsx scripts/simulate-ingest.ts --live
 */

const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};

const BASE_URL = (getArg('--url') || process.env.INGEST_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const API_KEY = getArg('--api-key') || process.env.INGEST_API_KEY || '';
const RUN_LIVE = args.includes('--live');
const RUN_SEED = args.includes('--seed') || !RUN_LIVE;

if (!API_KEY) {
  console.error('Error: Missing INGEST_API_KEY env var or --api-key argument.');
  process.exit(1);
}

async function postIngest<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Ingest ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runSeedIngest() {
  console.log(`[Simulator] Pushing property topology to ${BASE_URL}/api/ingest/bootstrap ...`);

  const afterDarkHistogram = [
    { cameraSlug: 'side_passage', slotIndex: 0, hourLabel: '18:00', baselineValue: 2, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 1, hourLabel: '18:30', baselineValue: 5, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 2, hourLabel: '19:00', baselineValue: 8, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 3, hourLabel: '19:30', baselineValue: 8, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 4, hourLabel: '20:00', baselineValue: 6, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 5, hourLabel: '20:30', baselineValue: 6, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 6, hourLabel: '21:00', baselineValue: 5, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 7, hourLabel: '21:30', baselineValue: 4, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 8, hourLabel: '22:00', baselineValue: 3, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 9, hourLabel: '22:30', baselineValue: 2, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 10, hourLabel: '23:00', baselineValue: 0, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 11, hourLabel: '23:38', baselineValue: 0, tonightValue: 7, highlightLabel: 'Tonight 23:38' },
    { cameraSlug: 'side_passage', slotIndex: 12, hourLabel: '00:00', baselineValue: 0, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 13, hourLabel: '01:00', baselineValue: 0, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 14, hourLabel: '02:00', baselineValue: 0, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 15, hourLabel: '03:00', baselineValue: 0, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 16, hourLabel: '04:00', baselineValue: 0, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 17, hourLabel: '05:00', baselineValue: 1, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 18, hourLabel: '05:30', baselineValue: 1, tonightValue: 0, highlightLabel: null },
    { cameraSlug: 'side_passage', slotIndex: 19, hourLabel: '06:00', baselineValue: 2, tonightValue: 0, highlightLabel: null },
  ];

  await postIngest('/api/ingest/bootstrap', {
    property: {
      slug: '27-alder-road',
      name: '27 Alder Road',
      securityMode: 'armed_night',
      autoAlertSeconds: 45,
    },
    cameras: [
      {
        slug: 'side_passage',
        name: 'Side passage',
        status: 'person_in_view',
        positionX: -3.55,
        positionY: 2.35,
        positionZ: -2.0,
        staticImagePath: '/src/assets/images/cam_side_passage_1795348556055.jpg',
        personBox: { x: 0.56, y: 0.16, w: 0.12, h: 0.68 },
      },
      {
        slug: 'driveway',
        name: 'Driveway',
        status: 'clear',
        positionX: 3.55,
        positionY: 2.55,
        positionZ: 2.5,
        staticImagePath: '/src/assets/images/cam_driveway_ir_1795348557015.jpg',
        personBox: null,
      },
      {
        slug: 'living_room',
        name: 'Living room',
        status: 'clear',
        positionX: 0.8,
        positionY: 2.2,
        positionZ: 1.5,
        staticImagePath: '/src/assets/images/cam_living_room_1795348556746.jpg',
        personBox: null,
      },
    ],
    residents: [
      {
        slug: 'emma-novak',
        name: 'Emma Novak',
        locationLabel: 'Upstairs bedroom',
        isHome: true,
        distanceKm: null,
        alertStatus: 'sent',
        avatarUrl: '/src/assets/images/avatar_emma_novak_1795348557956.jpg',
        marker3d: { x: -1.1, y: 3.4, z: 2.85 },
      },
      {
        slug: 'peter-novak',
        name: 'Peter Novak',
        locationLabel: 'Guest room',
        isHome: true,
        distanceKm: null,
        alertStatus: 'sent',
        avatarUrl: '/src/assets/images/avatar_peter_novak_1795348556691.jpg',
        marker3d: null,
      },
      {
        slug: 'daniel-novak',
        name: 'Daniel Novak',
        locationLabel: 'You, 14 km away',
        isHome: false,
        distanceKm: 14,
        alertStatus: 'none',
        avatarUrl: '/src/assets/images/avatar_daniel_novak_1795348557093.jpg',
        marker3d: null,
      },
    ],
    afterDarkStats: afterDarkHistogram,
  });

  console.log('[Simulator] Ingesting side passage intrusion event ...');
  const todayBase = '2026-11-22';
  await postIngest('/api/ingest/events', {
    externalEventId: 'evt_alder_20261122_2338',
    propertySlug: '27-alder-road',
    cameraSlug: 'side_passage',
    title: 'Unknown person in the side passage',
    personLabel: 'Unknown person',
    recognitionStatus: 'not_recognised',
    matchConfidence: 94,
    enteredAt: `${todayBase}T23:38:00Z`,
    snapshotUrl: '/src/assets/images/cam_side_person_1795348556430.jpg',
    autoAlertSeconds: 45,
    gateOpenedAt: `${todayBase}T23:38:00Z`,
    gateLabel: 'Side gate opened',
    personBox: { x: 0.56, y: 0.16, w: 0.12, h: 0.68 },
    trajectory: [
      { x: -2.6, y: 0.14, z: 5.5, recordedAt: `${todayBase}T23:37:50Z`, label: null, cameraDetected: false },
      { x: -3.5, y: 0.14, z: 4.1, recordedAt: `${todayBase}T23:38:00Z`, label: 'Side gate opened', cameraDetected: false },
      { x: -4.25, y: 0.14, z: 2.35, recordedAt: `${todayBase}T23:38:45Z`, label: null, cameraDetected: false },
      { x: -4.35, y: 0.14, z: 1.25, recordedAt: `${todayBase}T23:39:30Z`, label: null, cameraDetected: true },
      { x: -4.35, y: 0.14, z: -0.35, recordedAt: `${todayBase}T23:40:10Z`, label: null, cameraDetected: true },
      { x: -4.35, y: 0.14, z: -1.45, recordedAt: `${todayBase}T23:40:42Z`, label: null, cameraDetected: true },
    ],
  });

  console.log('[Simulator] Seed ingest completed cleanly.');
}

async function runLiveIngest() {
  const evtId = `evt_live_${Date.now()}`;
  const baseTs = new Date('2026-11-22T23:38:00Z').getTime();

  console.log(`[Simulator] Starting live streaming ingest (${evtId}) ...`);
  await postIngest('/api/ingest/events', {
    externalEventId: evtId,
    propertySlug: '27-alder-road',
    cameraSlug: 'side_passage',
    title: 'Unknown person in the side passage',
    personLabel: 'Unknown person',
    recognitionStatus: 'not_recognised',
    matchConfidence: 94,
    enteredAt: new Date(baseTs).toISOString(),
    snapshotUrl: '/src/assets/images/cam_side_person_1795348556430.jpg',
    autoAlertSeconds: 45,
    gateOpenedAt: new Date(baseTs).toISOString(),
    gateLabel: 'Side gate opened',
    trajectory: [
      { x: -2.6, y: 0.14, z: 5.5, recordedAt: new Date(baseTs - 10000).toISOString(), cameraDetected: false },
      { x: -3.5, y: 0.14, z: 4.1, recordedAt: new Date(baseTs).toISOString(), label: 'Side gate opened', cameraDetected: false },
    ],
  });

  const steps = [
    { x: -4.25, z: 2.35, offsetSec: 45, detected: false, box: null },
    { x: -4.35, z: 1.25, offsetSec: 90, detected: true, box: { x: 0.48, y: 0.2, w: 0.09, h: 0.54 } },
    { x: -4.35, z: -0.35, offsetSec: 130, detected: true, box: { x: 0.53, y: 0.18, w: 0.11, h: 0.62 } },
    { x: -4.35, z: -1.45, offsetSec: 162, detected: true, box: { x: 0.56, y: 0.16, w: 0.12, h: 0.68 } },
  ];

  for (const step of steps) {
    await sleep(1800);
    await postIngest(`/api/ingest/events/${evtId}/trajectory`, {
      x: step.x,
      y: 0.14,
      z: step.z,
      recordedAt: new Date(baseTs + step.offsetSec * 1000).toISOString(),
      cameraDetected: step.detected,
      personBox: step.box,
    });
    console.log(`[Simulator] Pushed trajectory point x=${step.x}, z=${step.z}, detected=${step.detected}`);
  }
}

async function main() {
  if (RUN_SEED) {
    await runSeedIngest();
  }
  if (RUN_LIVE) {
    await runLiveIngest();
  }
}

main().catch((err) => {
  console.error('[Simulator] Fatal error:', err.message);
  process.exit(1);
});
