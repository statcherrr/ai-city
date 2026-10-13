/**
 * The unified City Health Score: a ring gauge with the four department
 * sub-scores underneath. Colour tracks the score so the whole dashboard reads
 * its state from one glance.
 */

import { motion } from 'framer-motion';
import type { Scores } from '@/engine/types';

const RADIUS = 34;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function healthColor(score: number): string {
  if (score >= 90) return '#3ce8a4';
  if (score >= 78) return '#8fe36b';
  if (score >= 64) return '#f5b429';
  return '#ff5a3c';
}

const SUBSCORES: { key: keyof Omit<Scores, 'health'>; label: string }[] = [
  { key: 'infrastructure', label: 'Infrastructure' },
  { key: 'traffic', label: 'Traffic' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'transit', label: 'Transit' },
];

export function HealthRing({ scores }: { scores: Scores }): React.JSX.Element {
  const color = healthColor(scores.health);
  const dash = (scores.health / 100) * CIRCUMFERENCE;

  return (
    <div className="flex items-center gap-3.5">
      <div className="relative h-[86px] w-[86px] shrink-0">
        <svg viewBox="0 0 86 86" className="h-full w-full -rotate-90">
          <circle cx="43" cy="43" r={RADIUS} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="6" />
          <motion.circle
            cx="43"
            cy="43"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animate={{ strokeDashoffset: CIRCUMFERENCE - dash }}
            transition={{ type: 'spring', stiffness: 60, damping: 18 }}
            style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[22px] leading-none font-semibold tabular-nums text-white">
            {scores.health.toFixed(1)}
          </span>
          <span className="mt-0.5 text-[8px] font-semibold tracking-[0.16em] text-white/40 uppercase">Health</span>
        </div>
      </div>

      <div className="grid w-[152px] grid-cols-1 gap-1">
        {SUBSCORES.map((sub) => {
          const value = scores[sub.key];
          return (
            <div key={sub.key} className="flex items-center gap-2">
              <span className="w-[74px] shrink-0 text-[10px] font-medium tracking-wide text-white/45">
                {sub.label}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: healthColor(value) }}
                  animate={{ width: `${Math.max(2, value)}%` }}
                  transition={{ type: 'spring', stiffness: 60, damping: 20 }}
                />
              </div>
              <span className="w-6 shrink-0 text-right font-mono text-[10px] tabular-nums text-white/60">
                {value.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
