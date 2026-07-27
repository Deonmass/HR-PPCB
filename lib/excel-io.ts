import * as XLSX from 'xlsx-js-style';
import fs from 'fs';

export type AoaCell = string | number | boolean | null | undefined;
export type AoaRow = AoaCell[];

/**
 * The Excel workbooks under `Excel/` are the source of truth for the app.
 * Every read/write goes through this module so that all mutations are
 * serialized (no concurrent read-modify-write races) and every sheet edit
 * keeps the rest of the workbook (formatting, column widths, merges, other
 * sheets, etc.) intact.
 *
 * Two things matter to preserve the original look of the workbook:
 *  1. We read/write with `cellStyles: true` and use `xlsx-js-style` (a fork of
 *     SheetJS that can actually *write* cell styles back out — the plain
 *     `xlsx` package silently drops fonts/fills/borders on write).
 *  2. We never regenerate a whole sheet from scratch (e.g. via `aoa_to_sheet`)
 *     when editing data — that would wipe every cell's style. Instead, edits
 *     go through `writeRowValues`/`shiftRowsUp`/`shiftRowsDown` below, which
 *     mutate cells in place and only touch `.t`/`.v`, keeping any existing
 *     `.s` (style) and `.z` (number format) untouched.
 */

const READ_OPTS: XLSX.ParsingOptions = { type: 'buffer', cellStyles: true, cellNF: true };
/** Faster parse for read-only data extraction (no style metadata). */
const READ_DATA_OPTS: XLSX.ParsingOptions = { type: 'buffer', cellStyles: false, cellNF: false };
const WRITE_OPTS: XLSX.WritingOptions = { type: 'buffer', bookType: 'xlsx', cellStyles: true };

const locks = new Map<string, Promise<unknown>>();

export function withExcelLock<T>(filePath: string, fn: () => Promise<T> | T): Promise<T> {
  const previous = locks.get(filePath) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  // Swallow errors for chaining purposes only; the real error still propagates to the caller via `run`.
  locks.set(filePath, run.catch(() => undefined));
  return run;
}

export class ExcelFileLockedError extends Error {
  constructor(filePath: string) {
    super(
      `Le fichier "${filePath}" est actuellement ouvert ou verrouillé (probablement ouvert dans Excel). ` +
        'Fermez-le puis réessayez.',
    );
    this.name = 'ExcelFileLockedError';
  }
}

function isFileLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 150;

/**
 * File locks from Excel/OneDrive/antivirus are usually transient, so reads
 * and writes are retried a few times with a short delay before giving up
 * with a clear, user-facing error message.
 */
async function withLockRetry<T>(filePath: string, fn: () => T): Promise<T> {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return fn();
    } catch (err) {
      const isLast = attempt === RETRY_ATTEMPTS;
      if (!isFileLockError(err)) throw err;
      if (isLast) throw new ExcelFileLockedError(filePath);
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  throw new ExcelFileLockedError(filePath);
}

export function readWorkbook(filePath: string): Promise<XLSX.WorkBook> {
  return withLockRetry(filePath, () => {
    // Read the raw bytes ourselves and hand them to XLSX.read() rather than using
    // XLSX.readFile() directly: under Next.js's bundled server runtime, the
    // package's own file-system auto-detection can fail ("Cannot access file").
    const buffer = fs.readFileSync(filePath);
    return XLSX.read(buffer, READ_OPTS);
  });
}

/** Lighter workbook read for listing / dashboards — skips style metadata. */
export function readWorkbookForData(filePath: string): Promise<XLSX.WorkBook> {
  return withLockRetry(filePath, () => {
    const buffer = fs.readFileSync(filePath);
    return XLSX.read(buffer, READ_DATA_OPTS);
  });
}

function getMaxPopulatedRow(ws: XLSX.WorkSheet): number {
  let max = 0;
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const { r } = XLSX.utils.decode_cell(key);
    if (r > max) max = r;
  }
  return max;
}

function getMaxPopulatedCol(ws: XLSX.WorkSheet): number {
  let max = 0;
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const { c } = XLSX.utils.decode_cell(key);
    if (c > max) max = c;
  }
  return max;
}

const BLOATED_ROW_THRESHOLD = 10_000;

