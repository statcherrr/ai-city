/**
 * Transport controls: speed presets, pause, replay, and the Before/After AI
 * switch. Toggling the mode restarts the same incident so the two runs can be
 * compared second for second.
 */

import { motion } from 'framer-motion';
import type { EngineSnapshot } from '@/engine/engine';
import { SPEEDS, type Speed } from '@/engine/types';
import { useCityStore } from '@/store/useCityStore';

function IconButton({
  label,
  onClick,
  children,
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] transition ${
        active
          ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-200'
          : 'border-white/10 bg-white/4 text-white/60 hover:border-white/20 hover:bg-white/8 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function TransportBar({ snapshot }: { snapshot: EngineSnapshot }): React.JSX.Element {
  const setSpeed = useCityStore((state) => state.setSpeed);
  const togglePause = useCityStore((state) => state.togglePause);
  const toggleMode = useCityStore((state) => state.toggleMode);
  const trigger = useCityStore((state) => state.trigger);

  const beforeAi = snapshot.mode === 'siloed';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleMode}
        className="group relative flex items-center gap-2 rounded-xl border border-white/10 bg-white/4 px-2.5 py-1.5 text-left transition hover:border-white/20 hover:bg-white/8"
        title="Replay the same incident with siloed departments (M)"
      >
        <span className="relative flex h-4 w-8 items-center rounded-full bg-white/12 transition">
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className={`absolute h-3.5 w-3.5 rounded-full ${beforeAi ? 'left-0.5 bg-amber-300' : 'left-4 bg-emerald-300'}`}
          />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-[9px] font-semibold tracking-[0.14em] text-white/35 uppercase">
            {beforeAi ? 'Before AI' : 'After AI'}
          </span>
          <span className="text-[10px] text-white/55">{beforeAi ? 'Departments siloed' : 'Coordinated response'}</span>
        </span>
      </button>

      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/4 p-1">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            onClick={() => setSpeed(speed as Speed)}
            className={`h-6 w-7 rounded-md font-mono text-[10px] transition ${
              snapshot.speed === speed
                ? 'bg-white/90 text-slate-900'
                : 'text-white/50 hover:bg-white/8 hover:text-white'
            }`}
          >
            {speed}x
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <IconButton label="Pause / resume (space)" onClick={togglePause} active={snapshot.paused}>
          {snapshot.paused ? '▶' : '❚❚'}
        </IconButton>
        <IconButton
          label="Replay scenario"
          onClick={() => snapshot.scenarioId && trigger(snapshot.scenarioId)}
        >
          ↺
        </IconButton>
      </div>
    </div>
  );
}
