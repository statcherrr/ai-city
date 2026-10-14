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
  /** 0..1, indexes the building tint ramp (all one dark family). */
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
  /** Slightly brighter cool-paper windows only on taller buildings. */
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
const WINDOW_CAP = 3800;
const FLOOR_HEIGHT = 2.4;
const WINDOW_SPACING = 1.7;

/**
 * Height hierarchy: downtown cores read as a tall mass, edge districts as
 * low-rise. The exact per-building variation is still seeded, but the mean
 * is now clearly ordered by centrality and density tier.
 */
const TOWER = 26;
const MID = 11;
const LOW = 5.5;

function footprintHeight(block: Block, rng: Rng): number {
  const core = 1 - block.centrality;
  const base = block.kind === 'dense' ? TOWER : block.kind === 'mid' ? MID : LOW;
  const spread = block.kind === 'dense' ? 14 : block.kind === 'mid' ? 5 : 2.4;
  return (base + core * spread) * rng.float(0.78, 1.22);
}

/**
 * Fewer, better-composed lots per block. Dense blocks still split into 2-4
 * masses; everything else is usually one footprint, occasionally two.
 */
function lotsFor(block: Block, rng: Rng): { x: number; z: number; w: number; d: number }[] {
  const { rect } = block;
  const quarter = block.kind === 'dense' && rng.chance(0.45);
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
  if (block.kind === 'dense' && rng.chance(0.5)) {
    const hd = rect.d / 2;
    return [
      { x: rect.x, z: rect.z - hd / 2, w: rect.w, d: hd },
      { x: rect.x, z: rect.z + hd / 2, w: rect.w, d: hd },
    ];
  }
  return [{ x: rect.x, z: rect.z, w: rect.w, d: rect.d }];
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
      const count = rng.int(7, 13);
      for (let n = 0; n < count; n++) {
        const x = block.rect.x + rng.float(-block.rect.w / 2, block.rect.w / 2) * 0.7;
        const z = block.rect.z + rng.float(-block.rect.d / 2, block.rect.d / 2) * 0.7;
        trees.push({ x, z, scale: rng.float(0.9, 1.35) });
      }
      parkLamps.push(
        { x: block.rect.x + block.rect.w / 2 - 0.9, z: block.rect.z + block.rect.d / 2 - 0.9 },
      );
      continue;
    }

    for (const lot of lotsFor(block, rng)) {
      if (rng.chance(0.10)) continue;
      const w = lot.w * rng.float(0.5, 0.74);
      const d = lot.d * rng.float(0.5, 0.74);
      const h = footprintHeight(block, rng);
      const building: BuildingVisual = {
        x: lot.x + rng.float(-0.3, 0.3),
        z: lot.z + rng.float(-0.3, 0.3),
        w,
        d,
        h,
        tint: rng.int(0, 1),
      };
      buildings.push(building);
      collectWindows(building, windows);
    }
  }

  if (windows.length > WINDOW_CAP) {
    const stride = windows.length / WINDOW_CAP;
    const subsampled: WindowVisual[] = [];
    for (let n = 0; n < windows.length; n += stride) subsampled.push(windows[Math.floor(n)]!);
    return { buildings, windows: subsampled, trees, parkLamps };
  }
  return { buildings, windows, trees, parkLamps };
}

function collectWindows(building: BuildingVisual, out: WindowVisual[]): void {
  const floors = Math.min(14, Math.max(2, Math.floor(building.h / FLOOR_HEIGHT)));
  if (floors < 2) return;
  const halfW = building.w / 2;
  const halfD = building.d / 2;
  const faces: { rotationY: number; width: number; offsetX: number; offsetZ: number }[] = [
    { rotationY: 0, width: building.w, offsetX: 0, offsetZ: halfD + 0.05 },
    { rotationY: Math.PI, width: building.w, offsetX: 0, offsetZ: -halfD - 0.05 },
    { rotationY: Math.PI / 2, width: building.d, offsetX: halfW + 0.05, offsetZ: 0 },
    { rotationY: -Math.PI / 2, width: building.d, offsetX: -halfW - 0.05, offsetZ: 0 },
  ];

  const litChance = building.h >= MID ? 0.38 : 0.26;

  for (let fi = 0; fi < faces.length; fi++) {
    const face = faces[fi]!;
    const cols = Math.max(1, Math.floor(face.width / WINDOW_SPACING));
    const step = face.width / cols;
    const alongX = face.rotationY === 0 || face.rotationY === Math.PI;
    for (let floor = 1; floor < floors; floor++) {
      const y = floor * FLOOR_HEIGHT + 0.5;
      for (let col = 0; col < cols; col++) {
        const local = -face.width / 2 + step * (col + 0.5);
        const lit = hash2(Math.round(building.x * 7 + local * 3 + floor * 2), fi * 13 + col) < litChance;
        if (!lit) continue;
        out.push({
          x: building.x + (alongX ? local : face.offsetX),
          y,
          z: building.z + (alongX ? face.offsetZ : local),
          rotationY: face.rotationY,
          w: Math.min(1.05, step * 0.6),
          h: 1.05,
          tone: building.h >= MID && hash2(floor, col + Math.round(building.z)) > 0.6 ? 1 : 0,
        });
      }
    }
  }
}

/**
 * Night-glow map painted onto the ground: a soft pool under the towers, a
 * cold haze along the river. One texture beats lighting 400 blocks.
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

  for (const block of city.blocks) {
    if (block.kind === 'water' || block.kind === 'park') continue;
    const intensity = block.kind === 'dense' ? 0.22 : block.kind === 'mid' ? 0.12 : 0.06;
    const px = toPx(block.rect.x);
    const py = toPx(block.rect.z);
    const radius = BLOCK * (block.kind === 'dense' ? 1.6 : 1.05);
    const gradient = ctx.createRadialGradient(px, py, 0, px, py, radius);
    gradient.addColorStop(0, `rgba(205, 225, 255, ${intensity})`);
    gradient.addColorStop(1, `rgba(205, 225, 255, 0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineWidth = BLOCK * 1.5;
  ctx.strokeStyle = 'rgba(120, 190, 255, 0.16)';
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