/** True when sheet metadata claims far more rows than populated cells (e.g. 1M empty rows). */
export function isWorksheetBloated(ws: XLSX.WorkSheet, rowThreshold = BLOATED_ROW_THRESHOLD): boolean {
  const populatedMax = getMaxPopulatedRow(ws);
  if (populatedMax > rowThreshold) return true;

  const ref = ws['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    if (range.e.r > Math.max(rowThreshold, populatedMax + 100)) return true;
  }

  const rowsMeta = ws['!rows'];
  if (Array.isArray(rowsMeta) && rowsMeta.length > Math.max(rowThreshold, populatedMax + 100)) {
    return true;
  }

  return false;
}

/** Trim !ref / !rows and drop orphan cells beyond the last populated row. */
export function compactWorksheet(ws: XLSX.WorkSheet): void {
  const maxRow = getMaxPopulatedRow(ws);
  const maxCol = getMaxPopulatedCol(ws);

  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r > maxRow || c > maxCol) delete ws[key];
  }

  if (maxRow === 0 && maxCol === 0) {
    ws['!ref'] = 'A1';
  } else {
    ws['!ref'] = XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRow, c: maxCol },
    });
  }

  if (Array.isArray(ws['!rows']) && ws['!rows'].length > maxRow + 1) {
    ws['!rows'] = ws['!rows'].slice(0, maxRow + 1);
  }
}

/** Rebuild sheet from header + data rows only (drops empty filler rows). */
export function rebuildSheetFromRows(headerRows: AoaRow[], dataRows: AoaRow[]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);
}

function cellToAoaValue(cell: XLSX.CellObject | undefined): AoaCell {
  const value = cell?.v;
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value as AoaCell;
}

function readRowFromSheet(ws: XLSX.WorkSheet, rowIndex: number, colEnd: number): AoaRow {
  const row: AoaRow = [];
  for (let c = 0; c <= colEnd; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c })] as XLSX.CellObject | undefined;
    row.push(cellToAoaValue(cell));
  }
  return row;
}

export interface GetSheetBlockOptions {
  maxCols?: number;
  /** Stop after N consecutive empty cells in this column once data has started. */
  keyCol?: number;
  emptyStreakLimit?: number;
}

/**
 * Reads sheet rows from populated cells only — avoids scanning bloated !ref ranges
 * (e.g. CHECK DOCUMENTS BASE sheets that report 1M+ rows in Excel metadata).
 */
export function getSheetBlock(
  wb: XLSX.WorkBook,
  sheetName: string,
  dataStartRow: number,
  options: GetSheetBlockOptions = {},
): { headerRows: AoaRow[]; dataRows: AoaRow[] } {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Feuille "${sheetName}" introuvable dans le classeur Excel`);
  }

  const colEnd = options.maxCols ?? getMaxPopulatedCol(ws);
  const maxRow = getMaxPopulatedRow(ws);
  const keyCol = options.keyCol;
  const emptyStreakLimit = options.emptyStreakLimit ?? 5;

  const headerRows: AoaRow[] = [];
  for (let r = 0; r < dataStartRow; r++) {
    headerRows.push(readRowFromSheet(ws, r, colEnd));
  }

  const dataRows: AoaRow[] = [];
  let emptyStreak = 0;

  for (let r = dataStartRow; r <= maxRow; r++) {
    const row = readRowFromSheet(ws, r, colEnd);
    if (keyCol !== undefined) {
      const keyVal = String(row[keyCol] ?? '').trim();
      if (!keyVal) {
        emptyStreak++;
        if (dataRows.length > 0 && emptyStreak >= emptyStreakLimit) break;
        continue;
      }
      emptyStreak = 0;
    }
    dataRows.push(row);
  }

  return { headerRows, dataRows };
}

export function getSheet(wb: XLSX.WorkBook, sheetName: string): XLSX.WorkSheet {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Feuille "${sheetName}" introuvable dans le classeur Excel`);
  }
  return ws;
}

function getRange(ws: XLSX.WorkSheet): XLSX.Range {
  return ws['!ref']
    ? XLSX.utils.decode_range(ws['!ref'])
    : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
}

function growRange(ws: XLSX.WorkSheet, row: number, col: number): void {
  const range = getRange(ws);
  range.s.r = Math.min(range.s.r, row);
  range.s.c = Math.min(range.s.c, col);
  range.e.r = Math.max(range.e.r, row);
  range.e.c = Math.max(range.e.c, col);
  ws['!ref'] = XLSX.utils.encode_range(range);
}

function cloneStyle(style: XLSX.CellObject['s']): XLSX.CellObject['s'] | undefined {
  if (!style) return undefined;
  return JSON.parse(JSON.stringify(style)) as XLSX.CellObject['s'];
}

function cloneCellObject(cell: XLSX.CellObject): XLSX.CellObject {
  return {
    ...cell,
    s: cloneStyle(cell.s),
  };
}

