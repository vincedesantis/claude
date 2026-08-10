// Simple weekend check (UTC-based approximation) — doesn't account for
// market holidays, only Saturday/Sunday. Good enough for a daily cron;
// worth revisiting if holiday false-positives turn out to matter.
export function isWeekend(date: Date = new Date()): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}
