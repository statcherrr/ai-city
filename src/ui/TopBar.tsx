/**
 * Top bar: identity, clock, health, and transport controls. The health ring is
 * the single most prominent element — the rest is secondary.
 */

import { CITY_NAME } from '@/data/cityConfig';
import type { EngineSnapshot } from '@/engine/engine';
import { HealthRing } from './HealthRing';
import { TransportBar } from './TransportBar';
import { formatClock } from './format';

export function TopBar({ snapshot }: { snapshot: EngineSnapshot }): React.JSX.Element {
  const running = snapshot.running;

  return (
    <header className="flex items-center gap-4 px-4 py-3">
      {/* Identity — compact, secondary. */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 select-none items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/20 to-emerald-500/15 border border-white/10">
          <span className="text-base">🏙️</span>
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-[14px] font-semibold tracking-tight text-white">{CITY_NAME}</h1>
            <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[8.5px] font-semibold tracking-[0.12em] text-white/40 uppercase">
              {snapshot.district}
            </span>
            {snapshot.riskDataIllustrative && (
              <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[8.5px] font-semibold tracking-[0.12em] text-amber-300 uppercase">
                Illustrative data
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/40">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'live-dot bg-emerald-400' : 'bg-white/25'}`} />
            {snapshot.mode === 'coordinated' ? 'City Brain online' : 'Departments siloed'}
            <span className="text-white/15">·</span>
            <span className="truncate max-w-[180px] text-white/35">{snapshot.scenarioName}</span>
          </div>
        </div>
      </div>

      {/* Clock — prominent but not dominant. */}
      <div className="flex items-baseline gap-2 border-l border-white/10 pl-5">
        <span className="font-mono text-[24px] leading-none font-medium tabular-nums text-white/90">
          {formatClock(snapshot.clockMinutes)}
        </span>
        <span className="text-[9px] text-white/30">local</span>
      </div>

      {/* Scenario status — secondary. */}
      <div className="hidden min-w-0 flex-1 items-center gap-4 md:flex">
        {snapshot.scenarioId ? (
          <>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-white/70">{snapshot.headline}</div>
              <div className="mt-1 h-1 w-36 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400"
                  style={{ width: `${Math.round(snapshot.progress * 100)}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-white/35 font-mono">
              <span>T+{snapshot.timeMin.toFixed(1)}m</span>
              <span className="text-white/15">/</span>
              <span>{snapshot.totalMin.toFixed(0)}m</span>
            </div>
          </>
        ) : (
          <p className="max-w-md text-[11px] leading-snug text-white/40">{snapshot.brief}</p>
        )}
      </div>

      {/* Health — hero element in the header. */}
      <HealthRing scores={snapshot.scores} />

      {/* Transport controls. */}
      <TransportBar snapshot={snapshot} />
    </header>
  );
}
