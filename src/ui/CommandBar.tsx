/**
 * The command bar: type a question, the intent matcher picks a scenario, and the
 * run starts with a results card showing what changed.
 */

import { useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EXAMPLE_QUERIES } from '@/data/scenarios';
import { useCityStore } from '@/store/useCityStore';
import { ResultsCard } from './ResultsCard';

export function CommandBar(): React.JSX.Element {
  const submitQuery = useCityStore((state) => state.submitQuery);
  const ask = useCityStore((state) => state.ask);
  const comparison = useCityStore((state) => state.comparison);
  const clearAsk = useCityStore((state) => state.clearAsk);
  const setMode = useCityStore((state) => state.setMode);
  const trigger = useCityStore((state) => state.trigger);
  const mode = useCityStore((state) => state.snapshot.mode);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = (): void => inputRef.current?.focus();
    window.addEventListener('city:focus-command', focus);
    return () => window.removeEventListener('city:focus-command', focus);
  }, []);

  const matched = ask?.intent.match ?? null;
  const showCard = Boolean(comparison && ask?.comparison);

  return (
    <div className="mx-auto w-full max-w-[820px]">
      <AnimatePresence>
        {showCard && comparison && matched ? (
          <motion.div key="card" className="mb-2">
            <ResultsCard
              comparison={comparison}
              scenarioName={matched.scenario.name}
              mode={mode}
              onReplay={(nextMode) => {
                setMode(nextMode);
                trigger(matched.scenarioId);
              }}
              onDismiss={clearAsk}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitQuery(value);
          setValue('');
        }}
        className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-[12px] ring-1 ring-emerald-400/20 ring-inset">
          🧠
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask the City Brain…"
          aria-label="Ask the City Brain"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white/85 placeholder:text-white/25 focus:outline-none"
        />
        <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-mono text-white/25 sm:block">
          /
        </kbd>
        <button
          type="submit"
          disabled={value.trim().length === 0}
          className="rounded-lg border border-emerald-400/25 bg-emerald-400/8 px-3 py-1.5 text-[11px] font-medium text-emerald-100 transition enabled:hover:bg-emerald-400/16 disabled:opacity-30"
        >
          Run simulation
        </button>
      </form>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
        <AnimatePresence mode="wait">
          {ask ? (
            <motion.span
              key={`intent-${ask.query}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mr-1 text-[10px] text-white/40"
            >
              {matched ? (
                <>
                  <span className="text-emerald-300/80">{matched.reason}</span>
                  <span className="text-white/25">
                    {' '}
                    → {matched.scenario.name} · {Math.round(matched.confidence * 100)}% confidence
                  </span>
                  {ask.pending ? <span className="text-white/20"> · computing comparison…</span> : null}
                </>
              ) : (
                <span className="text-amber-200/70">
                  No scenario matched “{ask.query}”. Try one of the prompts below.
                </span>
              )}
            </motion.span>
          ) : null}
        </AnimatePresence>

        {EXAMPLE_QUERIES.map((query) => (
          <button
            key={query}
            type="button"
            onClick={() => submitQuery(query)}
            className="max-w-[260px] truncate rounded-full border border-white/10 bg-white/[0.02] px-2 py-0.5 text-[10px] text-white/40 transition hover:border-white/20 hover:text-white/70"
          >
            {query}
          </button>
        ))}
      </div>
    </div>
  );
}
