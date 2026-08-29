'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import { EXCO_SOURCE_FILES, type ExcoSourceFileId } from '@/lib/exco-source-files';
import {
  buildStaffCostSheet,
  staffCostInputFromPartial,
  workbookMonthToYtdInput,
  type ExcoStaffCostYtdInput,
  type StaffCostSheetCell,
  type StaffCostSheetMonth,
} from '@/lib/exco-staff-cost-model';
import type {
  ExcoWorkbookStaffCostMonth,
  ExcoWorkbookOtActualVsBudget,
  ExcoWorkbookOtTrendRow,
} from '@/lib/exco-new-report-parse';
import {
  OVT_TREND_MONTH_LABELS,
  OVT_AVB_MONTH_LABELS,
  OVT_TREND_MONTHS,
} from '@/lib/exco-new-report-parse';
import { otChartDeptLabel } from '@/lib/exco-ot-slide-data';
import ExcoOtOverviewCharts from '@/components/exco/ExcoOtOverviewCharts';
import ExcoNarrativePanel from '@/components/exco/ExcoNarrativePanel';
import ExcoExportMenu from '@/components/exco/ExcoExportMenu';
import type { ExcoSheetTable } from '@/lib/exco-workbook-types';
import { formatNarrativeForEdit } from '@/lib/exco-narrative-format';
import { showError, showSuccess } from '@/lib/swal';
import { ratioToRate } from '@/lib/format-rate';
import { useI18n } from '@/contexts/LocaleContext';
import type { MessageKey } from '@/lib/i18n';

type TabId =
  | 'params'
  | 'headcount'
  | 'inout'
  | 'staffcost'
  | 'overtime'
  | 'kpi'
  | 'summary'
  | 'csr'
  | 'recruitment'
  | 'audit';

const TAB_DEFS: { id: TabId; labelKey: MessageKey }[] = [
  { id: 'params', labelKey: 'exco.tab.params' },
  { id: 'kpi', labelKey: 'exco.tab.kpi' },
  { id: 'summary', labelKey: 'exco.tab.summary' },
  { id: 'headcount', labelKey: 'exco.tab.headcount' },
  { id: 'inout', labelKey: 'exco.tab.inout' },
  { id: 'staffcost', labelKey: 'exco.tab.staffcost' },
  { id: 'overtime', labelKey: 'exco.tab.overtime' },
  { id: 'csr', labelKey: 'exco.tab.csr' },
  { id: 'recruitment', labelKey: 'exco.tab.recruitment' },
  { id: 'audit', labelKey: 'exco.tab.audit' },
];

const CAL_MONTH_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

/** Colonnes feuille BASE (New report.xlsx) — ordre d’affichage. */
const BASE_COLUMNS = [
  'Emp Number',
  'Names',
  'Gender',
  'Nationality',
  'Position',
  'Grade',
  'Birth',
  'Age',
  'AGE_CAT',
  'Empl_Date',
  'Length of Service',
  'Length of Service_CAT',
  'Departments',
  'Location_Site',
  'Leave_Balance',
  'Allowance Amount',
  'OVT_Hours',
  'OVT_Cost',
] as const;

const BASE_IMPORT_ONLY_COLUMNS = new Set<string>([
  'Leave_Balance',
  'Allowance Amount',
  'OVT_Hours',
  'OVT_Cost',
]);

const BASE_HEADER_ALIASES: Record<string, string> = {
  'leave allowance_amount': 'Allowance Amount',
  'leave allowance amount': 'Allowance Amount',
  'leave_allowance_amount': 'Allowance Amount',
  'allowance amount': 'Allowance Amount',
  'allowance_amount': 'Allowance Amount',
  'length of service cat': 'Length of Service_CAT',
  'length of service_cat': 'Length of Service_CAT',
  nationality: 'Nationality',
  nationalite: 'Nationality',
  nationalité: 'Nationality',
};

type HeadcountView = {
  headcount: number;
  male: number;
  female: number;
  malePct: number;
  femalePct: number;
  genderByLocation: Array<{ location: string; male: number; female: number; total: number }>;
  ageBands: Array<{ label: string; value: number }>;
  seniorityBands: Array<{ label: string; value: number }>;
  averageAge: number | null;
  averageAgeMale: number | null;
  averageAgeFemale: number | null;
  averageLengthOfService: number | null;
  retirement: number;
  preRetirement: number;
};

type InOutPerson = {
  matricule: string;
  nom: string;
  localisation: string;
  departement: string;
  grade: string;
  genre: string;
  company: string;
  appointmentDate: string;
  site: string;
  reason?: string;
};

type InOutView = {
  months: Array<{
    monthKey: string;
    calendarMonth: number | null;
    in: number | null;
    out: number | null;
    attritionRate: number | null;
    turnover: number | null;
    headcount: number | null;
  }>;
  ytdIn: number | null;
  ytdOut: number | null;
  ytdAttrition: number | null;
  ytdTurnover: number | null;
  ytdHeadcount: number | null;
  exitsByReason: Array<{ label: string; value: number }>;
  inList: InOutPerson[];
  outList: InOutPerson[];
  hiresByMonth: Record<number, InOutPerson[]>;
  exitsByMonth: Record<number, InOutPerson[]>;
};

type StaffCostView = {
  /** Grille FY (Input + dérivés) avec formules documentées. */
  sheet: StaffCostSheetMonth[];
  /** Saisie YTD par mois calendaire. */
  ytdByMonth: Record<number, ExcoStaffCostYtdInput>;
};

type StaffCostFormulaNote = {
  explanation: string;
  calc: string | null;
  formula: string;
};

type FormulaModalState = {
  mode: 'view' | 'edit';
  cellKey: string;
  cell: StaffCostSheetCell;
};

type FormulaMenuState = {
  x: number;
  y: number;
  cellKey: string;
  cell: StaffCostSheetCell;
};

function applyFormulaNote(cell: StaffCostSheetCell, note?: StaffCostFormulaNote | null): StaffCostSheetCell {
  if (!note) return cell;
  return {
    ...cell,
    explanation: note.explanation || cell.explanation,
    calc: note.calc !== undefined ? note.calc : cell.calc,
    formula: note.formula || cell.formula,
  };
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

/** Colonnes alignées Input / FY Actual / FY Budget (metric + 12 mois + Total). */
function StaffCostColGroup() {
  return (
    <colgroup>
      <col className="exco-sc-col-metric" />
      {Array.from({ length: 12 }, (_, i) => (
        <col key={i} className="exco-sc-col-month" />
      ))}
      <col className="exco-sc-col-total" />
    </colgroup>
  );
}

function FormulaCell({
  cell,
  cellKey,
  digits = 0,
  pct = false,
  highlight = false,
  editable = false,
  disabled = false,
  excelStyle = false,
  onChange,
  onFormulaMenu,
}: {
  cell: StaffCostSheetCell;
  cellKey: string;
  digits?: number;
  pct?: boolean;
  highlight?: boolean;
  editable?: boolean;
  disabled?: boolean;
  /** Format Excel Staff_Cost_KPI (2 déc., négatifs entre parenthèses, 0 → -). */
  excelStyle?: boolean;
  onChange?: (value: number | null) => void;
  onFormulaMenu?: (e: ReactMouseEvent, cellKey: string, cell: StaffCostSheetCell) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const display = pct
    ? (cell.value != null ? formatRatePct(cell.value) : (excelStyle ? '-' : '—'))
    : excelStyle
      ? formatStaffCostExcel(cell.value, { digits: digits || 2 })
      : (cell.value != null ? formatNum(cell.value, digits) : '—');

  useEffect(() => {
    if (editing) {
      setDraft(cell.value != null ? String(cell.value) : '');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, cell.value]);

  const commitEdit = () => {
    onChange?.(parseInputNum(draft));
    setEditing(false);
  };

  const tdClass = [
    highlight ? 'is-report-month' : '',
    editable ? 'is-editable-cell' : '',
    editing ? 'is-editing' : '',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <td
      className={tdClass}
      onContextMenu={(e) => {
        e.preventDefault();
        onFormulaMenu?.(e, cellKey, cell);
      }}
    >
      {editing ? (
        <div className="exco-staffcost-inline-edit">
          <input
            ref={inputRef}
            type="number"
            step="any"
            className="exco-staffcost-cell-input"
            disabled={disabled}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitEdit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(false);
              }
            }}
          />
          <button
            type="button"
            className="exco-staffcost-ok-btn"
            disabled={disabled}
            onClick={commitEdit}
          >
            OK
          </button>
        </div>
      ) : (
        <div className="exco-staffcost-cell-label">
          {editable && !disabled && (
            <button
              type="button"
              className="exco-staffcost-pencil"
              title="Modifier"
              aria-label="Modifier"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              <PencilIcon />
            </button>
          )}
          <span className="exco-formula-cell-value">{display}</span>
        </div>
      )}
    </td>
  );
}

