import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Video, RotateCcw, RotateCw, Minus, Plus } from 'lucide-react';
import type { TrajectoryPointRecord } from '../types/homesight';

interface HouseScene3DProps {
  trajectory: TrajectoryPointRecord[];
  replayProgress: number; // 0..1
  replayTimeLabel: string;
  gateLabel: string | null;
  gateTimeLabel: string | null;
  residentMarkerLabel: string | null;
  residentMarkerPos: { x: number; y: number; z: number } | null;
  cameraPosition: { x: number; y: number; z: number };
  onCameraClick?: () => void;
}

interface ProjectedOverlay {
  replay: { x: number; y: number; visible: boolean };
  gate: { x: number; y: number; visible: boolean };
  resident: { x: number; y: number; visible: boolean };
  camera: { x: number; y: number; visible: boolean };
}

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

/* ============================================================================
 * PROCEDURAL PBR TEXTURES & SUBTLE BUMP MAPS (Matched to Reference Colors)
 * ============================================================================ */
function createClapboardTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const albedo = document.createElement('canvas');
  albedo.width = 512;
  albedo.height = 512;
  const ctx = albedo.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = 512;
  bump.height = 512;
  const bCtx = bump.getContext('2d')!;

  // Cool moonlit off-white weatherboard (prevents daytime over-brightness at night)
  const plankH = 18;
  for (let y = 0; y < 512; y += plankH) {
    const j = ((y * 7) % 5) - 2;
    const grad = ctx.createLinearGradient(0, y, 0, y + plankH);
    grad.addColorStop(0, `rgb(${156 + j}, ${163 + j}, ${172 + j})`);
    grad.addColorStop(0.18, `rgb(${168 + j}, ${175 + j}, ${184 + j})`);
    grad.addColorStop(0.88, `rgb(${160 + j}, ${167 + j}, ${176 + j})`);
    grad.addColorStop(1, `rgb(${136 + j}, ${143 + j}, ${152 + j})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, 512, plankH);

    ctx.fillStyle = 'rgba(18, 24, 32, 0.22)';
    ctx.fillRect(0, y + plankH - 1.5, 512, 1.5);

    const bGrad = bCtx.createLinearGradient(0, y, 0, y + plankH);
    bGrad.addColorStop(0, '#969696');
    bGrad.addColorStop(0.2, '#e8e8e8');
    bGrad.addColorStop(0.9, '#cfcfcf');
    bGrad.addColorStop(1, '#585858');
    bCtx.fillStyle = bGrad;
    bCtx.fillRect(0, y, 512, plankH);
  }

  const map = new THREE.CanvasTexture(albedo);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(3, 3);
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

function createRoofSlateTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const albedo = document.createElement('canvas');
  albedo.width = 512;
  albedo.height = 512;
  const ctx = albedo.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = 512;
  bump.height = 512;
  const bCtx = bump.getContext('2d')!;

  ctx.fillStyle = '#13171e';
  ctx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = '#606060';
  bCtx.fillRect(0, 0, 512, 512);

  const rowH = 22;
  const colW = 42;
  for (let row = 0; row < 512 / rowH + 1; row++) {
    const y = row * rowH;
    const offset = (row % 2) * (colW / 2);
    for (let col = -1; col < 512 / colW + 1; col++) {
      const x = col * colW + offset;
      const v = 19 + ((row * 17 + col * 31) % 7);
      ctx.fillStyle = `rgb(${v}, ${v + 4}, ${v + 10})`;
      ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
      ctx.fillStyle = 'rgba(6,8,12,0.55)';
      ctx.fillRect(x, y + rowH - 1.5, colW, 1.5);

      const bv = 160 + ((row * 13 + col * 23) % 40);
      bCtx.fillStyle = `rgb(${bv},${bv},${bv})`;
      bCtx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
    }
  }

  const map = new THREE.CanvasTexture(albedo);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(4, 4);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(4, 4);
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

function createGrassTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1b2616';
  ctx.fillRect(0, 0, 512, 512);

  for (let x = 0; x < 512; x += 64) {
    ctx.fillStyle = (x / 64) % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(x, 0, 64, 512);
  }

  for (let i = 0; i < 11000; i++) {
    const x = (i * 73 + (i % 13) * 19) % 512;
    const y = (i * 137 + (i % 7) * 31) % 512;
    const shade =
      i % 4 === 0 ? '#23311c' : i % 4 === 1 ? '#151e11' : i % 4 === 2 ? '#293821' : '#1e2a18';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 2, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4.5, 4.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createPaverTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const bump = document.createElement('canvas');
  bump.width = 512;
  bump.height = 512;
  const bCtx = bump.getContext('2d')!;

  ctx.fillStyle = '#1f2228';
  ctx.fillRect(0, 0, 512, 512);
  bCtx.fillStyle = '#404040';
  bCtx.fillRect(0, 0, 512, 512);

  const w = 32;
  const h = 20;
  for (let row = 0; row < 512 / h + 1; row++) {
    const offset = (row % 2) * (w / 2);
    for (let col = -1; col < 512 / w + 1; col++) {
      const tone = 42 + ((row * 17 + col * 31) % 12);
      ctx.fillStyle = `rgb(${tone}, ${tone + 3}, ${tone + 6})`;
      ctx.fillRect(col * w + offset + 1, row * h + 1, w - 2, h - 2);

      const bt = 165 + ((row * 13 + col * 23) % 45);
      bCtx.fillStyle = `rgb(${bt}, ${bt}, ${bt})`;
      bCtx.fillRect(col * w + offset + 1, row * h + 1, w - 2, h - 2);
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2.5, 4);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bump);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(2.5, 4);
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

function createFlagstoneTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#32363d';
  ctx.fillRect(0, 0, 256, 512);

  const slabH = 64;
  for (let y = 0; y < 512; y += slabH) {
    const shade = 62 + ((y * 19) % 10);
    ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade + 5})`;
    ctx.fillRect(4, y + 3, 248, slabH - 6);
    ctx.fillStyle = '#22252b';
    ctx.fillRect(0, y + slabH - 3, 256, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createWoodDeckTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#4e3726';
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 16) {
    const j = (y * 11) % 8;
    ctx.fillStyle = `rgb(${82 + j}, ${58 + j}, ${40 + j})`;
    ctx.fillRect(0, y, 256, 14);
    ctx.fillStyle = '#24170e';
    ctx.fillRect(0, y + 14, 256, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 2.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function createTimberFenceTexture(maxAniso: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#564433';
  ctx.fillRect(0, 0, 256, 256);

  for (let x = 0; x < 256; x += 16) {
    const j = ((x * 13) % 12) - 6;
    ctx.fillStyle = `rgb(${88 + j}, ${70 + j}, ${54 + j})`;
    ctx.fillRect(x + 1, 0, 14, 256);
    ctx.fillStyle = 'rgba(18, 13, 9, 0.48)';
    ctx.fillRect(x, 0, 1.5, 256);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/* ============================================================================
 * COMPOSITE MULTI-PART HERO MODELS
 * ============================================================================ */
function buildSculptedHatchbackCar(isSoftwareGl: boolean): THREE.Group {
  const carGroup = new THREE.Group();

  const carPaintMat = new THREE.MeshPhysicalMaterial({
    color: 0x5c6573,
    roughness: 0.22,
    metalness: 0.8,
    clearcoat: 0.95,
    clearcoatRoughness: 0.1,
  });
  const trimBlackMat = new THREE.MeshStandardMaterial({
    color: 0x171a20,
    roughness: 0.65,
    metalness: 0.15,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x131922,
    roughness: 0.08,
    metalness: 0.25,
    clearcoat: 1.0,
    opacity: 0.9,
    transparent: true,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x14161a,
    roughness: 0.88,
    metalness: 0.05,
  });
  const alloyMat = new THREE.MeshStandardMaterial({
    color: 0xbcc5d1,
    roughness: 0.24,
    metalness: 0.88,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfff4db,
    emissive: 0xffd58f,
    emissiveIntensity: 0.28,
    roughness: 0.15,
  });
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0x9e1f1f,
    emissive: 0x5c0909,
    emissiveIntensity: 0.35,
    roughness: 0.25,
  });

  // Sleeker lower hatchback profile (Z = length, Y = height)
  const profile = new THREE.Shape();
  profile.moveTo(-1.76, 0.22);
  profile.lineTo(-1.78, 0.56);
  profile.lineTo(-1.58, 0.94);
  profile.lineTo(-1.18, 1.24);
  profile.lineTo(0.22, 1.25);
  profile.lineTo(0.88, 0.86);
  profile.lineTo(1.7, 0.72);
  profile.lineTo(1.84, 0.45);
  profile.lineTo(1.78, 0.2);
  profile.closePath();

  const carWidth = 1.56;
  const bodyGeo = new THREE.ExtrudeGeometry(profile, {
    depth: carWidth,
    bevelEnabled: true,
    bevelThickness: 0.11,
    bevelSize: 0.08,
    bevelSegments: 3,
  });
  bodyGeo.rotateY(-Math.PI / 2);
  bodyGeo.translate(carWidth / 2, 0.04, 0);
  const bodyMesh = new THREE.Mesh(bodyGeo, carPaintMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  carGroup.add(bodyMesh);

  // Dark glasshouse wrap
  const glassProfile = new THREE.Shape();
  glassProfile.moveTo(-1.48, 0.92);
  glassProfile.lineTo(-1.15, 1.19);
  glassProfile.lineTo(0.2, 1.2);
  glassProfile.lineTo(0.82, 0.85);
  glassProfile.lineTo(-1.48, 0.85);
  glassProfile.closePath();

  const glassGeo = new THREE.ExtrudeGeometry(glassProfile, {
    depth: carWidth + 0.08,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 2,
  });
  glassGeo.rotateY(-Math.PI / 2);
  glassGeo.translate((carWidth + 0.08) / 2, 0.04, 0);
  carGroup.add(new THREE.Mesh(glassGeo, glassMat));

  // Front grille, headlights, taillights, side mirrors
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.18, 0.06), trimBlackMat);
  grille.position.set(0, 0.4, 1.88);
  carGroup.add(grille);

  for (const sx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.08), headlightMat);
    hl.position.set(sx, 0.54, 1.85);
    carGroup.add(hl);

    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.11, 0.08), taillightMat);
    tl.position.set(sx, 0.7, -1.8);
    carGroup.add(tl);

    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.12), carPaintMat);
    mirror.position.set(sx * 1.5, 0.84, 0.6);
    carGroup.add(mirror);
  }

  const lowerTrim = new THREE.Mesh(new THREE.BoxGeometry(carWidth + 0.12, 0.13, 3.6), trimBlackMat);
  lowerTrim.position.set(0, 0.24, 0);
  carGroup.add(lowerTrim);

  for (const [wx, wz] of [
    [-0.82, 1.12],
    [0.82, 1.12],
    [-0.82, -1.08],
    [0.82, -1.08],
  ]) {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 24), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(wx, 0.3, wz);
    tire.castShadow = !isSoftwareGl;
    carGroup.add(tire);

    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.24, 16), alloyMat);
    rim.rotation.z = Math.PI / 2;
    rim.position.set(wx, 0.3, wz);
    carGroup.add(rim);
  }

  return carGroup;
}

