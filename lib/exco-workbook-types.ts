/**
 * Types partagés EXCO workbook (client + serveur).
 */
import type { ExcoWorkbookSnapshot } from './exco-new-report-parse';
import type { ExcoReportPayload } from './exco-types';

export interface ExcoSheetTable {
  id: string;
  name: string;
  label: string;
  rows: Array<Array<string | number | null>>;
  rowCount: number;
  colCount: number;
}

export interface ExcoPptxView {
  sourceFile: string;
  periodLabel: string;
  coverTitle: string;
  narrative: {
    highlights?: string;
    lowlights?: string;
    focus?: string;
  };
  kpiCards?: Array<{
    label: string;
    value: string | null;
    delta: string | null;
    prev: string | null;
  }>;
  csrFy27Rows: Array<{
    name: string;
    objective: string;
    progress: string;
    risks: string;
    nextSteps: string;
  }>;
  cahierHighlights: Array<{
    icon: string;
    title: string;
    body: string;
    progressPct: number;
  }>;
  recruitment: {
    replacements: Array<{
      position: string;
      grade: string;
      status: string;
      comments: string;
      budgeted: string;
      department: string;
      location: string;
      contractType: string;
    }>;
    newPositions: Array<{
      position: string;
      grade: string;
      status: string;
      comments: string;
      budgeted: string;
      department: string;
      location: string;
      contractType: string;
    }>;
  };
  audit: {
    summary?: string;
    rows: Array<{
      number: string;
      finding: string;
      severity: string;
      status: string;
      comments: string;
      dueDate: string;
    }>;
  };
  governance?: {
    note?: string;
    progressionPctByMonth?: Record<string, string>;
  };
}

export interface ExcoBundledPayload {
  sourceFile: string;
  params: ExcoWorkbookSnapshot['params'];
  sheets: ExcoSheetTable[];
  snapshot: ExcoWorkbookSnapshot;
  report: ExcoReportPayload;
  pptx: ExcoPptxView | null;
  /** Noms système par matricule pour l’affichage BASE. */
  namesByMatricule?: Record<string, string>;
}
