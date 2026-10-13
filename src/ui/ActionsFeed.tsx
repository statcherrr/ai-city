/**
 * The hero element: a live feed of everything the brain did, newest first,
 * tagged by department and timestamped against the scenario clock. Cross-
 * department items are the whole point of the product, so they are marked.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DEPARTMENTS, DEPARTMENT_ORDER } from '@/data/departments';
import type { Department, FeedItem } from '@/engine/types';

type Filter = Department | 'all';

/**
 * Props come from the app shell so this panel stays a pure render of the feed.
 */
export function ActionsFeed({ feed, running }: { feed: FeedItem[]; running: boolean }): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousTopId = useRef<number>(-1);

  // Newest first, with the run boundary marked so replays are readable.
  const items = useMemo(() => {
    const filtered = filter === 'all' ? feed : feed.filter((item) => item.department === filter);
    return [...filtered].reverse();
  }, [feed, filter]);

  useEffect(() => {
    const top = items[0]?.id ?? -1;
    if (top === previousTopId.current) return;
    previousTopId.current = top;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [items]);

  const coordinationCount = feed.filter((item) => item.coordination).length;

  return (
    <aside className="pointer-events-auto flex w-[330px] flex-col gap-3">
      <section className="glass flex min-h-0 flex-col overflow-hidden rounded-2xl">
        <header className="border-b border-white/8 px-3.5 pt-3.5 pb-3">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'live-dot bg-emerald-400' : 'bg-white/30'}`} />
            <h2 className="text-[10px] font-semibold tracking-[0.18em] text-white/45 uppercase">AI Actions</h2>
            <span className="ml-auto font-mono text-[9.5px] text-white/30">
              {feed.length} events · {coordinationCount} cross-dept
            </span>
          </div>
          <div className="scroll-thin mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5">
            <FilterChip active={filter === 'all'} label="All" color="#ffffff" onClick={() => setFilter('all')} />
            {DEPARTMENT_ORDER.map((department) => (
              <FilterChip
                key={department}
                active={filter === department}
                label={DEPARTMENTS[department].short}
                color={DEPARTMENTS[department].color}
                onClick={() => setFilter(department)}
              />
            ))}
          </div>
        </header>

        <div ref={scrollRef} className="scroll-thin max-h-[58vh] min-h-[240px] overflow-y-auto px-3 py-3">
          {items.length === 0 ? (
            <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-white/35">
              Nothing to report. Everything is nominal — trigger an incident to watch the departments coordinate.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.slice(0, 60).map((item, index) => {
                  const older = items[index + 1];
                  const runBoundary = older !== undefined && (older.scenario !== item.scenario || older.mode !== item.mode);
                  return (
                    <motion.li
                      key={item.id}
                      layout
                      initial={{ opacity: 0, x: 24, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: 'auto' }}
                      exit={{ opacity: 0, x: 16 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.6 }}
                      className="list-none"
                    >
                      <FeedRow item={item} />
                      {runBoundary ? (
                        <div className="mt-2 mb-0.5 flex items-center gap-2">
                          <span className="h-px flex-1 bg-white/8" />
                          <span className="font-mono text-[9px] tracking-wide text-white/25 uppercase">
                            {older!.mode === 'siloed' ? 'pre-AI replay' : 'coordinated replay'}
                          </span>
                          <span className="h-px flex-1 bg-white/8" />
                        </div>
                      ) : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>
    </aside>
  );
}

function FeedRow({ item }: { item: FeedItem }): React.JSX.Element {
  const meta = DEPARTMENTS[item.department];
  return (
    <div
      className={`relative overflow-hidden rounded-xl border px-2.5 py-2 ${
        item.coordination ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : 'border-white/8 bg-white/[0.03]'
      }`}
    >
      <span className="absolute inset-y-0 left-0 w-[2px]" style={{ background: meta.color }} />
      <div className="flex items-center gap-2">
        <span
          className="rounded-md px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide"
          style={{ color: meta.color, background: `${meta.color}1f` }}
        >
          {meta.short}
        </span>
        <span className="text-[9.5px] font-medium tracking-wide text-white/35 uppercase">{meta.label}</span>
        {item.coordination ? (
          <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-emerald-200/90">
            cross-dept
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[9.5px] text-white/30">T+{item.t.toFixed(1)}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-white/88">{item.action}</p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-white/40">{item.detail}</p>
    </div>
  );
}

function FilterChip({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] transition ${
        active ? 'border-white/25 bg-white/12 text-white' : 'border-white/8 text-white/40 hover:text-white/70'
      }`}
      style={active ? { borderColor: `${color}66`, color } : undefined}
    >
      {label}
    </button>
  );
}
