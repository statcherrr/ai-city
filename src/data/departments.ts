/** Department colour coding, shared between the 3D scene and the UI. */

import type { Department } from '@/engine/types';

export interface DepartmentMeta {
  label: string;
  short: string;
  /** Primary hue. */
  color: string;
  /** Lighter tint for glow / bloom accents. */
  glow: string;
}

export const DEPARTMENTS: Record<Department, DepartmentMeta> = {
  fire: { label: 'Fire', short: 'FIRE', color: '#ff5a3c', glow: '#ffa07a' },
  police: { label: 'Police', short: 'PD', color: '#3f7dff', glow: '#8fb4ff' },
  water: { label: 'Water', short: 'H2O', color: '#22d3ee', glow: '#7ef0ff' },
  publicworks: { label: 'Public Works', short: 'PW', color: '#f5b429', glow: '#ffdd8a' },
  transit: { label: 'Transit', short: 'TR', color: '#a06bff', glow: '#c9a6ff' },
  ai: { label: 'City Brain', short: 'AI', color: '#3ce8a4', glow: '#a6ffd8' },
};

export const DEPARTMENT_ORDER: Department[] = [
  'ai',
  'fire',
  'police',
  'water',
  'publicworks',
  'transit',
];
