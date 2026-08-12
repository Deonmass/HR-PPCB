'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import ChartEnlargeModal, { ChartEnlargeButton } from '@/components/ChartEnlargeModal';
import { DependantsBarChartBody, type BarChartItem } from '@/components/dependants/DependantsBarChart';
import { EMPTY_LOCALISATION_VALUE } from '@/components/dependants/DependantsListTab';
import type { Dependant } from '@/lib/dependants-types';
import {
  countsAsEmployeeKpi,
  countsAsSpouseKpi,
  isChildStatut,
} from '@/lib/dependants-utils';
import { showError, showSuccess } from '@/lib/swal';
import XLSX from 'xlsx-js-style';

type TabId = 'graphique' | 'simulation';
type StatutFilter = 'enfant' | 'conjoint' | 'employe';

interface AgeSimRow {
  id: string;
  min: string;
  max: string;
}

interface Props {
  items: BarChartItem[];
  /** Bénéficiaires pour la simulation (idéalement non filtrés). */
  dependants: Dependant[];
  localisationOptions?: string[];
  hasEmptyLocalisation?: boolean;
  onItemClick?: (label: string) => void;
}

const DEFAULT_ROWS: Omit<AgeSimRow, 'id'>[] = [
  { min: '0', max: '2' },
  { min: '3', max: '12' },
  { min: '13', max: '15' },
  { min: '16', max: '19' },
  { min: '20', max: '25' },
  { min: '26', max: '' },
];

const STATUT_FILTERS: { id: StatutFilter; label: string }[] = [
  { id: 'enfant', label: 'Enfant' },
  { id: 'conjoint', label: 'Conjoint' },
  { id: 'employe', label: 'Employé' },
];