function buildOrganicTree(
  x: number,
  z: number,
  scale: number,
  seed: number,
  isSoftwareGl: boolean,
): THREE.Group {
  const tree = new THREE.Group();
  tree.position.set(x, 0.04, z);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d2119, roughness: 0.94 });
  const leafMats = [
    new THREE.MeshStandardMaterial({ color: 0x1a2715, roughness: 0.88 }),
    new THREE.MeshStandardMaterial({ color: 0x22331b, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x293c21, roughness: 0.82 }),
  ];

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11 * scale, 0.19 * scale, 1.65 * scale, 8),
    trunkMat,
  );
  trunk.position.y = 0.82 * scale;
  trunk.castShadow = true;
  tree.add(trunk);

  for (let b = 0; b < 3; b++) {
    const angle = (b * Math.PI * 2) / 3 + seed;
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05 * scale, 0.09 * scale, 1.0 * scale, 6),
      trunkMat,
    );
    branch.position.set(
      Math.cos(angle) * 0.28 * scale,
      1.45 * scale,
      Math.sin(angle) * 0.28 * scale,
    );
    branch.rotation.z = -Math.cos(angle) * 0.55;
    branch.rotation.x = Math.sin(angle) * 0.55;
    tree.add(branch);
  }

  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const clusters: Array<[number, number, number, number, number]> = [
    [0, 2.05, 0, 0.84, 0],
    [-0.55, 1.75, 0.35, 0.68, 1],
    [0.58, 1.8, -0.25, 0.72, 2],
    [0.15, 2.48, 0.12, 0.65, 2],
    [-0.38, 2.18, -0.42, 0.62, 1],
    [0.42, 2.15, 0.45, 0.6, 0],
    [-0.75, 1.55, -0.2, 0.54, 0],
    [0.72, 1.58, 0.18, 0.56, 1],
    [0.0, 1.65, 0.68, 0.55, 2],
    [-0.1, 1.72, -0.65, 0.56, 1],
    [-0.25, 2.55, -0.15, 0.5, 2],
    [0.3, 2.42, -0.2, 0.48, 1],
  ];

  clusters.forEach(([ox, oy, oz, r, mIdx]) => {
    const puff = new THREE.Mesh(canopyGeo, leafMats[mIdx % leafMats.length]);
    puff.position.set(ox * scale, oy * scale, oz * scale);
    puff.scale.set(r * scale * 1.12, r * scale * 0.9, r * scale * 1.05);
    puff.rotation.set(seed + ox, seed * 0.7 + oz, oy);
    puff.castShadow = !isSoftwareGl;
    puff.receiveShadow = true;
    tree.add(puff);
  });

  return tree;
}

/* ============================================================================
 * COMPLETE ARCHITECTURAL HOUSE DIORAMA (Exact Shape, Colors & Textures)
 * ============================================================================ */
