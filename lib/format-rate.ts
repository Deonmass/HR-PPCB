/** Taux / pourcentages : toujours 2 décimales. */

export const RATE_DECIMALS = 2;

export function roundRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Convertit une part / total en pourcentage (0–100) à 2 décimales. */
export function ratioToRate(part: number, total: number): number {
  if (!total || !Number.isFinite(part) || !Number.isFinite(total)) return 0;
  return roundRate((part / total) * 100);
}

export function formatRate(
  value: number | null | undefined,
  opts?: { suffix?: string; empty?: string },
): string {
  if (value == null || !Number.isFinite(value)) return opts?.empty ?? '—';
  return `${value.toFixed(RATE_DECIMALS)}${opts?.suffix ?? '%'}`;
}

export const EXCEL_RATE_FORMAT = '0.00%';