function newRowId(): string {
  return `age-sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createDefaultRows(): AgeSimRow[] {
  return DEFAULT_ROWS.map((row) => ({ ...row, id: newRowId() }));
}

function parseAgeBound(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function matchesStatutFilter(item: Dependant, filter: StatutFilter): boolean {
  if (filter === 'enfant') return isChildStatut(item.statut);
  if (filter === 'conjoint') return countsAsSpouseKpi(item.statut);
  return countsAsEmployeeKpi(item.statut);
}

function matchesLocalisation(item: Dependant, localisation: string): boolean {
  if (!localisation) return true;
  if (localisation === EMPTY_LOCALISATION_VALUE) return !item.localisation.trim();
  return item.localisation === localisation;
}

function countByGenderInRange(
  dependants: Dependant[],
  minRaw: string,
  maxRaw: string,
  statutFilter: StatutFilter,
  localisation: string,
  options?: { includeUnknownAge?: boolean },
): { fille: number; garcon: number; autres: number; total: number } {
  const min = parseAgeBound(minRaw);
  const max = parseAgeBound(maxRaw);
  const includeUnknownAge = Boolean(options?.includeUnknownAge);
  let fille = 0;
  let garcon = 0;
  let autres = 0;

  for (const item of dependants) {
    if (!matchesStatutFilter(item, statutFilter)) continue;
    if (!matchesLocalisation(item, localisation)) continue;

    const age = item.age;
    if (age == null || age < 0) {
      if (!includeUnknownAge) continue;
    } else {
      if (min != null && age < min) continue;
      if (max != null && age > max) continue;
    }

    const sexe = item.sexe.trim().toUpperCase();
    if (sexe === 'F') fille += 1;
    else if (sexe === 'M') garcon += 1;
    else autres += 1;
  }

  return { fille, garcon, autres, total: fille + garcon + autres };
}

function countPopulationByGender(
  dependants: Dependant[],
  statutFilter: StatutFilter,
  localisation: string,
): { fille: number; garcon: number; autres: number; total: number } {
  let fille = 0;
  let garcon = 0;
  let autres = 0;

  for (const item of dependants) {
    if (!matchesStatutFilter(item, statutFilter)) continue;
    if (!matchesLocalisation(item, localisation)) continue;

    const sexe = item.sexe.trim().toUpperCase();
    if (sexe === 'F') fille += 1;
    else if (sexe === 'M') garcon += 1;
    else autres += 1;
  }

  return { fille, garcon, autres, total: fille + garcon + autres };
}

function genderLabels(filter: StatutFilter): { female: string; male: string } {
  if (filter === 'enfant') return { female: 'Fille', male: 'Garçon' };
  return { female: 'Femme', male: 'Homme' };
}

type SimExportRow = {
  min: string;
  max: string;
  fille: number;
  garcon: number;
  autres: number;
  total: number;
  includeUnknownAge?: boolean;
};

type CellValue =
  | string
  | number
  | { v?: string | number; f?: string; t?: string; s?: object };

const EXPORT_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const EXPORT_HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { fgColor: { rgb: 'C41230' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: EXPORT_BORDER,
};

const EXPORT_CELL_STYLE = {
  alignment: { horizontal: 'center', vertical: 'center' },
  border: EXPORT_BORDER,
};

const EXPORT_META_LABEL_STYLE = {
  font: { bold: true },
  alignment: { horizontal: 'left', vertical: 'center' },
};

function styledExportCell(value: string | number, style?: object): CellValue {
  return {
    v: value,
    t: typeof value === 'number' ? 'n' : 's',
    s: style ?? EXPORT_CELL_STYLE,
  };
}

function formulaExportCell(formula: string, style?: object): CellValue {
  return { f: formula, t: 'n', s: style ?? EXPORT_CELL_STYLE };
}

function applySheetStyles(ws: XLSX.WorkSheet): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr] as { s?: object } | undefined;
      if (!cell) continue;
      if (!cell.s) cell.s = EXPORT_CELL_STYLE;
    }
  }
}

function ageCriteriaFormulas(
  excelRow: number,
  baseLastRow: number,
  includeUnknownAge: boolean,
): { withSexe: (sexe: string) => string; all: string } {
  const ageRange = `Base!$G$2:$G$${baseLastRow}`;
  const sexeRange = `Base!$E$2:$E$${baseLastRow}`;
  const minRef = `$A${excelRow}`;
  const maxRef = `$B${excelRow}`;
  const maxEmpty = `OR($B${excelRow}="",$B${excelRow}="et +")`;

  const boundedAll = `COUNTIFS(${ageRange},">="&${minRef},${ageRange},"<="&${maxRef})`;
  const openAll = `COUNTIFS(${ageRange},">="&${minRef})`;
  const blankAgeAll = `COUNTIFS(${ageRange},"")`;

  const boundedSexe = (sexe: string) =>
    `COUNTIFS(${sexeRange},"${sexe}",${ageRange},">="&${minRef},${ageRange},"<="&${maxRef})`;
  const openSexe = (sexe: string) =>
    `COUNTIFS(${sexeRange},"${sexe}",${ageRange},">="&${minRef})`;
  const blankSexe = (sexe: string) =>
    `COUNTIFS(${sexeRange},"${sexe}",${ageRange},"")`;

  if (includeUnknownAge) {
    return {
      all: `IF(${maxEmpty},${openAll}+${blankAgeAll},${boundedAll})`,
      withSexe: (sexe) => `IF(${maxEmpty},${openSexe(sexe)}+${blankSexe(sexe)},${boundedSexe(sexe)})`,
    };
  }

  return {
    all: `IF(${maxEmpty},${openAll},${boundedAll})`,
    withSexe: (sexe) => `IF(${maxEmpty},${openSexe(sexe)},${boundedSexe(sexe)})`,
  };
}

function buildBaseSheetRows(items: Dependant[]): CellValue[][] {
  const header: CellValue[] = [
    styledExportCell('Matricule', EXPORT_HEADER_STYLE),
    styledExportCell('Nom employé', EXPORT_HEADER_STYLE),
    styledExportCell('Nom', EXPORT_HEADER_STYLE),
    styledExportCell('Statut', EXPORT_HEADER_STYLE),
    styledExportCell('Sexe', EXPORT_HEADER_STYLE),
    styledExportCell('Localisation', EXPORT_HEADER_STYLE),
    styledExportCell('Âge', EXPORT_HEADER_STYLE),
    styledExportCell('Date de naissance', EXPORT_HEADER_STYLE),
    styledExportCell('Pactilis', EXPORT_HEADER_STYLE),
    styledExportCell('Commentaires', EXPORT_HEADER_STYLE),
  ];

  const data = items.map((item) => [
    styledExportCell(item.matricule || ''),
    styledExportCell(item.employeNom || ''),
    styledExportCell(item.nom || ''),
    styledExportCell(item.statut || ''),
    styledExportCell(item.sexe.trim().toUpperCase()),
    styledExportCell(item.localisation || ''),
    item.age == null || item.age < 0
      ? styledExportCell('')
      : styledExportCell(item.age),
    styledExportCell(item.dateNaissance || ''),
    styledExportCell(item.pactilis || ''),
    styledExportCell(item.commentaires || ''),
  ]);

  return [header, ...data];
}

function exportSimulationExcel(
  rows: SimExportRow[],
  labels: { female: string; male: string },
  statutLabel: string,
  localisationLabel: string,
  baseItems: Dependant[],
): void {
  const wb = XLSX.utils.book_new();

  const sortedBase = [...baseItems].sort((a, b) => {
    const byEmp = (a.employeNom || '').localeCompare(b.employeNom || '', 'fr');
    if (byEmp !== 0) return byEmp;
    return (a.nom || '').localeCompare(b.nom || '', 'fr');
  });

  // --- Feuille Base (données filtrées) ---
  const baseAoa = buildBaseSheetRows(sortedBase);
  const baseWs = XLSX.utils.aoa_to_sheet(baseAoa);
  baseWs['!cols'] = [
    { wch: 12 },
    { wch: 28 },
    { wch: 28 },
    { wch: 14 },
    { wch: 8 },
    { wch: 14 },
    { wch: 8 },
    { wch: 16 },
    { wch: 14 },
    { wch: 24 },
  ];
  applySheetStyles(baseWs);
  XLSX.utils.book_append_sheet(wb, baseWs, 'Base');

  const baseLastRow = Math.max(2, sortedBase.length + 1);

  // --- Feuille Simulation (formules → Base) ---
  const simAoa: CellValue[][] = [
    [
      styledExportCell('Statut', EXPORT_META_LABEL_STYLE),
      styledExportCell(statutLabel, EXPORT_CELL_STYLE),
    ],
    [
      styledExportCell('Localisation', EXPORT_META_LABEL_STYLE),
      styledExportCell(localisationLabel, EXPORT_CELL_STYLE),
    ],
    [
      styledExportCell('Min', EXPORT_HEADER_STYLE),
      styledExportCell('Max', EXPORT_HEADER_STYLE),
      styledExportCell(labels.female, EXPORT_HEADER_STYLE),
      styledExportCell(labels.male, EXPORT_HEADER_STYLE),
      styledExportCell('Autres', EXPORT_HEADER_STYLE),
      styledExportCell('Total', EXPORT_HEADER_STYLE),
    ],
  ];

  rows.forEach((row, index) => {
    const excelRow = 4 + index; // 1-based
    const minValue = row.min.trim() === '' ? 0 : Number(row.min);
    const maxValue = row.max.trim() === '' ? 'et +' : Number(row.max);
    const crit = ageCriteriaFormulas(
      excelRow,
      baseLastRow,
      Boolean(row.includeUnknownAge),
    );

    simAoa.push([
      styledExportCell(minValue),
      styledExportCell(maxValue),
      formulaExportCell(crit.withSexe('F')),
      formulaExportCell(crit.withSexe('M')),
      formulaExportCell(`MAX(0,${crit.all}-C${excelRow}-D${excelRow})`),
      formulaExportCell(`C${excelRow}+D${excelRow}+E${excelRow}`),
    ]);
  });

  const lastDataRow = 3 + rows.length;
  const totalExcelRow = lastDataRow + 1;

  simAoa.push([
    styledExportCell('', EXPORT_HEADER_STYLE),
    styledExportCell('Total', EXPORT_HEADER_STYLE),
    formulaExportCell(
      `COUNTIF(Base!$E$2:$E$${baseLastRow},"F")`,
      EXPORT_HEADER_STYLE,
    ),
    formulaExportCell(
      `COUNTIF(Base!$E$2:$E$${baseLastRow},"M")`,
      EXPORT_HEADER_STYLE,
    ),
    formulaExportCell(
      `MAX(0,COUNTA(Base!$C$2:$C$${baseLastRow})-C${totalExcelRow}-D${totalExcelRow})`,
      EXPORT_HEADER_STYLE,
    ),
    formulaExportCell(
      `COUNTA(Base!$C$2:$C$${baseLastRow})`,
      EXPORT_HEADER_STYLE,
    ),
  ]);

  const simWs = XLSX.utils.aoa_to_sheet(simAoa);
  simWs['!cols'] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
  ];
  applySheetStyles(simWs);
  XLSX.utils.book_append_sheet(wb, simWs, 'Simulation');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `simulation-tranche-age-${stamp}.xlsx`);
}

function ExportIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

/** Barre divergente centrée : fille ← centre → garçon. */
function ComparativeBars({
  fille,
  garcon,
  autres = 0,
  scaleMax,
  femaleLabel,
  maleLabel,
  showBar = true,
}: {
  fille: number;
  garcon: number;
  autres?: number;
  scaleMax: number;
  femaleLabel: string;
  maleLabel: string;
  showBar?: boolean;
}) {
  const denom = Math.max(scaleMax, 1);
  const fillePct = Math.min(100, Math.round((fille / denom) * 100));
  const garconPct = Math.min(100, Math.round((garcon / denom) * 100));

  return (
    <div
      className={`dependants-age-sim-stack${showBar ? '' : ' is-total-only'}`}
      role="img"
      aria-label={`${femaleLabel} ${fille}, ${maleLabel} ${garcon}${autres ? `, autres ${autres}` : ''}`}
      title={`${femaleLabel}: ${fille} · ${maleLabel}: ${garcon}${autres ? ` · Autres: ${autres}` : ''}`}
    >
      {showBar ? (
        <div className="dependants-age-sim-diverge">
          <div className="dependants-age-sim-diverge-side is-fille">
            <span className="dependants-age-sim-diverge-label is-fille">{fille}</span>
            <div className="dependants-age-sim-diverge-track is-fille">
              <div
                className="dependants-age-sim-diverge-fill is-fille"
                style={{ width: `${fillePct}%` }}
              />
            </div>
          </div>
          <div className="dependants-age-sim-diverge-axis" aria-hidden />
          <div className="dependants-age-sim-diverge-side is-garcon">
            <div className="dependants-age-sim-diverge-track is-garcon">
              <div
                className="dependants-age-sim-diverge-fill is-garcon"
                style={{ width: `${garconPct}%` }}
              />
            </div>
            <span className="dependants-age-sim-diverge-label is-garcon">{garcon}</span>
          </div>
        </div>
      ) : (
        <div className="dependants-age-sim-stack-labels-only is-footer-split">
          <span className="dependants-age-sim-stack-chip is-fille">
            <i className="dependants-age-sim-stack-swatch is-fille" aria-hidden />
            {femaleLabel} {fille}
          </span>
          {autres > 0 ? (
            <span className="dependants-age-sim-stack-chip is-autres">Autres {autres}</span>
          ) : null}
          <span className="dependants-age-sim-stack-chip is-garcon">
            <i className="dependants-age-sim-stack-swatch is-garcon" aria-hidden />
            {maleLabel} {garcon}
          </span>
        </div>
      )}
    </div>
  );
}

export default function DependantsAgeTrancheChart({
  items,
  dependants,
  localisationOptions = [],
  hasEmptyLocalisation = false,
  onItemClick,
}: Props) {
  const tabsId = useId();
  const [enlarged, setEnlarged] = useState(false);
  const [tab, setTab] = useState<TabId>('graphique');
  const [rows, setRows] = useState<AgeSimRow[]>(createDefaultRows);
  const [statutFilter, setStatutFilter] = useState<StatutFilter>('enfant');
  const [localisation, setLocalisation] = useState('');
  const [exporting, setExporting] = useState(false);

  const siteOptions = useMemo(() => {
    if (localisationOptions.length > 0) return localisationOptions;
    return [...new Set(dependants.map((item) => item.localisation).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }, [localisationOptions, dependants]);

  const open = () => {
    setTab('graphique');
    setEnlarged(true);
  };
  const close = () => setEnlarged(false);

  const labels = genderLabels(statutFilter);
  const statutLabel = STATUT_FILTERS.find((item) => item.id === statutFilter)?.label ?? 'Enfant';
  const localisationLabel = !localisation
    ? 'Toutes'
    : localisation === EMPTY_LOCALISATION_VALUE
      ? 'Non renseigné'
      : localisation;

  const computedRows = useMemo(() => {
    // Âges non renseignés → dernière tranche « et + » (max vide), comme filet de sécurité.
    let catchAllAssigned = false;
    const catchAllId = [...rows].reverse().find((row) => !row.max.trim())?.id ?? null;

    return rows.map((row) => {
      const includeUnknownAge = Boolean(catchAllId && row.id === catchAllId && !catchAllAssigned);
      if (includeUnknownAge) catchAllAssigned = true;
      const counts = countByGenderInRange(
        dependants,
        row.min,
        row.max,
        statutFilter,
        localisation,
        { includeUnknownAge },
      );
      return { ...row, ...counts, includeUnknownAge };
    });
  }, [rows, dependants, statutFilter, localisation]);

  const filteredBaseItems = useMemo(
    () => dependants.filter(
      (item) => matchesStatutFilter(item, statutFilter) && matchesLocalisation(item, localisation),
    ),
    [dependants, statutFilter, localisation],
  );

  const scaleMax = useMemo(
    () => Math.max(1, ...computedRows.flatMap((row) => [row.fille, row.garcon])),
    [computedRows],
  );

  /** Total aligné sur le KPI dashboard (tous les bénéficiaires du filtre, sans exclure âge/sexe). */
  const totals = useMemo(
    () => countPopulationByGender(dependants, statutFilter, localisation),
    [dependants, statutFilter, localisation],
  );

  const updateBound = useCallback((id: string, field: 'min' | 'max', value: string) => {
    const cleaned = value.replace(/[^\d]/g, '');
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: cleaned } : row)));
  }, []);

  const addRow = () => {
    setRows((prev) => [...prev, { id: newRowId(), min: '', max: '' }]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)));
  };

  const handleExport = async () => {
    if (computedRows.length === 0) {
      await showError('Aucune ligne à exporter');
      return;
    }
    setExporting(true);
    try {
      exportSimulationExcel(
        computedRows,
        labels,
        statutLabel,
        localisationLabel,
        filteredBaseItems,
      );
      await showSuccess('Simulation exportée');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  };

  const chartBody = (
    <DependantsBarChartBody
      items={items}
      onItemClick={onItemClick}
    />
  );

  return (
    <>
      <div className="panel travel-history-chart-panel employees-bar-panel">
        <div className="panel-head travel-history-chart-head">
          <h3>Par tranche d&apos;âge</h3>
          <div className="chart-panel-head-actions">
            <ChartEnlargeButton onClick={open} />
          </div>
        </div>
        {chartBody}
      </div>

      {enlarged ? (
        <ChartEnlargeModal
          title="Par tranche d'âge"
          onClose={close}
          className="dependants-age-enlarge-modal"
          headerActions={(
            <>
              <div className="dependants-age-enlarge-tabs" role="tablist" aria-label="Vue">
                <button
                  type="button"
                  role="tab"
                  id={`${tabsId}-graphique`}
                  aria-selected={tab === 'graphique'}
                  aria-controls={`${tabsId}-panel-graphique`}
                  className={`dependants-age-enlarge-tab${tab === 'graphique' ? ' active' : ''}`}
                  onClick={() => setTab('graphique')}
                >
                  Graphique
                </button>
                <button
                  type="button"
                  role="tab"
                  id={`${tabsId}-simulation`}
                  aria-selected={tab === 'simulation'}
                  aria-controls={`${tabsId}-panel-simulation`}
                  className={`dependants-age-enlarge-tab${tab === 'simulation' ? ' active' : ''}`}
                  onClick={() => setTab('simulation')}
                >
                  Simulation
                </button>
              </div>
              <button
                type="button"
                className="chart-enlarge-btn dependants-age-export-btn"
                onClick={() => void handleExport()}
                disabled={exporting}
                title="Exporter la simulation en Excel"
                aria-label="Exporter la simulation en Excel"
              >
                {exporting ? (
                  <span className="btn-spinner" aria-hidden />
                ) : (
                  <ExportIcon />
                )}
              </button>
            </>
          )}
        >
          {tab === 'graphique' ? (
            <div
              role="tabpanel"
              id={`${tabsId}-panel-graphique`}
              aria-labelledby={`${tabsId}-graphique`}
              className="panel travel-history-chart-panel employees-bar-panel is-enlarged dependants-age-enlarge-chart"
            >
              {chartBody}
            </div>
          ) : (
            <div
              role="tabpanel"
              id={`${tabsId}-panel-simulation`}
              aria-labelledby={`${tabsId}-simulation`}
              className="dependants-age-sim"
            >
              <div className="dependants-age-sim-toolbar">
                <div className="dependants-age-sim-toolbar-left">
                  <div className="dependants-age-sim-filters-row">
                    <div className="dependants-age-sim-filters" role="group" aria-label="Filtrer par statut">
                      {STATUT_FILTERS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`dependants-age-sim-filter${statutFilter === item.id ? ' active' : ''}`}
                          aria-pressed={statutFilter === item.id}
                          onClick={() => setStatutFilter(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <label className="dependants-age-sim-localisation">
                      <span>Localisation</span>
                      <select
                        className="filter-select"
                        value={localisation}
                        onChange={(event) => setLocalisation(event.target.value)}
                      >
                        <option value="">Toutes les localisations</option>
                        {hasEmptyLocalisation ? (
                          <option value={EMPTY_LOCALISATION_VALUE}>Non renseigné</option>
                        ) : null}
                        {siteOptions.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="dependants-age-sim-table-wrap">
                <table className="dependants-age-sim-table">
                  <colgroup>
                    <col className="dependants-age-sim-col-min" />
                    <col className="dependants-age-sim-col-max" />
                    <col className="dependants-age-sim-col-actions" />
                    <col className="dependants-age-sim-col-effectifs" />
                    <col className="dependants-age-sim-col-total" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th colSpan={3} className="dependants-age-sim-group-head is-bounds">
                        Tranche d&apos;âge
                      </th>
                      <th className="dependants-age-sim-group-head is-counts">
                        Effectifs — {labels.female} / {labels.male}
                      </th>
                      <th className="dependants-age-sim-group-head is-total">Total</th>
                    </tr>
                    <tr>
                      <th>Min</th>
                      <th>Max</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                      <th>Comparatif</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computedRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="dependants-age-sim-input"
                            value={row.min}
                            onChange={(e) => updateBound(row.id, 'min', e.target.value)}
                            aria-label="Âge minimum"
                            placeholder="0"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="dependants-age-sim-input"
                            value={row.max}
                            onChange={(e) => updateBound(row.id, 'max', e.target.value)}
                            aria-label="Âge maximum"
                            placeholder="et +"
                          />
                        </td>
                        <td className="dependants-age-sim-actions-cell">
                          <button
                            type="button"
                            className="action-btn action-delete"
                            onClick={() => removeRow(row.id)}
                            disabled={rows.length <= 1}
                            title="Supprimer la ligne"
                            aria-label="Supprimer la ligne"
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </td>
                        <td className="dependants-age-sim-effectifs-cell">
                          <ComparativeBars
                            fille={row.fille}
                            garcon={row.garcon}
                            autres={row.autres}
                            scaleMax={scaleMax}
                            femaleLabel={labels.female}
                            maleLabel={labels.male}
                          />
                        </td>
                        <td className="dependants-age-sim-total-cell">{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="dependants-age-sim-total-label">
                        <span className="dependants-age-sim-total-mark">Total</span>
                      </td>
                      <td className="dependants-age-sim-effectifs-cell">
                        <ComparativeBars
                          fille={totals.fille}
                          garcon={totals.garcon}
                          autres={totals.autres}
                          scaleMax={Math.max(totals.total, 1)}
                          femaleLabel={labels.female}
                          maleLabel={labels.male}
                          showBar={false}
                        />
                      </td>
                      <td className="dependants-age-sim-total-cell is-footer">{totals.total}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="dependants-age-sim-footer-actions">
                <button type="button" className="btn btn-accent btn-sm" onClick={addRow}>
                  + Ajouter une ligne
                </button>
              </div>
            </div>
          )}
        </ChartEnlargeModal>
      ) : null}
    </>
  );
}