function buildHouseDiorama(
  scene: THREE.Scene,
  maxAniso: number,
  isSoftwareGl: boolean,
): {
  gateGroup: THREE.Group;
  trajectoryGroup: THREE.Group;
  personMarker: THREE.Group;
  gateDot: THREE.Mesh;
} {
  const world = new THREE.Group();
  scene.add(world);

  const clapboard = createClapboardTextures(maxAniso);
  const roofSlate = createRoofSlateTextures(maxAniso);
  const grassTex = createGrassTexture(maxAniso);
  const paver = createPaverTextures(maxAniso);
  const flagstoneTex = createFlagstoneTexture(maxAniso);
  const woodTex = createWoodDeckTexture(maxAniso);
  const timberFenceTex = createTimberFenceTexture(maxAniso);

  // Materials tuned for deep night moonlight
  const plinthSkirtMat = new THREE.MeshStandardMaterial({ color: 0x1d2026, roughness: 0.88, metalness: 0.05 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.82, metalness: 0.05 });
  const lawnMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.94, metalness: 0.0 });
  const paverMat = new THREE.MeshStandardMaterial({
    map: paver.map,
    bumpMap: paver.bumpMap,
    bumpScale: 0.02,
    roughness: 0.82,
    metalness: 0.05,
  });
  const concretePathMat = new THREE.MeshStandardMaterial({
    map: flagstoneTex,
    roughness: 0.88,
    metalness: 0.03,
  });
  const sidingMat = new THREE.MeshStandardMaterial({
    map: clapboard.map,
    bumpMap: clapboard.bumpMap,
    bumpScale: 0.012,
    roughness: 0.78,
    metalness: 0.02,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    map: roofSlate.map,
    bumpMap: roofSlate.bumpMap,
    bumpScale: 0.025,
    roughness: 0.62,
    metalness: 0.14,
  });
  const trimDarkMat = new THREE.MeshStandardMaterial({ color: 0x15181e, roughness: 0.48, metalness: 0.28 });
  const fasciaWhiteMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.65, metalness: 0.04 });
  const whiteFenceMat = new THREE.MeshStandardMaterial({ color: 0xaeb5bf, roughness: 0.6, metalness: 0.04 });
  const timberFenceMat = new THREE.MeshStandardMaterial({ map: timberFenceTex, roughness: 0.82, metalness: 0.02 });
  const woodDeckMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.68, metalness: 0.04 });
  const clearGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xa5bacf,
    roughness: 0.08,
    metalness: 0.1,
    clearcoat: 1.0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const darkWindowGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x17202b,
    roughness: 0.12,
    metalness: 0.25,
    clearcoat: 0.9,
    transparent: true,
    opacity: 0.78,
  });

  // 1. Stepped Diorama Plinth, Perimeter Concrete Kerb & Lawn
  const plotW = 14.8;
  const plotD = 11.4;
  const plotCenterX = 0.5;
  const plotCenterZ = 0.25;

  const plinthOuter = new THREE.Mesh(new THREE.BoxGeometry(plotW, 0.38, plotD), plinthSkirtMat);
  plinthOuter.position.set(plotCenterX, -0.19, plotCenterZ);
  plinthOuter.receiveShadow = true;
  world.add(plinthOuter);

  const lawn = new THREE.Mesh(new THREE.BoxGeometry(plotW - 0.55, 0.08, plotD - 0.55), lawnMat);
  lawn.position.set(plotCenterX, 0.02, plotCenterZ);
  lawn.receiveShadow = true;
  world.add(lawn);

  const kerbH = 0.14;
  const kerbT = 0.24;
  const addKerb = (x: number, z: number, w: number, d: number) => {
    const k = new THREE.Mesh(new THREE.BoxGeometry(w, kerbH, d), kerbMat);
    k.position.set(x, 0.07, z);
    k.castShadow = true;
    k.receiveShadow = true;
    world.add(k);
  };
  addKerb(-6.78, plotCenterZ, kerbT, plotD); // Left kerb
  addKerb(plotCenterX, -5.33, plotW, kerbT); // Back kerb
  addKerb(7.78, -1.6, kerbT, 7.6); // Right kerb
  addKerb(-5.7, 5.82, 2.35, kerbT); // Front-left kerb
  addKerb(0.3, 5.82, 6.2, kerbT); // Front-center kerb

  // Soft grounded studio contact shadow
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 256;
  shadowCanvas.height = 256;
  const sCtx = shadowCanvas.getContext('2d')!;
  const radGrad = sCtx.createRadialGradient(128, 128, 30, 128, 128, 124);
  radGrad.addColorStop(0, 'rgba(0,0,0,0.88)');
  radGrad.addColorStop(1, 'rgba(0,0,0,0)');
  sCtx.fillStyle = radGrad;
  sCtx.fillRect(0, 0, 256, 256);
  const contactTex = new THREE.CanvasTexture(shadowCanvas);
  const contactPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(19.5, 16),
    new THREE.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false }),
  );
  contactPlane.rotation.x = -Math.PI / 2;
  contactPlane.position.set(plotCenterX, -0.39, plotCenterZ);
  world.add(contactPlane);

  // 2. Side Passage Flagstone Walkway, Entry Path, Stepping Stones & Driveway
  const sideWalkwayMain = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.06, 6.9), concretePathMat);
  sideWalkwayMain.position.set(-4.12, 0.055, 0.75);
  sideWalkwayMain.receiveShadow = true;
  world.add(sideWalkwayMain);

  const entryWalk = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 2.15), concretePathMat);
  entryWalk.position.set(-3.15, 0.055, 4.9);
  entryWalk.rotation.y = 0.42;
  entryWalk.receiveShadow = true;
  world.add(entryWalk);

  for (let i = 0; i < 6; i++) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.04, 0.42), concretePathMat);
    stone.position.set(-4.35 - i * 0.14, 0.055, -2.85 - i * 0.46);
    stone.receiveShadow = true;
    world.add(stone);
  }

  const driveway = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.065, 6.45), paverMat);
  driveway.position.set(5.45, 0.06, 2.65);
  driveway.receiveShadow = true;
  world.add(driveway);

  // 3. Main 2-Story House Architecture (Clean Solid Gable Roof + Steep Pitch)
  const houseGroup = new THREE.Group();
  world.add(houseGroup);

  const wallW = 6.2;
  const wallH = 3.85;
  const wallD = 4.65;
  const halfW = wallW / 2;
  const halfD = wallD / 2;

  const houseBody = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallD), sidingMat);
  houseBody.position.set(0, wallH / 2 + 0.06, 0);
  houseBody.castShadow = true;
  houseBody.receiveShadow = true;
  houseGroup.add(houseBody);

  const houseBaseBand = new THREE.Mesh(
    new THREE.BoxGeometry(wallW + 0.08, 0.25, wallD + 0.08),
    trimDarkMat,
  );
  houseBaseBand.position.set(0, 0.18, 0);
  houseGroup.add(houseBaseBand);

  // Vertical corner trim boards & downspout
  for (const [cx, cz] of [
    [-halfW, halfD],
    [halfW, halfD],
    [-halfW, -halfD],
    [halfW, -halfD],
  ]) {
    const cornerTrim = new THREE.Mesh(new THREE.BoxGeometry(0.13, wallH, 0.13), fasciaWhiteMat);
    cornerTrim.position.set(cx, wallH / 2 + 0.06, cz);
    houseGroup.add(cornerTrim);
  }

  const downspout = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, wallH, 8), trimDarkMat);
  downspout.position.set(-halfW - 0.04, wallH / 2 + 0.06, halfD - 0.14);
  houseGroup.add(downspout);

  // Solid Filled Gable Roof (clean architectural silhouette matching steep European roof)
  const roofOverhangZ = halfD + 0.34;
  const ridgeH = 2.45;
  const roofSolidShape = new THREE.Shape();
  roofSolidShape.moveTo(-roofOverhangZ, 0);
  roofSolidShape.lineTo(0, ridgeH);
  roofSolidShape.lineTo(roofOverhangZ, 0);
  roofSolidShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofSolidShape, {
    depth: wallW + 0.52,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  roofGeo.rotateY(Math.PI / 2);
  roofGeo.translate(-(wallW + 0.52) / 2, wallH + 0.06, 0);
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  houseGroup.add(roofMesh);

  // Gable clapboard triangular end-walls inset cleanly under roof bargeboards
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-halfD, 0);
  gableShape.lineTo(0, ridgeH - 0.2);
  gableShape.lineTo(halfD, 0);
  gableShape.closePath();

  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.18, bevelEnabled: false });
  gableGeo.rotateY(Math.PI / 2);
  const leftGable = new THREE.Mesh(gableGeo, sidingMat);
  leftGable.position.set(-halfW - 0.02, wallH + 0.06, 0);
  houseGroup.add(leftGable);
  const rightGable = new THREE.Mesh(gableGeo, sidingMat);
  rightGable.position.set(halfW - 0.16, wallH + 0.06, 0);
  houseGroup.add(rightGable);

  // Crisp dark ridge cap & front/back eaves gutters
  const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(wallW + 0.58, 0.12, 0.2), trimDarkMat);
  ridgeCap.position.set(0, wallH + ridgeH + 0.06, 0);
  houseGroup.add(ridgeCap);

  for (const gz of [roofOverhangZ - 0.02, -roofOverhangZ + 0.02]) {
    const gutter = new THREE.Mesh(new THREE.BoxGeometry(wallW + 0.54, 0.09, 0.11), trimDarkMat);
    gutter.position.set(0, wallH + 0.03, gz);
    houseGroup.add(gutter);
  }

  // Terracotta-brick chimney + twin chimney pots
  const chimneyMat = new THREE.MeshStandardMaterial({ color: 0x704335, roughness: 0.86, metalness: 0.04 });
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.66, 1.5, 0.66), chimneyMat);
  chimney.position.set(-1.3, wallH + 1.98, -0.42);
  chimney.castShadow = true;
  houseGroup.add(chimney);

  const chimneyCrown = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.09, 0.74), trimDarkMat);
  chimneyCrown.position.set(-1.3, wallH + 2.75, -0.42);
  houseGroup.add(chimneyCrown);

  for (const px of [-1.45, -1.15]) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.095, 0.24, 12),
      new THREE.MeshStandardMaterial({ color: 0x875240, roughness: 0.8 }),
    );
    pot.position.set(px, wallH + 2.88, -0.42);
    houseGroup.add(pot);
  }

  // =========================================================================
  // 4. LIVING ROOM RECESSED 3D INTERIOR + SLIDING GLASS DOORS (Front Wall +Z)
  // =========================================================================
  const lrCenterX = 0.7;
  const lrZ = halfD + 0.01;
  const lrRoomBox = new THREE.Group();
  lrRoomBox.position.set(lrCenterX, 1.12, lrZ - 0.42);
  houseGroup.add(lrRoomBox);

  const warmWallMat = new THREE.MeshStandardMaterial({
    color: 0xa0784f,
    emissive: 0xffa347,
    emissiveIntensity: 0.62,
    roughness: 0.85,
  });
  const lrFloorMat = new THREE.MeshStandardMaterial({
    color: 0x765536,
    emissive: 0x8a511c,
    emissiveIntensity: 0.4,
    roughness: 0.75,
  });
  const lrBack = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.9, 0.08), warmWallMat);
  lrBack.position.set(0, 0, -0.35);
  lrRoomBox.add(lrBack);
  const lrFloor = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 0.82), lrFloorMat);
  lrFloor.position.set(0, -0.92, 0.04);
  lrRoomBox.add(lrFloor);

  // Interior furniture: Sofa, coffee table, glowing floor lamp
  const sofaMat = new THREE.MeshStandardMaterial({ color: 0x3b3835, roughness: 0.9 });
  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.3, 0.46), sofaMat);
  sofaBase.position.set(-0.45, -0.69, -0.04);
  lrRoomBox.add(sofaBase);
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.5, 0.14), sofaMat);
  sofaBack.position.set(-0.45, -0.45, -0.2);
  lrRoomBox.add(sofaBack);
  const coffeeTable = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.17, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x926b47, roughness: 0.55 }),
  );
  coffeeTable.position.set(-0.3, -0.76, 0.24);
  lrRoomBox.add(coffeeTable);

  const floorLampShade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.21, 0.25, 14),
    new THREE.MeshBasicMaterial({ color: 0xffe8b5 }),
  );
  floorLampShade.position.set(1.12, 0.18, -0.05);
  lrRoomBox.add(floorLampShade);
  const floorLampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.98, 8), trimDarkMat);
  floorLampPole.position.set(1.12, -0.38, -0.05);
  lrRoomBox.add(floorLampPole);

  const livingRoomLight = new THREE.PointLight(0xffac52, 5.2, 7.2, 1.65);
  livingRoomLight.position.set(lrCenterX + 0.1, 1.35, lrZ + 0.72);
  houseGroup.add(livingRoomLight);

  const slidingGlass = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.94), clearGlassMat);
  slidingGlass.position.set(lrCenterX, 1.12, lrZ + 0.02);
  houseGroup.add(slidingGlass);

  for (const mx of [lrCenterX - 1.63, lrCenterX - 0.54, lrCenterX + 0.54, lrCenterX + 1.63]) {
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 0.12), trimDarkMat);
    mullion.position.set(mx, 1.12, lrZ + 0.03);
    houseGroup.add(mullion);
  }
  const lrTopBar = new THREE.Mesh(new THREE.BoxGeometry(3.36, 0.09, 0.14), trimDarkMat);
  lrTopBar.position.set(lrCenterX, 2.1, lrZ + 0.03);
  houseGroup.add(lrTopBar);
  const lrBotBar = new THREE.Mesh(new THREE.BoxGeometry(3.36, 0.08, 0.14), trimDarkMat);
  lrBotBar.position.set(lrCenterX, 0.15, lrZ + 0.03);
  houseGroup.add(lrBotBar);

  // Exterior wall sconce left of living room glass doors
  const frontSconce = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.14), trimDarkMat);
  frontSconce.position.set(-1.32, 1.65, lrZ + 0.08);
  houseGroup.add(frontSconce);
  const frontSconceBulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd98e }),
  );
  frontSconceBulb.position.set(-1.32, 1.6, lrZ + 0.09);
  houseGroup.add(frontSconceBulb);
  const frontSconceLight = new THREE.PointLight(0xffb865, 3.2, 4.8, 1.75);
  frontSconceLight.position.set(-1.32, 1.55, lrZ + 0.38);
  houseGroup.add(frontSconceLight);

  // =========================================================================
  // 5. UPSTAIRS WINDOWS ("Emma, upstairs" Glowing Bedroom + Right Window)
  // =========================================================================
  const upLeftX = -1.05;
  const upY = 3.0;
  const upZ = halfD + 0.01;
  const emmaRoomGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.04, 1.04),
    new THREE.MeshStandardMaterial({
      color: 0xffd48f,
      emissive: 0xffa94a,
      emissiveIntensity: 0.78,
      roughness: 0.28,
    }),
  );
  emmaRoomGlow.position.set(upLeftX, upY, upZ + 0.01);
  houseGroup.add(emmaRoomGlow);

  const upLeftFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.18, 0.12), trimDarkMat);
  upLeftFrame.position.set(upLeftX, upY, upZ - 0.01);
  houseGroup.add(upLeftFrame);
  const upLeftMidMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.12, 0.13), trimDarkMat);
  upLeftMidMullion.position.set(upLeftX, upY, upZ + 0.02);
  houseGroup.add(upLeftMidMullion);

  const upRightX = 1.42;
  const upRightFrame = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.12, 0.12), trimDarkMat);
  upRightFrame.position.set(upRightX, upY, upZ - 0.01);
  houseGroup.add(upRightFrame);
  const upRightGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), darkWindowGlassMat);
  upRightGlass.position.set(upRightX, upY, upZ + 0.02);
  houseGroup.add(upRightGlass);
  const upRightMullion = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.06, 0.13), trimDarkMat);
  upRightMullion.position.set(upRightX, upY, upZ + 0.03);
  houseGroup.add(upRightMullion);

  // =========================================================================
  // 6. SIDE PASSAGE LEFT WALL DETAILS
  // =========================================================================
  const sideWallX = -halfW;

  const sideWinFrame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.04, 1.02), trimDarkMat);
  sideWinFrame.position.set(sideWallX - 0.01, 2.05, -1.1);
  houseGroup.add(sideWinFrame);
  const sideWinPane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.88, 0.9),
    new THREE.MeshStandardMaterial({
      color: 0xf4c47d,
      emissive: 0xffa747,
      emissiveIntensity: 0.52,
      roughness: 0.25,
    }),
  );
  sideWinPane.rotation.y = -Math.PI / 2;
  sideWinPane.position.set(sideWallX - 0.09, 2.05, -1.1);
  houseGroup.add(sideWinPane);

  // Exterior Lantern on Side Wall
  const lanternBracket = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), trimDarkMat);
  lanternBracket.position.set(sideWallX - 0.08, 2.15, 0.38);
  houseGroup.add(lanternBracket);
  const lanternCage = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.16), trimDarkMat);
  lanternCage.position.set(sideWallX - 0.15, 2.02, 0.38);
  houseGroup.add(lanternCage);
  const lanternCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.075, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe4a0 }),
  );
  lanternCore.position.set(sideWallX - 0.15, 2.0, 0.38);
  houseGroup.add(lanternCore);

  const sideLanternLight = new THREE.PointLight(0xffb14f, 6.8, 7.6, 1.6);
  sideLanternLight.position.set(sideWallX - 0.48, 1.98, 0.38);
  houseGroup.add(sideLanternLight);

  // Firewood Shed + Stacked Split Logs
  const shedTimberMat = new THREE.MeshStandardMaterial({ color: 0x262321, roughness: 0.82 });
  const logBarkMat = new THREE.MeshStandardMaterial({ color: 0x5c422f, roughness: 0.9 });
  const logEndMat = new THREE.MeshStandardMaterial({ color: 0xc8a377, roughness: 0.84 });

  const woodRoof = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.06, 1.18), shedTimberMat);
  woodRoof.position.set(sideWallX - 0.32, 1.05, 0.38);
  woodRoof.rotation.z = 0.14;
  woodRoof.castShadow = true;
  houseGroup.add(woodRoof);

  for (const lz of [-0.15, 0.9]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.98, 0.06), shedTimberMat);
    post.position.set(sideWallX - 0.6, 0.52, lz);
    houseGroup.add(post);
  }
  const woodBack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.96, 1.12), shedTimberMat);
  woodBack.position.set(sideWallX - 0.04, 0.52, 0.38);
  houseGroup.add(woodBack);

  const logGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.46, 8);
  logGeo.rotateZ(Math.PI / 2);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const log = new THREE.Mesh(logGeo, (row + col) % 2 === 0 ? logBarkMat : logEndMat);
      log.position.set(sideWallX - 0.3, 0.16 + row * 0.14, -0.03 + col * 0.165);
      houseGroup.add(log);
    }
  }

  // Two Dark Wheelie Bins
  const binMat = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.72 });
  for (const bz of [-0.56, -1.04]) {
    const binBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.38), binMat);
    binBody.position.set(sideWallX - 0.28, 0.42, bz);
    binBody.castShadow = true;
    houseGroup.add(binBody);
    const binLid = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.06, 0.41), trimDarkMat);
    binLid.position.set(sideWallX - 0.28, 0.8, bz);
    houseGroup.add(binLid);
  }

  // Coiled Green Hose
  const greenHose = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.045, 10, 22),
    new THREE.MeshStandardMaterial({ color: 0x2c8f52, roughness: 0.48 }),
  );
  greenHose.rotation.y = Math.PI / 2;
  greenHose.position.set(sideWallX - 0.08, 0.65, 1.5);
  houseGroup.add(greenHose);

  // Physical Bullet CCTV Camera mounted on back-left eaves
  const cctvGroup = new THREE.Group();
  cctvGroup.position.set(sideWallX - 0.15, 2.35, -1.98);
  const cctvMount = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), trimDarkMat);
  cctvGroup.add(cctvMount);
  const cctvBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.075, 0.22, 12),
    new THREE.MeshStandardMaterial({ color: 0xe2e5ea, roughness: 0.35, metalness: 0.3 }),
  );
  cctvBody.rotation.x = Math.PI / 2;
  cctvBody.position.set(-0.08, -0.02, 0.08);
  cctvGroup.add(cctvBody);
  houseGroup.add(cctvGroup);

  // =========================================================================
  // 7. WOODEN TERRACE DECK & OUTDOOR BISTRO TABLE + CHAIRS
  // =========================================================================
  const deck = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.12, 1.85), woodDeckMat);
  deck.position.set(0.68, 0.11, halfD + 0.92);
  deck.receiveShadow = true;
  houseGroup.add(deck);

  const bistroTop = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 20), trimDarkMat);
  bistroTop.position.set(0.68, 0.72, halfD + 1.05);
  houseGroup.add(bistroTop);
  const bistroLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.58, 10), trimDarkMat);
  bistroLeg.position.set(0.68, 0.43, halfD + 1.05);
  houseGroup.add(bistroLeg);
  const bistroBase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.03, 14), trimDarkMat);
  bistroBase.position.set(0.68, 0.18, halfD + 1.05);
  houseGroup.add(bistroBase);

  for (const [cx, cz, rotY] of [
    [0.2, halfD + 1.05, 1.3],
    [1.15, halfD + 1.05, -1.3],
  ]) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.3), trimDarkMat);
    seat.position.set(cx, 0.46, cz);
    seat.rotation.y = rotY;
    houseGroup.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.04), trimDarkMat);
    back.position.set(cx - Math.sin(rotY) * 0.13, 0.64, cz - Math.cos(rotY) * 0.13);
    back.rotation.y = rotY;
    houseGroup.add(back);
  }

  // =========================================================================
  // 8. POINTED WHITE PICKET FENCE, OPEN SIDE GATE & FRONT HEDGE BORDER
  // =========================================================================
  const fenceGroup = new THREE.Group();
  world.add(fenceGroup);

  const picketShape = new THREE.Shape();
  picketShape.moveTo(-0.065, 0);
  picketShape.lineTo(0.065, 0);
  picketShape.lineTo(0.065, 0.8);
  picketShape.lineTo(0, 0.94);
  picketShape.lineTo(-0.065, 0.8);
  picketShape.closePath();

  const picketGeo = new THREE.ExtrudeGeometry(picketShape, { depth: 0.045, bevelEnabled: false });
  picketGeo.rotateY(Math.PI / 2);

  const fenceX = -5.05;
  for (let z = -2.2; z <= 4.05; z += 0.24) {
    const picket = new THREE.Mesh(picketGeo, whiteFenceMat);
    picket.position.set(fenceX - 0.02, 0.06, z);
    picket.castShadow = true;
    fenceGroup.add(picket);
  }
  const sideRailTop = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 6.4), whiteFenceMat);
  sideRailTop.position.set(fenceX, 0.76, 0.92);
  fenceGroup.add(sideRailTop);
  const sideRailBot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 6.4), whiteFenceMat);
  sideRailBot.position.set(fenceX, 0.28, 0.92);
  fenceGroup.add(sideRailBot);

  for (const [px, pz] of [
    [fenceX, -2.25],
    [fenceX, 1.0],
    [fenceX, 4.12],
    [-3.1, 4.12],
  ]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.06, 0.14), whiteFenceMat);
    post.position.set(px, 0.57, pz);
    post.castShadow = true;
    fenceGroup.add(post);
  }

  // Hinged White Picket Gate swung open cleanly at z = 4.12
  const gateGroup = new THREE.Group();
  gateGroup.position.set(fenceX + 0.14, 0, 4.12);
  gateGroup.rotation.y = 0.85;
  for (let i = 0; i < 5; i++) {
    const gPicket = new THREE.Mesh(picketGeo, whiteFenceMat);
    gPicket.rotation.y = Math.PI / 2;
    gPicket.position.set(0.18 + i * 0.22, 0.06, 0.02);
    gPicket.castShadow = true;
    gateGroup.add(gPicket);
  }
  const gRailTop = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.07, 0.07), whiteFenceMat);
  gRailTop.position.set(0.62, 0.74, 0);
  gateGroup.add(gRailTop);
  const gRailBot = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.07, 0.07), whiteFenceMat);
  gRailBot.position.set(0.62, 0.28, 0);
  gateGroup.add(gRailBot);
  world.add(gateGroup);

  // Low trimmed green border hedge connecting house front-left corner to gate post (no boxy fence blocking!)
  const borderHedgeMat = new THREE.MeshStandardMaterial({ color: 0x1d2b18, roughness: 0.9 });
  for (let z = 2.65; z <= 3.95; z += 0.42) {
    const hedgePuff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), borderHedgeMat);
    hedgePuff.position.set(-2.98, 0.3, z);
    hedgePuff.scale.set(0.95, 0.85, 1.1);
    hedgePuff.castShadow = !isSoftwareGl;
    world.add(hedgePuff);
  }

  // =========================================================================
  // 9. CEDAR TIMBER PERIMETER FENCE WITH POSTS, SHED, CAR, TREES & SHRUBS
  // =========================================================================
  const backFence = new THREE.Mesh(new THREE.BoxGeometry(12.8, 1.25, 0.1), timberFenceMat);
  backFence.position.set(1.2, 0.66, -4.95);
  backFence.castShadow = true;
  world.add(backFence);

  const rightFence = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.25, 7.6), timberFenceMat);
  rightFence.position.set(7.52, 0.66, -1.15);
  rightFence.castShadow = true;
  world.add(rightFence);

  // Fence posts along cedar fence
  const fencePostMat = new THREE.MeshStandardMaterial({ color: 0x5c4734, roughness: 0.85 });
  for (let fx = -4.8; fx <= 7.5; fx += 1.75) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.32, 0.14), fencePostMat);
    p.position.set(fx, 0.68, -4.95);
    world.add(p);
  }
  for (let fz = -4.9; fz <= 2.6; fz += 1.85) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.32, 0.14), fencePostMat);
    p.position.set(7.52, 0.68, fz);
    world.add(p);
  }

  // Back-left Garden Shed
  const shedGroup = new THREE.Group();
  shedGroup.position.set(-4.95, 0.06, -4.15);
  const shedBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.65, 1.5, 1.35),
    new THREE.MeshStandardMaterial({ color: 0x3d434d, roughness: 0.84 }),
  );
  shedBody.position.y = 0.75;
  shedBody.castShadow = true;
  shedGroup.add(shedBody);
  const shedRoof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.16, 1.55), roofMat);
  shedRoof.position.y = 1.55;
  shedRoof.rotation.z = 0.11;
  shedGroup.add(shedRoof);
  world.add(shedGroup);

  // Sculpted Parked Hatchback Car on Driveway
  const car = buildSculptedHatchbackCar(isSoftwareGl);
  car.position.set(5.45, 0.08, 1.75);
  car.rotation.y = 0.05;
  world.add(car);

  // Organic Trees
  world.add(buildOrganicTree(-5.65, -2.55, 1.28, 0.4, isSoftwareGl));
  world.add(buildOrganicTree(4.35, -3.75, 1.12, 1.7, isSoftwareGl));
  world.add(buildOrganicTree(6.45, -2.65, 0.88, 2.9, isSoftwareGl));
  world.add(buildOrganicTree(-2.1, -4.15, 0.92, 4.1, isSoftwareGl));

  const hedgeDarkMat = new THREE.MeshStandardMaterial({ color: 0x1a2615, roughness: 0.9 });
  const shrubMidMat = new THREE.MeshStandardMaterial({ color: 0x22331b, roughness: 0.86 });

  for (let hx = -3.2; hx <= 6.8; hx += 0.95) {
    const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), hedgeDarkMat);
    h.position.set(hx, 0.38, -4.5);
    h.scale.set(1.2, 0.85, 0.9);
    world.add(h);
  }

  const addBoxwoodShrub = (x: number, z: number, r: number) => {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 2), shrubMidMat);
    s.position.set(x, r * 0.62 + 0.04, z);
    s.scale.set(1.22, 0.78, 1.14);
    s.castShadow = !isSoftwareGl;
    s.receiveShadow = true;
    world.add(s);
  };

  addBoxwoodShrub(-1.85, 4.45, 0.48);
  addBoxwoodShrub(2.95, 4.42, 0.44);
  addBoxwoodShrub(3.52, 3.35, 0.36);
  addBoxwoodShrub(-5.85, 3.85, 0.42);
  addBoxwoodShrub(-5.95, 1.65, 0.38);

  // =========================================================================
  // 10. DYNAMIC TRAJECTORY LINE, GATE DOT & PERSON MARKER
  // =========================================================================
  const trajectoryGroup = new THREE.Group();
  world.add(trajectoryGroup);

  const gateDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 14, 14),
    new THREE.MeshBasicMaterial({ color: 0xf25c19 }),
  );
  gateDot.visible = false;
  world.add(gateDot);

  const personMarker = new THREE.Group();
  const ringOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.25, 0.05, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const ringInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.075, 24),
    new THREE.MeshBasicMaterial({ color: 0xf25c19 }),
  );
  personMarker.add(ringOuter, ringInner);
  personMarker.visible = false;
  world.add(personMarker);

  return { gateGroup, trajectoryGroup, personMarker, gateDot };
}

