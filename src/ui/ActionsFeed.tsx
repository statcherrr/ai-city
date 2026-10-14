/**
 * The hero element: a live feed of everything the brain did, newest first,
 * tagged by department and timestamped against the scenario clock. Cross-
 * department items are the whole point, so they are visually distinct.
 */

import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DEPARTMENTS, DEPARTMENT_ORDER } from '@/data/departments';
import type { Department, FeedItem } from '@/engine/types';

type Filter = Department | 'all';

interface Props {
  feed: FeedItem[];
  running: boolean;
}

export function ActionsFeed({ feed, running }: Props): React.JSX.Element {
  const [filter, setFilter] = useState<Filter>('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousTopId = useRef<number>(-1);

  const items = useMemo(() => {
    const filtered = filter === 'all' ? feed : feed.filter((item) => item.department === filter);
    return [...filtered].reverse();
  }, [feed, filter]);

  // Auto-scroll to top when a new item appears.
  const top = items[0]?.id ?? -1;
  if (top !== previousTopId.current) {
    previousTopId.current = top;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const coordinationCount = feed.filter((item) => item.coordination).length;

  return (
    <aside className="flex flex-col">
      <section className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]">
        {/* Header */}
        <header className="border-b border-white/10 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${running ? 'live-dot bg-emerald-400' : 'bg-white/25'}`} />
            <h2 className="text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">AI Actions</h2>
            <span className="ml-auto font-mono text-[9px] text-white/25">
              {feed.length} events · {coordinationCount} cross-dept
            </span>
          </div>
          {/* Filter chips */}
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
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

        {/* Feed body */}
        <div ref={scrollRef} className="max-h-[52vh] min-h-[180px] overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="px-1 py-8 text-center text-[11px] leading-relaxed text-white/30">
              Nothing to report. Everything is nominal — trigger an incident to watch the departments coordinate.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {items.slice(0, 80).map((item) => (
                  <FeedRow key={item.id} item={item} />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>
    </aside>
  );
}

interface FeedRowProps {
  item: FeedItem;
}

function FeedRow({ item }: FeedRowProps): React.JSX.Element {
  const meta = DEPARTMENTS[item.department];
  const [expanded, setExpanded] = useState(false);

  return (
    <li
      className={`rounded-lg border px-3 py-2.5 transition ${
        item.coordination
          ? 'border-emerald-400/20 bg-emerald-400/[0.04]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {/* Department chip — the landmark. */}
        <span
          className="mt-0.5 flex h-5 min-w-[44px] shrink-0 items-center rounded-md px-1.5 text-[9px] font-semibold tracking-wide uppercase"
          style={{ color: meta.color, background: `${meta.color}1c` }}
        >
          {meta.short}
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* One-line action + timestamp (always visible) */}
          <div className="flex items-center gap-2">
            <span className="truncate text-[12px] leading-snug text-white/85">{item.action}</span>
            <span className="shrink-0 font-mono text-[9.5px] text-white/25">T+{item.t.toFixed(1)}</span>
          </div>

          {/* Detail — hidden behind expand */}
          <AnimatePresence initial={false}>
            {expanded && item.detail ? (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-1 overflow-hidden text-[10.5px] leading-relaxed text-white/35"
              >
                {item.detail}
              </motion.p>
            ) : null}
          </AnimatePresence>

          {/* Expand affordance */}
          {item.detail && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[9.5px] text-white/25 transition hover:text-white/50"
            >
              {expanded ? 'show less' : 'show detail'}
            </button>
          )}

          {/* Cross-dept badge */}
          {item.coordination && (
            <span className="mt-1 inline-block rounded text-[9px] font-semibold tracking-wide text-emerald-200/80 bg-emerald-400/10 px-1.5 py-0.5">
              cross-dept
            </span>
          )}
        </div>
      </div>
    </li>
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
      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-mono transition ${
        active ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 text-white/40 hover:text-white/65'
      }`}
      style={active ? { borderColor: `${color}55` } : undefined}
    >
      {label}
    </button>
  );
}
