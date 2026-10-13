/**
 * Visual derivation of the city layout.
 *
 * The engine only knows structure; every polygon the renderer draws is produced
 * here, once, from the same seeded RNG. Building masses, lit windows, trees and
 * the ground glow map are all plain arrays, so the scene components can pour
 * them straight into instanced meshes without per-frame work.
 */

import * as THREE from 'three';
import { BLOCK, CITY_HALF, GRID_BLOCKS, PALETTE } from '@/data/cityConfig';
import type { Block, CityModel } from '@/engine/city';
import { Rng, hash2 } from '@/engine/rng';

export interface BuildingVisual {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** 0..3, indexes the building tint ramp. */
  tint: number;
}

export interface WindowVisual {
  x: number;
  y: number;
  z: number;
  /** Y rotation of the quad, so it lies flat on one of the four facades. */
  rotationY: number;
  w: number;
  h: number;
  /** 0 = warm interior, 1 = cool office light. */
  tone: 0 | 1;
}

export interface TreeVisual {
  x: number;
  z: number;
  scale: number;
}

export interface CityVisuals {
  buildings: BuildingVisual[];
  windows: WindowVisual[];
  trees: TreeVisual[];
  parkLamps: { x: number; z: number }[];
}

/** Hard ceiling on window quads; the generator subsamples evenly if exceeded. */
const WINDOW_CAP = 20000;
const FLOOR_HEIGHT = 2.4;
const WINDOW_SPACING = 1.45;

function footprintHeight(block: Block, rng: Rng): number {
  const core = 1 - block.centrality;
  switch (block.kind) {
    case 'dense':
      return (12 + core * 26) * rng.float(0.7, 1.35);
    case 'mid':
      return (7 + core * 13) * rng.float(0.75, 1.3);
    case 'low':
      return rng.float(4, 10.5);
    case 'civic':
      return rng.float(5, 9);
    default:
      return 0;
  }
}

/** Split a block into 1, 2 or 4 lots depending on density. */
function lotsFor(block: Block, rng: Rng): { x: number; z: number; w: number; d: number }[] {
  const { rect } = block;
  const quarter = block.kind === 'dense' || rng.chance(0.45);
  if (quarter) {
    const hw = rect.w / 2;
    const hd = rect.d / 2;
    return [
      { x: rect.x - hw / 2, z: rect.z - hd / 2, w: hw, d: hd },
      { x: rect.x + hw / 2, z: rect.z - hd / 2, w: hw, d: hd },
      { x: rect.x - hw / 2, z: rect.z + hd / 2, w: hw, d: hd },
      { x: rect.x + hw / 2, z: rect.z + hd / 2, w: hw, d: hd },
    ];
  }
  if (rng.chance(0.5)) {
    const hd = rect.d / 2;
    return [
      { x: rect.x, z: rect.z - hd / 2, w: rect.w, d: hd },
      { x: rect.x, z: rect.z + hd / 2, w: rect.w, d: hd },
    ];
  }
  const hw = rect.w / 2;
  return [
    { x: rect.x - hw / 2, z: rect.z, w: hw, d: rect.d },
    { x: rect.x + hw / 2, z: rect.z, w: hw, d: rect.d },
  ];
}

export function buildCityVisuals(city: CityModel): CityVisuals {
  const rng = new Rng(city.seed ^ 0x5eed1a);
  const buildings: BuildingVisual[] = [];
  const windows: WindowVisual[] = [];
  const trees: TreeVisual[] = [];
  const parkLamps: { x: number; z: number }[] = [];

  for (const block of city.blocks) {
    if (block.kind === 'water') continue;

    if (block.kind === 'park') {
      // A loose grove plus lamps along the edges.
      const count = rng.int(9, 16);
      for (let n = 0; n < count; n++) {
        const x = block.rect.x + rng.float(-block.rect.w / 2, block.rect.w / 2) * 0.74;
        const z = block.rect.z + rng.float(-block.rect.d / 2, block.rect.d / 2) * 0.74;
        trees.push({ x, z, scale: rng.float(0.8, 1.5) });
      }
      parkLamps.push(
        { x: block.rect.x - block.rect.w / 2 + 0.7, z: block.rect.z - block.rect.d / 2 + 0.7 },
        { x: block.rect.x + block.rect.w / 2 - 0.7, z: block.rect.z + block.rect.d / 2 - 0.7 },
      );
      continue;
    }

    for (const lot of lotsFor(block, rng)) {
      if (rng.chance(0.07)) continue;
      const w = lot.w * rng.float(0.52, 0.78);
      const d = lot.d * rng.float(0.52, 0.78);
      const h = footprintHeight(block, rng);
      const building: BuildingVisual = {
        x: lot.x + rng.float(-0.35, 0.35),
        z: lot.z + rng.float(-0.35, 0.35),
        w,
        d,
        h,
        tint: rng.int(0, 3),
      };
      buildings.push(building);
      collectWindows(building, windows);
    }
  }

  // Keep the window quads inside budget by dropping every nth one evenly.
  if (windows.length > WINDOW_CAP) {
    const stride = windows.length / WINDOW_CAP;
    const subsampled: WindowVisual[] = [];
    for (let n = 0; n < windows.length; n += stride) subsampled.push(windows[Math.floor(n)]!);
    return { buildings, windows: subsampled, trees, parkLamps };
  }
  return { buildings, windows, trees, parkLamps };
}

