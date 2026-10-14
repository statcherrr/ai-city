/**
 * Transport controls. The Before/After AI toggle is the largest, most obvious
 * control — it shows the response-time delta next to it so the value of
 * coordination is visible at a glance. Speed and pause are secondary.
 */

import { motion } from 'framer-motion';
import type { EngineSnapshot } from '@/engine/engine';
import { SPEEDS, type Speed } from '@/engine/types';
import { useCityStore } from '@/store/useCityStore';

export function TransportBar({ snapshot }: { snapshot: EngineSnapshot }): React.JSX.Element {
  const setSpeed = useCityStore((state) => state.setSpeed);
  const togglePause = useCityStore((state) => state.togglePause);
  const toggleMode = useCityStore((state) => state.toggleMode);

  const beforeAi = snapshot.mode === 'siloed';

  return (
    <div className="flex items-center gap-3">
      {/* Before/After AI toggle — the hero control. */}
      <button
        type="button"
        onClick={toggleMode}
        className={`flex items-center gap-3 rounded-xl border px-3 py-2 transition ${
          beforeAi
            ? 'border-amber-400/30 bg-amber-300/8 text-amber-100'
            : 'border-emerald-400/30 bg-emerald-400/8 text-emerald-100'
        }`}
        title="Replay the same incident with siloed / coordinated departments (M)"
      >
        {/* Toggle pill */}
        <span className="relative flex h-5 w-10 items-center rounded-full bg-white/10 transition-all">
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className={`h-4 w-4 rounded-full shadow ${beforeAi ? 'left-1 bg-amber-300' : 'left-5 bg-emerald-300'}`}
          />
        </span>

        {/* Label */}
        <div className="flex flex-col leading-tight">
          <span className={`text-[11px] font-semibold tracking-[0.12em] uppercase ${beforeAi ? 'text-amber-200' : 'text-emerald-200'}`}>
            {beforeAi ? 'Before AI' : 'After AI'}
          </span>
          <span className="text-[9.5px] text-white/40">
            {beforeAi ? 'Departments siloed' : 'Coordinated response'}
          </span>
        </div>

        {/* Response-time delta — prominently beside the toggle. */}
        {snapshot.metrics.responseTimeMin !== null && snapshot.comparisonDelta !== null && (
          <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 ${beforeAi ? 'bg-amber-300/8' : 'bg-emerald-400/8'}`}>
            <span className="text-[10px] font-medium text-white/40">response</span>
            <span
              className={`text-[13px] font-mono font-semibold tabular-nums ${beforeAi ? 'text-amber-200' : 'text-emerald-200'}`}
            >
              {snapshot.comparisonDelta?.responseTimeMin === null
                ? '—'
                : `${snapshot.comparisonDelta!.responseTimeMin.toFixed(1)}`
              }
              {snapshot.comparisonDelta?.responseUnit ?? 'min'}
            </span>
          </div>
        )}
      </button>

      {/* Speed presets — secondary */}
      <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-1 py-1">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => setSpeed(speed as Speed)}
            className={`rounded-md font-mono text-[10px] transition ${
              snapshot.speed === speed
                ? 'bg-white/85 text-slate-900 shadow-sm'
                : 'text-white/40 hover:bg-white/8 hover:text-white/70'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      {/* Pause / replay — secondary */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={togglePause}
          aria-label="Pause / resume (space)"
          title="Pause / resume (space)"
          className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] transition ${
            snapshot.paused
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/8 hover:text-white'
          }`}
        >
          {snapshot.paused ? '▶' : '❚❚'}
        </button>
        <button
          type="button"
          onClick={() => snapshot.scenarioId && useCityStore.getState().trigger(snapshot.scenarioId)}
          aria-label="Replay scenario"
          title="Replay scenario"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/55 transition hover:border-white/20 hover:bg-white/8 hover:text-white"
        >
          ↺
        </button>
      </div>
    </div>
  );
}
