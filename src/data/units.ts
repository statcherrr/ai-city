import type { UnitKind, UnitMeta } from '@/engine/types';

/** Which vehicle model each dispatched unit drives. */
export const UNITS: Record<UnitKind, UnitMeta> = {
  engine: { label: 'Engine 2', vehicle: 'fire-truck' },
  ladder: { label: 'Ladder 1', vehicle: 'fire-truck' },
  ambulance: { label: 'Medic 3', vehicle: 'fire-truck' },
  plow: { label: 'Plow', vehicle: 'plow' },
  police: { label: 'Patrol Unit', vehicle: 'police' },
  utility: { label: 'Repair Crew', vehicle: 'utility' },
};
