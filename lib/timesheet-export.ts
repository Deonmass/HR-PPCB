import type { TimesheetPeriod } from './timesheet-period';
import type { TimesheetRowData } from './timesheet-types';

export type TimesheetExportRow = TimesheetRowData;

export interface TimesheetExportPayload {
  company: string;
  department: string;
  employeeName: string;
  matricule: string;
  localisation?: string;
  period: TimesheetPeriod;
  rows: TimesheetExportRow[];
}

export interface DepartmentExportEmployee {
  matricule: string;
  nom: string;
  localisation?: string;
  rows: TimesheetRowData[];
}

export interface DepartmentExportPayload {
  company: string;
  department: string;
  period: TimesheetPeriod;
  employees: DepartmentExportEmployee[];
}

async function postExport(body: Record<string, unknown>): Promise<ArrayBuffer> {
  const response = await fetch('/api/timesheet/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let message = 'Export impossible';
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  return response.arrayBuffer();
}

export async function exportTimesheetWorkbook(payload: TimesheetExportPayload): Promise<ArrayBuffer> {
  return postExport({ mode: 'employee', ...payload });
}

export async function exportDepartmentTimesheetWorkbook(
  payload: DepartmentExportPayload,
): Promise<ArrayBuffer> {
  return postExport({ mode: 'department', ...payload });
}

export function downloadTimesheetWorkbook(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