function setWorksheetCell(ws: XLSX.WorkSheet, address: string, cell: XLSX.CellObject | undefined): void {
  if (cell) ws[address] = cell;
  else delete ws[address];
}

/**
 * Writes `values` into row `rowIndex` (0-based) starting at `startCol`,
 * updating each cell's value in place so its existing style/number-format
 * survive untouched. This is the formatting-safe replacement for rebuilding
 * a sheet with `aoa_to_sheet`.
 */
export function writeRowValues(
  ws: XLSX.WorkSheet,
  rowIndex: number,
  values: AoaRow,
  startCol = 0,
  options?: { skipEmpty?: boolean },
): void {
  const skipEmpty = options?.skipEmpty ?? false;
  values.forEach((value, i) => {
    const col = startCol + i;
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c: col });
    const existing = ws[addr] as XLSX.CellObject | undefined;
    if (value === undefined || value === null || value === '') {
      if (skipEmpty) return;
      if (existing) {
        delete existing.v;
        delete existing.w;
        delete existing.f;
        delete existing.r;
        delete existing.h;
        existing.t = 'z';
      }
      return;
    }
    const cell: XLSX.CellObject = existing
      ? {
          ...existing,
          s: cloneStyle(existing.s),
        }
      : ({} as XLSX.CellObject);
    delete cell.f;
    delete cell.w;
    delete cell.r;
    delete cell.h;
    if (typeof value === 'number') {
      cell.t = 'n';
      cell.v = value;
    } else if (typeof value === 'boolean') {
      cell.t = 'b';
      cell.v = value;
    } else {
      cell.t = 's';
      cell.v = String(value);
    }
    ws[addr] = cell;
  });
  if (values.length > 0) growRange(ws, rowIndex, startCol + values.length - 1);
}

/** Writes a single cell value in place, preserving existing style and number format. */
export function writeCellValue(
  ws: XLSX.WorkSheet,
  address: string,
  value: AoaCell,
  options?: { skipEmpty?: boolean },
): void {
  const { r, c } = XLSX.utils.decode_cell(address);
  writeRowValues(ws, r, [value], c, options);
}

/** Copies formatting (style, number format, row height) from one row onto another. */
export function cloneRowStyle(
  ws: XLSX.WorkSheet,
  sourceRow: number,
  targetRow: number,
  colStart: number,
  colEnd: number,
): void {
  for (let c = colStart; c <= colEnd; c++) {
    const srcAddr = XLSX.utils.encode_cell({ r: sourceRow, c });
    const dstAddr = XLSX.utils.encode_cell({ r: targetRow, c });
    const src = ws[srcAddr] as XLSX.CellObject | undefined;
    if (!src?.s && !src?.z) continue;

    const existing = ws[dstAddr] as XLSX.CellObject | undefined;
    ws[dstAddr] = {
      ...(existing || { t: 'z' }),
      t: existing?.t ?? 'z',
      s: src.s ? cloneStyle(src.s) : existing?.s,
      z: src.z ?? existing?.z,
    };
  }

  if (ws['!rows']?.[sourceRow]) {
    ws['!rows'] = ws['!rows'] ?? [];
    ws['!rows'][targetRow] = { ...ws['!rows'][sourceRow] };
  }
}

function shiftRowMetadataDown(ws: XLSX.WorkSheet, atRow: number, count: number): void {
  const range = getRange(ws);
  range.e.r += count;
  ws['!ref'] = XLSX.utils.encode_range(range);

  if (ws['!rows']) {
    const sourceRowInfo = ws['!rows'][atRow > 0 ? atRow - 1 : atRow];
    const inserted = Array.from({ length: count }, () => (
      sourceRowInfo ? { ...sourceRowInfo } : {}
    ));
    ws['!rows'].splice(atRow, 0, ...inserted);
  }

  if (ws['!merges']) {
    ws['!merges'] = ws['!merges'].map((merge) => {
      const next = {
        s: { r: merge.s.r, c: merge.s.c },
        e: { r: merge.e.r, c: merge.e.c },
      };
      if (next.s.r >= atRow) {
        next.s.r += count;
        next.e.r += count;
      } else if (next.e.r >= atRow) {
        next.e.r += count;
      }
      return next;
    });
  }
}

