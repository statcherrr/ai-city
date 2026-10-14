/**
 * City Health Score: one compact ring that dominates the header, with four
 * slim sub-score bars underneath. Colour tracks the score so the dashboard
 * reads its state from one glance.
 */

import type { Scores } from '@/engine/types';

const RADIUS = 28;
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
    <div className="flex items-center gap-3">
      {/* Ring — the hero. */}
      <div className="relative h-[72px] w-[72px] shrink-0">
        <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
          <circle cx="36" cy="36" r={RADIUS} fill="none" stroke="rgb(255 255 255 / 0.09)" strokeWidth="5" />
          <circle
            cx="36"
            cy="36"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE - dash}
            style={{
              filter: `drop-shadow(0 0 5px ${color}88)`,
              transition: 'stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[20px] leading-none font-semibold tabular-nums text-white">
            {scores.health.toFixed(1)}
          </span>
          <span className="mt-0.5 text-[7.5px] font-semibold tracking-[0.14em] text-white/35 uppercase">Health</span>
        </div>
      </div>

      {/* Sub-scores — slim, secondary. */}
      <div className="grid grid-cols-1 gap-1.5" style={{ width: '136px' }}>
        {SUBSCORES.map((sub) => {
          const value = scores[sub.key];
          return (
            <div key={sub.key} className="flex items-center gap-2">
              <span className="w-[68px] shrink-0 text-[9.5px] font-medium tracking-wide text-white/40">
                {sub.label}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className="h-full rounded-full"
                  style={{ background: healthColor(value), width: `${Math.max(2, value)}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right font-mono text-[9.5px] tabular-nums text-white/55">
                {value.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
