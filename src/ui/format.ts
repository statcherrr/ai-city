/** Small formatting helpers shared by the dashboard panels. */

export function formatClock(minutes: number): string {
  const total = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(total / 60);
  const mins = Math.floor(total % 60);
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function formatMinutes(minutes: number | null, digits = 1): string {
  if (minutes === null) return '—';
  return `${minutes.toFixed(digits)} min`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}
