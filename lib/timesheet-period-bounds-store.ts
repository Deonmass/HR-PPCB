import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_TIMESHEET_PERIOD_BOUNDS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import {
  applyTimesheetPeriodBounds,
  defaultTimesheetPeriodBounds,
  type TimesheetPeriodBounds,
} from './timesheet-period-bounds';
import { buildTimesheetPeriod, localDateKey, type TimesheetPeriod } from './timesheet-period';

type PeriodBoundsFile = {
  periods: Record<string, TimesheetPeriodBounds>;
};

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) return path.join(process.cwd(), relativePath);
  const writable = path.join(getWritableDataRoot(), relativePath.replace(/^data[\\/]/, ''));
  const bundled = path.join(process.cwd(), relativePath);
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

function boundsPath(): string {
  return resolveStorePath(path.join('data', 'timesheet', 'period-bounds.json'));
}

function periodKey(year: number, month: number): string {
  return `${Math.trunc(year)}-${Math.trunc(month)}`;
}

async function readBoundsFile(): Promise<PeriodBoundsFile> {
  const filePath = boundsPath();
  await hydrateDurableFile(DURABLE_TIMESHEET_PERIOD_BOUNDS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const json = JSON.parse(raw) as PeriodBoundsFile;
    return { periods: json.periods ?? {} };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { periods: {} };
    throw err;
  }
}

async function writeBoundsFile(data: PeriodBoundsFile): Promise<void> {
  const filePath = boundsPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_TIMESHEET_PERIOD_BOUNDS_KEY, filePath);
}

export async function getTimesheetPeriodBounds(
  year: number,
  month: number,
): Promise<TimesheetPeriodBounds> {
  const file = await readBoundsFile();
  const saved = file.periods[periodKey(year, month)];
  if (saved?.activeStart && saved?.activeEnd) {
    const applied = applyTimesheetPeriodBounds(buildTimesheetPeriod(year, month), saved);
    return {
      activeStart: localDateKey(applied.start),
      activeEnd: localDateKey(applied.end),
    };
  }
  return defaultTimesheetPeriodBounds(year, month);
}

export async function saveTimesheetPeriodBounds(
  year: number,
  month: number,
  bounds: TimesheetPeriodBounds,
): Promise<TimesheetPeriodBounds> {
  const base = buildTimesheetPeriod(year, month);
  const applied = applyTimesheetPeriodBounds(base, bounds);
  const normalized: TimesheetPeriodBounds = {
    activeStart: localDateKey(applied.start),
    activeEnd: localDateKey(applied.end),
  };
  const file = await readBoundsFile();
  file.periods[periodKey(year, month)] = normalized;
  await writeBoundsFile(file);
  return normalized;
}

export async function resolveTimesheetPeriod(year: number, month: number): Promise<TimesheetPeriod> {
  const bounds = await getTimesheetPeriodBounds(year, month);
  return applyTimesheetPeriodBounds(buildTimesheetPeriod(year, month), bounds);
}
