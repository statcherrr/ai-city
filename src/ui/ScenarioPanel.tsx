/**
 * Left panel: the scenario launcher (keys 1-4) and, once something is running,
 * the operations view — dispatches with live ETAs, corridor clearing order and
 * road closures. Slim, collapsible, consistent spacing.
 */

import { motion } from 'framer-motion';
import { useState } from 'react';
import { DEPARTMENTS } from '@/data/departments';
import { SCENARIOS } from '@/data/scenarios';
import type { EngineSnapshot } from '@/engine/engine';
import type { ScenarioId } from '@/engine/types';
import { useCityStore } from '@/store/useCityStore';
import { formatMinutes, formatPercent } from './format';

export function ScenarioPanel({ snapshot }: { snapshot: EngineSnapshot }): React.JSX.Element {
  const trigger = useCityStore((state) => state.trigger);
  const [opsExpanded, setOpsExpanded] = useState(true);
  const activeId: ScenarioId | null = snapshot.scenarioId;

  return (
    <aside className="flex flex-col gap-2.5">
      {/* Trigger panel */}
      <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">Trigger incident</h2>
          <span className="font-mono text-[9px] text-white/20">keys 1-4</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {SCENARIOS.map((scenario, index) => {
            const active = activeId === scenario.id;
            return (
              <button
                key={scenario.id}
                type="button"
                onClick={() => trigger(scenario.id)}
                className={`group relative flex flex-col overflow-hidden rounded-lg border p-2.5 text-left transition ${
                  active
                    ? 'border-emerald-400/25 bg-emerald-400/6'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md font-mono text-[9px] ${
                      active ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/8 text-white/40'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-[12px] font-medium text-white/85">{scenario.name}</span>
                  {active ? (
                    <span
                      className={`ml-auto rounded-md px-1.5 py-0.5 text-[8.5px] font-semibold tracking-wide uppercase ${
                        snapshot.running ? 'bg-emerald-400/15 text-emerald-200' : 'bg-white/10 text-white/50'
                      }`}
                    >
                      {snapshot.running ? 'live' : 'done'}
                    </span>
                  ) : (
                    <span className="ml-auto text-[9.5px] text-white/20 opacity-0 group-hover:opacity-100 transition">
                      trigger →
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] leading-snug text-white/40">{scenario.brief}</p>
                {active && (
                  <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-400"
                      style={{ width: `${Math.round(snapshot.progress * 100)}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Operations panel — collapsible */}
      {activeId && (
        <motion.section
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: opsExpanded ? 'auto' : 0, opacity: opsExpanded ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl border border-white/10 bg-white/[0.02] p-3 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h2 className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">Operations</h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-white/20">T+{snapshot.timeMin.toFixed(1)}m</span>
              <button
                type="button"
                onClick={() => setOpsExpanded((v) => !v)}
                className="text-[9px] text-white/25 transition hover:text-white/50"
              >
                {opsExpanded ? 'collapse' : 'expand'}
              </button>
            </div>
          </div>

          {opsExpanded && (
            <div className="mt-2.5 space-y-2">
              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-1.5">
                <Metric label="Response" value={formatMinutes(snapshot.metrics.responseTimeMin)} />
                <Metric label="Resolution" value={formatMinutes(snapshot.metrics.resolutionMin)} />
                <Metric label="Peak traffic" value={formatPercent(snapshot.metrics.peakTrafficDelayPct)} />
                <Metric label="Cross-dept" value={`${snapshot.metrics.coordinatedActions}`} />
              </div>

              {/* Dispatches */}
              {snapshot.dispatches.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[9.5px] font-medium tracking-wide text-white/30">Units assigned</h3>
                  <div className="flex flex-col gap-1">
                    {snapshot.dispatches.map((dispatch) => {
                      const color = DEPARTMENTS[dispatch.department]?.color ?? '#fff';
                      return (
                        <div key={dispatch.id} className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                            <span className="min-w-0 flex-1 truncate text-[11px] text-white/75">{dispatch.label}</span>
                            <span className="shrink-0 font-mono text-[9px] text-white/30">
                              {dispatch.arrived ? 'on scene' : `eta ${Math.max(0, dispatch.etaMin - dispatch.elapsedMin).toFixed(1)}m`}
                            </span>
                          </div>
                          <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full"
                            style={{ background: dispatch.arrived ? '#3ce8a4' : color, width: `${Math.round(dispatch.progress * 100)}%` }}
                          />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Corridor priority */}
              {snapshot.corridors.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[9.5px] font-medium tracking-wide text-white/30">Plow priority · by ridership</h3>
                  <div className="flex flex-col gap-0.5">
                    {snapshot.corridors.map((corridor) => (
                      <div key={corridor.id} className="flex items-center gap-2 text-[10px]">
                        <span className="w-3 shrink-0 text-center font-mono text-[8.5px] text-white/25">{corridor.rank}</span>
                        <span className="min-w-0 flex-1 truncate text-white/55">{corridor.name}</span>
                        <span className="shrink-0 font-mono text-[8.5px] text-white/25">
                          {(corridor.volume / 1000).toFixed(1)}k
                        </span>
                        <div className="h-0.5 shrink-0 w-8 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-amber-300"
                        style={{ width: `${Math.round(corridor.progress * 100)}%` }}
                      />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Road closures */}
              {snapshot.detours.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-[9.5px] font-medium tracking-wide text-white/30">Road closures</h3>
                  <div className="flex flex-col gap-0.5">
                    {snapshot.detours.map((detour) => (
                      <div key={detour.id} className="flex items-center gap-1.5 text-[10px]">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${detour.reopened ? 'bg-emerald-400' : 'bg-red-400'}`}
                        />
                        <span className="min-w-0 flex-1 truncate text-white/55">{detour.label}</span>
                        <span className="shrink-0 font-mono text-[8.5px] text-white/25">
                          {detour.reopened ? 'reopened' : `${Math.max(0, detour.reroute.length - 1)} blk detour`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.section>
      )}
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
      <div className="text-[8.5px] font-medium tracking-wide text-white/30 uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-[12px] tabular-nums text-white/85">{value}</div>
    </div>
  );
}
