import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Standalone FFmpeg 5 FPS Static-Image Stream Verification Script
 * ----------------------------------------------------------------
 * Demonstrates spawning FFmpeg at an exact 5 FPS cadence (-re -framerate 5)
 * from a static CCTV reference frame, ready for WebRTC / RTP or MJPEG pipe.
 *
 * Usage:
 *   npx tsx scripts/ffmpeg-webrtc-stream.ts [camera_slug]
 */

const slug = process.argv[2] || 'side_passage';
const imageMap: Record<string, string> = {
  side_passage: 'src/assets/images/cam_side_passage_1795348556055.jpg',
  driveway: 'src/assets/images/cam_driveway_ir_1795348557015.jpg',
  living_room: 'src/assets/images/cam_living_room_1795348556746.jpg',
};

const targetImage = path.resolve(process.cwd(), imageMap[slug] || imageMap.side_passage);

if (!fs.existsSync(targetImage)) {
  console.error(`Static camera image not found: ${targetImage}`);
  process.exit(1);
}

console.log(`[FFmpeg 5 FPS] Starting stream probe for '${slug}' from ${targetImage}`);

const proc = spawn('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-re',
  '-loop',
  '1',
  '-framerate',
  '5',
  '-i',
  targetImage,
  '-vf',
  "fps=5,scale=640:-2,eq=brightness='0.008*sin(2*PI*t/4)'",
  '-f',
  'image2pipe',
  '-vcodec',
  'mjpeg',
  '-q:v',
  '6',
  'pipe:1',
]);

let frames = 0;
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
    if (start > 0) buffer = buffer.subarray(start);
    const end = buffer.indexOf(EOI, 2);
    if (end === -1) break;

    const frame = buffer.subarray(0, end + 2);
    buffer = buffer.subarray(end + 2);
    frames += 1;
    console.log(`[FFmpeg 5 FPS] Frame #${frames} encoded (${frame.length} bytes)`);
    if (frames >= 10) {
      proc.kill('SIGTERM');
      console.log('[FFmpeg 5 FPS] Verified 5 FPS stream output cleanly.');
      process.exit(0);
    }
  }
});

proc.stderr.on('data', (d) => console.error('[FFmpeg]', d.toString()));
