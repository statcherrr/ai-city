/**
 * Left panel: the scenario launcher (keys 1-4) and, once something is running,
 * the operations view — dispatches with live ETAs, corridor clearing order and
 * the incident's own numbers.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { DEPARTMENTS } from '@/data/departments';
import { SCENARIOS } from '@/data/scenarios';
import type { EngineSnapshot } from '@/engine/engine';
import type { ScenarioId } from '@/engine/types';
import { useCityStore } from '@/store/useCityStore';
import { formatMinutes, formatPercent } from './format';

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }): React.JSX.Element {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-[10px] font-semibold tracking-[0.18em] text-white/40 uppercase">{children}</h2>
      {hint ? <span className="font-mono text-[9.5px] text-white/25">{hint}</span> : null}
    </div>
  );
}

export function ScenarioPanel({ snapshot }: { snapshot: EngineSnapshot }): React.JSX.Element {
  const trigger = useCityStore((state) => state.trigger);
  const activeId: ScenarioId | null = snapshot.scenarioId;

  return (
    <aside className="pointer-events-auto flex w-[286px] flex-col gap-3">
      <section className="glass rounded-2xl p-3.5">
        <SectionTitle hint="keys 1-4">Trigger incident</SectionTitle>
        <div className="flex flex-col gap-2">
          {SCENARIOS.map((scenario, index) => {
            const active = activeId === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => trigger(scenario.id)}
                className={`group relative overflow-hidden rounded-xl border p-2.5 text-left transition ${
                  active
                    ? 'border-emerald-400/35 bg-emerald-400/8'
                    : 'border-white/8 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.06]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-4.5 w-4.5 items-center justify-center rounded-md font-mono text-[9.5px] ${
                      active ? 'bg-emerald-400/25 text-emerald-100' : 'bg-white/8 text-white/45'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-[12.5px] font-medium text-white/90">{scenario.name}</span>
                  {active ? (
                    <span className="ml-auto rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-200 uppercase">
                      {snapshot.running ? 'live' : 'done'}
                    </span>
                  ) : (
                    <span className="ml-auto text-[10px] text-white/25 opacity-0 transition group-hover:opacity-100">
                      trigger →
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-white/45">{scenario.brief}</p>
                {active ? (
                  <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full rounded-full bg-emerald-400"
                      animate={{ width: `${Math.round(snapshot.progress * 100)}%` }}
                      transition={{ ease: 'linear', duration: 0.12 }}
                    />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <AnimatePresence>
        {activeId ? (
          <motion.section
            key="ops"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 220, damping: 26 }}
            className="glass scroll-thin max-h-[46vh] overflow-y-auto rounded-2xl p-3.5"
          >
            <SectionTitle hint={`T+${snapshot.timeMin.toFixed(1)}m`}>Operations</SectionTitle>

            <div className="grid grid-cols-2 gap-1.5">
              <Metric label="Response" value={formatMinutes(snapshot.metrics.responseTimeMin)} />
              <Metric label="Resolution" value={formatMinutes(snapshot.metrics.resolutionMin)} />
              <Metric label="Peak traffic" value={formatPercent(snapshot.metrics.peakTrafficDelayPct)} />
              <Metric label="Cross-dept" value={`${snapshot.metrics.coordinatedActions}`} />
            </div>

            {snapshot.dispatches.length > 0 ? (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-medium tracking-wide text-white/35">Units assigned</div>
                <div className="flex flex-col gap-1.5">
                  {snapshot.dispatches.map((dispatch) => {
                    const color = DEPARTMENTS[dispatch.department]?.color ?? '#fff';
                    return (
                      <div key={dispatch.id} className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                          <span className="truncate text-[11px] text-white/80">{dispatch.label}</span>
                          <span className="ml-auto font-mono text-[9.5px] text-white/35">
                            {dispatch.arrived ? 'on scene' : `eta ${Math.max(0, dispatch.etaMin - dispatch.elapsedMin).toFixed(1)}m`}
                          </span>
                        </div>
                        <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/8">
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: dispatch.arrived ? '#3ce8a4' : color }}
                            animate={{ width: `${Math.round(dispatch.progress * 100)}%` }}
                            transition={{ ease: 'linear', duration: 0.12 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {snapshot.corridors.length > 0 ? (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-medium tracking-wide text-white/35">
                  Plow priority · by ridership
                </div>
                <div className="flex flex-col gap-1">
                  {snapshot.corridors.map((corridor) => (
                    <div key={corridor.id} className="flex items-center gap-2">
                      <span className="w-3 text-center font-mono text-[9px] text-white/30">{corridor.rank}</span>
                      <span className="min-w-0 flex-1 truncate text-[10.5px] text-white/60">{corridor.name}</span>
                      <span className="font-mono text-[9px] text-white/30">
                        {(corridor.volume / 1000).toFixed(1)}k
                      </span>
                      <div className="h-1 w-10 overflow-hidden rounded-full bg-white/8">
                        <motion.div
                          className="h-full rounded-full bg-amber-300"
                          animate={{ width: `${Math.round(corridor.progress * 100)}%` }}
                          transition={{ ease: 'linear', duration: 0.2 }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {snapshot.detours.length > 0 ? (
              <div className="mt-3">
                <div className="mb-1.5 text-[10px] font-medium tracking-wide text-white/35">Road closures</div>
                <div className="flex flex-col gap-1">
                  {snapshot.detours.map((detour) => (
                    <div key={detour.id} className="flex items-center gap-1.5 text-[10.5px]">
                      <span className={`h-1.5 w-1.5 rounded-full ${detour.reopened ? 'bg-emerald-400' : 'bg-red-400'}`} />
                      <span className="truncate text-white/60">{detour.label}</span>
                      <span className="ml-auto font-mono text-[9px] text-white/30">
                        {detour.reopened ? 'reopened' : `${Math.max(0, detour.reroute.length - 1)} blk detour`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </motion.section>
        ) : null}
      </AnimatePresence>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5">
      <div className="text-[9px] font-medium tracking-wide text-white/35 uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-[12.5px] tabular-nums text-white/90">{value}</div>
    </div>
  );
}