function collectWindows(building: BuildingVisual, out: WindowVisual[]): void {
  const floors = Math.min(15, Math.max(1, Math.floor(building.h / FLOOR_HEIGHT)));
  if (floors < 2) return;
  const halfW = building.w / 2;
  const halfD = building.d / 2;
  const faces: { rotationY: number; width: number; offsetX: number; offsetZ: number }[] = [
    { rotationY: 0, width: building.w, offsetX: 0, offsetZ: halfD + 0.06 },
    { rotationY: Math.PI, width: building.w, offsetX: 0, offsetZ: -halfD - 0.06 },
    { rotationY: Math.PI / 2, width: building.d, offsetX: halfW + 0.06, offsetZ: 0 },
    { rotationY: -Math.PI / 2, width: building.d, offsetX: -halfW - 0.06, offsetZ: 0 },
  ];

  for (const face of faces) {
    const cols = Math.max(1, Math.floor(face.width / WINDOW_SPACING));
    const step = face.width / cols;
    const alongX = face.rotationY === 0 || face.rotationY === Math.PI;
    for (let floor = 1; floor < floors; floor++) {
      const y = floor * FLOOR_HEIGHT + 0.5;
      for (let col = 0; col < cols; col++) {
        const local = -face.width / 2 + step * (col + 0.5);
        // Roughly a third of the city is dark at this hour.
        const lit = hash2(Math.round(building.x * 7 + local * 3), Math.round(building.z * 7 + floor)) > 0.34;
        if (!lit) continue;
        out.push({
          x: building.x + (alongX ? local : face.offsetX),
          y,
          z: building.z + (alongX ? face.offsetZ : local),
          rotationY: face.rotationY,
          w: Math.min(1.05, step * 0.62),
          h: 1.15,
          tone: hash2(floor, col + Math.round(building.z)) > 0.55 ? 0 : 1,
        });
      }
    }
  }
}

/**
 * Night-glow map painted onto the ground: brighter where the city is dense, a
 * cold wash along the river. One texture beats lighting 400 blocks.
 */
export function createGroundTexture(city: CityModel): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, size, size);

  const span = GRID_BLOCKS * BLOCK;
  const toPx = (world: number): number => ((world + CITY_HALF) / span) * size;

  // Warm pool of light where the towers are.
  for (const block of city.blocks) {
    if (block.kind === 'water' || block.kind === 'park') continue;
    const intensity = block.kind === 'dense' ? 0.5 : block.kind === 'mid' ? 0.3 : 0.18;
    const px = toPx(block.rect.x);
    const py = toPx(block.rect.z);
    const radius = BLOCK * (block.kind === 'dense' ? 1.5 : 1.05);
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
    const hue = block.kind === 'dense' ? '255, 205, 150' : '130, 170, 235';
    gradient.addColorStop(0, `rgba(${hue}, ${intensity})`);
    gradient.addColorStop(1, `rgba(${hue}, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cold river wash plus the bridge glints.
  ctx.lineWidth = BLOCK * 1.5;
  ctx.strokeStyle = 'rgba(70, 190, 255, 0.22)';
  ctx.beginPath();
  city.riverRects.forEach((rect, index) => {
    const px = toPx(rect.x);
    const py = toPx(rect.z);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
