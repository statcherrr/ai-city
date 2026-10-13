/**
 * Top bar: who we are looking at, what time it is, how the city is doing, and
 * the controls that drive the replay.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { CITY_NAME } from '@/data/cityConfig';
import type { EngineSnapshot } from '@/engine/engine';
import { HealthRing } from './HealthRing';
import { TransportBar } from './TransportBar';
import { formatClock } from './format';

export function TopBar({ snapshot }: { snapshot: EngineSnapshot }): React.JSX.Element {
  const running = snapshot.running;
  const progress = Math.round(snapshot.progress * 100);

  return (
    <header className="pointer-events-auto glass flex items-center gap-5 rounded-2xl px-4 py-2.5">
      <div className="flex min-w-[210px] items-center gap-3">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400/25 to-sky-500/20 ring-1 ring-white/10 ring-inset">
          <span className="text-[15px]">🏙️</span>
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight text-white">{CITY_NAME}</h1>
            <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-white/45 uppercase">
              {snapshot.district}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-white/45">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'live-dot bg-emerald-400' : 'bg-white/30'}`} />
            {snapshot.mode === 'coordinated' ? 'City Brain online' : 'Departments siloed'}
            <span className="text-white/20">·</span>
            <span className="truncate">{snapshot.scenarioName}</span>
          </div>
        </div>
      </div>

      <div className="flex items-baseline gap-2 border-x border-white/8 px-5">
        <span className="font-mono text-[26px] leading-none font-medium tabular-nums text-white/95">
          {formatClock(snapshot.clockMinutes)}
        </span>
        <span className="pb-0.5 text-[10px] text-white/35">local</span>
      </div>

      <div className="hidden min-w-0 flex-1 items-center gap-4 md:flex">
        {snapshot.scenarioId ? (
          <>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-white/80">{snapshot.headline}</div>
              <div className="mt-1 h-1 w-40 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: 'linear', duration: 0.12 }}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px] text-white/40">
              <span>T+{snapshot.timeMin.toFixed(1)}m</span>
              <span className="text-white/20">/</span>
              <span>{snapshot.totalMin.toFixed(0)}m</span>
            </div>
          </>
        ) : (
          <AnimatePresence mode="wait">
            <motion.p
              key="idle"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md text-[11px] leading-snug text-white/45"
            >
              {snapshot.brief}
            </motion.p>
          </AnimatePresence>
        )}
      </div>

      <div className="ml-auto flex items-center gap-4">
        <HealthRing scores={snapshot.scores} />
        <TransportBar snapshot={snapshot} />
      </div>
    </header>
  );
}