/* ============================================================================
 * REACT VIEWPORT COMPONENT
 * ============================================================================ */
export function HouseScene3D({
  trajectory,
  replayProgress,
  replayTimeLabel,
  gateLabel,
  gateTimeLabel,
  residentMarkerLabel,
  residentMarkerPos,
  cameraPosition,
  onCameraClick,
}: HouseScene3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<'model' | 'plan'>('model');
  const [zoomPercent, setZoomPercent] = useState(88);
  const [webglFallback, setWebglFallback] = useState(false);

  const [overlays, setOverlays] = useState<ProjectedOverlay>({
    replay: { x: 0, y: 0, visible: false },
    gate: { x: 0, y: 0, visible: false },
    resident: { x: 0, y: 0, visible: false },
    camera: { x: 0, y: 0, visible: false },
  });

  const sceneControlRef = useRef<{
    requestRender: () => void;
    setViewModeTarget: (mode: 'model' | 'plan') => void;
    adjustZoom: (delta: number) => void;
    rotateAzimuth: (rad: number) => void;
    updateTrajectoryMesh: (pts: TrajectoryPointRecord[], progress: number) => void;
  } | null>(null);

  const latestPropsRef = useRef({
    trajectory,
    replayProgress,
    residentMarkerPos,
    cameraPosition,
  });
  latestPropsRef.current = {
    trajectory,
    replayProgress,
    residentMarkerPos,
    cameraPosition,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglFallback(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.84;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x0b0c0e, 1);

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 480;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0c0e);
    scene.fog = new THREE.FogExp2(0x0b0c0e, 0.012);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.22;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 120);
    const defaultCamPos = new THREE.Vector3(-9.4, 8.6, 12.1);
    const defaultTarget = new THREE.Vector3(0.35, 1.15, 0.35);
    camera.position.copy(defaultCamPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(defaultTarget);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6.5;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.minPolarAngle = 0.04;
    controls.update();

    // True Midnight Moonlight Rig (deep nocturnal shadow contrast + crisp warm light pools)
    const hemiLight = new THREE.HemisphereLight(0x364d6b, 0x0a0c0f, 0.38);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0x8faed4, 0.65);
    keyLight.position.set(-8.5, 16, 11);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -11;
    keyLight.shadow.camera.right = 11;
    keyLight.shadow.camera.top = 11;
    keyLight.shadow.camera.bottom = -11;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x556f91, 0.28);
    rimLight.position.set(10, 8, -10);
    scene.add(rimLight);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const { trajectoryGroup, personMarker, gateDot } = buildHouseDiorama(
      scene,
      maxAniso,
      isSoftwareGl,
    );

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const _projVec = new THREE.Vector3();
    const _upAxis = new THREE.Vector3(0, 1, 0);
    const _offsetVec = new THREE.Vector3();
    let cameraGoal: THREE.Vector3 | null = null;
    let targetGoal: THREE.Vector3 | null = null;
    let targetAzimuthDelta = 0;

    const activeHeadPos = new THREE.Vector3(-4.35, 0.16, -0.6);
    const fallbackGatePos = new THREE.Vector3(-3.5, 0.16, 4.1);

    const projectWorld = (worldPos: THREE.Vector3, w: number, h: number) => {
      _projVec.copy(worldPos).project(camera);
      const visible = _projVec.z >= -1 && _projVec.z <= 1;
      return {
        x: ((_projVec.x + 1) / 2) * w,
        y: (-(_projVec.y - 1) / 2) * h,
        visible,
      };
    };

    const syncOverlays = () => {
      const w = container.clientWidth || 900;
      const h = container.clientHeight || 480;
      const { trajectory: traj, residentMarkerPos: resPos, cameraPosition: camPos } =
        latestPropsRef.current;

      const labeledPt = traj.find((p) => Boolean(p.label));
      const gPos = labeledPt
        ? new THREE.Vector3(labeledPt.x, (labeledPt.y || 0.14) + 0.05, labeledPt.z)
        : fallbackGatePos;

      const rPos = resPos
        ? new THREE.Vector3(resPos.x, resPos.y, resPos.z)
        : new THREE.Vector3(-1.05, 3.05, 2.38);
      const cPos = new THREE.Vector3(camPos.x, camPos.y, camPos.z);

      setOverlays({
        replay: { ...projectWorld(activeHeadPos, w, h), visible: personMarker.visible },
        gate: projectWorld(gPos, w, h),
        resident: projectWorld(rPos, w, h),
        camera: projectWorld(cPos, w, h),
      });

      const dist = camera.position.distanceTo(controls.target);
      const pct = Math.round(
        THREE.MathUtils.clamp(((26 - dist) / (26 - 6.5)) * 100 + 30, 40, 160),
      );
      setZoomPercent(pct);
    };

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        let animating = false;
        if (cameraGoal && targetGoal) {
          camera.position.lerp(cameraGoal, 0.14);
          controls.target.lerp(targetGoal, 0.14);
          if (camera.position.distanceTo(cameraGoal) < 0.05) {
            camera.position.copy(cameraGoal);
            controls.target.copy(targetGoal);
            cameraGoal = null;
            targetGoal = null;
          } else {
            animating = true;
          }
        }

        if (Math.abs(targetAzimuthDelta) > 0.004) {
          const step = targetAzimuthDelta * 0.16;
          targetAzimuthDelta -= step;
          _offsetVec.copy(camera.position).sub(controls.target);
          _offsetVec.applyAxisAngle(_upAxis, step);
          camera.position.copy(controls.target).add(_offsetVec);
          animating = true;
        }

        controls.update();
        renderer.render(scene, camera);
        syncOverlays();

        const done = () => {
          renderBusy = false;
          if (renderDirty || animating) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const updateTrajectoryMesh = (pts: TrajectoryPointRecord[], progress: number) => {
      while (trajectoryGroup.children.length > 0) {
        const child = trajectoryGroup.children[0] as THREE.Mesh;
        child.geometry?.dispose();
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
        trajectoryGroup.remove(child);
      }

      const labeledPt = pts?.find((p) => Boolean(p.label));
      if (labeledPt) {
        gateDot.position.set(labeledPt.x, (labeledPt.y || 0.14) + 0.04, labeledPt.z);
        gateDot.visible = true;
      } else {
        gateDot.visible = false;
      }

      if (!pts || pts.length === 0) {
        personMarker.visible = false;
        requestRender();
        return;
      }

      if (pts.length === 1) {
        const single = pts[0];
        const y = single.y || 0.14;
        activeHeadPos.set(single.x, y, single.z);
        personMarker.position.set(single.x, y + 0.03, single.z);
        personMarker.visible = true;
        requestRender();
        return;
      }

      const rawVectors = pts.map((p) => new THREE.Vector3(p.x, p.y || 0.14, p.z));
      const fullCurve = new THREE.CatmullRomCurve3(rawVectors, false, 'catmullrom', 0.2);

      const clampedProgress = THREE.MathUtils.clamp(progress, 0.05, 1);
      const sampleCount = Math.max(8, Math.round(48 * clampedProgress));
      const slicedPts: THREE.Vector3[] = [];
      for (let i = 0; i <= sampleCount; i++) {
        const t = (i / sampleCount) * clampedProgress;
        slicedPts.push(fullCurve.getPoint(t));
      }

      const activeCurve = new THREE.CatmullRomCurve3(slicedPts);
      const tubeGeo = new THREE.TubeGeometry(activeCurve, Math.max(12, sampleCount), 0.06, 8, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0xf25c19 });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      trajectoryGroup.add(tubeMesh);

      const head = slicedPts[slicedPts.length - 1];
      activeHeadPos.copy(head);
      personMarker.position.set(head.x, head.y + 0.03, head.z);
      personMarker.visible = true;

      requestRender();
    };

    controls.addEventListener('start', () => {
      cameraGoal = null;
      targetGoal = null;
      targetAzimuthDelta = 0;
    });

    controls.addEventListener('change', () => {
      requestRender();
    });

    const handleResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 900;
      const h = container.clientHeight || 480;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', handleResize);

    const canvasEl = renderer.domElement;
    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFallback(true);
    };
    const onContextRestored = () => {
      setWebglFallback(false);
      requestRender();
    };
    canvasEl.addEventListener('webglcontextlost', onContextLost);
    canvasEl.addEventListener('webglcontextrestored', onContextRestored);

    sceneControlRef.current = {
      requestRender,
      setViewModeTarget: (mode) => {
        if (mode === 'plan') {
          cameraGoal = new THREE.Vector3(0.35, 21.5, 0.36);
          targetGoal = new THREE.Vector3(0.35, 0, 0.35);
        } else {
          cameraGoal = defaultCamPos.clone();
          targetGoal = defaultTarget.clone();
        }
        requestRender();
      },
      adjustZoom: (delta) => {
        const dir = camera.position.clone().sub(controls.target);
        const currentDist = dir.length();
        const nextDist = THREE.MathUtils.clamp(currentDist + delta, 6.5, 26);
        dir.setLength(nextDist);
        camera.position.copy(controls.target).add(dir);
        requestRender();
      },
      rotateAzimuth: (rad) => {
        targetAzimuthDelta += rad;
        requestRender();
      },
      updateTrajectoryMesh,
    };

    updateTrajectoryMesh(latestPropsRef.current.trajectory, latestPropsRef.current.replayProgress);
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvasEl.removeEventListener('webglcontextlost', onContextLost);
      canvasEl.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      renderer.dispose();
      sceneControlRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneControlRef.current?.updateTrajectoryMesh(trajectory, replayProgress);
  }, [trajectory, replayProgress]);

  const handleViewSwitch = (mode: 'model' | 'plan') => {
    setViewMode(mode);
    sceneControlRef.current?.setViewModeTarget(mode);
  };

  return (
    <div className="relative w-full h-[360px] sm:h-[430px] lg:h-[470px] bg-[#0D0F12] overflow-hidden select-none">
      {/* Top-Left Model/Plan + Zoom + Rotate Toolbar */}
      <div className="absolute top-3 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
        <div className="flex items-center p-0.5 bg-[#15171B]/95 border border-[#24272E] rounded-lg">
          <button
            type="button"
            onClick={() => handleViewSwitch('model')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'model'
                ? 'bg-[#252830] text-white'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            Model
          </button>
          <button
            type="button"
            onClick={() => handleViewSwitch('plan')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'plan'
                ? 'bg-[#252830] text-white'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            Plan
          </button>
        </div>

        <div className="flex items-center bg-[#15171B]/95 border border-[#24272E] rounded-lg px-1.5 py-1 gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => sceneControlRef.current?.adjustZoom(1.4)}
            className="p-0.5 text-[#9CA3AF] hover:text-white transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-medium text-[#E5E7EB] tabular-nums min-w-[34px] text-center">
            {zoomPercent}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => sceneControlRef.current?.adjustZoom(-1.4)}
            className="p-0.5 text-[#9CA3AF] hover:text-white transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center bg-[#15171B]/95 border border-[#24272E] rounded-lg divide-x divide-[#24272E]">
          <button
            type="button"
            aria-label="Rotate left"
            onClick={() => sceneControlRef.current?.rotateAzimuth(-0.45)}
            className="p-1.5 text-[#9CA3AF] hover:text-white transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            aria-label="Rotate right"
            onClick={() => sceneControlRef.current?.rotateAzimuth(0.45)}
            className="p-1.5 text-[#9CA3AF] hover:text-white transition-colors"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dedicated Isolated WebGL Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {webglFallback && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0D0F12] text-sm text-[#9CA3AF]">
          3D spatial preview unavailable on this device. Switch to Events or camera feeds below.
        </div>
      )}

      {/* World-to-Screen Spatial Callouts */}
      {!webglFallback && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {/* Camera Wall Pin */}
          {overlays.camera.visible && (
            <button
              type="button"
              onClick={onCameraClick}
              title="Focus Side Passage Camera"
              style={{
                transform: `translate(${overlays.camera.x - 14}px, ${overlays.camera.y - 14}px)`,
              }}
              className="pointer-events-auto absolute top-0 left-0 w-7 h-7 rounded-full bg-[#1C120E]/95 border border-[#F25C19] flex items-center justify-center text-[#F25C19] shadow-lg hover:scale-110 transition-transform"
            >
              <Video className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Emma, upstairs resident pin */}
          {residentMarkerLabel && overlays.resident.visible && (
            <div
              style={{
                transform: `translate(${overlays.resident.x + 26}px, ${overlays.resident.y - 26}px)`,
              }}
              className="absolute top-0 left-0 flex items-center"
            >
              <svg className="w-7 h-6 -ml-7 mr-0.5 overflow-visible" viewBox="0 0 28 24">
                <polyline
                  points="0,22 12,10 28,10"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeOpacity="0.6"
                  strokeWidth="1.2"
                />
                <circle cx="0" cy="22" r="3" fill="#34D399" />
              </svg>
              <div className="flex items-center gap-2 bg-[#16181D]/95 border border-[#2C3039] rounded-lg px-2.5 py-1 shadow-lg whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
                <span className="text-xs font-medium text-[#F3F4F6]">{residentMarkerLabel}</span>
              </div>
            </div>
          )}

          {/* Active Replay Person Timestamp Pin */}
          {overlays.replay.visible && (
            <div
              style={{
                transform: `translate(${Math.max(12, overlays.replay.x - 148)}px, ${overlays.replay.y - 14}px)`,
              }}
              className="absolute top-0 left-0 flex items-center gap-2 bg-[#16181D]/95 border border-[#2C3039] rounded-lg px-2.5 py-1 shadow-lg whitespace-nowrap"
            >
              <span className="text-xs font-medium text-[#F25C19] tabular-nums">
                {replayTimeLabel}
              </span>
              <span className="text-xs font-medium text-[#F3F4F6]">Replay</span>
            </div>
          )}

          {/* Side Gate Opened Event Pin */}
          {gateLabel && gateTimeLabel && overlays.gate.visible && (
            <div
              style={{
                transform: `translate(${Math.max(12, overlays.gate.x - 165)}px, ${overlays.gate.y + 24}px)`,
              }}
              className="absolute top-0 left-0 flex items-center"
            >
              <div className="flex items-center gap-2 bg-[#16181D]/95 border border-[#2C3039] rounded-lg px-2.5 py-1 shadow-lg whitespace-nowrap">
                <span className="text-xs font-medium text-[#F25C19] tabular-nums">
                  {gateTimeLabel}
                </span>
                <span className="text-xs font-medium text-[#E5E7EB]">{gateLabel}</span>
              </div>
              <svg className="w-5 h-7 -mt-6 ml-0.5 overflow-visible" viewBox="0 0 20 28">
                <polyline
                  points="0,18 14,18 14,-2"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeOpacity="0.55"
                  strokeWidth="1.1"
                />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