function StaffCostFormulaModal({
  state,
  canEdit,
  onClose,
  onSave,
}: {
  state: FormulaModalState;
  canEdit: boolean;
  onClose: () => void;
  onSave: (cellKey: string, note: StaffCostFormulaNote) => void;
}) {
  const base = state.cell;
  const [explanation, setExplanation] = useState(base.explanation);
  const [calc, setCalc] = useState(base.calc || '');
  const [formula, setFormula] = useState(base.formula);
  const editing = state.mode === 'edit' && canEdit;
  const modalRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    setExplanation(base.explanation);
    setCalc(base.calc || '');
    setFormula(base.formula);
    setOffset({ x: 0, y: 0 });
  }, [base, state.cellKey, state.mode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onDragPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    e.preventDefault();
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: offset.x,
      origY: offset.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onDragPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setOffset({
      x: drag.origX + (e.clientX - drag.startX),
      y: drag.origY + (e.clientY - drag.startY),
    });
  };

  const onDragPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  return (
    <div
      className="modal-overlay open exco-formula-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="modal modal-form exco-formula-modal"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="exco-formula-modal-title"
      >
        <div
          className="modal-header exco-formula-modal-drag"
          onPointerDown={onDragPointerDown}
          onPointerMove={onDragPointerMove}
          onPointerUp={onDragPointerUp}
          onPointerCancel={onDragPointerUp}
          title="Glisser pour déplacer"
        >
          <h3 id="exco-formula-modal-title">
            {editing ? 'Modifier la formule' : 'Voir la formule'} — {base.title}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>
        <div className="modal-body exco-formula-modal-body">
          <div className="exco-formula-result">
            <span>Résultat</span>
            <strong>
              {base.value != null ? formatNum(base.value, base.value % 1 === 0 ? 0 : 2) : '—'}
            </strong>
          </div>

          {editing ? (
            <>
              <label className="exco-formula-field">
                <span>Explication</span>
                <textarea
                  rows={4}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                />
              </label>
              <label className="exco-formula-field">
                <span>Calcul (déroulement numérique)</span>
                <input type="text" value={calc} onChange={(e) => setCalc(e.target.value)} />
              </label>
              <label className="exco-formula-field">
                <span>Référence Excel</span>
                <input type="text" value={formula} onChange={(e) => setFormula(e.target.value)} />
              </label>
              <p className="exco-muted exco-formula-hint">
                La modification documente la formule affichée ; le calcul automatique des tableaux reste basé sur les règles Staff_Cost_KPI.
              </p>
            </>
          ) : (
            <>
              <section className="exco-formula-block">
                <h4>Comment ce chiffre est obtenu</h4>
                <p>{base.explanation}</p>
              </section>
              {base.calc && (
                <section className="exco-formula-block">
                  <h4>Déroulement</h4>
                  <code className="exco-formula-calc">{base.calc}</code>
                </section>
              )}
              <section className="exco-formula-block">
                <h4>Sources (références)</h4>
                {base.sources.length === 0 ? (
                  <p className="exco-muted">Aucune source listée — valeur saisie ou constante.</p>
                ) : (
                  <ul className="exco-formula-sources">
                    {base.sources.map((s) => (
                      <li key={`${s.label}-${s.origin}`}>
                        <div className="exco-formula-source-main">
                          <code className="exco-formula-source-ref" title="Référence Excel / origine">
                            {s.origin}
                          </code>
                          <strong>{s.label}</strong>
                        </div>
                        <span className="exco-formula-source-value">
                          {s.value != null ? formatNum(s.value, s.value % 1 === 0 ? 0 : 2) : '—'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="exco-formula-block">
                <h4>Référence Excel</h4>
                <code className="exco-formula-calc">{base.formula}</code>
              </section>
            </>
          )}
        </div>
        <div className="modal-footer">
          {editing ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onSave(state.cellKey, {
                    explanation: explanation.trim(),
                    calc: calc.trim() || null,
                    formula: formula.trim(),
                  });
                  onClose();
                }}
              >
                Enregistrer la formule
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Total Excel = SUM(mois) — lignes mensuelles / ratios. */
function sumSheetValues(
  sheet: StaffCostSheetMonth[],
  getter: (m: StaffCostSheetMonth) => number | null,
): number | null {
  let sum = 0;
  let any = false;
  for (const m of sheet) {
    const v = getter(m);
    if (v == null) continue;
    sum += v;
    any = true;
  }
  return any ? Math.round(sum * 100) / 100 : null;
}

/** Total Excel = MAX(mois) — lignes de cumul (Staff_Cumul, Volume_Cum, …). */
function maxSheetValues(
  sheet: StaffCostSheetMonth[],
  getter: (m: StaffCostSheetMonth) => number | null,
): number | null {
  let max: number | null = null;
  for (const m of sheet) {
    const v = getter(m);
    if (v == null) continue;
    if (max == null || v > max) max = v;
  }
  return max;
}

const INOUT_LIST_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'genre', label: 'Genre' },
  { key: 'grade', label: 'Grade' },
  { key: 'departement', label: 'Département' },
  { key: 'date', label: 'Date' },
  { key: 'motif', label: 'Motif' },
];

function inOutPersonToRow(
  r: InOutPerson,
  names: Record<string, string>,
  depts: Record<string, string>,
): DashboardListRow {
  const mat = normMatricule(r.matricule);
  return {
    id: `${r.matricule}-${r.appointmentDate}-${r.reason || ''}`,
    cells: {
      matricule: r.matricule,
      nom: names[mat] || r.nom,
      genre: r.genre || '—',
      grade: r.grade || '—',
      departement: depts[mat] || r.departement || '—',
      date: formatInOutDate(r.appointmentDate),
      motif: r.reason || '—',
    },
  };
}

type ImportedFlags = {
  componentPostedUnits: boolean;
  leaveBalances: boolean;
  engagementsTerminations: boolean;
};

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Actual vs Budget OVT : APR→MAR. */
const OVT_AVB_MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3] as const;

type UploadMeta = {
  file: string;
  originalName: string;
  uploadedAt: string;
  exists: boolean;
};

type ParamsState = {
  year: number;
  month: number;
  fxRateFcPerUsd: number | null;
  uploads: Partial<Record<ExcoSourceFileId, UploadMeta>>;
  imported?: ImportedFlags;
  importedSources?: Partial<Record<keyof ImportedFlags, { importedAt: string; originalName: string }>>;
  hasData?: boolean;
  baseImportColumns?: BaseImportColumns;
};

type BaseImportColumns = {
  leaveDaysByMatricule: Record<string, number>;
  leaveValueFcByMatricule: Record<string, number>;
  ovtHoursByMatricule: Record<string, number>;
  ovtCostFcByMatricule: Record<string, number>;
};

const EMPTY_BASE_IMPORT_COLUMNS: BaseImportColumns = {
  leaveDaysByMatricule: {},
  leaveValueFcByMatricule: {},
  ovtHoursByMatricule: {},
  ovtCostFcByMatricule: {},
};

type BaseReconcile = {
  year: number;
  month: number;
  baseEmployees: number;
  systemActive: number;
  systemExits: number;
  matched: number;
  actionableCount: number;
  namesByMatricule: Record<string, string>;
  departmentsByMatricule: Record<string, string>;
  mismatches: Array<{
    kind: string;
    matricule: string;
    fileName: string;
    filePosition: string;
    fileDepartment: string;
    resolvedDepartment: string;
    systemName: string;
    systemPosition: string;
    systemDepartment: string;
    systemStatut: string;
    policy: string;
  }>;
  baseDepartments: string[];
  systemDepartments: string[];
  departmentsToCreate: string[];
  engagementsInMonth: Array<{
    matricule: string;
    displayName: string;
    employmentDate: string;
    company: string;
    position: string;
  }>;
  terminationsInMonth: Array<{
    matricule: string;
    displayName: string;
    terminationDate: string;
    terminationReason: string;
    company: string;
  }>;
  historicalMissingInSystem: Array<{
    matricule: string;
    displayName: string;
    terminationDate: string;
    terminationReason: string;
    employmentDate: string;
    company: string;
  }>;
};

type OtView = {
  year: number;
  month: number;
  fxRateFcPerUsd: number | null;
  rows: Array<{
    matricule: string;
    name: string;
    hours: number;
    costFc: number;
    costUsd: number | null;
    leaveDays: number | null;
    leaveValueUsd: number | null;
    department: string;
  }>;
  totals: {
    agents: number;
    hours: number;
    costUsd: number | null;
    leaveValueUsd: number | null;
  };
  byDepartment: Array<{ department: string; hours: number; costUsd: number; agents: number }>;
  sourceFiles: string[];
  missing: { overtime: boolean; leave: boolean };
  leaveAvgDays?: number | null;
  /** Données Evolution / Overview depuis New report.xlsx (OVT). */
  workbook?: {
    trendRows: ExcoWorkbookOtTrendRow[];
    actualVsBudget: ExcoWorkbookOtActualVsBudget | null;
    headcount: number | null;
    employeesWithOtPct: number | null;
    averageHours: number | null;
    averageCostPerEmployee: number | null;
    averageLeaveDays: number | null;
    staffCostMonth: number | null;
    staffCostYtd: number | null;
  };
};

type OtSubTab = 'overview' | 'evolution' | 'top10';

type PptxKpi = { label: string; value: string | null; delta: string | null; prev: string | null };

function formatNum(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Format Staff_Cost_KPI (Excel) : 1,234.56 · (1,234.56) · - */
function formatStaffCostExcel(
  n: number | null | undefined,
  opts?: { digits?: number; zeroAsDash?: boolean },
): string {
  const digits = opts?.digits ?? 2;
  const zeroAsDash = opts?.zeroAsDash ?? true;
  if (n == null || !Number.isFinite(n)) return '-';
  if (zeroAsDash && Math.abs(n) < 1e-9) return '-';
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return n < 0 ? `(${abs})` : abs;
}

function formatUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function formatOtCell(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) < 1e-9) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const v = n <= 1 ? n * 100 : n;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Taux déjà en points de % (ex. 0.6 = 0.6 %), issus de buildExcoReport. */
function formatRatePct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function normHeader(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normMatricule(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  // Excel parfois en notation scientifique
  const n = Number(s);
  if (Number.isFinite(n) && /^\d+(\.0+)?(e\+\d+)?$/i.test(s)) {
    return String(Math.round(n));
  }
  return s;
}

function fcToUsd(fc: number | undefined, fx: number | null): number | null {
  if (fc == null || !Number.isFinite(fc)) return null;
  if (fx == null || !(fx > 0)) return null;
  return Math.round((fc / fx) * 100) / 100;
}

function normalizeBaseImportMap(raw: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const mat = normMatricule(k);
    if (!mat || v == null || !Number.isFinite(Number(v))) continue;
    out[mat] = Number(v);
  }
  return out;
}

function displayBaseCell(value: string | number | null, header: string): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const shifted = new Date(d.getTime() + 12 * 60 * 60 * 1000);
      const dd = String(shifted.getUTCDate()).padStart(2, '0');
      const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const yy = shifted.getUTCFullYear();
      return `${dd}/${mm}/${yy}`;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (header === 'Leave Allowance Amount' || header === 'Allowance Amount' || header === 'OVT_Cost') {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    if (header === 'Leave_Balance' || header === 'OVT_Hours' || header === 'Length of Service' || header === 'Age') {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    }
    return String(value);
  }
  return String(value);
}

/** Projette la feuille BASE sur les 18 colonnes attendues. */
function projectBaseSheet(sheet: ExcoSheetTable | null): {
  headers: string[];
  rows: Array<Array<string | number | null>>;
} {
  const headers = [...BASE_COLUMNS];
  if (!sheet?.rows?.length) return { headers, rows: [] };
  const rawHeader = (sheet.rows[0] || []).map((c) => String(c ?? '').trim());
  const indexByNorm = new Map<string, number>();
  rawHeader.forEach((h, i) => {
    if (!h) return;
    const key = normHeader(h);
    indexByNorm.set(key, i);
    const alias = BASE_HEADER_ALIASES[key];
    if (alias) indexByNorm.set(normHeader(alias), i);
  });

  const colIndexes = headers.map((wanted) => {
    const key = normHeader(wanted);
    if (indexByNorm.has(key)) return indexByNorm.get(key)!;
    // fuzzy: leave allowance
    for (const [k, idx] of indexByNorm) {
      if (k.includes(key) || key.includes(k)) return idx;
    }
    return -1;
  });

  const rows = sheet.rows.slice(1).map((row) => {
    const projected = colIndexes.map((idx) => (idx >= 0 ? (row[idx] ?? null) : null));
    headers.forEach((header, i) => {
      if (BASE_IMPORT_ONLY_COLUMNS.has(header)) projected[i] = null;
    });
    return projected;
  });
  return { headers, rows };
}

function ExcoSourceClearIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <path
        d="M2 2l6 6M8 2L2 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ExcoBusyOverlay({ label }: { label: string }) {
  return (
    <div className="exco-busy-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="exco-busy-progress" aria-hidden="true">
        <span className="exco-busy-progress-bar" />
      </div>
      <div className="exco-busy-chip">
        <span className="exco-busy-dots" aria-hidden="true">
          <i /><i /><i />
        </span>
        <p>{label}</p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
  onClick,
  title,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'navy' | 'rose' | 'teal' | 'amber' | 'wine' | 'ok' | 'warn' | 'bad';
  onClick?: () => void;
  title?: string;
  /** Surligne le mois du rapport (rouge léger). */
  highlight?: boolean;
}) {
  const className = `exco-metric-card exco-metric-${tone || 'default'}${onClick ? ' is-clickable' : ''}${highlight ? ' is-report-month' : ''}`;
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        title={title || `Voir la liste — ${label}`}
      >
        <span className="exco-metric-label">{label}</span>
        <strong className="exco-metric-value">{value}</strong>
        {hint ? <span className="exco-metric-hint">{hint}</span> : null}
      </button>
    );
  }
  return (
    <article className={className}>
      <span className="exco-metric-label">{label}</span>
      <strong className="exco-metric-value">{value}</strong>
      {hint ? <span className="exco-metric-hint">{hint}</span> : null}
    </article>
  );
}

function BarChart({
  items,
  color = '#7a1f2b',
}: {
  items: Array<{ label: string; value: number }>;
  color?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="exco-bar-chart">
      {items.map((item) => (
        <div key={item.label} className="exco-bar-row">
          <span className="exco-bar-label" title={item.label}>{item.label}</span>
          <div className="exco-bar-track">
            <div
              className="exco-bar-fill"
              style={{ width: `${Math.max(2, Math.round((item.value / max) * 100))}%`, background: color }}
            />
          </div>
          <span className="exco-bar-value">{formatNum(item.value, 0)}</span>
        </div>
      ))}
    </div>
  );
}

function PctBarChart({
  items,
  color = '#e30613',
  total,
  wideLabels,
  onItemClick,
}: {
  items: Array<{ label: string; value: number }>;
  color?: string;
  /** Si défini, % = valeur / total (ex. vs effectif). Sinon % du total des barres. */
  total?: number;
  wideLabels?: boolean;
  onItemClick?: (label: string) => void;
}) {
  const sum = items.reduce((s, i) => s + (i.value || 0), 0);
  const denom = total && total > 0 ? total : sum || 1;
  if (!items.length || (sum <= 0 && !(total && total > 0))) {
    return <p className="exco-muted">Aucune donnée.</p>;
  }
  return (
    <div className={`exco-pct-bars${wideLabels ? ' is-wide-labels' : ''}`}>
      {items.map((item) => {
        const count = item.value || 0;
        const pct = ratioToRate(count, denom);
        const clickable = Boolean(onItemClick && count > 0);
        const row = (
          <>
            <span className="exco-bar-label" title={item.label}>{item.label}</span>
            <div className="exco-bar-track">
              <div
                className="exco-bar-fill"
                style={{
                  width: `${Math.max(count > 0 ? 2 : 0, Math.min(100, pct))}%`,
                  background: color,
                }}
              />
            </div>
            <span className="exco-bar-value" title={`${formatNum(count)} · ${pct.toFixed(2)}%`}>
              {formatNum(count)}
              <small>({pct.toFixed(2)}%)</small>
            </span>
          </>
        );
        if (clickable) {
          return (
            <button
              key={item.label}
              type="button"
              className="exco-bar-row is-clickable"
              title={`Voir la liste — ${item.label}`}
              onClick={() => onItemClick?.(item.label)}
            >
              {row}
            </button>
          );
        }
        return (
          <div key={item.label} className="exco-bar-row">
            {row}
          </div>
        );
      })}
    </div>
  );
}

function ExitReasonsPctChart({
  items,
  onItemClick,
}: {
  items: Array<{ label: string; value: number }>;
  onItemClick?: (label: string) => void;
}) {
  const total = items.reduce((sum, i) => sum + (i.value || 0), 0);
  const max = Math.max(...items.map((i) => i.value), 1);
  if (!items.length || total <= 0) {
    return <p className="exco-muted">Aucune sortie renseignée.</p>;
  }
  return (
    <div className="exco-bar-chart exco-exit-reasons-chart">
      {items.map((item) => {
        const pct = total > 0 ? (item.value / total) * 100 : 0;
        const clickable = Boolean(onItemClick && item.value > 0);
        const row = (
          <>
            <span className="exco-bar-label" title={item.label}>{item.label}</span>
            <div className="exco-bar-track">
              <div
                className="exco-bar-fill"
                style={{
                  width: `${Math.max(2, Math.round((item.value / max) * 100))}%`,
                  background: '#7a1f2b',
                }}
              />
            </div>
            <span className="exco-bar-value" title={`${formatNum(item.value)} · ${formatPct(pct)}`}>
              {formatNum(item.value)}
              <small>({formatPct(pct)})</small>
            </span>
          </>
        );
        if (clickable) {
          return (
            <button
              key={item.label}
              type="button"
              className="exco-bar-row is-clickable"
              title={`Voir la liste — ${item.label}`}
              onClick={() => onItemClick?.(item.label)}
            >
              {row}
            </button>
          );
        }
        return (
          <div key={item.label} className="exco-bar-row">
            {row}
          </div>
        );
      })}
    </div>
  );
}

function ClickableNum({
  value,
  title,
  onClick,
}: {
  value: string;
  title: string;
  onClick?: () => void;
}) {
  if (!onClick) return <>{value}</>;
  return (
    <button type="button" className="exco-num-clickable" title={title} onClick={onClick}>
      {value}
    </button>
  );
}