function shiftRowMetadataUp(ws: XLSX.WorkSheet, fromRow: number, count: number): void {
  const range = getRange(ws);
  range.e.r = Math.max(range.s.r, range.e.r - count);
  ws['!ref'] = XLSX.utils.encode_range(range);

  if (ws['!rows']) ws['!rows'].splice(fromRow, count);

  if (ws['!merges']) {
    ws['!merges'] = ws['!merges']
      .filter((merge) => !(merge.s.r >= fromRow && merge.e.r < fromRow + count))
      .map((merge) => {
        if (merge.s.r >= fromRow + count) {
          merge.s.r -= count;
          merge.e.r -= count;
        }
        return merge;
      });
  }
}

export function shiftRowsUp(ws: XLSX.WorkSheet, fromRow: number, count = 1): void {
  if (count <= 0) return;

  const moves: Array<{ to: string; cell: XLSX.CellObject }> = [];
  const keysToDelete: string[] = [];

  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r >= fromRow + count) {
      keysToDelete.push(key);
      moves.push({
        to: XLSX.utils.encode_cell({ r: r - count, c }),
        cell: cloneCellObject(ws[key] as XLSX.CellObject),
      });
    } else if (r >= fromRow) {
      keysToDelete.push(key);
    }
  }

  for (const key of keysToDelete) {
    delete ws[key];
  }
  for (const { to, cell } of moves) {
    ws[to] = cell;
  }

  shiftRowMetadataUp(ws, fromRow, count);
}

/**
 * Inserts `count` empty row(s) at `atRow` (0-based), shifting every row at
 * and below down so their cells (and styles) move with them — same effect as
 * Excel's own "Insert Row".
 */
export function shiftRowsDown(ws: XLSX.WorkSheet, atRow: number, count = 1): void {
  if (count <= 0) return;

  const moves: Array<{ to: string; cell: XLSX.CellObject }> = [];
  const keysToDelete: string[] = [];

  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(key);
    if (r >= atRow) {
      keysToDelete.push(key);
      moves.push({
        to: XLSX.utils.encode_cell({ r: r + count, c }),
        cell: cloneCellObject(ws[key] as XLSX.CellObject),
      });
    }
  }

  for (const key of keysToDelete) {
    delete ws[key];
  }
  for (const { to, cell } of moves) {
    ws[to] = cell;
  }

  shiftRowMetadataDown(ws, atRow, count);
}

export function cloneWorksheet(ws: XLSX.WorkSheet): XLSX.WorkSheet {
  const clone: XLSX.WorkSheet = {};

  for (const key of Object.keys(ws)) {
    if (key === '!merges' && Array.isArray(ws['!merges'])) {
      clone['!merges'] = ws['!merges'].map((merge) => ({
        s: { r: merge.s.r, c: merge.s.c },
        e: { r: merge.e.r, c: merge.e.c },
      }));
      continue;
    }

    if (key === '!rows' && Array.isArray(ws['!rows'])) {
      clone['!rows'] = ws['!rows'].map((row) => (row ? { ...row } : row));
      continue;
    }

    if (key === '!cols' && Array.isArray(ws['!cols'])) {
      clone['!cols'] = ws['!cols'].map((col) => (col ? { ...col } : col));
      continue;
    }

    if (key.startsWith('!')) {
      clone[key] = ws[key];
      continue;
    }

    clone[key] = cloneCellObject(ws[key] as XLSX.CellObject);
  }

  return clone;
}

function prepareWorkbookForWrite(wb: XLSX.WorkBook): void {
  const workbookMeta = wb.Workbook || {};
  wb.Workbook = {
    ...workbookMeta,
  };
  (wb.Workbook as Record<string, unknown>).CalcPr = {
    ...((workbookMeta as Record<string, unknown>).CalcPr as Record<string, unknown> | undefined),
    fullCalcOnLoad: true,
  };
}

/** Serializes a workbook to an in-memory buffer (preserves cell styles). */
export function writeWorkbookToBuffer(wb: XLSX.WorkBook): Buffer {
  prepareWorkbookForWrite(wb);
  return XLSX.write(wb, WRITE_OPTS) as Buffer;
}

export function saveWorkbook(wb: XLSX.WorkBook, filePath: string): Promise<void> {
  const buffer = writeWorkbookToBuffer(wb);
  return withLockRetry(filePath, () => {
    fs.writeFileSync(filePath, buffer);
  });
}

/** Maps a thrown error to an HTTP status + user-facing message for API routes. */
export function excelErrorResponse(err: unknown): { status: number; message: string } {
  if (err instanceof ExcelFileLockedError) {
    return { status: 503, message: err.message };
  }
  const message = err instanceof Error ? err.message : 'Erreur inattendue';
  return { status: 500, message: `Erreur lors de l'accès au fichier Excel : ${message}` };
}
