/**
 * Layout: the city canvas fills the viewport, and the dashboard floats over it
 * in three zones — identity and health on top, incidents left, AI actions right,
 * command bar at the bottom.
 */

import { useEffect } from 'react';
import { DEPARTMENTS, DEPARTMENT_ORDER } from '@/data/departments';
import { CityScene } from '@/scene/CityScene';
import { ActionsFeed } from '@/ui/ActionsFeed';
import { CommandBar } from '@/ui/CommandBar';
import { ScenarioPanel } from '@/ui/ScenarioPanel';
import { TopBar } from '@/ui/TopBar';
import { useShortcuts } from '@/ui/useShortcuts';
import { useCityStore } from '@/store/useCityStore';

function DepartmentLegend(): React.JSX.Element {
  return (
    <div className="glass pointer-events-none absolute bottom-4 left-4 hidden items-center gap-3 rounded-xl px-3 py-1.5 lg:flex">
      {DEPARTMENT_ORDER.map((department) => (
        <span key={department} className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: DEPARTMENTS[department].color }} />
          <span className="text-[10px] text-white/50">{DEPARTMENTS[department].label}</span>
        </span>
      ))}
      <span className="ml-1 border-l border-white/10 pl-3 font-mono text-[9.5px] text-white/30">
        1-4 incidents · space pause · m before/after · r view
      </span>
    </div>
  );
}

export default function App(): React.JSX.Element {
  const init = useCityStore((state) => state.init);
  const snapshot = useCityStore((state) => state.snapshot);
  const feed = useCityStore((state) => state.feed);
  useShortcuts();

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d]">
      <div className="absolute inset-0">
        <CityScene />
      </div>

      {/* Readability washes, so panels never fight the skyline behind them. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/80 via-black/30 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 p-3">
        <TopBar snapshot={snapshot} />
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3">
          <ScenarioPanel snapshot={snapshot} />
          <div className="hidden flex-1 md:block" />
          <ActionsFeed feed={feed} running={snapshot.running} />
        </div>
        <CommandBar />
      </div>

      <DepartmentLegend />
    </div>
  );
}
