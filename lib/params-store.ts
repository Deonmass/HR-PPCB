import 'server-only';

import {
  cloneRowStyle,
  getSheet,
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  shiftRowsUp,
  withExcelLock,
  writeRowValues,
  type AoaRow,
} from './excel-io';
import type { CostCenterSetting, DepartmentSetting } from './auth-types';
import { resolveWorkbookPath } from './runtime-mode';

const PARAMS_PATH = resolveWorkbookPath('Params.xlsx', process.env.PARAMS_XLSX);
const SHEET_NAME = 'Sheet1';
const DATA_START = 1;
const COL_DEPARTMENT = 0;
const COL_COST_CENTER = 1;

interface ParamsWorkbookState {
  filePath: string;
  wb: Awaited<ReturnType<typeof readWorkbook>>;
  ws: import('xlsx-js-style').WorkSheet;
  dataRows: AoaRow[];
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

export function departmentIdFromName(name: string): string {
  return `dept-${slugify(name)}`;
}

export function costCenterIdFromRow(rowIndex: number): string {
  return `cc-${rowIndex}`;
}

function parseCostCenterRowId(id: string): number | null {
  const match = id.trim().match(/^cc-(\d+)$/);
  if (!match) return null;
  const rowIndex = Number.parseInt(match[1], 10);
  return Number.isInteger(rowIndex) && rowIndex >= DATA_START ? rowIndex : null;
}

async function loadState(): Promise<ParamsWorkbookState> {
  const wb = await readWorkbook(PARAMS_PATH);
  const ws = getSheet(wb, SHEET_NAME);
  const sheet = getSheetBlock(wb, SHEET_NAME, DATA_START);
  return { filePath: PARAMS_PATH, wb, ws, dataRows: sheet.dataRows };
}

function findNextEmptyRow(dataRows: AoaRow[]): number {
  const firstEmpty = dataRows.findIndex((row) => !str(row[COL_DEPARTMENT]) && !str(row[COL_COST_CENTER]));
  if (firstEmpty >= 0) return firstEmpty;
  return dataRows.length;
}

function ensureHeader(ws: ParamsWorkbookState['ws']): void {
  writeRowValues(ws, 0, ['Departement', 'Centre de cout']);
}

function rowToDepartmentNames(dataRows: AoaRow[]): string[] {
  const names = new Set<string>();
  for (const row of dataRows) {
    const department = str(row[COL_DEPARTMENT]);
    if (department) names.add(department);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
}

function findDepartmentNameById(dataRows: AoaRow[], id: string): string | null {
  for (const name of rowToDepartmentNames(dataRows)) {
    if (departmentIdFromName(name) === id) return name;
  }
  return null;
}

export async function listDepartmentsFromParams(): Promise<DepartmentSetting[]> {
  return withExcelLock(PARAMS_PATH, async () => {
    const state = await loadState();
    return rowToDepartmentNames(state.dataRows).map((name) => ({
      id: departmentIdFromName(name),
      name,
      code: name,
      active: true,
    }));
  });
}

export async function listCostCentersFromParams(): Promise<CostCenterSetting[]> {
  return withExcelLock(PARAMS_PATH, async () => {
    const state = await loadState();
    const items: CostCenterSetting[] = [];

    state.dataRows.forEach((row, index) => {
      const costCenter = str(row[COL_COST_CENTER]);
      if (!costCenter) return;

      const department = str(row[COL_DEPARTMENT]);
      const rowIndex = DATA_START + index;
      items.push({
        id: costCenterIdFromRow(rowIndex),
        code: costCenter,
        name: costCenter,
        departmentId: department ? departmentIdFromName(department) : undefined,
        active: true,
      });
    });

    return items.sort((a, b) => a.code.localeCompare(b.code, 'fr'));
  });
}

export async function upsertDepartmentInParams(item: DepartmentSetting): Promise<DepartmentSetting> {
  return withExcelLock(PARAMS_PATH, async () => {
    const state = await loadState();
    ensureHeader(state.ws);

    const nextName = item.name.trim();
    if (!nextName) throw new Error('Nom du département requis');

    const previousName = item.id ? findDepartmentNameById(state.dataRows, item.id) : null;

    if (previousName && previousName !== nextName) {
      state.dataRows.forEach((row, index) => {
        if (str(row[COL_DEPARTMENT]) !== previousName) return;
        writeRowValues(state.ws, DATA_START + index, [nextName, str(row[COL_COST_CENTER])]);
      });
    } else if (!previousName) {
      const targetRowIndex = DATA_START + findNextEmptyRow(state.dataRows);
      const styleSourceRow = targetRowIndex > DATA_START ? targetRowIndex - 1 : DATA_START;
      cloneRowStyle(state.ws, styleSourceRow, targetRowIndex, COL_DEPARTMENT, COL_COST_CENTER);
      writeRowValues(state.ws, targetRowIndex, [nextName, '']);
    }

    await saveWorkbook(state.wb, state.filePath);

    return {
      id: departmentIdFromName(nextName),
      name: nextName,
      code: item.code?.trim() || nextName,
      active: item.active ?? true,
    };
  });
}

export async function deleteDepartmentFromParams(id: string): Promise<boolean> {
  return withExcelLock(PARAMS_PATH, async () => {
    const state = await loadState();
    const departmentName = findDepartmentNameById(state.dataRows, id);
    if (!departmentName) return false;

    const rowsToDelete = state.dataRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => str(row[COL_DEPARTMENT]) === departmentName)
      .map(({ index }) => DATA_START + index)
      .sort((a, b) => b - a);

    for (const rowIndex of rowsToDelete) {
      shiftRowsUp(state.ws, rowIndex, 1);
    }

    await saveWorkbook(state.wb, state.filePath);
    return true;
  });
}

export async function upsertCostCenterInParams(item: CostCenterSetting): Promise<CostCenterSetting> {
  return withExcelLock(PARAMS_PATH, async () => {
    const state = await loadState();
    ensureHeader(state.ws);

    const code = item.code.trim();
    const name = item.name.trim() || code;
    if (!code) throw new Error('Code centre de coût requis');

    let departmentName = '';
    if (item.departmentId) {
      departmentName = findDepartmentNameById(state.dataRows, item.departmentId) ?? '';
    }

    const existingRowIndex = item.id ? parseCostCenterRowId(item.id) : null;
    if (existingRowIndex !== null) {
      writeRowValues(state.ws, existingRowIndex, [departmentName, code]);
      await saveWorkbook(state.wb, state.filePath);
      return {
        id: costCenterIdFromRow(existingRowIndex),
        code,
        name,
        departmentId: departmentName ? departmentIdFromName(departmentName) : undefined,
        active: item.active ?? true,
      };
    }

    const targetRowIndex = DATA_START + findNextEmptyRow(state.dataRows);
    const styleSourceRow = targetRowIndex > DATA_START ? targetRowIndex - 1 : DATA_START;
    cloneRowStyle(state.ws, styleSourceRow, targetRowIndex, COL_DEPARTMENT, COL_COST_CENTER);
    writeRowValues(state.ws, targetRowIndex, [departmentName, code]);
    await saveWorkbook(state.wb, state.filePath);

    return {
      id: costCenterIdFromRow(targetRowIndex),
      code,
      name,
      departmentId: departmentName ? departmentIdFromName(departmentName) : undefined,
      active: item.active ?? true,
    };
  });
}

export async function deleteCostCenterFromParams(id: string): Promise<boolean> {
  return withExcelLock(PARAMS_PATH, async () => {
    const rowIndex = parseCostCenterRowId(id);
    if (rowIndex === null) return false;

    const state = await loadState();
    if (rowIndex - DATA_START >= state.dataRows.length) return false;

    shiftRowsUp(state.ws, rowIndex, 1);
    await saveWorkbook(state.wb, state.filePath);
    return true;
  });
}

export function createDepartmentId(name: string): string {
  return departmentIdFromName(name);
}

export function createCostCenterId(_rowIndex?: number): string {
  return '';
}
