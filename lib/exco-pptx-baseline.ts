/**
 * Applique l’extraction exacte du PPTX EXCO (narrative, CSR, Cahier,
 * recrutement, audit) sur les overlays.
 */
import fs from 'fs/promises';
import path from 'path';
import type {
  ExcoAuditFinding,
  ExcoCahierHighlight,
  ExcoCahierIcon,
  ExcoCsrFy27Row,
  ExcoOverlays,
  ExcoRecruitmentRow,
} from './exco-types';
import { emptyExcoOverlays } from './exco-types';

export interface ExcoPptxExtracted {
  sourceFile: string;
  periodLabel: string;
  coverTitle: string;
  narrative: {
    highlights?: string;
    lowlights?: string;
    focus?: string;
  };
  csrFy27Rows: Array<{
    name: string;
    objective: string;
    progress: string;
    risks: string;
    nextSteps: string;
  }>;
  cahierHighlights: Array<{
    icon: ExcoCahierIcon | string;
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

const DEFAULT_EXTRACT_PATH = path.join(
  process.cwd(),
  'data',
  'exco',
  'pptx-extracted-jul26.json',
);

function uid(prefix: string, index: number): string {
  return `${prefix}-${String(index + 1).padStart(2, '0')}`;
}

function mapSeverity(raw: string): ExcoAuditFinding['severity'] {
  const s = raw.trim().toLowerCase();
  if (s === 'high') return 'High';
  if (s === 'medium') return 'Medium';
  if (s === 'low') return 'Low';
  return '';
}

function mapAuditStatus(raw: string): ExcoAuditFinding['status'] {
  const s = raw.trim().toLowerCase();
  if (s === 'closed') return 'Closed';
  if (s === 'overdue') return 'Overdue';
  if (s === 'on going' || s === 'ongoing') return 'On going';
  if (s === 'open') return 'Open';
  return '';
}

function mapCahierIcon(raw: string): ExcoCahierIcon {
  const s = raw.trim().toLowerCase();
  if (s.includes('infra')) return 'infrastructure';
  if (s.includes('agri')) return 'agriculture';
  if (s.includes('leisure') || s.includes('sport')) return 'leisure';
  if (s.includes('electric')) return 'electricity';
  if (s.includes('scholar')) return 'scholarship';
  const allowed: ExcoCahierIcon[] = [
    'scholarship',
    'infrastructure',
    'agriculture',
    'leisure',
    'electricity',
  ];
  return (allowed.includes(raw as ExcoCahierIcon) ? raw : 'scholarship') as ExcoCahierIcon;
}

export async function loadExcoPptxExtracted(
  filePath = DEFAULT_EXTRACT_PATH,
): Promise<ExcoPptxExtracted | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as ExcoPptxExtracted;
  } catch {
    return null;
  }
}

export function pptxExtractToOverlayPatch(extracted: ExcoPptxExtracted): Partial<ExcoOverlays> {
  const csrFy27Rows: ExcoCsrFy27Row[] = (extracted.csrFy27Rows || []).map((row, i) => ({
    id: uid('csr', i),
    name: row.name || '',
    objective: row.objective || '',
    progress: row.progress || '',
    risks: row.risks || '',
    nextSteps: row.nextSteps || '',
  }));

  const cahierHighlights: ExcoCahierHighlight[] = (extracted.cahierHighlights || []).map(
    (row, i) => ({
      id: uid('cahier', i),
      icon: mapCahierIcon(String(row.icon || row.title || '')),
      title: row.title || '',
      body: row.body || '',
      progressPct: Number.isFinite(row.progressPct) ? row.progressPct : 0,
    }),
  );

  const recruitment: ExcoRecruitmentRow[] = [
    ...(extracted.recruitment?.replacements || []).map((row, i) => ({
      id: uid('repl', i),
      category: 'replacement' as const,
      position: row.position || '',
      grade: row.grade || '',
      status: row.status || '',
      comments: row.comments || '',
      budgeted: row.budgeted || '',
      department: row.department || '',
      location: row.location || '',
      contractType: row.contractType || '',
    })),
    ...(extracted.recruitment?.newPositions || []).map((row, i) => ({
      id: uid('new', i),
      category: 'new' as const,
      position: row.position || '',
      grade: row.grade || '',
      status: row.status || '',
      comments: row.comments || '',
      department: row.department || '',
      budgeted: row.budgeted || '',
      location: row.location || '',
      contractType: row.contractType || '',
    })),
  ];

  const auditFindings: ExcoAuditFinding[] = (extracted.audit?.rows || []).map((row, i) => ({
    id: uid('audit', i),
    number: row.number || String(i + 1),
    finding: row.finding || '',
    severity: mapSeverity(row.severity || ''),
    status: mapAuditStatus(row.status || ''),
    comments: row.comments || '',
    dueDate: row.dueDate || '',
  }));

  return {
    narrative: {
      ...emptyExcoOverlays().narrative,
      meetingTitle: extracted.coverTitle || 'EXCO MEETING',
      meetingDate: extracted.periodLabel || '',
      highlights: extracted.narrative?.highlights || '',
      lowlights: extracted.narrative?.lowlights || '',
      focus: extracted.narrative?.focus || '',
    },
    csrFy27Rows,
    cahierHighlights,
    recruitment,
    auditFindings,
  };
}

export async function applyPptxBaselineToOverlays(
  overlays: ExcoOverlays,
  options?: { force?: boolean },
): Promise<ExcoOverlays> {
  const extracted = await loadExcoPptxExtracted();
  if (!extracted) return overlays;
  const patch = pptxExtractToOverlayPatch(extracted);
  const force = options?.force === true;
  const hasNarrative =
    Boolean(overlays.narrative?.highlights?.trim())
    || Boolean(overlays.narrative?.lowlights?.trim())
    || Boolean(overlays.narrative?.focus?.trim());

  return {
    ...overlays,
    narrative: force || !hasNarrative
      ? { ...overlays.narrative, ...patch.narrative }
      : overlays.narrative,
    csrFy27Rows:
      force || !(overlays.csrFy27Rows || []).length
        ? patch.csrFy27Rows || []
        : overlays.csrFy27Rows,
    cahierHighlights:
      force || !(overlays.cahierHighlights || []).length
        ? patch.cahierHighlights || []
        : overlays.cahierHighlights,
    recruitment:
      force || !(overlays.recruitment || []).length
        ? patch.recruitment || []
        : overlays.recruitment,
    auditFindings:
      force || !(overlays.auditFindings || []).length
        ? patch.auditFindings || []
        : overlays.auditFindings,
  };
}
