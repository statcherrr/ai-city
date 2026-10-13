/**
 * The command bar: type a question, the intent matcher picks a scenario, and the
 * run starts with a results card showing what changed.
 */

import { useEffect, useRef, useState } from 'react';
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
    <div className="pointer-events-auto mx-auto w-full max-w-[860px]">
      <AnimatePresence>
        {showCard && comparison && matched ? (
          <motion.div key="card" className="mb-3">
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
        className="glass flex items-center gap-2 rounded-2xl px-3 py-2.5"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-400/12 text-[13px] ring-1 ring-emerald-400/25 ring-inset">
          🧠
        </span>
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask the City Brain…"
          aria-label="Ask the City Brain"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-white/90 placeholder:text-white/30 focus:outline-none"
        />
        <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[9.5px] text-white/30 sm:block">
          /
        </kbd>
        <button
          type="submit"
          disabled={value.trim().length === 0}
          className="rounded-lg border border-emerald-400/30 bg-emerald-400/12 px-3 py-1.5 text-[11.5px] font-medium text-emerald-100 transition enabled:hover:bg-emerald-400/20 disabled:opacity-35"
        >
          Run simulation
        </button>
      </form>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
        <AnimatePresence mode="wait">
          {ask ? (
            <motion.span
              key={`intent-${ask.query}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mr-1 text-[10.5px] text-white/45"
            >
              {matched ? (
                <>
                  <span className="text-emerald-300/90">{matched.reason}</span>
                  <span className="text-white/30">
                    {' '}
                    → {matched.scenario.name} · {Math.round(matched.confidence * 100)}% confidence
                  </span>
                  {ask.pending ? <span className="text-white/30"> · computing comparison…</span> : null}
                </>
              ) : (
                <span className="text-amber-200/80">
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
            className="max-w-[280px] truncate rounded-full border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[10.5px] text-white/45 transition hover:border-white/20 hover:text-white/80"
          >
            {query}
          </button>
        ))}
      </div>
    </div>
  );
}
