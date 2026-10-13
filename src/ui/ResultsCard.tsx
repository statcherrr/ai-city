/**
 * The comparison card: the same incident, run twice. Everything shown here is
 * measured by the two headless replays — nothing is hard-coded.
 */

import { motion } from 'framer-motion';
import type { Comparison } from '@/engine/engine';
import type { SimMode } from '@/engine/types';

interface Row {
  label: string;
  before: number | null;
  after: number | null;
  unit: string;
  digits: number;
  /** True when a smaller number is the better outcome. */
  lowerIsBetter: boolean;
}

function buildRows(comparison: Comparison): Row[] {
  const { siloed, coordinated } = comparison;
  return [
    {
      label: 'First unit on scene',
      before: siloed.metrics.responseTimeMin,
      after: coordinated.metrics.responseTimeMin,
      unit: 'min',
      digits: 1,
      lowerIsBetter: true,
    },
    {
      label: 'Incident resolved',
      before: siloed.metrics.resolutionMin,
      after: coordinated.metrics.resolutionMin,
      unit: 'min',
      digits: 1,
      lowerIsBetter: true,
    },
    {
      label: 'Peak traffic delay',
      before: siloed.metrics.peakTrafficDelayPct,
      after: coordinated.metrics.peakTrafficDelayPct,
      unit: '%',
      digits: 0,
      lowerIsBetter: true,
    },
    {
      label: 'Cross-department actions',
      before: siloed.metrics.coordinatedActions,
      after: coordinated.metrics.coordinatedActions,
      unit: '',
      digits: 0,
      lowerIsBetter: false,
    },
    {
      label: 'Lowest health score',
      before: siloed.metrics.healthLow,
      after: coordinated.metrics.healthLow,
      unit: '',
      digits: 1,
      lowerIsBetter: true,
    },
  ];
}

function deltaText(row: Row): string {
  if (row.before === null || row.after === null) return 'n/a';
  const improvement = row.lowerIsBetter ? row.before - row.after : row.after - row.before;
  const sign = improvement >= 0 ? '' : '−';
  const magnitude = Math.abs(improvement).toFixed(row.digits);
  if (row.label === 'Cross-department actions') return `${improvement >= 0 ? '+' : '−'}${magnitude} actions`;
  return `${sign}${magnitude}${row.unit ? ` ${row.unit}` : ''}`;
}

function Sparkline({
  series,
  color,
  domain,
}: {
  series: number[];
  color: string;
  domain: [number, number];
}): React.JSX.Element {
  const width = 240;
  const height = 46;
  const [min, max] = domain;
  const span = Math.max(0.001, max - min);
  const points = series.map((value, index) => {
    const x = series.length > 1 ? (index / (series.length - 1)) * width : 0;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point}`).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[46px] w-full">
      <path d={area} fill={`${color}14`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function ResultsCard({
  comparison,
  scenarioName,
  mode,
  onReplay,
  onDismiss,
}: {
  comparison: Comparison;
  scenarioName: string;
  mode: SimMode;
  onReplay: (mode: SimMode) => void;
  onDismiss: () => void;
}): React.JSX.Element {
  const rows = buildRows(comparison);
  const speedup =
    comparison.siloed.metrics.responseTimeMin !== null && comparison.coordinated.metrics.responseTimeMin
      ? comparison.siloed.metrics.responseTimeMin / comparison.coordinated.metrics.responseTimeMin
      : null;

  const allHealth = [...comparison.siloed.healthSeries, ...comparison.coordinated.healthSeries];
  const domain: [number, number] = [
    Math.min(...allHealth) - 2,
    Math.max(...allHealth) + 2,
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      className="glass w-full overflow-hidden rounded-2xl"
    >
      <header className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <span className="text-[10px] font-semibold tracking-[0.18em] text-white/40 uppercase">
          Response comparison
        </span>
        <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] text-white/60">{scenarioName}</span>
        {speedup && speedup > 1.02 ? (
          <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
            {speedup.toFixed(1)}× faster on scene
          </span>
        ) : null}
        <button
          type="button"
          onClick={onDismiss}
          className="ml-auto text-[11px] text-white/35 transition hover:text-white/70"
        >
          dismiss
        </button>
      </header>

      <div className="grid grid-cols-2 gap-4 px-4 py-3.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            <span className="text-[10.5px] font-semibold tracking-wide text-amber-200/80 uppercase">Before AI</span>
            <span className="text-[9.5px] text-white/30">departments siloed</span>
          </div>
          <Sparkline series={comparison.siloed.healthSeries} color="#f5b429" domain={domain} />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10.5px] font-semibold tracking-wide text-emerald-200/90 uppercase">After AI</span>
            <span className="text-[9.5px] text-white/30">coordinated response</span>
          </div>
          <Sparkline series={comparison.coordinated.healthSeries} color="#3ce8a4" domain={domain} />
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="grid grid-cols-[1.5fr_0.7fr_0.7fr_1fr] gap-x-2 border-b border-white/8 pb-1.5 text-[9.5px] font-semibold tracking-wide text-white/30 uppercase">
          <span>Metric</span>
          <span className="text-right">Before</span>
          <span className="text-right">After</span>
          <span className="text-right">Delta</span>
        </div>
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1.5fr_0.7fr_0.7fr_1fr] items-center gap-x-2 border-b border-white/5 py-1.5 last:border-0"
          >
            <span className="text-[11.5px] text-white/70">{row.label}</span>
            <span className="text-right font-mono text-[11.5px] tabular-nums text-white/45">
              {row.before === null ? '—' : `${row.before.toFixed(row.digits)}${row.unit && row.unit !== '%' ? '' : row.unit}`}
            </span>
            <span className="text-right font-mono text-[11.5px] tabular-nums text-white/90">
              {row.after === null ? '—' : `${row.after.toFixed(row.digits)}${row.unit && row.unit !== '%' ? '' : row.unit}`}
            </span>
            <span className="text-right font-mono text-[11px] tabular-nums text-emerald-300/90">{deltaText(row)}</span>
          </div>
        ))}
      </div>

      <footer className="flex items-center gap-2 border-t border-white/8 bg-white/[0.02] px-4 py-2.5">
        <span className="text-[10.5px] text-white/40">
          Both runs use the identical city, fleet and timeline. Only coordination changes.
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onReplay('siloed')}
            className={`rounded-lg border px-2.5 py-1 text-[10.5px] transition ${
              mode === 'siloed'
                ? 'border-amber-300/40 bg-amber-300/12 text-amber-100'
                : 'border-white/10 text-white/55 hover:border-white/25 hover:text-white'
            }`}
          >
            Replay before AI
          </button>
          <button
            type="button"
            onClick={() => onReplay('coordinated')}
            className={`rounded-lg border px-2.5 py-1 text-[10.5px] transition ${
              mode === 'coordinated'
                ? 'border-emerald-400/40 bg-emerald-400/12 text-emerald-100'
                : 'border-white/10 text-white/55 hover:border-white/25 hover:text-white'
            }`}
          >
            Replay after AI
          </button>
        </div>
      </footer>
    </motion.div>
  );
}
