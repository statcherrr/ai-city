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
    <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 lg:flex">
      {DEPARTMENT_ORDER.map((department) => (
        <span key={department} className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: DEPARTMENTS[department].color }} />
          <span className="text-[9px] text-white/40">{DEPARTMENTS[department].label}</span>
        </span>
      ))}
      <span className="ml-1 border-l border-white/10 pl-2.5 font-mono text-[8.5px] text-white/25">
        1-4 · space · m · r
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

      {/* Subtle readability wash so panels stay readable against the skyline. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/70 via-black/20 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />

      <div className="pointer-events-none absolute inset-0 flex flex-col gap-2.5 p-2.5">
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