function StaffMovementYtdTable({
  inOut,
  month,
  onMonth,
  onYtd,
}: {
  inOut: InOutView | null;
  month: number;
  onMonth: (kind: 'in' | 'out', calendarMonth: number | null, monthKey: string) => void;
  onYtd: (kind: 'in' | 'out') => void;
}) {
  return (
    <section className="exco-panel exco-panel-accent-navy">
      <h3>5. Staff Movement — IN / OUT YTD</h3>
      <div className="exco-sheet-scroll">
        <table className="exco-mini-table exco-inout-trend-table">
          <thead>
            <tr>
              <th>IN — OUT YTD</th>
              {(inOut?.months || []).map((m) => (
                <th
                  key={m.monthKey}
                  className={m.calendarMonth === month ? 'is-report-month' : undefined}
                >
                  {m.monthKey}
                </th>
              ))}
              <th>YTD</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>IN</td>
              {(inOut?.months || []).map((m) => (
                <td
                  key={`in-${m.monthKey}`}
                  className={m.calendarMonth === month ? 'is-report-month' : undefined}
                >
                  <ClickableNum
                    value={formatNum(m.in)}
                    title={`Voir la liste — IN · ${m.monthKey}`}
                    onClick={
                      (m.in || 0) > 0
                        ? () => onMonth('in', m.calendarMonth, m.monthKey)
                        : undefined
                    }
                  />
                </td>
              ))}
              <td>
                <ClickableNum
                  value={formatNum(inOut?.ytdIn)}
                  title="Voir la liste — IN YTD"
                  onClick={(inOut?.ytdIn || 0) > 0 ? () => onYtd('in') : undefined}
                />
              </td>
            </tr>
            <tr>
              <td>Out</td>
              {(inOut?.months || []).map((m) => (
                <td
                  key={`out-${m.monthKey}`}
                  className={m.calendarMonth === month ? 'is-report-month' : undefined}
                >
                  <ClickableNum
                    value={formatNum(m.out)}
                    title={`Voir la liste — OUT · ${m.monthKey}`}
                    onClick={
                      (m.out || 0) > 0
                        ? () => onMonth('out', m.calendarMonth, m.monthKey)
                        : undefined
                    }
                  />
                </td>
              ))}
              <td>
                <ClickableNum
                  value={formatNum(inOut?.ytdOut)}
                  title="Voir la liste — OUT YTD"
                  onClick={(inOut?.ytdOut || 0) > 0 ? () => onYtd('out') : undefined}
                />
              </td>
            </tr>
            <tr>
              <td>Attrition Rate (%)</td>
              {(inOut?.months || []).map((m) => (
                <td
                  key={`att-${m.monthKey}`}
                  className={m.calendarMonth === month ? 'is-report-month' : undefined}
                >
                  {formatRatePct(m.attritionRate)}
                </td>
              ))}
              <td>{formatRatePct(inOut?.ytdAttrition)}</td>
            </tr>
            <tr>
              <td>Turnover (%)</td>
              {(inOut?.months || []).map((m) => (
                <td
                  key={`to-${m.monthKey}`}
                  className={m.calendarMonth === month ? 'is-report-month' : undefined}
                >
                  {formatRatePct(m.turnover)}
                </td>
              ))}
              <td>{formatRatePct(inOut?.ytdTurnover)}</td>
            </tr>
            <tr className="exco-row-total">
              <td>Total Headcount</td>
              {(inOut?.months || []).map((m) => (
                <td
                  key={`hc-${m.monthKey}`}
                  className={m.calendarMonth === month ? 'is-report-month' : undefined}
                >
                  {formatNum(m.headcount)}
                </td>
              ))}
              <td>{formatNum(inOut?.ytdHeadcount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

function parseInputNum(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function formatInOutDate(value: string): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const shifted = new Date(d.getTime() + 12 * 60 * 60 * 1000);
      const dd = String(shifted.getUTCDate()).padStart(2, '0');
      const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
      const yy = shifted.getUTCFullYear();
      return `${dd}/${mm}/${yy}`;
    }
  }
  return value;
}

function GenderLocationChart({
  items,
}: {
  items: Array<{ location: string; male: number; female: number; total: number }>;
}) {
  const max = Math.max(...items.map((i) => i.total), 1);
  return (
    <div className="exco-bar-chart">
      {items.map((item) => {
        const mPct = Math.round((item.male / max) * 100);
        const fPct = Math.round((item.female / max) * 100);
        return (
          <div key={item.location} className="exco-bar-row">
            <span className="exco-bar-label" title={item.location}>{item.location}</span>
            <div className="exco-bar-track exco-bar-track-stack">
              <div className="exco-bar-fill exco-bar-male" style={{ width: `${Math.max(0, mPct)}%` }} />
              <div className="exco-bar-fill exco-bar-female" style={{ width: `${Math.max(0, fPct)}%` }} />
            </div>
            <span className="exco-bar-value">{formatNum(item.total, 0)}</span>
          </div>
        );
      })}
      <div className="exco-chart-legend">
        <span className="exco-legend-male">Male</span>
        <span className="exco-legend-female">Female</span>
      </div>
    </div>
  );
}

function mismatchLabel(kind: string): string {
  switch (kind) {
    case 'missing_in_system': return 'Absent système';
    case 'missing_in_base': return 'Absent BASE (nouveaux — laisser)';
    case 'name_mismatch': return 'Nom différent (garder système)';
    case 'position_mismatch': return 'Position différente (garder système)';
    case 'department_mismatch': return 'Département différent (garder système)';
    default: return kind;
  }
}

function mismatchPolicyHint(policy: string): string {
  switch (policy) {
    case 'apply_file_department':
      return 'Non appliqué — le département système fait foi';
    case 'keep_system':
      return 'Aucune écriture — conserver la valeur système';
    case 'leave_in_system':
      return 'Nouveaux d’août — laisser dans le système';
    case 'create_from_base':
      return 'Créer l’employé depuis BASE';
    default:
      return '';
  }
}

export default function ExcoPage() {
  const { can } = usePermissions();
  const { t } = useI18n();
  const canEdit = can('exco.rapport', 'edit');
  const [tab, setTab] = useState<TabId>('params');
  // Période de travail courante (juillet 2026 — fichiers sources préchargés)
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);
  const [fxRate, setFxRate] = useState('');
  const [uploads, setUploads] = useState<Partial<Record<ExcoSourceFileId, UploadMeta>>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [clearingSourceId, setClearingSourceId] = useState<ExcoSourceFileId | null>(null);
  const [base, setBase] = useState<BaseReconcile | null>(null);
  const [ot, setOt] = useState<OtView | null>(null);
  const [otSubTab, setOtSubTab] = useState<OtSubTab>('overview');
  const [kpiCards, setKpiCards] = useState<PptxKpi[]>([]);
  const [narrative, setNarrative] = useState<{
    highlights?: string;
    lowlights?: string;
    focus?: string;
    thankYouTitle?: string;
    thankYouMessage?: string;
  }>({});
  const [baseSheet, setBaseSheet] = useState<ExcoSheetTable | null>(null);
  const [baseSheetSource, setBaseSheetSource] = useState('');
  const [baseSearch, setBaseSearch] = useState('');
  const [imported, setImported] = useState<ImportedFlags>({
    componentPostedUnits: false,
    leaveBalances: false,
    engagementsTerminations: false,
  });
  const [importedSources, setImportedSources] = useState<
    Partial<Record<keyof ImportedFlags, { importedAt: string; originalName: string }>>
  >({});
  const [headcount, setHeadcount] = useState<HeadcountView | null>(null);
  const [inOut, setInOut] = useState<InOutView | null>(null);
  const [staffCost, setStaffCost] = useState<StaffCostView | null>(null);
  const [staffCostFormulaNotes, setStaffCostFormulaNotes] = useState<Record<string, StaffCostFormulaNote>>({});
  const [formulaModal, setFormulaModal] = useState<FormulaModalState | null>(null);
  const [formulaMenu, setFormulaMenu] = useState<FormulaMenuState | null>(null);
  const [inoutDrilldown, setInoutDrilldown] = useState<{
    title: string;
    columns: DashboardListColumn[];
    rows: DashboardListRow[];
  } | null>(null);
  const [namesByMatricule, setNamesByMatricule] = useState<Record<string, string>>({});
  const [deptsByMatricule, setDeptsByMatricule] = useState<Record<string, string>>({});
  const [baseImportColumns, setBaseImportColumns] = useState<BaseImportColumns>(EMPTY_BASE_IMPORT_COLUMNS);

  const monthLabel = t(`cal.month.${month}` as MessageKey);
  const periodLabel = `${monthLabel} ${year}`;

  const resolveStaffCostCell = useCallback(
    (cellKey: string, cell: StaffCostSheetCell) => applyFormulaNote(cell, staffCostFormulaNotes[cellKey]),
    [staffCostFormulaNotes],
  );

  const openStaffCostFormulaMenu = useCallback(
    (e: ReactMouseEvent, cellKey: string, cell: StaffCostSheetCell) => {
      setFormulaMenu({
        x: e.clientX,
        y: e.clientY,
        cellKey,
        cell: resolveStaffCostCell(cellKey, cell),
      });
    },
    [resolveStaffCostCell],
  );

  const formulaMenuItems = useMemo((): ContextMenuItem[] => {
    if (!formulaMenu) return [];
    const items: ContextMenuItem[] = [
      {
        id: 'view-formula',
        label: 'Voir la formule',
        icon: 'view',
        onClick: () => {
          setFormulaModal({ mode: 'view', cellKey: formulaMenu.cellKey, cell: formulaMenu.cell });
        },
      },
    ];
    if (canEdit) {
      items.push({
        id: 'edit-formula',
        label: 'Modifier la formule',
        icon: 'edit',
        onClick: () => {
          setFormulaModal({ mode: 'edit', cellKey: formulaMenu.cellKey, cell: formulaMenu.cell });
        },
      });
    }
    return items;
  }, [formulaMenu, canEdit]);

  const loadParams = useCallback(async (y: number, m: number) => {
    const res = await fetch(`/api/exco/params?year=${y}&month=${m}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Params');
    const p = data as ParamsState;
    setYear(p.year);
    setMonth(p.month);
    setFxRate(p.fxRateFcPerUsd != null ? String(p.fxRateFcPerUsd) : '');
    setUploads(p.uploads || {});
    if (data.imported) setImported(data.imported as ImportedFlags);
    else {
      setImported({
        componentPostedUnits: false,
        leaveBalances: false,
        engagementsTerminations: false,
      });
    }
    setImportedSources(
      (data.importedSources || {}) as Partial<
        Record<keyof ImportedFlags, { importedAt: string; originalName: string }>
      >,
    );
    const cols = (data.baseImportColumns || {}) as Partial<BaseImportColumns>;
    setBaseImportColumns({
      leaveDaysByMatricule: normalizeBaseImportMap(cols.leaveDaysByMatricule),
      leaveValueFcByMatricule: normalizeBaseImportMap(cols.leaveValueFcByMatricule),
      ovtHoursByMatricule: normalizeBaseImportMap(cols.ovtHoursByMatricule),
      ovtCostFcByMatricule: normalizeBaseImportMap(cols.ovtCostFcByMatricule),
    });
    if (data.narrative && typeof data.narrative === 'object') {
      const n = data.narrative as {
        highlights?: string;
        lowlights?: string;
        focus?: string;
        thankYouTitle?: string;
        thankYouMessage?: string;
      };
      setNarrative({
        highlights: formatNarrativeForEdit(n.highlights || ''),
        lowlights: formatNarrativeForEdit(n.lowlights || ''),
        focus: formatNarrativeForEdit(n.focus || ''),
        thankYouTitle: n.thankYouTitle || 'Et merci',
        thankYouMessage: n.thankYouMessage || 'Thank You',
      });
    } else {
      setNarrative({
        highlights: '',
        lowlights: '',
        focus: '',
        thankYouTitle: 'Et merci',
        thankYouMessage: 'Thank You',
      });
    }
  }, []);

  const loadBase = useCallback(async (y: number, m: number) => {
    const res = await fetch(`/api/exco/base?year=${y}&month=${m}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'BASE');
    setBase(data as BaseReconcile);
    if (data.namesByMatricule && typeof data.namesByMatricule === 'object') {
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.namesByMatricule as Record<string, string>)) {
        const mat = normMatricule(k);
        if (mat && v) normalized[mat] = v;
      }
      setNamesByMatricule((prev) => ({ ...prev, ...normalized }));
    }
    if (data.departmentsByMatricule && typeof data.departmentsByMatricule === 'object') {
      const normalized: Record<string, string> = {};
      for (const [k, v] of Object.entries(data.departmentsByMatricule as Record<string, string>)) {
        const mat = normMatricule(k);
        if (mat && v) normalized[mat] = v;
      }
      setDeptsByMatricule((prev) => ({ ...prev, ...normalized }));
    }
  }, []);

  const loadOt = useCallback(async (y: number, m: number, fx?: string) => {
    const q = fx ? `&fxRate=${encodeURIComponent(fx)}` : '';
    const [otRes, wbRes, reportRes] = await Promise.all([
      fetch(`/api/exco/overtime?year=${y}&month=${m}${q}`),
      fetch('/api/exco/workbook'),
      fetch(`/api/exco/report?year=${y}&month=${m}`),
    ]);
    const data = await otRes.json();
    if (!otRes.ok) throw new Error(data.error || 'Overtime');
    const baseView = data as OtView;

    let workbook: OtView['workbook'];
    if (wbRes.ok) {
      const wb = await wbRes.json();
      const snapOt = wb?.snapshot?.ot;
      const report = reportRes.ok ? await reportRes.json() : null;
      const staffCostRow = Array.isArray(wb?.snapshot?.staffCost)
        ? (wb.snapshot.staffCost as ExcoWorkbookStaffCostMonth[]).find((s) => s.calendarMonth === m)
        : null;
      const headcount =
        wb?.snapshot?.headcount?.headcount
        ?? report?.computed?.headcount
        ?? null;
      if (snapOt && !baseView.missing.overtime) {
        const leaveAllAvg =
          wb?.snapshot?.leave?.allAvgDays
          ?? snapOt.averageLeaveDays
          ?? report?.computed?.leaveBalanceAvgDays
          ?? null;
        workbook = {
          trendRows: Array.isArray(snapOt.trendRows) ? snapOt.trendRows : [],
          actualVsBudget: snapOt.actualVsBudget || null,
          headcount: headcount != null ? Number(headcount) : null,
          employeesWithOtPct: snapOt.employeesWithOtPct ?? null,
          averageHours: snapOt.averageHours ?? null,
          averageCostPerEmployee: snapOt.averageCostPerEmployee ?? null,
          averageLeaveDays: leaveAllAvg != null ? Number(leaveAllAvg) : null,
          staffCostMonth: staffCostRow?.staffCostMonth ?? null,
          staffCostYtd: staffCostRow?.salariesActualYtd ?? null,
        };
        setOt({
          ...baseView,
          workbook,
        });
        return;
      }
    }
    setOt(baseView);
  }, []);

  const loadSystemNames = useCallback(async () => {
    try {
      const res = await fetch('/api/employees');
      if (!res.ok) return;
      const employees = (await res.json()) as Array<{
        matricule?: string;
        nom?: string;
        departement?: string;
        departmentHr?: string;
      }>;
      const names: Record<string, string> = {};
      const depts: Record<string, string> = {};
      for (const e of employees) {
        const mat = normMatricule(e.matricule);
        if (!mat) continue;
        if (e.nom) names[mat] = e.nom;
        const dept = (e.departement || e.departmentHr || '').trim();
        if (dept) depts[mat] = dept;
      }
      setNamesByMatricule((prev) => ({ ...prev, ...names }));
      setDeptsByMatricule((prev) => ({ ...prev, ...depts }));
    } catch {
      // ignore
    }
  }, []);

  const loadInOut = useCallback(async (y: number, m: number) => {
    const res = await fetch(`/api/exco/report?year=${y}&month=${m}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'In Out');
    const c = data.computed || {};
    const through = Number(data.month) || m;
    const trends = Array.isArray(c.trends) ? c.trends : [];
    const byMonth = new Map<number, {
      label?: string;
      month?: number;
      hires?: number;
      exits?: number;
      attritionPct?: number | null;
      turnoverPct?: number | null;
      headcount?: number;
      staffCost?: number | null;
      volumePerEmp?: number | null;
      revenuePerEmp?: number | null;
    }>();
    for (const t of trends) {
      if (t?.month) byMonth.set(Number(t.month), t);
    }
    const months = CAL_MONTH_KEYS.map((key, idx) => {
      const cal = idx + 1;
      const t = byMonth.get(cal);
      const visible = cal <= through;
      return {
        monthKey: key,
        calendarMonth: cal,
        in: visible ? (t?.hires ?? 0) : null,
        out: visible ? (t?.exits ?? 0) : null,
        attritionRate: visible ? (t?.attritionPct ?? null) : null,
        turnover: visible ? (t?.turnoverPct ?? null) : null,
        headcount: visible ? (t?.headcount ?? null) : null,
      };
    });
    const filled = months.filter((row) => row.calendarMonth != null && row.calendarMonth <= through);
    const ytdIn = filled.reduce((s, row) => s + (row.in || 0), 0);
    const ytdOut = filled.reduce((s, row) => s + (row.out || 0), 0);
    const hiresByMonthRaw = (c.hiresByMonth || {}) as Record<string, InOutPerson[]>;
    const exitsByMonthRaw = (c.exitsByMonth || {}) as Record<string, InOutPerson[]>;
    const hiresByMonth: Record<number, InOutPerson[]> = {};
    const exitsByMonth: Record<number, InOutPerson[]> = {};
    for (const [k, list] of Object.entries(hiresByMonthRaw)) {
      hiresByMonth[Number(k)] = Array.isArray(list) ? list : [];
    }
    for (const [k, list] of Object.entries(exitsByMonthRaw)) {
      exitsByMonth[Number(k)] = Array.isArray(list) ? list : [];
    }
    setInOut({
      months,
      ytdIn,
      ytdOut,
      ytdAttrition: c.attritionPct ?? null,
      ytdTurnover: c.turnoverPct ?? null,
      ytdHeadcount: c.headcount ?? null,
      exitsByReason: Array.isArray(c.exitsByReason) ? c.exitsByReason : [],
      inList: Array.isArray(c.hiresList) ? c.hiresList : [],
      outList: Array.isArray(c.exitsList)
        ? c.exitsList
        : Array.isArray(c.leaversList)
          ? c.leaversList
          : [],
      hiresByMonth,
      exitsByMonth,
    });
  }, []);

  const rebuildStaffCost = useCallback((
    ytdByMonth: Record<number, ExcoStaffCostYtdInput>,
  ): StaffCostView => ({
    ytdByMonth,
    sheet: buildStaffCostSheet({ ytdByCalendarMonth: ytdByMonth }),
  }), []);

  const loadStaffCost = useCallback(async (y: number, m: number) => {
    const [reportRes, wbRes] = await Promise.all([
      fetch(`/api/exco/report?year=${y}&month=${m}`),
      fetch('/api/exco/workbook'),
    ]);
    const report = await reportRes.json();
    if (!reportRes.ok) throw new Error(report.error || 'Staff Cost');
    const wb = wbRes.ok ? await wbRes.json() : null;

    const ytdByMonth: Record<number, ExcoStaffCostYtdInput> = {};
    const snapRows = (wb?.snapshot?.staffCost || []) as ExcoWorkbookStaffCostMonth[];
    for (const row of snapRows) {
      ytdByMonth[row.calendarMonth] = workbookMonthToYtdInput(row);
      // Budget headcount Excel = 192
      if (ytdByMonth[row.calendarMonth].budgetHeadcount == null) {
        ytdByMonth[row.calendarMonth] = {
          ...ytdByMonth[row.calendarMonth],
          budgetHeadcount: 192,
        };
      }
    }
    // Headcount actual from trends when missing
    const trends = Array.isArray(report.computed?.trends) ? report.computed.trends : [];
    for (const t of trends) {
      const cal = Number(t.month);
      if (!cal) continue;
      const cur = ytdByMonth[cal] || staffCostInputFromPartial(null);
      if (cur.actualHeadcount == null && t.headcount != null) {
        ytdByMonth[cal] = { ...cur, actualHeadcount: t.headcount };
      }
    }
    // Overlay saisie utilisateur (prioritaire)
    const overlayMap = (report.overlays?.staffCostYtdByMonth || {}) as Record<string, ExcoStaffCostYtdInput>;
    for (const [k, v] of Object.entries(overlayMap)) {
      const cal = Number(k);
      if (!cal) continue;
      ytdByMonth[cal] = {
        ...staffCostInputFromPartial(ytdByMonth[cal]),
        ...staffCostInputFromPartial(v),
      };
    }
    setStaffCost(rebuildStaffCost(ytdByMonth));
    const notes = (report.overlays?.staffCostFormulaNotes || {}) as Record<string, StaffCostFormulaNote>;
    setStaffCostFormulaNotes(notes && typeof notes === 'object' ? notes : {});
  }, [rebuildStaffCost]);

  const loadWorkbookExtras = useCallback(async () => {
    try {
      const res = await fetch('/api/exco/workbook');
      if (!res.ok) return;
      const data = await res.json();
      setKpiCards(data.pptx?.kpiCards || []);
      const pptxN = data.pptx?.narrative as
        | { highlights?: string; lowlights?: string; focus?: string }
        | undefined;
      if (pptxN) {
        setNarrative((prev) => {
          const hasSaved = Boolean(
            prev.highlights?.trim() || prev.lowlights?.trim() || prev.focus?.trim(),
          );
          if (hasSaved) return prev;
          return {
            highlights: formatNarrativeForEdit(pptxN.highlights || ''),
            lowlights: formatNarrativeForEdit(pptxN.lowlights || ''),
            focus: formatNarrativeForEdit(pptxN.focus || ''),
          };
        });
      }
      const sheets = (data.sheets || []) as ExcoSheetTable[];
      const base =
        sheets.find((s) => s.name.toLowerCase() === 'base')
        || sheets.find((s) => s.id === 'base')
        || null;
      setBaseSheet(base);
      setBaseSheetSource(String(data.sourceFile || 'New report.xlsx'));
      const hc = data.snapshot?.headcount as HeadcountView | undefined;
      setHeadcount(hc || null);
      if (data.namesByMatricule && typeof data.namesByMatricule === 'object') {
        const normalized: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.namesByMatricule as Record<string, string>)) {
          const mat = normMatricule(k);
          if (mat && v) normalized[mat] = v;
        }
        setNamesByMatricule((prev) => ({ ...prev, ...normalized }));
      }
    } catch {
      // optional
    }
  }, []);

  const openInOutList = useCallback(
    (title: string, people: InOutPerson[]) => {
      setInoutDrilldown({
        title,
        columns: INOUT_LIST_COLUMNS,
        rows: people.map((p) => inOutPersonToRow(p, namesByMatricule, deptsByMatricule)),
      });
    },
    [namesByMatricule, deptsByMatricule],
  );

  const openInOutMonth = useCallback(
    (kind: 'in' | 'out', calendarMonth: number | null, monthKey: string) => {
      if (calendarMonth == null) return;
      const people =
        kind === 'in'
          ? (inOut?.hiresByMonth?.[calendarMonth] || [])
          : (inOut?.exitsByMonth?.[calendarMonth] || []);
      const label = kind === 'in' ? 'IN — Embauches' : 'OUT — Sorties';
      openInOutList(`Voir la liste — ${label} · ${monthKey}`, people);
    },
    [inOut, openInOutList],
  );

  const openInOutYtd = useCallback(
    (kind: 'in' | 'out') => {
      const byMonth = kind === 'in' ? inOut?.hiresByMonth : inOut?.exitsByMonth;
      const people = Object.values(byMonth || {}).flat();
      const label = kind === 'in' ? 'IN YTD — Embauches' : 'OUT YTD — Sorties';
      openInOutList(`Voir la liste — ${label}`, people);
    },
    [inOut, openInOutList],
  );

  const openExitReason = useCallback(
    (reason: string) => {
      const people = (inOut?.outList || []).filter(
        (p) => (p.reason || 'Non renseigné') === reason,
      );
      openInOutList(`Voir la liste — Sorties · ${reason} · ${periodLabel}`, people);
    },
    [inOut, openInOutList, periodLabel],
  );

  const baseProjected = useMemo(() => {
    const projected = projectBaseSheet(baseSheet);
    const nameIdx = projected.headers.indexOf('Names');
    const deptIdx = projected.headers.indexOf('Departments');
    const matIdx = projected.headers.indexOf('Emp Number');
    const leaveIdx = projected.headers.indexOf('Leave_Balance');
    const allowIdx = projected.headers.indexOf('Allowance Amount');
    const hoursIdx = projected.headers.indexOf('OVT_Hours');
    const costIdx = projected.headers.indexOf('OVT_Cost');
    const fx = Number(fxRate);
    const fxOk = Number.isFinite(fx) && fx > 0 ? fx : null;
    const rows = projected.rows.map((row) => {
      const next = row.slice();
      if (matIdx >= 0) {
        const mat = normMatricule(next[matIdx]);
        const sysName = namesByMatricule[mat];
        if (nameIdx >= 0 && sysName) next[nameIdx] = sysName;
        const sysDept = deptsByMatricule[mat];
        if (deptIdx >= 0 && sysDept) next[deptIdx] = sysDept;
        if (mat) {
          if (leaveIdx >= 0 && Object.prototype.hasOwnProperty.call(baseImportColumns.leaveDaysByMatricule, mat)) {
            next[leaveIdx] = baseImportColumns.leaveDaysByMatricule[mat];
          }
          if (allowIdx >= 0 && Object.prototype.hasOwnProperty.call(baseImportColumns.leaveValueFcByMatricule, mat)) {
            next[allowIdx] = fcToUsd(baseImportColumns.leaveValueFcByMatricule[mat], fxOk);
          }
          if (hoursIdx >= 0 && Object.prototype.hasOwnProperty.call(baseImportColumns.ovtHoursByMatricule, mat)) {
            next[hoursIdx] = baseImportColumns.ovtHoursByMatricule[mat];
          }
          if (costIdx >= 0 && Object.prototype.hasOwnProperty.call(baseImportColumns.ovtCostFcByMatricule, mat)) {
            next[costIdx] = fcToUsd(baseImportColumns.ovtCostFcByMatricule[mat], fxOk);
          }
        }
      }
      return next;
    });
    const q = baseSearch.trim().toLowerCase();
    const filtered = !q
      ? rows
      : rows.filter((row) =>
          row.some((cell) => String(cell ?? '').toLowerCase().includes(q)),
        );
    return { headers: projected.headers, rows: filtered, total: rows.length };
  }, [baseSheet, namesByMatricule, deptsByMatricule, baseSearch, baseImportColumns, fxRate]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await loadParams(year, month);
      await Promise.all([
        loadBase(year, month),
        loadSystemNames(),
        loadOt(year, month, fxRate),
        loadWorkbookExtras(),
        loadInOut(year, month),
        loadStaffCost(year, month),
      ]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [year, month, fxRate, loadParams, loadBase, loadSystemNames, loadOt, loadWorkbookExtras, loadInOut, loadStaffCost]);

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveParams = useCallback(async () => {
    if (!canEdit) return;
    setBusy('Enregistrement Params…');
    try {
      const rate = fxRate.trim() === '' ? null : Number(String(fxRate).replace(',', '.'));
      const res = await fetch('/api/exco/params', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, fxRateFcPerUsd: rate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur Params');
      setUploads(data.uploads || {});
      showSuccess(`Params enregistrés — ${MONTHS_FR[month - 1]} ${year}`);
      await Promise.all([loadBase(year, month), loadOt(year, month, fxRate)]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy('');
    }
  }, [canEdit, year, month, fxRate, loadBase, loadOt]);

  const saveNarrative = useCallback(async () => {
    if (!canEdit) return;
    setBusy('Enregistrement…');
    try {
      const res = await fetch('/api/exco/params', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          narrative: {
            highlights: narrative.highlights || '',
            lowlights: narrative.lowlights || '',
            focus: narrative.focus || '',
            thankYouTitle: narrative.thankYouTitle || 'Et merci',
            thankYouMessage: narrative.thankYouMessage || 'Thank You',
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur enregistrement');
      if (data.narrative) {
        setNarrative({
          highlights: data.narrative.highlights || '',
          lowlights: data.narrative.lowlights || '',
          focus: data.narrative.focus || '',
          thankYouTitle: data.narrative.thankYouTitle || 'Et merci',
          thankYouMessage: data.narrative.thankYouMessage || 'Thank You',
        });
      }
      showSuccess(`Enregistré — ${MONTHS_FR[month - 1]} ${year}`);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy('');
    }
  }, [canEdit, year, month, narrative]);

  const uploadFile = useCallback(
    async (sourceId: ExcoSourceFileId, file: File) => {
      if (!canEdit) return;
      setBusy(`Upload ${file.name}…`);
      try {
        const form = new FormData();
        form.append('year', String(year));
        form.append('month', String(month));
        form.append('sourceId', sourceId);
        form.append('file', file);
        const res = await fetch('/api/exco/upload', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Upload impossible');
        showSuccess(`${file.name} importé — données enregistrées`);
        await loadParams(year, month);
        await Promise.all([
          loadBase(year, month),
          loadOt(year, month, fxRate),
          loadInOut(year, month),
        ]);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Upload impossible');
      } finally {
        setBusy('');
      }
    },
    [canEdit, year, month, fxRate, loadParams, loadBase, loadOt, loadInOut],
  );

  const clearImport = useCallback(
    async (sourceId: ExcoSourceFileId, label: string) => {
      if (!canEdit || clearingSourceId) return;
      setClearingSourceId(sourceId);
      try {
        const res = await fetch(
          `/api/exco/upload?year=${year}&month=${month}&sourceId=${encodeURIComponent(sourceId)}`,
          { method: 'DELETE' },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Annulation impossible');
        showSuccess(`Import retiré — ${label}`);
        await loadParams(year, month);
        await Promise.all([
          loadBase(year, month),
          loadOt(year, month, fxRate),
          loadInOut(year, month),
        ]);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Annulation impossible');
      } finally {
        setClearingSourceId(null);
      }
    },
    [canEdit, clearingSourceId, year, month, fxRate, loadParams, loadBase, loadOt, loadInOut],
  );

  const runBaseAction = useCallback(
    async (action: string, extra?: Record<string, unknown>) => {
      if (!canEdit) return;
      setBusy(action === 'applyAllCorrections' ? 'Application des corrections…' : 'Traitement…');
      try {
        const res = await fetch('/api/exco/base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, month, action, ...extra }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Action impossible');
        if (data.result) setBase(data.result as BaseReconcile);
        const applied = typeof data.applied === 'number' ? data.applied : null;
        showSuccess(
          applied != null && applied > 0
            ? `Corrections appliquées · ${applied} fiche(s)`
            : 'Action terminée',
        );
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erreur');
      } finally {
        setBusy('');
      }
    },
    [canEdit, year, month],
  );

  const mismatchGroups = useMemo(() => {
    const groups: Record<string, BaseReconcile['mismatches']> = {};
    for (const row of base?.mismatches || []) {
      // Seuls les absents système restent actionnables (nom/dept fichier ignorés).
      if (row.policy !== 'create_from_base') continue;
      (groups[row.kind] ||= []).push(row);
    }
    return groups;
  }, [base]);

  const otEmployeesResolved = useMemo(() => {
    return (ot?.rows || []).map((r) => {
      const mat = normMatricule(r.matricule);
      return {
        ...r,
        name: namesByMatricule[mat] || r.name,
        department: deptsByMatricule[mat] || r.department,
      };
    });
  }, [ot, namesByMatricule, deptsByMatricule]);

  const otTopByHours = useMemo(
    () => [...otEmployeesResolved].sort((a, b) => b.hours - a.hours),
    [otEmployeesResolved],
  );

  const otTopByLeave = useMemo(
    () =>
      [...otEmployeesResolved].sort(
        (a, b) => (b.leaveDays ?? -Infinity) - (a.leaveDays ?? -Infinity),
      ),
    [otEmployeesResolved],
  );

  const otOverview = useMemo(() => {
    const wb = ot?.workbook;
    const agents = ot?.totals.agents ?? 0;
    const hours = ot?.totals.hours ?? 0;
    const cost = ot?.totals.costUsd ?? null;
    const hc = wb?.headcount ?? null;
    const pctAgents =
      wb?.employeesWithOtPct
      ?? (hc && hc > 0 ? ratioToRate(agents, hc) : null);
    const avgHours = wb?.averageHours ?? (agents ? hours / agents : null);
    const avgCost = wb?.averageCostPerEmployee ?? (agents && cost != null ? cost / agents : null);
    const withLeave = otEmployeesResolved.filter((e) => e.leaveDays != null);
    const avgLeaveFromRows = withLeave.length
      ? withLeave.reduce((s, e) => s + (e.leaveDays || 0), 0) / withLeave.length
      : null;
    const avgLeave = ot?.leaveAvgDays ?? avgLeaveFromRows ?? wb?.averageLeaveDays ?? null;
    const staffMonth = wb?.staffCostMonth ?? null;
    const staffYtd = wb?.staffCostYtd ?? null;
    const avbYtd = wb?.actualVsBudget?.actualYtd ?? null;
    const otPctMonth =
      cost != null && staffMonth && staffMonth > 0
        ? Math.round((cost / staffMonth) * 10000) / 100
        : null;
    const otPctYtd =
      avbYtd != null && staffYtd && staffYtd > 0
        ? Math.round((avbYtd / staffYtd) * 10000) / 100
        : null;
    return {
      headcount: hc,
      agents,
      pctAgents,
      hours,
      avgHours,
      cost,
      avgCost,
      avgLeave,
      otPctMonth,
      otPctYtd,
    };
  }, [ot, otEmployeesResolved]);

  const otHoursSlide = useMemo(() => {
    const monthLabel = (MONTHS_EN[month - 1] || String(month)).slice(0, 3).toUpperCase();
    const imported = (ot?.byDepartment || []).map((d) => ({
      department: d.department,
      hours: d.hours > 0 ? d.hours : null,
    }));
    const rows = imported.filter((r) => (r.hours || 0) > 0);
    const max = Math.max(...rows.map((r) => r.hours || 0), 1);
    const total = rows.reduce((s, r) => s + (r.hours || 0), 0);
    return { monthLabel, rows, max, total };
  }, [ot, month]);

  const openOtEmployeeList = useCallback(
    (title: string, rows: OtView['rows']) => {
      setInoutDrilldown({
        title,
        columns: [
          { key: 'matricule', label: 'Matricule' },
          { key: 'nom', label: 'Nom' },
          { key: 'hours', label: 'Hours' },
          { key: 'cost', label: 'Cost USD' },
          { key: 'leave', label: 'Leave' },
          { key: 'departement', label: 'Department' },
        ],
        rows: rows.map((r) => ({
          id: r.matricule,
          cells: {
            matricule: r.matricule,
            nom: namesByMatricule[normMatricule(r.matricule)] || r.name,
            hours: formatNum(r.hours, 2),
            cost: formatUsd(r.costUsd),
            leave: r.leaveDays != null ? formatNum(r.leaveDays, 2) : '—',
            departement: deptsByMatricule[normMatricule(r.matricule)] || r.department,
          },
        })),
      });
    },
    [namesByMatricule, deptsByMatricule],
  );

  const openOtDeptHours = useCallback(
    (department: string | null) => {
      const rows = department
        ? otEmployeesResolved.filter(
            (r) => r.department.trim().toLowerCase() === department.trim().toLowerCase(),
          )
        : otEmployeesResolved;
      openOtEmployeeList(
        department
          ? `Voir la liste — Overtime · ${department} · ${periodLabel}`
          : `Voir la liste — Overtime · ${periodLabel}`,
        rows,
      );
    },
    [otEmployeesResolved, openOtEmployeeList, periodLabel],
  );

  const missingInSystemCount = mismatchGroups.missing_in_system?.length || 0;
  const hasActionable = Object.values(mismatchGroups).some((rows) => rows.length > 0);

  const changePeriod = useCallback(
    async (y: number, m: number) => {
      setYear(y);
      setMonth(m);
      setLoading(true);
      try {
        await loadParams(y, m);
        await Promise.all([
          loadBase(y, m),
          loadSystemNames(),
          loadOt(y, m, fxRate),
          loadWorkbookExtras(),
          loadInOut(y, m),
          loadStaffCost(y, m),
        ]);
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        setLoading(false);
      }
    },
    [fxRate, loadParams, loadBase, loadSystemNames, loadOt, loadWorkbookExtras, loadInOut, loadStaffCost],
  );

  const updateStaffCostInput = useCallback(
    (field: keyof ExcoStaffCostYtdInput, value: number | null) => {
      const nextYtd = {
        ...(staffCost?.ytdByMonth || {}),
        [month]: {
          ...staffCostInputFromPartial(staffCost?.ytdByMonth?.[month]),
          [field]: value,
        },
      };
      setStaffCost(rebuildStaffCost(nextYtd));
    },
    [staffCost, month, rebuildStaffCost],
  );

  const saveStaffCost = useCallback(async () => {
    if (!canEdit || !staffCost) return;
    setBusy('Enregistrement Staff Cost…');
    try {
      const staffCostYtdByMonth: Record<string, ExcoStaffCostYtdInput> = {};
      for (const [k, v] of Object.entries(staffCost.ytdByMonth)) {
        staffCostYtdByMonth[String(k)] = staffCostInputFromPartial(v);
      }
      const current = staffCost.sheet.find((s) => s.calendarMonth === month);
      const res = await fetch('/api/exco/report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          overlays: {
            staffCostYtdByMonth,
            staffCostFormulaNotes,
            manualKpis: {
              staffCost: current?.staffCostMonth.value ?? null,
              volumePerEmp: current?.tonPerEmp.value ?? null,
              revenuePerEmp: current?.revenuePerEmp.value ?? null,
              staffCostBudgetYtd: current?.salariesBudgetYtd.value ?? null,
              volumeBudgetYtd: current?.volumesBudgetYtd.value ?? null,
              revenueBudgetYtd: current?.revenueBudgetYtd.value ?? null,
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur Staff Cost');
      showSuccess(`Staff Cost enregistré — ${periodLabel}`);
      await loadStaffCost(year, month);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setBusy('');
    }
  }, [canEdit, staffCost, staffCostFormulaNotes, month, year, periodLabel, loadStaffCost]);

  return (
    <PermissionGate menuId="exco.rapport" action="view">
      <div className="exco-page exco-page-relative exco-workbook-page">
        {(loading || busy) && <ExcoBusyOverlay label={busy || t('common.loading')} />}

        <div className="exco-sticky">
          <div className="page-header page-header-with-tabs exco-page-header">
            <div className="exco-header-left">
              <h2>{t('exco.title')}</h2>
              <p>
                {periodLabel}
                {fxRate ? ` · ${t('exco.rateLabel', { rate: fxRate })}` : ` · ${t('exco.rateUndefined')}`}
              </p>
            </div>
            <div className="exco-header-actions">
              <label className="exco-header-period">
                <span className="sr-only">{t('exco.periodMonth')}</span>
                <input
                  type="month"
                  aria-label={t('exco.periodMonth')}
                  value={`${year}-${String(month).padStart(2, '0')}`}
                  disabled={!canEdit || Boolean(busy) || loading}
                  onChange={(e) => {
                    const [ys, ms] = e.target.value.split('-');
                    void changePeriod(Number(ys), Number(ms));
                  }}
                />
              </label>
              <ExcoExportMenu year={year} month={month} disabled={Boolean(busy) || loading} />
              <RefreshButton loading={loading} onClick={() => void refreshAll()} />
            </div>
          </div>
        </div>

        <div className="exco-main-tabs-shell">
          <div className="exco-main-tabs" role="tablist" aria-label={t('exco.title')}>
            {TAB_DEFS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className={`exco-main-tab${tab === item.id ? ' is-active' : ''}`}
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>

        <div className="exco-workbook-body">
          {tab === 'params' && (
            <div className="exco-panel-stack">
              <section className="exco-panel exco-params-top">
                <div className="exco-params-top-row">
                  <div className="exco-params-taux">
                    <h3>{t('exco.params.rate')}</h3>
                    <div className="exco-params-grid">
                      <label className="exco-field">
                        <span>{t('exco.params.rateFc')}</span>
                        <input
                          type="number"
                          min="1"
                          step="any"
                          placeholder="ex. 2308"
                          disabled={!canEdit || Boolean(busy)}
                          value={fxRate}
                          onChange={(e) => setFxRate(e.target.value)}
                        />
                      </label>
                      {canEdit && (
                        <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => void saveParams()}>
                          {t('exco.params.save')}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="exco-params-imports">
                    {EXCO_SOURCE_FILES.map((def) => {
                      const done = imported[def.id as keyof ImportedFlags];
                      const fileMeta = importedSources[def.id as keyof ImportedFlags];
                      const name = fileMeta?.originalName || uploads[def.id]?.originalName;
                      const clearing = clearingSourceId === def.id;
                      return (
                        <div
                          key={def.id}
                          className={`exco-source-item exco-source-tile${done ? ' is-imported' : ''}${clearing ? ' is-clearing' : ''}`}
                        >
                          {clearing ? (
                            <div className="exco-source-tile-spinner" role="status" aria-live="polite">
                              <span className="btn-spinner" aria-hidden="true" />
                              <span className="sr-only">{t('exco.params.clearing')}</span>
                            </div>
                          ) : null}
                          {canEdit && done && !clearing ? (
                            <button
                              type="button"
                              className="exco-source-clear"
                              title={t('exco.params.clearImport')}
                              aria-label={`${t('exco.params.clearImport')} ${def.label}`}
                              disabled={Boolean(busy) || Boolean(clearingSourceId)}
                              onClick={() => void clearImport(def.id, def.label)}
                            >
                              <ExcoSourceClearIcon />
                            </button>
                          ) : null}
                          <div className="exco-source-meta">
                            <strong title={def.description || def.label}>
                              {def.label}
                              {def.required ? ' *' : ''}
                            </strong>
                            {done ? (
                              <span className="exco-source-chosen" title={name || ''}>
                                {name
                                  ? t('exco.params.importedAs', { name })
                                  : t('exco.params.imported')}
                              </span>
                            ) : (
                              <span className="exco-muted">
                                {t('exco.params.notImported')}
                              </span>
                            )}
                          </div>
                          {canEdit && (
                            <label className="btn btn-secondary btn-sm exco-source-pick">
                              {done ? t('exco.params.reimport') : t('exco.params.import')}
                              <input
                                type="file"
                                accept={def.accept}
                                hidden
                                disabled={Boolean(busy) || Boolean(clearingSourceId)}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = '';
                                  if (f) void uploadFile(def.id, f);
                                }}
                              />
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {hasActionable && (
                <>
                  <section className="exco-panel">
                    <div className="exco-panel-head">
                      <h3>Corrections à appliquer</h3>
                      <div className="exco-inline-actions">
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={Boolean(busy)}
                              onClick={() => void runBaseAction('syncDepartments')}
                            >
                              Sync départements & services
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={Boolean(busy) || missingInSystemCount === 0}
                              onClick={() => void runBaseAction('importMissingFromBase')}
                            >
                              Créer les absents depuis BASE ({missingInSystemCount})
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <p className="exco-muted">
                      Nom et département : données système (matricule). Seuls les absents du système peuvent être créés depuis BASE.
                    </p>
                    {(base?.departmentsToCreate.length || 0) > 0 && (
                      <p className="exco-warn-banner">
                        Départements encore absents : {base!.departmentsToCreate.join(', ')}
                      </p>
                    )}
                  </section>

                  {Object.entries(mismatchGroups).map(([kind, rows]) => (
                    <section key={kind} className="exco-panel">
                      <div className="exco-panel-head">
                        <h3>
                          {mismatchLabel(kind)} ({rows.length})
                        </h3>
                        {canEdit && kind === 'missing_in_system' && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={Boolean(busy)}
                            onClick={() => void runBaseAction('importMissingFromBase')}
                          >
                            Créer tous les absents
                          </button>
                        )}
                      </div>
                      <p className="exco-muted">{mismatchPolicyHint(rows[0]?.policy || '')}</p>
                      <div className="exco-sheet-scroll">
                        <table className="exco-mini-table">
                          <thead>
                            <tr>
                              <th>Matricule</th>
                              <th>Fichier</th>
                              <th>Système</th>
                              <th>Dept fichier</th>
                              <th>Dept résolu</th>
                              <th>Dept système</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.slice(0, 120).map((r) => (
                              <tr key={`${kind}-${r.matricule}-${r.fileName}-${r.systemName}`}>
                                <td>{r.matricule}</td>
                                <td>{r.fileName || '—'}</td>
                                <td>{r.systemName || '—'}</td>
                                <td>{r.fileDepartment || '—'}</td>
                                <td>{r.resolvedDepartment || '—'}</td>
                                <td>{r.systemDepartment || '—'}</td>
                                <td>
                                  {canEdit && r.policy === 'create_from_base' && (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-secondary"
                                      onClick={() =>
                                        void runBaseAction('applyEmployeeFix', {
                                          matricule: r.matricule,
                                        })
                                      }
                                    >
                                      Créer
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}
                </>
              )}

              <section className="exco-panel exco-panel-accent-navy exco-base-in-params">
                <div className="exco-panel-head">
                  <h3>{t('exco.base.title')}</h3>
                  <div className="exco-base-toolbar-inline">
                    <strong className="exco-base-effectif">
                      {t('exco.base.headcount', { count: formatNum(baseProjected.total) })}
                      {baseSearch.trim() ? ` · ${baseProjected.rows.length}` : ''}
                    </strong>
                    <input
                      type="search"
                      className="exco-base-search"
                      placeholder={t('common.search')}
                      value={baseSearch}
                      onChange={(e) => setBaseSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="exco-base-scroll-host">
                  {baseProjected.rows.length > 0 || baseProjected.total > 0 ? (
                    <div className="exco-base-scroll-x">
                      <table className="exco-sheet-table exco-base-table">
                        <thead>
                          <tr>
                            {baseProjected.headers.map((h) => (
                              <th key={h}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {baseProjected.rows.map((row, ri) => (
                            <tr key={`base-${ri}-${row[0] ?? ri}`}>
                              {row.map((cell, ci) => (
                                <td key={`c-${ri}-${ci}`}>
                                  {displayBaseCell(cell, baseProjected.headers[ci])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="exco-muted" style={{ padding: '0.75rem' }}>
                      Feuille BASE introuvable dans New report.xlsx.
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}

          {tab === 'headcount' && (
            <div className="exco-hc-dashboard">
              <div className="exco-metric-strip">
                <MetricCard
                  label="Headcount"
                  value={formatNum(headcount?.headcount)}
                  hint={t('exco.headcount.totalHint')}
                  tone="navy"
                />
                <MetricCard
                  label="Male"
                  value={formatNum(headcount?.male)}
                  hint={formatPct(headcount?.malePct)}
                  tone="navy"
                />
                <MetricCard
                  label="Female"
                  value={formatNum(headcount?.female)}
                  hint={formatPct(headcount?.femalePct)}
                  tone="rose"
                />
                <MetricCard
                  label="Avg Age"
                  value={formatNum(headcount?.averageAge, 1)}
                  hint="années"
                  tone="teal"
                />
                <MetricCard
                  label="Avg LoS"
                  value={formatNum(headcount?.averageLengthOfService, 1)}
                  hint="années"
                  tone="wine"
                />
                <MetricCard
                  label="Pre-retirement"
                  value={formatNum(headcount?.preRetirement)}
                  hint="≥ 55 ans"
                  tone="amber"
                />
              </div>

              <div className="exco-hc-grid">
                <section className="exco-panel exco-panel-accent-navy">
                  <h3>{t('exco.headcount.title')}</h3>
                  <table className="exco-mini-table">
                    <tbody>
                      <tr>
                        <td>Headcount</td>
                        <td>{formatNum(headcount?.headcount)}</td>
                        <td>100%</td>
                      </tr>
                      <tr>
                        <td>Male</td>
                        <td>{formatNum(headcount?.male)}</td>
                        <td>{formatPct(headcount?.malePct)}</td>
                      </tr>
                      <tr>
                        <td>Female</td>
                        <td>{formatNum(headcount?.female)}</td>
                        <td>{formatPct(headcount?.femalePct)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="exco-gender-donut">
                    <div
                      className="exco-donut"
                      style={{
                        background: `conic-gradient(#1e3a5f 0 ${(headcount?.malePct || 0) <= 1 ? (headcount?.malePct || 0) * 100 : (headcount?.malePct || 0)}%, #c45c7a 0)`,
                      }}
                    >
                      <div className="exco-donut-hole">
                        <strong>{formatNum(headcount?.headcount)}</strong>
                        <span>Total</span>
                      </div>
                    </div>
                    <div className="exco-chart-legend">
                      <span className="exco-legend-male">Male {formatPct(headcount?.malePct)}</span>
                      <span className="exco-legend-female">Female {formatPct(headcount?.femalePct)}</span>
                    </div>
                  </div>
                </section>

                <section className="exco-panel exco-panel-accent-rose">
                  <h3>Gender per location</h3>
                  <GenderLocationChart items={headcount?.genderByLocation || []} />
                  <div className="exco-sheet-scroll" style={{ marginTop: '0.75rem', maxHeight: '14rem' }}>
                    <table className="exco-mini-table">
                      <thead>
                        <tr>
                          <th>Location</th>
                          <th>Male</th>
                          <th>Female</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(headcount?.genderByLocation || []).map((r) => (
                          <tr key={r.location}>
                            <td>{r.location}</td>
                            <td>{formatNum(r.male)}</td>
                            <td>{formatNum(r.female)}</td>
                            <td>{formatNum(r.total)}</td>
                          </tr>
                        ))}
                        <tr className="exco-row-total">
                          <td>Total</td>
                          <td>{formatNum(headcount?.male)}</td>
                          <td>{formatNum(headcount?.female)}</td>
                          <td>{formatNum(headcount?.headcount)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <StaffMovementYtdTable
                inOut={inOut}
                month={month}
                onMonth={openInOutMonth}
                onYtd={openInOutYtd}
              />

              <div className="exco-diversity-slide">
                <div className="exco-diversity-cards">
                  <article className="exco-slide-card tone-red">
                    <header>
                      <div className="exco-slide-card-titles">
                        <strong>Age Distribution</strong>
                        <em>
                          {headcount?.averageAge != null
                            ? `${formatNum(headcount.averageAge, 1)} years old`
                            : '—'}
                        </em>
                      </div>
                      {headcount?.averageAge != null ? (
                        <span className="exco-avg-badge">Avg {formatNum(headcount.averageAge, 1)} yrs</span>
                      ) : null}
                    </header>
                    <PctBarChart
                      items={headcount?.ageBands || []}
                      color="#e30613"
                    />
                  </article>
                  <article className="exco-slide-card tone-black">
                    <header>
                      <div className="exco-slide-card-titles">
                        <strong>Length of Service</strong>
                        <em>
                          {headcount?.averageLengthOfService != null
                            ? `${formatNum(headcount.averageLengthOfService, 2)} years`
                            : '—'}
                        </em>
                      </div>
                      {headcount?.averageLengthOfService != null ? (
                        <span className="exco-avg-badge">Avg {formatNum(headcount.averageLengthOfService, 2)} yrs</span>
                      ) : null}
                    </header>
                    <PctBarChart
                      items={headcount?.seniorityBands || []}
                      color="#52525b"
                    />
                  </article>
                </div>
              </div>
            </div>
          )}

          {tab === 'inout' && (
            <div className="exco-hc-dashboard">
              <div className="exco-metric-strip">
                <MetricCard
                  label={`IN · ${monthLabel}`}
                  value={formatNum(inOut?.inList?.length)}
                  hint="embauches du mois"
                  tone="teal"
                  highlight
                  onClick={() => openInOutList(`Voir la liste — IN — ${periodLabel}`, inOut?.inList || [])}
                />
                <MetricCard
                  label={`OUT · ${monthLabel}`}
                  value={formatNum(inOut?.outList?.length)}
                  hint="sorties du mois"
                  tone="wine"
                  highlight
                  onClick={() => openInOutList(`Voir la liste — OUT — ${periodLabel}`, inOut?.outList || [])}
                />
                <MetricCard
                  label="Attrition"
                  value={formatRatePct(inOut?.ytdAttrition)}
                  hint="OUT ÷ HC (mois)"
                  tone="amber"
                  highlight
                />
                <MetricCard
                  label="Turnover"
                  value={formatRatePct(inOut?.ytdTurnover)}
                  hint="(IN+OUT)/2 ÷ HC (mois)"
                  tone="navy"
                  highlight
                />
                <MetricCard
                  label="Headcount"
                  value={formatNum(inOut?.ytdHeadcount)}
                  hint="fin de mois"
                  tone="default"
                  highlight
                />
                <MetricCard
                  label="IN YTD"
                  value={formatNum(inOut?.ytdIn)}
                  hint="embauches cumulées"
                  tone="teal"
                  onClick={() => openInOutYtd('in')}
                />
                <MetricCard
                  label="OUT YTD"
                  value={formatNum(inOut?.ytdOut)}
                  hint="sorties cumulées"
                  tone="wine"
                  onClick={() => openInOutYtd('out')}
                />
              </div>

              <StaffMovementYtdTable
                inOut={inOut}
                month={month}
                onMonth={openInOutMonth}
                onYtd={openInOutYtd}
              />

              <div className="exco-inout-lists">
                <section className="exco-panel exco-panel-accent-teal is-report-month">
                  <div className="exco-panel-head">
                    <h3>{t('exco.inout.hires', { month: monthLabel })}</h3>
                    <button
                      type="button"
                      className="exco-num-clickable"
                      title={`Voir la liste — Embauches · ${periodLabel}`}
                      onClick={() => openInOutList(`Voir la liste — IN — ${periodLabel}`, inOut?.inList || [])}
                    >
                      {formatNum(inOut?.inList?.length)} personnes
                    </button>
                  </div>
                  <div className="exco-sheet-scroll" style={{ maxHeight: '22rem' }}>
                    <table className="exco-mini-table">
                      <thead>
                        <tr>
                          <th>Matricule</th>
                          <th>Nom</th>
                          <th>Genre</th>
                          <th>Grade</th>
                          <th>Département</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inOut?.inList || []).length === 0 ? (
                          <tr>
                            <td colSpan={6} className="exco-muted">Aucune embauche ce mois.</td>
                          </tr>
                        ) : (
                          (inOut?.inList || []).map((r) => (
                            <tr key={`in-${r.matricule}-${r.appointmentDate}`}>
                              <td>{r.matricule}</td>
                              <td>{namesByMatricule[normMatricule(r.matricule)] || r.nom}</td>
                              <td>{r.genre || '—'}</td>
                              <td>{r.grade || '—'}</td>
                              <td>{deptsByMatricule[normMatricule(r.matricule)] || r.departement || '—'}</td>
                              <td>{formatInOutDate(r.appointmentDate)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="exco-panel exco-panel-accent-wine is-report-month">
                  <div className="exco-panel-head">
                    <h3>{t('exco.inout.exits', { month: monthLabel })}</h3>
                    <button
                      type="button"
                      className="exco-num-clickable"
                      title={`Voir la liste — Sorties · ${periodLabel}`}
                      onClick={() => openInOutList(`Voir la liste — OUT — ${periodLabel}`, inOut?.outList || [])}
                    >
                      {formatNum(inOut?.outList?.length)} personnes
                    </button>
                  </div>
                  <div className="exco-sheet-scroll" style={{ maxHeight: '22rem' }}>
                    <table className="exco-mini-table">
                      <thead>
                        <tr>
                          <th>Matricule</th>
                          <th>Nom</th>
                          <th>Genre</th>
                          <th>Grade</th>
                          <th>Département</th>
                          <th>Date</th>
                          <th>Motif</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(inOut?.outList || []).length === 0 ? (
                          <tr>
                            <td colSpan={7} className="exco-muted">Aucune sortie ce mois.</td>
                          </tr>
                        ) : (
                          (inOut?.outList || []).map((r) => (
                            <tr key={`out-${r.matricule}-${r.appointmentDate}`}>
                              <td>{r.matricule}</td>
                              <td>{namesByMatricule[normMatricule(r.matricule)] || r.nom}</td>
                              <td>{r.genre || '—'}</td>
                              <td>{r.grade || '—'}</td>
                              <td>{deptsByMatricule[normMatricule(r.matricule)] || r.departement || '—'}</td>
                              <td>{formatInOutDate(r.appointmentDate)}</td>
                              <td>{r.reason || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>

              <section className="exco-panel exco-panel-accent-rose is-report-month">
                <h3>{t('exco.inout.exitTypes', { month: monthLabel })}</h3>
                <ExitReasonsPctChart
                  items={inOut?.exitsByReason || []}
                  onItemClick={openExitReason}
                />
              </section>
            </div>
          )}

          {tab === 'staffcost' && (
            <div className="exco-hc-dashboard exco-staffcost-page exco-staffcost-aligned">
              <section className="exco-panel exco-panel-accent-navy exco-staffcost-sheet-panel">
                <div className="exco-panel-head">
                  <h3>Input</h3>
                  <div className="exco-staffcost-actions">
                    <span className="exco-muted">Stylo = éditer · clic droit = formule</span>
                    {canEdit && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={Boolean(busy)} onClick={() => void saveStaffCost()}>
                        {t('common.save')}
                      </button>
                    )}
                  </div>
                </div>
                <div className="exco-sheet-scroll">
                  <table className="exco-mini-table exco-inout-trend-table exco-staffcost-table exco-staffcost-input">
                    <StaffCostColGroup />
                    <thead>
                      <tr>
                        <th>Metric</th>
                        {(staffCost?.sheet || []).map((m) => (
                          <th key={m.label} className={m.calendarMonth === month ? 'is-report-month' : undefined}>{m.label}</th>
                        ))}
                        <th className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="exco-staffcost-section"><td colSpan={14}>Actual YTD</td></tr>
                      <tr>
                        <td>Headcount</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`ah-${m.label}`}
                            cellKey={`input:actualHeadcount:${m.label}`}
                            cell={resolveStaffCostCell(`input:actualHeadcount:${m.label}`, m.actualHeadcount)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('actualHeadcount', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Salaries</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`as-${m.label}`}
                            cellKey={`input:salariesActualYtd:${m.label}`}
                            cell={resolveStaffCostCell(`input:salariesActualYtd:${m.label}`, m.salariesActualYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            digits={0}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('salariesActualYtd', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Volumes</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`av-${m.label}`}
                            cellKey={`input:volumesActualYtd:${m.label}`}
                            cell={resolveStaffCostCell(`input:volumesActualYtd:${m.label}`, m.volumesActualYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            digits={0}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('volumesActualYtd', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Revenue</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`ar-${m.label}`}
                            cellKey={`input:revenueActualYtd:${m.label}`}
                            cell={resolveStaffCostCell(`input:revenueActualYtd:${m.label}`, m.revenueActualYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            digits={0}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('revenueActualYtd', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr className="exco-staffcost-section"><td colSpan={14}>Plan Budget YTD</td></tr>
                      <tr>
                        <td>Headcount</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`bh-${m.label}`}
                            cellKey={`input:budgetHeadcount:${m.label}`}
                            cell={resolveStaffCostCell(`input:budgetHeadcount:${m.label}`, m.budgetHeadcount)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('budgetHeadcount', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Salaries</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`bs-${m.label}`}
                            cellKey={`input:salariesBudgetYtd:${m.label}`}
                            cell={resolveStaffCostCell(`input:salariesBudgetYtd:${m.label}`, m.salariesBudgetYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            digits={0}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('salariesBudgetYtd', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Volumes</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`bv-${m.label}`}
                            cellKey={`input:volumesBudgetYtd:${m.label}`}
                            cell={resolveStaffCostCell(`input:volumesBudgetYtd:${m.label}`, m.volumesBudgetYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            digits={0}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('volumesBudgetYtd', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Revenue</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell
                            key={`br-${m.label}`}
                            cellKey={`input:revenueBudgetYtd:${m.label}`}
                            cell={resolveStaffCostCell(`input:revenueBudgetYtd:${m.label}`, m.revenueBudgetYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu}
                            digits={0}
                            highlight={m.calendarMonth === month}
                            editable={canEdit && m.calendarMonth === month}
                            disabled={Boolean(busy)}
                            onChange={(v) => updateStaffCostInput('revenueBudgetYtd', v)}
                          />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr className="exco-staffcost-section"><td colSpan={14}>%</td></tr>
                      <tr>
                        <td>Salaries %</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`ps-${m.label}`} cellKey={`pct:salaries:${m.label}`}
                            cell={resolveStaffCostCell(`pct:salaries:${m.label}`, m.pctSalaries)}
                            onFormulaMenu={openStaffCostFormulaMenu} pct highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Volumes %</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`pv-${m.label}`} cellKey={`pct:volumes:${m.label}`}
                            cell={resolveStaffCostCell(`pct:volumes:${m.label}`, m.pctVolumes)}
                            onFormulaMenu={openStaffCostFormulaMenu} pct highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                      <tr>
                        <td>Revenue %</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`pr-${m.label}`} cellKey={`pct:revenue:${m.label}`}
                            cell={resolveStaffCostCell(`pct:revenue:${m.label}`, m.pctRevenue)}
                            onFormulaMenu={openStaffCostFormulaMenu} pct highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col is-total-spacer" aria-hidden="true" />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="exco-panel exco-panel-accent-wine exco-staffcost-sheet-panel">
                <div className="exco-panel-head">
                  <h3>FY — Actual</h3>
                  <span className="exco-muted">Formules Staff_Cost_KPI</span>
                </div>
                <div className="exco-sheet-scroll">
                  <table className="exco-mini-table exco-inout-trend-table exco-staffcost-table exco-staffcost-fy is-actual">
                    <StaffCostColGroup />
                    <thead>
                      <tr>
                        <th>FY — Actual</th>
                        {(staffCost?.sheet || []).map((m) => (
                          <th key={`a-${m.label}`} className={m.calendarMonth === month ? 'is-report-month' : undefined}>{m.label}</th>
                        ))}
                        <th className="is-total-col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Staff_Cost</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`sc-${m.label}`} cellKey={`actual:staffCostMonth:${m.label}`}
                            cell={resolveStaffCostCell(`actual:staffCostMonth:${m.label}`, m.staffCostMonth)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.staffCostMonth.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Staff_Cumul</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`scc-${m.label}`} cellKey={`actual:staffCumul:${m.label}`}
                            cell={resolveStaffCostCell(`actual:staffCumul:${m.label}`, m.staffCumul)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(maxSheetValues(staffCost?.sheet || [], (m) => m.staffCumul.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Volume</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`vm-${m.label}`} cellKey={`actual:volumeMonth:${m.label}`}
                            cell={resolveStaffCostCell(`actual:volumeMonth:${m.label}`, m.volumeMonth)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.volumeMonth.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Volume_Cumul</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`vc-${m.label}`} cellKey={`actual:volumeCumul:${m.label}`}
                            cell={resolveStaffCostCell(`actual:volumeCumul:${m.label}`, m.volumeCumul)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(maxSheetValues(staffCost?.sheet || [], (m) => m.volumeCumul.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Revenue</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`rm-${m.label}`} cellKey={`actual:revenueMonth:${m.label}`}
                            cell={resolveStaffCostCell(`actual:revenueMonth:${m.label}`, m.revenueMonth)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.revenueMonth.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Revenue_Cumul</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`rc-${m.label}`} cellKey={`actual:revenueCumul:${m.label}`}
                            cell={resolveStaffCostCell(`actual:revenueCumul:${m.label}`, m.revenueCumul)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(maxSheetValues(staffCost?.sheet || [], (m) => m.revenueCumul.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr className="exco-staffcost-fy-sep">
                        <td>T/employee YTD</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`ty-${m.label}`} cellKey={`actual:tonPerEmpYtd:${m.label}`}
                            cell={resolveStaffCostCell(`actual:tonPerEmpYtd:${m.label}`, m.tonPerEmpYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.tonPerEmpYtd.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>T/employee</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`tm-${m.label}`} cellKey={`actual:tonPerEmp:${m.label}`}
                            cell={resolveStaffCostCell(`actual:tonPerEmp:${m.label}`, m.tonPerEmp)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.tonPerEmp.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Revenue/Employee YTD</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`ry-${m.label}`} cellKey={`actual:revenuePerEmpYtd:${m.label}`}
                            cell={resolveStaffCostCell(`actual:revenuePerEmpYtd:${m.label}`, m.revenuePerEmpYtd)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.revenuePerEmpYtd.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Revenue/Employee</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`re-${m.label}`} cellKey={`actual:revenuePerEmp:${m.label}`}
                            cell={resolveStaffCostCell(`actual:revenuePerEmp:${m.label}`, m.revenuePerEmp)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.revenuePerEmp.value), { zeroAsDash: false })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="exco-panel exco-panel-accent-teal exco-staffcost-sheet-panel">
                <div className="exco-panel-head">
                  <h3>FY — Budget</h3>
                  <span className="exco-muted">Formules Staff_Cost_KPI</span>
                </div>
                <div className="exco-sheet-scroll">
                  <table className="exco-mini-table exco-inout-trend-table exco-staffcost-table exco-staffcost-fy is-budget">
                    <StaffCostColGroup />
                    <thead>
                      <tr>
                        <th>FY — Budget</th>
                        {(staffCost?.sheet || []).map((m) => (
                          <th key={`b-${m.label}`} className={m.calendarMonth === month ? 'is-report-month' : undefined}>{m.label}</th>
                        ))}
                        <th className="is-total-col">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Staff_Cost</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`bsc-${m.label}`} cellKey={`budget:staffCostMonth:${m.label}`}
                            cell={resolveStaffCostCell(`budget:staffCostMonth:${m.label}`, m.budgetStaffCostMonth)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.budgetStaffCostMonth.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Staff_Cumul</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`bscc-${m.label}`} cellKey={`budget:staffCumul:${m.label}`}
                            cell={resolveStaffCostCell(`budget:staffCumul:${m.label}`, m.budgetStaffCumul)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(maxSheetValues(staffCost?.sheet || [], (m) => m.budgetStaffCumul.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Volume</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`bvm-${m.label}`} cellKey={`budget:volumeMonth:${m.label}`}
                            cell={resolveStaffCostCell(`budget:volumeMonth:${m.label}`, m.budgetVolumeMonth)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.budgetVolumeMonth.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Volume_Cumul</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`bvc-${m.label}`} cellKey={`budget:volumeCumul:${m.label}`}
                            cell={resolveStaffCostCell(`budget:volumeCumul:${m.label}`, m.budgetVolumeCumul)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(maxSheetValues(staffCost?.sheet || [], (m) => m.budgetVolumeCumul.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Revenue</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`brm-${m.label}`} cellKey={`budget:revenueMonth:${m.label}`}
                            cell={resolveStaffCostCell(`budget:revenueMonth:${m.label}`, m.budgetRevenueMonth)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.budgetRevenueMonth.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Revenue_Cumul</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`brc-${m.label}`} cellKey={`budget:revenueCumul:${m.label}`}
                            cell={resolveStaffCostCell(`budget:revenueCumul:${m.label}`, m.budgetRevenueCumul)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(maxSheetValues(staffCost?.sheet || [], (m) => m.budgetRevenueCumul.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr className="exco-staffcost-fy-sep">
                        <td>T/employee</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`bt-${m.label}`} cellKey={`budget:tonPerEmp:${m.label}`}
                            cell={resolveStaffCostCell(`budget:tonPerEmp:${m.label}`, m.budgetTonPerEmp)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.budgetTonPerEmp.value), { zeroAsDash: false })}</td>
                      </tr>
                      <tr>
                        <td>Revenue/Employee</td>
                        {(staffCost?.sheet || []).map((m) => (
                          <FormulaCell key={`bre-${m.label}`} cellKey={`budget:revenuePerEmp:${m.label}`}
                            cell={resolveStaffCostCell(`budget:revenuePerEmp:${m.label}`, m.budgetRevenuePerEmp)}
                            onFormulaMenu={openStaffCostFormulaMenu} excelStyle digits={2} highlight={m.calendarMonth === month} />
                        ))}
                        <td className="is-total-col">{formatStaffCostExcel(sumSheetValues(staffCost?.sheet || [], (m) => m.budgetRevenuePerEmp.value), { zeroAsDash: false })}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {tab === 'overtime' && (
            <div className="exco-panel-stack exco-ot-page">
              {ot?.missing.overtime || ot?.missing.leave ? (
                <p className="exco-warn-banner">
                  {ot.missing.overtime ? 'Importez Component Posted Units dans Params. ' : ''}
                  {ot.missing.leave ? 'Importez Leave Balances (Annual) dans Params.' : ''}
                </p>
              ) : null}

              <div className="exco-ot-tabs-shell">
              <div className="exco-ot-subtabs" role="tablist" aria-label="Overtime">
                <button
                  type="button"
                  role="tab"
                  aria-selected={otSubTab === 'overview'}
                  className={`exco-ot-subtab${otSubTab === 'overview' ? ' is-active' : ''}`}
                  onClick={() => setOtSubTab('overview')}
                >
                  General Overview — {MONTHS_EN[month - 1] || month}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={otSubTab === 'evolution'}
                  className={`exco-ot-subtab${otSubTab === 'evolution' ? ' is-active' : ''}`}
                  onClick={() => setOtSubTab('evolution')}
                >
                  Evolution
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={otSubTab === 'top10'}
                  className={`exco-ot-subtab${otSubTab === 'top10' ? ' is-active' : ''}`}
                  onClick={() => setOtSubTab('top10')}
                >
                  Top 10
                </button>
              </div>

              {otSubTab === 'overview' && (
                <div className="exco-ot-tab-body exco-ot-overview-tab">
                  <div className="exco-metric-strip exco-ot-overview-cards">
                      <MetricCard
                        label="Total workforce"
                        value={formatNum(otOverview.headcount)}
                        hint="effectif"
                        tone="navy"
                        highlight
                      />
                      <MetricCard
                        label="Employees with hours"
                        value={`${formatNum(otOverview.agents)}${otOverview.pctAgents != null ? ` (${formatNum(otOverview.pctAgents, 1)}%)` : ''}`}
                        hint="avec OT enregistré"
                        tone="teal"
                        onClick={() => openOtEmployeeList(`Voir la liste — Agents OT · ${periodLabel}`, otEmployeesResolved)}
                      />
                      <MetricCard
                        label="Total Overtime"
                        value={formatNum(otOverview.hours, 2)}
                        hint="heures"
                        tone="wine"
                        onClick={() => openOtEmployeeList(`Voir la liste — Heures OT · ${periodLabel}`, otEmployeesResolved)}
                      />
                      <MetricCard
                        label="Average hours"
                        value={formatNum(otOverview.avgHours, 2)}
                        hint="par agent OT"
                        tone="amber"
                      />
                      <MetricCard
                        label="Total cost"
                        value={formatUsd(otOverview.cost)}
                        hint="USD"
                        tone="wine"
                        onClick={() => openOtEmployeeList(`Voir la liste — Coût OT · ${periodLabel}`, otEmployeesResolved)}
                      />
                      <MetricCard
                        label="Average cost / emp."
                        value={formatUsd(otOverview.avgCost)}
                        hint="USD"
                        tone="default"
                      />
                      <MetricCard
                        label="OT % of staff cost"
                        value={
                          otOverview.otPctMonth != null || otOverview.otPctYtd != null
                            ? `${otOverview.otPctYtd != null ? `${formatNum(otOverview.otPctYtd, 2)}% YTD` : '—'}${otOverview.otPctMonth != null ? ` · ${formatNum(otOverview.otPctMonth, 2)}% mois` : ''}`
                            : '—'
                        }
                        hint="vs Staff Cost"
                        tone="rose"
                      />
                      <MetricCard
                        label="Avg leave days"
                        value={formatNum(otOverview.avgLeave, 1)}
                        hint="Annual Closing · Mco+Qco"
                        tone="ok"
                        onClick={() =>
                          openOtEmployeeList(
                            `Voir la liste — Leave Annual (Closing) · ${periodLabel}`,
                            otEmployeesResolved.filter((e) => e.leaveDays != null),
                          )
                        }
                      />
                  </div>

                  <div className="exco-ot-hours-slide">
                    <section className="exco-panel exco-ot-hours-table-panel">
                      <div className="exco-sheet-scroll">
                        <table className="exco-mini-table exco-ot-month-hours">
                          <thead>
                            <tr>
                              <th>Department</th>
                              <th className="is-report-month">{otHoursSlide.monthLabel}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {otHoursSlide.rows.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="exco-muted">Aucune donnée overtime.</td>
                              </tr>
                            ) : (
                              otHoursSlide.rows.map((r) => (
                                <tr
                                  key={r.department}
                                  className={r.hours && r.hours > 0 ? 'is-clickable' : undefined}
                                  title={
                                    r.hours && r.hours > 0
                                      ? `Voir la liste — Overtime · ${r.department}`
                                      : undefined
                                  }
                                  onClick={() => {
                                    if (r.hours && r.hours > 0) openOtDeptHours(r.department);
                                  }}
                                >
                                  <td>{r.department}</td>
                                  <td className="is-report-month">
                                    {r.hours != null && r.hours > 0 ? formatOtCell(r.hours) : '—'}
                                  </td>
                                </tr>
                              ))
                            )}
                            {otHoursSlide.rows.length > 0 && (
                              <tr
                                className="exco-row-total is-clickable"
                                title={`Voir la liste — Overtime · ${periodLabel}`}
                                onClick={() => openOtDeptHours(null)}
                              >
                                <td>Total</td>
                                <td className="is-report-month">{formatOtCell(otHoursSlide.total || null)}</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    <section className="exco-panel exco-ot-hours-chart-panel">
                      <h3>Overtime — {otHoursSlide.monthLabel} hours per Department</h3>
                      <div className="exco-ot-vchart">
                        {otHoursSlide.rows.map((r) => {
                          const h = r.hours && r.hours > 0
                            ? Math.max(4, (r.hours / otHoursSlide.max) * 100)
                            : 1;
                          return (
                            <button
                              type="button"
                              key={r.department}
                              className="exco-ot-vcol is-clickable"
                              title={
                                r.hours && r.hours > 0
                                  ? `Voir la liste — Overtime · ${r.department}`
                                  : r.department
                              }
                              disabled={!(r.hours && r.hours > 0)}
                              onClick={() => openOtDeptHours(r.department)}
                            >
                              <span className="exco-ot-vval">
                                {r.hours && r.hours > 0 ? formatNum(r.hours, 0) : ''}
                              </span>
                              <div className="exco-ot-vtrack">
                                <span style={{ height: `${h}%` }} />
                              </div>
                              <span className="exco-ot-vlab" title={r.department}>
                                {otChartDeptLabel(r.department)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  </div>

                  <ExcoOtOverviewCharts
                    trendRows={ot?.workbook?.trendRows || []}
                    actualVsBudget={ot?.workbook?.actualVsBudget || null}
                  />
                </div>
              )}

              {otSubTab === 'evolution' && (
                <div className="exco-ot-tab-body exco-ot-evolution">
                  <section className="exco-panel exco-panel-accent-navy exco-staffcost-sheet-panel">
                    <div className="exco-panel-head">
                      <h3>HOURS</h3>
                      <span className="exco-muted">OVT · APR→MAR</span>
                    </div>
                    <div className="exco-sheet-scroll">
                      <table className="exco-mini-table exco-inout-trend-table exco-ot-trend-table is-hours">
                        <thead>
                          <tr>
                            <th>Dept</th>
                            {OVT_TREND_MONTH_LABELS.map((lab, i) => (
                              <th
                                key={`h-${lab}-${i}`}
                                className={OVT_TREND_MONTHS[i] === month ? 'is-report-month' : undefined}
                              >
                                {lab}
                              </th>
                            ))}
                            <th>%</th>
                            <th className="is-total-col">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(ot?.workbook?.trendRows || []).map((row) => (
                            <tr key={`h-${row.department}`}>
                              <td>{row.department}</td>
                              {row.hoursByMonth.map((v, i) => (
                                <td
                                  key={`${row.department}-h-${i}`}
                                  className={OVT_TREND_MONTHS[i] === month ? 'is-report-month' : undefined}
                                >
                                  {formatOtCell(v)}
                                </td>
                              ))}
                              <td>{row.hoursShare != null ? formatNum((row.hoursShare <= 1 ? row.hoursShare * 100 : row.hoursShare), 1) + '%' : '—'}</td>
                              <td className="is-total-col">{formatOtCell(row.hoursYtd)}</td>
                            </tr>
                          ))}
                          {(ot?.workbook?.trendRows || []).length > 0 && (
                            <tr className="exco-row-total">
                              <td>Total</td>
                              {Array.from({ length: 12 }, (_, i) => {
                                const sum = (ot?.workbook?.trendRows || []).reduce(
                                  (s, r) => s + (r.hoursByMonth[i] || 0),
                                  0,
                                );
                                return (
                                  <td key={`ht-${i}`} className={OVT_TREND_MONTHS[i] === month ? 'is-report-month' : undefined}>
                                    {formatOtCell(sum || null)}
                                  </td>
                                );
                              })}
                              <td />
                              <td className="is-total-col">
                                {formatOtCell(
                                  (ot?.workbook?.trendRows || []).reduce((s, r) => s + (r.hoursYtd || 0), 0) || null,
                                )}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="exco-panel exco-panel-accent-wine exco-staffcost-sheet-panel">
                    <div className="exco-panel-head">
                      <h3>Value</h3>
                      <span className="exco-muted">OVT · coût USD</span>
                    </div>
                    <div className="exco-sheet-scroll">
                      <table className="exco-mini-table exco-inout-trend-table exco-ot-trend-table is-value">
                        <thead>
                          <tr>
                            <th>Dept</th>
                            {OVT_TREND_MONTH_LABELS.map((lab, i) => (
                              <th
                                key={`v-${lab}-${i}`}
                                className={OVT_TREND_MONTHS[i] === month ? 'is-report-month' : undefined}
                              >
                                {lab}
                              </th>
                            ))}
                            <th>%</th>
                            <th className="is-total-col">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(ot?.workbook?.trendRows || []).map((row) => (
                            <tr key={`v-${row.department}`}>
                              <td>{row.department}</td>
                              {row.costByMonth.map((v, i) => (
                                <td
                                  key={`${row.department}-v-${i}`}
                                  className={OVT_TREND_MONTHS[i] === month ? 'is-report-month' : undefined}
                                >
                                  {formatOtCell(v)}
                                </td>
                              ))}
                              <td>{row.costShare != null ? formatNum((row.costShare <= 1 ? row.costShare * 100 : row.costShare), 1) + '%' : '—'}</td>
                              <td className="is-total-col">{formatOtCell(row.costYtd)}</td>
                            </tr>
                          ))}
                          {(ot?.workbook?.trendRows || []).length > 0 && (
                            <tr className="exco-row-total">
                              <td>Total</td>
                              {Array.from({ length: 12 }, (_, i) => {
                                const sum = (ot?.workbook?.trendRows || []).reduce(
                                  (s, r) => s + (r.costByMonth[i] || 0),
                                  0,
                                );
                                return (
                                  <td key={`vt-${i}`} className={OVT_TREND_MONTHS[i] === month ? 'is-report-month' : undefined}>
                                    {formatOtCell(sum || null)}
                                  </td>
                                );
                              })}
                              <td />
                              <td className="is-total-col">
                                {formatOtCell(
                                  (ot?.workbook?.trendRows || []).reduce((s, r) => s + (r.costYtd || 0), 0) || null,
                                )}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="exco-panel exco-panel-accent-teal exco-staffcost-sheet-panel">
                    <div className="exco-panel-head">
                      <h3>Actual vs Budget</h3>
                      <span className="exco-muted">OVT · APR→MAR</span>
                    </div>
                    <div className="exco-sheet-scroll">
                      <table className="exco-mini-table exco-inout-trend-table exco-ot-trend-table is-avb">
                        <thead>
                          <tr>
                            <th />
                            {(ot?.workbook?.actualVsBudget?.monthLabels || OVT_AVB_MONTH_LABELS).map((lab, i) => (
                              <th
                                key={`avb-${lab}`}
                                className={OVT_AVB_MONTHS[i] === month ? 'is-report-month' : undefined}
                              >
                                {lab}
                              </th>
                            ))}
                            <th className="is-total-col">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Actual</td>
                            {(ot?.workbook?.actualVsBudget?.actualByMonth || []).map((v, i) => (
                              <td key={`act-${i}`} className={OVT_AVB_MONTHS[i] === month ? 'is-report-month' : undefined}>
                                {formatOtCell(v)}
                              </td>
                            ))}
                            <td className="is-total-col">{formatOtCell(ot?.workbook?.actualVsBudget?.actualYtd ?? null)}</td>
                          </tr>
                          <tr>
                            <td>Budget</td>
                            {(ot?.workbook?.actualVsBudget?.budgetByMonth || []).map((v, i) => (
                              <td key={`bud-${i}`} className={OVT_AVB_MONTHS[i] === month ? 'is-report-month' : undefined}>
                                {formatOtCell(v)}
                              </td>
                            ))}
                            <td className="is-total-col">{formatOtCell(ot?.workbook?.actualVsBudget?.budgetYtd ?? null)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <div className="exco-hc-grid">
                    <section className="exco-panel exco-panel-accent-navy">
                      <h3>Hours by department</h3>
                      <BarChart
                        items={(ot?.byDepartment || []).map((d) => ({
                          label: d.department,
                          value: d.hours,
                        }))}
                        color="#1e3a5f"
                      />
                    </section>
                    <section className="exco-panel exco-panel-accent-wine">
                      <h3>Value by department</h3>
                      <BarChart
                        items={(ot?.byDepartment || []).map((d) => ({
                          label: d.department,
                          value: d.costUsd,
                        }))}
                        color="#7a1f2b"
                      />
                    </section>
                  </div>
                </div>
              )}

              {otSubTab === 'top10' && (
                <div className="exco-ot-tab-body exco-ot-top10">
                  <section className="exco-panel exco-panel-accent-wine">
                    <div className="exco-panel-head">
                      <h3>Overtime — Top Employees</h3>
                      <span className="exco-muted">Top 10 surlignés</span>
                    </div>
                    <div className="exco-sheet-scroll">
                      <table className="exco-mini-table exco-ot-emp-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>ID</th>
                            <th>Names</th>
                            <th>OVT_Hours</th>
                            <th>OVT_Cost</th>
                            <th>Leave_Balance</th>
                            <th>Departments</th>
                          </tr>
                        </thead>
                        <tbody>
                          {otTopByHours.map((r, idx) => (
                            <tr key={`oh-${r.matricule}`} className={idx < 10 ? 'is-top10' : undefined}>
                              <td>{idx + 1}</td>
                              <td>{r.matricule}</td>
                              <td>{r.name}</td>
                              <td>{formatNum(r.hours, 2)}</td>
                              <td>{formatUsd(r.costUsd)}</td>
                              <td>{r.leaveDays != null ? formatNum(r.leaveDays, 2) : '—'}</td>
                              <td>{r.department}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="exco-panel exco-panel-accent-navy">
                    <div className="exco-panel-head">
                      <h3>Leave Balance — Top Employees</h3>
                      <span className="exco-muted">Top 10 surlignés</span>
                    </div>
                    <div className="exco-sheet-scroll">
                      <table className="exco-mini-table exco-ot-emp-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>ID</th>
                            <th>Names</th>
                            <th>OVT_Hours</th>
                            <th>OVT_Cost</th>
                            <th>Leave_Balance</th>
                            <th>Departments</th>
                          </tr>
                        </thead>
                        <tbody>
                          {otTopByLeave.map((r, idx) => (
                            <tr key={`ol-${r.matricule}`} className={idx < 10 ? 'is-top10' : undefined}>
                              <td>{idx + 1}</td>
                              <td>{r.matricule}</td>
                              <td>{r.name}</td>
                              <td>{formatNum(r.hours, 2)}</td>
                              <td>{formatUsd(r.costUsd)}</td>
                              <td>{r.leaveDays != null ? formatNum(r.leaveDays, 2) : '—'}</td>
                              <td>{r.department}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
              </div>
            </div>
          )}

          {tab === 'kpi' && (
            <div className="exco-kpi-summary">
              <p className="exco-muted">
                Valeurs et comparaison vs mois précédent selon le PPTX / New report
                (pas de reconstitution de juin incomplet).
              </p>
              <div className="exco-kpi-cards">
                {kpiCards.map((c) => {
                  const delta = c.delta || '';
                  const tone = delta.includes('▲')
                    ? 'exco-kpi-delta-up'
                    : delta.includes('▼')
                      ? 'exco-kpi-delta-down'
                      : 'exco-kpi-delta-flat';
                  return (
                    <article key={c.label} className="exco-kpi-card">
                      <h4>{c.label}</h4>
                      <p className="exco-kpi-card-value">{c.value || '—'}</p>
                      <p className={`exco-kpi-card-delta ${tone}`}>{c.delta || 'vs prev. —'}</p>
                      <p className="exco-kpi-card-prev">prev. {c.prev || '—'}</p>
                    </article>
                  );
                })}
              </div>
              {!kpiCards.length && <p className="exco-muted">Cartes KPI PPTX non disponibles.</p>}
            </div>
          )}

          {tab === 'summary' && (
            <div className="exco-panel-stack exco-summary-stack">
              <div className="exco-panel-head" style={{ marginBottom: 0 }}>
                <p className="exco-muted" style={{ margin: 0 }}>
                  Textes éditables pour la synthèse EXCO (Highlights / Lowlights / Focus).
                </p>
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(busy)}
                    onClick={() => void saveNarrative()}
                  >
                    {t('common.save')} Summary
                  </button>
                )}
              </div>
              <div className="exco-panel-grid">
                <section className="exco-panel exco-panel-accent-teal">
                  <h3>Highlights</h3>
                  <textarea
                    className="exco-narrative-input"
                    rows={22}
                    disabled={!canEdit || Boolean(busy)}
                    value={narrative.highlights || ''}
                    onChange={(e) =>
                      setNarrative((prev) => ({ ...prev, highlights: e.target.value }))
                    }
                    onBlur={(e) =>
                      setNarrative((prev) => ({
                        ...prev,
                        highlights: formatNarrativeForEdit(e.target.value),
                      }))
                    }
                    placeholder={"Point 1\n\nPoint 2\n\nPoint 3…"}
                  />
                </section>
                <section className="exco-panel exco-panel-accent-wine">
                  <h3>Lowlights</h3>
                  <textarea
                    className="exco-narrative-input"
                    rows={22}
                    disabled={!canEdit || Boolean(busy)}
                    value={narrative.lowlights || ''}
                    onChange={(e) =>
                      setNarrative((prev) => ({ ...prev, lowlights: e.target.value }))
                    }
                    onBlur={(e) =>
                      setNarrative((prev) => ({
                        ...prev,
                        lowlights: formatNarrativeForEdit(e.target.value),
                      }))
                    }
                    placeholder={"Point 1\n\nPoint 2\n\nPoint 3…"}
                  />
                </section>
                <section className="exco-panel exco-panel-accent-navy">
                  <h3>Focus</h3>
                  <textarea
                    className="exco-narrative-input"
                    rows={22}
                    disabled={!canEdit || Boolean(busy)}
                    value={narrative.focus || ''}
                    onChange={(e) =>
                      setNarrative((prev) => ({ ...prev, focus: e.target.value }))
                    }
                    onBlur={(e) =>
                      setNarrative((prev) => ({
                        ...prev,
                        focus: formatNarrativeForEdit(e.target.value),
                      }))
                    }
                    placeholder={"Point 1\n\nPoint 2\n\nPoint 3…"}
                  />
                </section>
              </div>
            </div>
          )}

          {(tab === 'csr' || tab === 'recruitment' || tab === 'audit') && (
            <ExcoNarrativePanel tab={tab} year={year} month={month} canEdit={canEdit} />
          )}
        </div>
        </div>

        {inoutDrilldown && (
          <DashboardListModal
            title={inoutDrilldown.title}
            columns={inoutDrilldown.columns}
            rows={inoutDrilldown.rows}
            onClose={() => setInoutDrilldown(null)}
          />
        )}

        {formulaMenu && (
          <RowContextMenu
            x={formulaMenu.x}
            y={formulaMenu.y}
            items={formulaMenuItems}
            onClose={() => setFormulaMenu(null)}
          />
        )}

        {formulaModal && (
          <StaffCostFormulaModal
            state={formulaModal}
            canEdit={canEdit}
            onClose={() => setFormulaModal(null)}
            onSave={(cellKey, note) => {
              setStaffCostFormulaNotes((prev) => ({ ...prev, [cellKey]: note }));
              void (async () => {
                try {
                  const res = await fetch('/api/exco/report', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      year,
                      month,
                      overlays: {
                        staffCostFormulaNotes: {
                          ...staffCostFormulaNotes,
                          [cellKey]: note,
                        },
                      },
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || 'Erreur formule');
                  showSuccess('Formule enregistrée');
                } catch (err) {
                  showError(err instanceof Error ? err.message : 'Erreur formule');
                }
              })();
            }}
          />
        )}
      </div>
    </PermissionGate>
  );
}
