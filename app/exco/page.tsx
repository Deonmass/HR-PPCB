'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AuditHrDashboardPanels } from '@/components/audit/AuditHrDashboardPanels';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import type { AuditHrDashboard } from '@/lib/audit-hr-types';
import {
  emptyExcoOverlays,
  type ExcoManualKpis,
  type ExcoMetricValue,
  type ExcoOverlays,
  type ExcoRecruitmentRow,
  type ExcoReportPayload,
  type ExcoTrainingTopic,
} from '@/lib/exco-types';
import { EXCO_SOURCE_FILES, type ExcoSourceFileId } from '@/lib/exco-source-files';
import {
  EXCO_FY_MONTH_LABELS,
  EXCO_FY_START_YEAR,
  TEMPLATE_YTD_JUNE_2026,
  excoFyColToYearMonth,
} from '@/lib/exco-template-baseline';
import { showError, showSuccess } from '@/lib/swal';
import { buildExcoPreviewHtml } from '@/lib/exco-preview-html';

function ExcoBusyOverlay({ label }: { label: string }) {
  return (
    <div className="exco-busy-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="exco-busy-card">
        <span className="btn-spinner exco-busy-spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  );
}

/** Colonnes FY Mar→Mar (template juin) pour l’UI. */
function excoFyColumns(reportYear: number, reportMonth: number) {
  const fyStart = EXCO_FY_START_YEAR;
  const yy = String(fyStart).slice(-2);
  return EXCO_FY_MONTH_LABELS.map((label, i) => {
    const { year, month } = excoFyColToYearMonth(i, fyStart);
    const visible =
      year < reportYear || (year === reportYear && month <= reportMonth);
    return {
      index: i,
      label: i === 0 ? `${label} ${yy}` : label,
      year,
      month,
      visible,
      isCurrent: year === reportYear && month === reportMonth,
    };
  });
}

const OT_MONTH_SEGMENT_COLORS = [
  '#9ca3af',
  '#111827',
  '#7a1f2b',
  '#b45309',
  '#1d4ed8',
  '#047857',
  '#7c3aed',
  '#db2777',
  '#0d9488',
  '#ca8a04',
] as const;

function otMonthSegmentColor(calendarMonth: number): string {
  const idx = ((calendarMonth - 3) % OT_MONTH_SEGMENT_COLORS.length + OT_MONTH_SEGMENT_COLORS.length)
    % OT_MONTH_SEGMENT_COLORS.length;
  return OT_MONTH_SEGMENT_COLORS[idx];
}

function trendMetricHint(
  metric: string,
  year: number,
  month: number,
  reportYear: number,
  reportMonth: number,
): string | undefined {
  if (year !== reportYear || month !== reportMonth) return undefined;
  if (year === EXCO_FY_START_YEAR && month <= 6) {
    return 'Valeur figée du fichier EXCO de juin (template) — non recalculée.';
  }
  const hints: Record<string, string> = {
    staffCost: 'Staff cost saisi pour le mois (KPI manuels / finance).',
    volumePerEmp: 'Volume / emp saisi pour le mois (KPI manuels).',
    revenuePerEmp: 'Revenue / emp saisi pour le mois (KPI manuels).',
    plant: 'Effectif Plant (Zamba) — employés présents fin de mois.',
    hq: 'Effectif HQ and Regions — employés présents fin de mois.',
    lubudi: 'Effectif Lubudi — employés présents fin de mois.',
    graduates: 'Effectif Graduates — employés présents fin de mois.',
    headcount: 'Effectif total présent fin de mois — module Employés.',
    genderMalePct: '% Hommes parmi les présents fin de mois (genre).',
    genderFemalePct: '% Femmes parmi les présents fin de mois (genre).',
    averageAge: 'Âge moyen des présents — date de naissance / âge (Employés).',
    averageAgeMale: 'Âge moyen des hommes présents fin de mois.',
    averageAgeFemale: 'Âge moyen des femmes présentes fin de mois.',
    leavePlantAvgDays: 'Moyenne Closing Balance Annual (Leave Balances) — Plant.',
    leaveHqAvgDays: 'Moyenne Closing Balance Annual (Leave Balances) — HQ/Regions.',
    leaveLubudiAvgDays: 'Moyenne Closing Balance Annual (Leave Balances) — Lubudi.',
    leaveBalanceAvgDays: 'Moyenne Closing Balance Annual — All Company.',
    leaveProvisionUsd000: 'Provision leave (000 USD) — Leave Balances × taux FC/USD.',
    hires: 'IN du mois — date d’engagement dans le mois du rapport.',
    exits: 'OUT du mois — date de sortie dans le mois du rapport.',
    overtimeHours: 'Heures OT du mois — import Component Posted Units (ou timesheet).',
  };
  return hints[metric];
}

function TipTd({
  children,
  tip,
  className,
}: {
  children: ReactNode;
  tip?: string;
  className?: string;
}) {
  if (!tip) {
    return <td className={className}>{children}</td>;
  }
  return (
    <td className={`exco-tip-cell${className ? ` ${className}` : ''}`} title={tip}>
      <span className="exco-tip-cell-val">{children}</span>
    </td>
  );
}

type TabId =
  | 'synthese'
  | 'kpi'
  | 'tendances'
  | 'mouvements'
  | 'ot'
  | 'formation'
  | 'csr'
  | 'recrutement'
  | 'gouvernance';

const TABS: { id: TabId; label: string }[] = [
  { id: 'synthese', label: 'Synthèse' },
  { id: 'kpi', label: 'KPI Summary' },
  { id: 'tendances', label: 'Tendances' },
  { id: 'mouvements', label: 'Mouvements' },
  { id: 'ot', label: 'Heures supp.' },
  { id: 'formation', label: 'Formation' },
  { id: 'csr', label: 'CSR' },
  { id: 'recrutement', label: 'Recrutement' },
  { id: 'gouvernance', label: 'Gouvernance' },
];

const MONTHS = [
  { value: 1, label: 'Janvier' },
  { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' },
  { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' },
  { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Décembre' },
];

const MANUAL_KPI_FIELD_BY_SUMMARY_KEY: Record<string, keyof ExcoManualKpis> = {
  absenteeism: 'absenteeismPct',
  leaveCost: 'leaveCost',
  leaveBalance: 'leaveBalanceAvgDays',
  staffCost: 'staffCost',
  volumePerEmp: 'volumePerEmp',
  onboardingSurvey: 'onboardingSurvey',
  competencyGap: 'competencyGapCoverage',
  revenuePerEmp: 'revenuePerEmp',
  overtimeCost: 'overtimeCost',
  trainingCost: 'trainingCost',
  climateSurvey: 'climateSurvey',
  trainingHours: 'trainingHours',
  succession: 'successionCoverage',
};

/** KPIs issus d’import : ne pas écraser le badge Auto côté UI. */
const IMPORT_KPI_KEYS = new Set(['leaveCost', 'leaveBalance', 'overtimeCost', 'overtimeHours']);

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function toDateInputValue(raw: string | undefined): string {
  const value = (raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const fr = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }
  return '';
}

function formatMeetingDate(raw: string | undefined): string {
  const iso = toDateInputValue(raw);
  if (!iso) return raw?.trim() || '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return raw?.trim() || '—';
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function applyManualKpisToSummary(
  summary: ExcoMetricValue[],
  mk: ExcoManualKpis,
): ExcoMetricValue[] {
  return summary.map((kpi) => {
    if (IMPORT_KPI_KEYS.has(kpi.key) && kpi.source === 'computed') return kpi;
    const field = MANUAL_KPI_FIELD_BY_SUMMARY_KEY[kpi.key];
    if (!field) return kpi;
    const value = mk[field];
    if (value == null || (typeof value === 'number' && !Number.isFinite(value))) {
      return { ...kpi, value: null, source: 'empty' as const };
    }
    return { ...kpi, value, source: 'manual' as const };
  });
}

function formatDelta(
  delta: number | null | undefined,
  trend?: 'up' | 'down' | '',
): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const pct = Math.round(delta * 1000) / 10;
  const arrow =
    pct > 0 || trend === 'up' ? '▲' : pct < 0 || trend === 'down' ? '▼' : '•';
  return `${arrow} ${Math.abs(pct)}% vs prev.`;
}

/** Tendance vs mois précédent (pour couleur rouge/vert). */
function kpiTrend(kpi: ExcoMetricValue): 'up' | 'down' | '' {
  const cur = typeof kpi.value === 'number' ? kpi.value : null;
  const prev = typeof kpi.prevValue === 'number' ? kpi.prevValue : null;
  if (cur != null && prev != null) {
    if (cur > prev) return 'up';
    if (cur < prev) return 'down';
    return '';
  }
  if (kpi.deltaPct == null || !Number.isFinite(kpi.deltaPct) || kpi.deltaPct === 0) return '';
  return kpi.deltaPct > 0 ? 'up' : 'down';
}

function formatMetricValue(kpi: ExcoMetricValue): string {
  if (kpi.value == null || kpi.value === '') return '—';
  if (typeof kpi.value === 'number') {
    const n = kpi.value;
    if (kpi.unit === 'USD') {
      const digits = kpi.key === 'leaveCost' ? 2 : 0;
      return n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
    if (kpi.unit === '%') return `${n}%`;
    if (kpi.unit === 'hrs' || kpi.unit === 'jours' || kpi.unit === 'ans') {
      return `${n.toLocaleString('fr-FR')} ${kpi.unit}`;
    }
    return n.toLocaleString('fr-FR');
  }
  return String(kpi.value);
}

function SourceBadge({ source }: { source: ExcoMetricValue['source'] }) {
  const label =
    source === 'computed' ? 'Auto' : source === 'manual' ? 'Saisi' : 'Manquant';
  return (
    <span className={`exco-source exco-source-${source}`} title={label}>
      {label}
    </span>
  );
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="exco-section-head">
      <h3>{children}</h3>
      {hint && <p>{hint}</p>}
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="exco-empty-hint">{children}</p>;
}

function TextArea({
  label,
  value,
  onChange,
  rows = 5,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="exco-field">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder || 'Saisir le contenu…'}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  unit?: string;
}) {
  return (
    <label className="exco-field">
      <span>
        {label}
        {unit ? ` (${unit})` : ''}
      </span>
      <input
        type="number"
        step="any"
        disabled={disabled}
        placeholder="À renseigner"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (!raw) onChange(null);
          else {
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : null);
          }
        }}
      />
    </label>
  );
}

function LinesEditor({
  label,
  lines,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  lines: string[];
  onChange: (lines: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="exco-field">
      <span>{label}</span>
      <textarea
        rows={6}
        disabled={disabled}
        placeholder={placeholder || 'Une ligne = un élément'}
        value={lines.join('\n')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split('\n')
              .map((l) => l.trimEnd())
              .filter((l, i, arr) => l.length > 0 || i < arr.length - 1),
          )
        }
      />
    </label>
  );
}

export default function ExcoPage() {
  const { can } = usePermissions();
  const canEdit = can('exco.rapport', 'edit');
  const canExport = can('exco.rapport', 'export') || can('exco.rapport', 'view');
  const now = useMemo(() => new Date(), []);
  const [phase, setPhase] = useState<'setup' | 'report'>('setup');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [reportDate, setReportDate] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
  );
  const [fxRate, setFxRate] = useState('');
  const [sourceFiles, setSourceFiles] = useState<Partial<Record<ExcoSourceFileId, File | null>>>(
    {},
  );
  const [tab, setTab] = useState<TabId>('synthese');
  const [report, setReport] = useState<ExcoReportPayload | null>(null);
  const [overlays, setOverlays] = useState<ExcoOverlays>(emptyExcoOverlays());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savedPeriods, setSavedPeriods] = useState<
    Array<{
      year: number;
      month: number;
      updatedAt: string;
      fxRateFcPerUsd: number | null;
      hasOtImport: boolean;
      hasLeaveImport: boolean;
    }>
  >([]);

  const refreshSavedPeriods = useCallback(async () => {
    try {
      const res = await fetch('/api/exco/report?list=1');
      const data = await res.json();
      if (res.ok && Array.isArray(data.periods)) setSavedPeriods(data.periods);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshSavedPeriods();
  }, [refreshSavedPeriods]);

  const load = useCallback(async (y: number, m: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/exco/report?year=${y}&month=${m}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur de chargement');
      const payload = data as ExcoReportPayload;
      setYear(y);
      setMonth(m);
      setReportDate(`${y}-${String(m).padStart(2, '0')}`);
      setReport(payload);
      setOverlays(payload.overlays || emptyExcoOverlays());
      const fx = payload.overlays?.generationMeta?.fxRateFcPerUsd;
      if (fx != null && fx > 0) setFxRate(String(fx));
      setDirty(false);
      setPhase('report');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  const patchOverlays = useCallback((updater: (prev: ExcoOverlays) => ExcoOverlays) => {
    setOverlays((prev) => updater(prev));
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/exco/report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, overlays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur d’enregistrement');
      setReport(data.report as ExcoReportPayload);
      setOverlays((data.report as ExcoReportPayload).overlays);
      setDirty(false);
      showSuccess('Rapport EXCO enregistré');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  }, [canEdit, year, month, overlays]);

  const previewHtml = useMemo(() => {
    if (!report) return '';
    const liveSummary = applyManualKpisToSummary(report.kpiSummary, overlays.manualKpis);
    return buildExcoPreviewHtml({
      ...report,
      kpiSummary: liveSummary,
      overlays,
    });
  }, [report, overlays]);

  const exportPptx = useCallback(async () => {
    if (!canExport) return;
    if (dirty) {
      showError('Enregistrez d’abord les modifications avant d’exporter.');
      return;
    }
    setExporting(true);
    try {
      const res = await fetch(`/api/exco/export?year=${year}&month=${month}&format=pptx`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur d’export PowerPoint');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match?.[1] || `EXCO_HR_REPORT_${year}-${month}.pptx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showSuccess('PowerPoint exporté');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur d’export PowerPoint');
    } finally {
      setExporting(false);
    }
  }, [canExport, dirty, year, month]);

  const generateReport = useCallback(async () => {
    if (!canEdit) return;
    const [yStr, mStr] = reportDate.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      showError('Indiquez la date du rapport (mois)');
      return;
    }
    const rate = Number(String(fxRate).replace(',', '.'));
    if (!(rate > 0)) {
      showError('Indiquez le taux de conversion FC → USD');
      return;
    }
    for (const def of EXCO_SOURCE_FILES) {
      if (def.required && !sourceFiles[def.id]) {
        showError(`Fichier requis : ${def.exampleName}`);
        return;
      }
    }
    const componentFile = sourceFiles.componentPostedUnits;
    const leaveFile = sourceFiles.leaveBalances || null;
    if (!componentFile) {
      showError(`Fichier requis : ${EXCO_SOURCE_FILES[0].exampleName}`);
      return;
    }

    setGenerating(true);
    try {
      const form = new FormData();
      form.append('year', String(y));
      form.append('month', String(m));
      form.append('fxRateFcPerUsd', String(rate));
      form.append('componentFile', componentFile);
      if (leaveFile) form.append('leaveFile', leaveFile);
      const res = await fetch('/api/exco/import-overtime', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Génération impossible');
      setYear(y);
      setMonth(m);
      setReport(data.report as ExcoReportPayload);
      setOverlays((data.report as ExcoReportPayload).overlays);
      setDirty(false);
      setTab('synthese');
      setPhase('report');
      await refreshSavedPeriods();
      showSuccess(
        `Rapport ${MONTHS.find((x) => x.value === m)?.label} ${y} enregistré — vous pourrez le rouvrir depuis Paramètres.`,
      );
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur de génération');
    } finally {
      setGenerating(false);
    }
  }, [canEdit, reportDate, fxRate, sourceFiles, refreshSavedPeriods]);

  const openExisting = useCallback(() => {
    const [yStr, mStr] = reportDate.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
      showError('Indiquez la date du rapport (mois)');
      return;
    }
    void load(y, m);
  }, [reportDate, load]);

  if (phase === 'setup') {
    return (
      <PermissionGate menuId="exco.rapport" action="view">
        <div className="exco-page exco-page-relative">
          {(loading || generating) && (
            <ExcoBusyOverlay
              label={
                generating
                  ? 'Génération du rapport en cours…'
                  : 'Chargement du rapport…'
              }
            />
          )}
          <div className="exco-setup">
            <div className="exco-setup-card panel panel-padded">
              <div className="exco-header-left">
                <h2>Rapport EXCO</h2>
                <p>Paramètres et fichiers sources — générez le rapport avant l’export PPTX</p>
              </div>

              <div className="exco-setup-grid">
                <label className="exco-field">
                  <span>Date du rapport *</span>
                  <input
                    type="month"
                    value={reportDate}
                    disabled={generating || loading}
                    onChange={(e) => setReportDate(e.target.value)}
                  />
                </label>

                <label className="exco-field">
                  <span>Taux de conversion (FC pour 1 USD) *</span>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="ex. 2850"
                    disabled={generating || loading || !canEdit}
                    value={fxRate}
                    onChange={(e) => setFxRate(e.target.value)}
                  />
                </label>
              </div>

              <div className="exco-setup-files">
                <h3>Fichiers à importer</h3>
                <p className="exco-muted">
                  Ajoutez les fichiers listés. D’autres sources pourront être ajoutées ici plus tard.
                </p>
                <ul className="exco-source-list">
                  {EXCO_SOURCE_FILES.map((def) => {
                    const file = sourceFiles[def.id] || null;
                    return (
                      <li key={def.id} className="exco-source-item">
                        <div className="exco-source-meta">
                          <strong>
                            {def.label}
                            {def.required ? ' *' : ''}
                          </strong>
                          <span className="exco-muted">{def.exampleName}</span>
                          {def.description ? (
                            <span className="exco-muted">{def.description}</span>
                          ) : null}
                          {file ? (
                            <span className="exco-source-chosen">Sélectionné : {file.name}</span>
                          ) : null}
                        </div>
                        <label className="btn btn-secondary btn-sm exco-source-pick">
                          Choisir
                          <input
                            type="file"
                            accept={def.accept}
                            disabled={generating || loading || !canEdit}
                            hidden
                            onChange={(e) => {
                              const f = e.target.files?.[0] || null;
                              setSourceFiles((prev) => ({ ...prev, [def.id]: f }));
                            }}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="exco-setup-actions">
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={generating || loading}
                    onClick={() => void generateReport()}
                  >
                    {generating ? <span className="btn-spinner" aria-hidden="true" /> : null}
                    {generating ? 'Génération…' : 'Générer le rapport'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={generating || loading}
                  onClick={openExisting}
                  title="Ouvrir un rapport déjà généré pour cette période"
                >
                  {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
                  {loading ? 'Chargement…' : 'Ouvrir le rapport existant'}
                </button>
              </div>

              {savedPeriods.length > 0 && (
                <div className="exco-saved-periods">
                  <h3>Rapports enregistrés</h3>
                  <p className="exco-muted">Cliquez pour rouvrir un mois déjà généré.</p>
                  <ul>
                    {savedPeriods.map((p) => {
                      const label = `${MONTHS.find((x) => x.value === p.month)?.label || p.month} ${p.year}`;
                      const active =
                        reportDate === `${p.year}-${String(p.month).padStart(2, '0')}`;
                      return (
                        <li key={`${p.year}-${p.month}`}>
                          <button
                            type="button"
                            className={`btn btn-sm${active ? ' btn-primary' : ' btn-secondary'}`}
                            disabled={generating || loading}
                            onClick={() => {
                              setReportDate(
                                `${p.year}-${String(p.month).padStart(2, '0')}`,
                              );
                              if (p.fxRateFcPerUsd != null) {
                                setFxRate(String(p.fxRateFcPerUsd));
                              }
                              void load(p.year, p.month);
                            }}
                          >
                            {label}
                            {p.hasOtImport || p.hasLeaveImport ? ' · import' : ''}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate menuId="exco.rapport" action="view">
      <div className="exco-page exco-page-relative">
        {loading && (
          <ExcoBusyOverlay label="Chargement du rapport…" />
        )}
        <div className="exco-sticky">
          <div className="page-header page-header-with-tabs exco-page-header">
            <div className="exco-header-left">
              <h2>Rapport EXCO</h2>
              <p>
                {MONTHS.find((x) => x.value === month)?.label} {year} — données système
                {overlays.generationMeta?.fxRateFcPerUsd
                  ? ` · taux ${overlays.generationMeta.fxRateFcPerUsd} FC/USD`
                  : fxRate
                    ? ` · taux ${fxRate} FC/USD`
                    : ''}
                {report?.updatedAt
                  ? ` · enregistré ${new Date(report.updatedAt).toLocaleString('fr-FR')}`
                  : ''}
              </p>
            </div>
            <div className="exco-header-actions">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={loading || generating || dirty}
                onClick={() => {
                  setPhase('setup');
                  setReport(null);
                }}
              >
                ← Paramètres
              </button>
              <RefreshButton loading={loading} onClick={() => void load(year, month)} />
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!dirty || saving || loading}
                  onClick={() => void save()}
                >
                  {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
                  {saving ? 'Enregistrement…' : dirty ? 'Enregistrer' : 'À jour'}
                </button>
              )}
              {canExport && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={loading || !report}
                    onClick={() => setPreviewOpen(true)}
                    title="Aperçu des slides avant export"
                  >
                    Aperçu PPTX
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={loading || exporting || dirty || !report}
                    onClick={() => void exportPptx()}
                    title={dirty ? 'Enregistrez avant d’exporter' : 'Exporter le PowerPoint'}
                  >
                    {exporting ? <span className="btn-spinner" aria-hidden="true" /> : null}
                    {exporting ? 'Export…' : 'Exporter PPTX'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="tabs header-tabs header-tabs-compact exco-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`tab-btn tab-btn-sm${tab === t.id ? ' active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {previewOpen && report && (
          <div className="exco-preview-overlay" role="dialog" aria-modal="true" aria-label="Aperçu PowerPoint">
            <div className="exco-preview-modal">
              <div className="exco-preview-modal-head">
                <div>
                  <h3>Aperçu avant export</h3>
                  <p>
                    Synthèse + KPI Summary (cartes style capt.1) — {report.periodLabel}
                  </p>
                </div>
                <div className="exco-preview-modal-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={exporting || dirty}
                    onClick={() => void exportPptx()}
                  >
                    {exporting ? 'Export…' : 'Exporter PPTX'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPreviewOpen(false)}
                  >
                    Fermer
                  </button>
                </div>
              </div>
              <iframe
                className="exco-preview-iframe"
                title="Aperçu EXCO PowerPoint"
                srcDoc={previewHtml}
              />
            </div>
          </div>
        )}

        {dirty && (
          <div className="exco-dirty-banner">
            Modifications non enregistrées — changez de période uniquement après enregistrement.
          </div>
        )}

        {loading && !report ? (
          <div className="panel panel-padded">
            <div className="loading">Chargement du rapport…</div>
          </div>
        ) : report ? (
          <>
            {tab === 'synthese' && (
              <SyntheseTab
                report={report}
                overlays={overlays}
                canEdit={canEdit}
                onChange={patchOverlays}
              />
            )}
            {tab === 'kpi' && (
              <KpiTab
                report={report}
                overlays={overlays}
                canEdit={canEdit}
                onChange={patchOverlays}
              />
            )}
            {tab === 'tendances' && <TendancesTab report={report} />}
            {tab === 'mouvements' && <MouvementsTab report={report} />}
            {tab === 'ot' && (
              <OtTab
                report={report}
                overlays={overlays}
                canEdit={canEdit}
                onChange={patchOverlays}
              />
            )}
            {tab === 'formation' && (
              <FormationTab
                overlays={overlays}
                canEdit={canEdit}
                onChange={patchOverlays}
              />
            )}
            {tab === 'csr' && <CsrTab report={report} />}
            {tab === 'recrutement' && (
              <RecrutementTab
                report={report}
                overlays={overlays}
                canEdit={canEdit}
                onChange={patchOverlays}
              />
            )}
            {tab === 'gouvernance' && (
              <GouvernanceTab
                year={year}
                month={month}
                overlays={overlays}
                canEdit={canEdit}
                onChange={patchOverlays}
              />
            )}
          </>
        ) : (
          <div className="panel panel-padded">Aucune donnée.</div>
        )}
      </div>
    </PermissionGate>
  );
}

function SyntheseTab({
  report,
  overlays,
  canEdit,
  onChange,
}: {
  report: ExcoReportPayload;
  overlays: ExcoOverlays;
  canEdit: boolean;
  onChange: (u: (p: ExcoOverlays) => ExcoOverlays) => void;
}) {
  const n = overlays.narrative;
  return (
    <div className="exco-grid">
      <div className="panel panel-padded exco-cover">
        <SectionTitle hint="Équivalent slide couverture">Couverture réunion</SectionTitle>
        <div className="exco-fields-row">
          <label className="exco-field">
            <span>Titre</span>
            <input
              disabled={!canEdit}
              value={n.meetingTitle || ''}
              onChange={(e) =>
                onChange((p) => ({
                  ...p,
                  narrative: { ...p.narrative, meetingTitle: e.target.value },
                }))
              }
            />
          </label>
          <label className="exco-field">
            <span>Date</span>
            <input
              type="date"
              disabled={!canEdit}
              value={toDateInputValue(n.meetingDate)}
              onChange={(e) =>
                onChange((p) => ({
                  ...p,
                  narrative: { ...p.narrative, meetingDate: e.target.value },
                }))
              }
            />
          </label>
          <label className="exco-field">
            <span>Lieu</span>
            <input
              disabled={!canEdit}
              placeholder="ex. KINSHASA"
              value={n.meetingPlace || ''}
              onChange={(e) =>
                onChange((p) => ({
                  ...p,
                  narrative: { ...p.narrative, meetingPlace: e.target.value },
                }))
              }
            />
          </label>
        </div>
        <p className="exco-cover-preview">
          <strong>{n.meetingTitle || 'EXCO MEETING'}</strong>
          <br />
          held On {formatMeetingDate(n.meetingDate)}, in {n.meetingPlace || '—'}
          <br />
          <span className="exco-muted">Période rapport : {report.periodLabel}</span>
        </p>
      </div>

      <div className="panel panel-padded exco-hl-grid">
        <TextArea
          label="HIGHLIGHT"
          value={n.highlights || ''}
          disabled={!canEdit}
          rows={8}
          placeholder="Points positifs du mois…"
          onChange={(v) =>
            onChange((p) => ({ ...p, narrative: { ...p.narrative, highlights: v } }))
          }
        />
        <TextArea
          label="LOWLIGHT"
          value={n.lowlights || ''}
          disabled={!canEdit}
          rows={8}
          placeholder="Points d’attention / risques…"
          onChange={(v) =>
            onChange((p) => ({ ...p, narrative: { ...p.narrative, lowlights: v } }))
          }
        />
        <TextArea
          label="FOCUS"
          value={n.focus || ''}
          disabled={!canEdit}
          rows={8}
          placeholder="Priorités à suivre…"
          onChange={(v) =>
            onChange((p) => ({ ...p, narrative: { ...p.narrative, focus: v } }))
          }
        />
      </div>

      <div className="panel panel-padded exco-hl-grid">
        <TextArea
          label="Items requiring ExCo approval"
          value={n.approvalItems || ''}
          disabled={!canEdit}
          rows={6}
          onChange={(v) =>
            onChange((p) => ({ ...p, narrative: { ...p.narrative, approvalItems: v } }))
          }
        />
        <TextArea
          label="Medical cases requiring management decision"
          value={n.medicalCases || ''}
          disabled={!canEdit}
          rows={6}
          onChange={(v) =>
            onChange((p) => ({ ...p, narrative: { ...p.narrative, medicalCases: v } }))
          }
        />
      </div>
    </div>
  );
}

function ExcoKpiCard({
  kpi,
  canEdit,
  manualValue,
  onManualChange,
}: {
  kpi: ExcoMetricValue;
  canEdit?: boolean;
  manualValue?: number | null;
  onManualChange?: (v: number | null) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tipSide, setTipSide] = useState<'above' | 'below'>('above');
  const [tipStyle, setTipStyle] = useState<CSSProperties>({});
  const trend = kpiTrend(kpi);
  const delta = formatDelta(kpi.deltaPct, trend);
  const field = MANUAL_KPI_FIELD_BY_SUMMARY_KEY[kpi.key];
  const importLocked = IMPORT_KPI_KEYS.has(kpi.key) && kpi.source === 'computed';
  const editable = Boolean(canEdit && field && onManualChange && !importLocked);

  const placeTip = useCallback(() => {
    const el = cardRef.current;
    if (!el || !kpi.hint || editable) return;
    const rect = el.getBoundingClientRect();
    const tipW = Math.min(280, Math.max(220, window.innerWidth - 24));
    const tipH = 110;
    const gap = 8;
    const pad = 8;

    // Préférer au-dessus de la carte : le portal (z-index élevé) passe au-dessus du header sticky.
    let side: 'above' | 'below' = 'above';
    if (rect.top - tipH - gap < pad) {
      side = 'below';
    }

    let left = rect.left + rect.width / 2 - tipW / 2;
    if (left < pad) left = pad;
    if (left + tipW > window.innerWidth - pad) left = window.innerWidth - pad - tipW;

    const cardMid = rect.left + rect.width / 2;
    const arrowLeft = Math.min(tipW - 14, Math.max(14, cardMid - left));

    setTipSide(side);
    setTipStyle({
      left,
      width: tipW,
      top: side === 'below' ? rect.bottom + gap : rect.top - gap,
      transform: side === 'above' ? 'translateY(-100%)' : undefined,
      ['--exco-tip-arrow' as string]: `${arrowLeft}px`,
    });
    setOpen(true);
  }, [kpi.hint, editable]);

  const hideTip = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => placeTip();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, placeTip]);

  return (
    <div
      ref={cardRef}
      className={`exco-kpi-card${kpi.source === 'empty' ? ' exco-kpi-empty' : ''}${
        editable ? ' exco-kpi-editable' : ''
      }`}
      tabIndex={editable ? undefined : 0}
      onMouseEnter={editable ? undefined : placeTip}
      onMouseLeave={editable ? undefined : hideTip}
      onFocus={editable ? undefined : placeTip}
      onBlur={editable ? undefined : hideTip}
    >
      <div className="exco-kpi-top">
        <span className="exco-kpi-label">{kpi.label}</span>
        <SourceBadge source={kpi.source} />
      </div>
      {editable ? (
        <input
          className="exco-kpi-input"
          type="number"
          step="any"
          inputMode="decimal"
          placeholder="À renseigner"
          aria-label={kpi.label}
          value={manualValue ?? ''}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) onManualChange?.(null);
            else {
              const n = Number(raw);
              onManualChange?.(Number.isFinite(n) ? n : null);
            }
          }}
        />
      ) : (
        <strong className="exco-kpi-value">{formatMetricValue(kpi)}</strong>
      )}
      <div className="exco-kpi-foot">
        {delta ? (
          <span className={`exco-kpi-delta${trend ? ` ${trend}` : ''}`}>
            {delta}
          </span>
        ) : (
          <span className="exco-kpi-delta" />
        )}
        <span className="exco-kpi-prev" title="Mois précédent">
          {formatMetricValue({ ...kpi, value: kpi.prevValue ?? null })}
        </span>
      </div>
      {open && kpi.hint
        ? createPortal(
            <div
              className={`exco-kpi-tip exco-kpi-tip--portal${
                tipSide === 'below' ? ' exco-kpi-tip--below' : ''
              }`}
              style={tipStyle}
              role="tooltip"
            >
              {kpi.hint}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function KpiTab({
  report,
  overlays,
  canEdit,
  onChange,
}: {
  report: ExcoReportPayload;
  overlays: ExcoOverlays;
  canEdit: boolean;
  onChange: (u: (p: ExcoOverlays) => ExcoOverlays) => void;
}) {
  const mk = overlays.manualKpis;
  const liveSummary = useMemo(
    () => applyManualKpisToSummary(report.kpiSummary, mk),
    [report.kpiSummary, mk],
  );
  const setMk = (key: keyof typeof mk, value: number | null) => {
    onChange((p) => ({
      ...p,
      manualKpis: { ...p.manualKpis, [key]: value },
      financeByMonth: {
        ...(p.financeByMonth || {}),
        [String(report.month)]: {
          ...(p.financeByMonth?.[String(report.month)] || {}),
          ...p.manualKpis,
          [key]: value,
        },
      },
    }));
  };

  return (
    <div className="exco-grid">
      <div className="panel panel-padded exco-kpi-panel">
        <SectionTitle hint={`${report.prevPeriodLabel} vs ${report.periodLabel} — saisie directe sur les cartes manquantes`}>
          KPI Summary
        </SectionTitle>
        <div className="exco-kpi-grid">
          {liveSummary.map((kpi) => {
            const field = MANUAL_KPI_FIELD_BY_SUMMARY_KEY[kpi.key];
            return (
              <ExcoKpiCard
                key={kpi.key}
                kpi={kpi}
                canEdit={canEdit}
                manualValue={field ? mk[field] : undefined}
                onManualChange={field ? (v) => setMk(field, v) : undefined}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TendancesTab({ report }: { report: ExcoReportPayload }) {
  const trends = report.computed.trends || [];
  const fyCols = excoFyColumns(report.year, report.month);
  const current = trends.find((t) => t.month === report.month);
  const filled = trends.filter((t) => t.month >= 3 && t.month <= report.month);
  const staffYtd =
    report.month <= 6 && report.year === EXCO_FY_START_YEAR
      ? TEMPLATE_YTD_JUNE_2026.staffCost000 * 1000
      : TEMPLATE_YTD_JUNE_2026.staffCost000 * 1000
        + filled.filter((t) => t.month > 6).reduce((s, t) => s + (t.staffCost || 0), 0);
  const volumeYtd =
    report.month <= 6 && report.year === EXCO_FY_START_YEAR
      ? TEMPLATE_YTD_JUNE_2026.volumePerEmp
      : TEMPLATE_YTD_JUNE_2026.volumePerEmp
        + filled.filter((t) => t.month > 6).reduce((s, t) => s + (t.volumePerEmp || 0), 0);
  const revenueYtd =
    report.month <= 6 && report.year === EXCO_FY_START_YEAR
      ? TEMPLATE_YTD_JUNE_2026.revenuePerEmp
      : TEMPLATE_YTD_JUNE_2026.revenuePerEmp
        + filled.filter((t) => t.month > 6).reduce((s, t) => s + (t.revenuePerEmp || 0), 0);
  const mk = report.overlays.manualKpis;
  const staffBudget = mk.staffCostBudgetYtd ?? null;
  const volumeBudget = mk.volumeBudgetYtd ?? null;
  const revenueBudget = mk.revenueBudgetYtd ?? null;

  const trendAt = (year: number, month: number) => {
    if (year !== report.year) return undefined;
    return trends.find((t) => t.month === month);
  };

  const cell = (value: number | null | undefined, digits = 0, visible = true) => {
    if (!visible) return '';
    if (value == null || !Number.isFinite(value)) return '';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  };

  const pctCell = (value: number | null | undefined, visible = true) => {
    if (!visible) return '';
    if (value == null || !Number.isFinite(value)) return '';
    return `${Math.round(value)}%`;
  };

  return (
    <div className="exco-grid">
      <div className="panel panel-padded">
        <SectionTitle hint={`FY Mar→Mar (template juin) — Mar–Jun figés · mois courant : ${report.periodLabel} · survol d’une cellule du mois pour l’origine`}>
          HR KPI — Trends
        </SectionTitle>

        <h4 className="exco-trend-subtitle">1. Financial KPIs</h4>
        <div className="exco-table-scroll">
          <table className="exco-table exco-trend-table">
            <thead>
              <tr>
                <th>Metric</th>
                {fyCols.map((c) => (
                  <th key={`fin-h-${c.index}`} className={c.isCurrent ? 'exco-month-current' : undefined}>
                    {c.label}
                  </th>
                ))}
                <th>YTD</th>
                <th>BUDGET</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Staff Cost (000 USD)</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`sc-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('staffCost', c.year, c.month, report.year, report.month)}
                    >
                      {cell(t?.staffCost != null ? t.staffCost / 1000 : null, 2, c.visible)}
                    </TipTd>
                  );
                })}
                <td>{staffYtd ? cell(staffYtd / 1000, 2) : '—'}</td>
                <td>{staffBudget != null ? cell(staffBudget / 1000, 2) : '—'}</td>
                <td>
                  {staffBudget && staffYtd
                    ? `${Math.round((staffYtd / staffBudget) * 100)}%`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Ton per Employee</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`vol-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('volumePerEmp', c.year, c.month, report.year, report.month)}
                    >
                      {cell(t?.volumePerEmp, 2, c.visible)}
                    </TipTd>
                  );
                })}
                <td>{volumeYtd ? cell(volumeYtd, 2) : '—'}</td>
                <td>{volumeBudget != null ? cell(volumeBudget, 2) : '—'}</td>
                <td>
                  {volumeBudget && volumeYtd
                    ? `${Math.round((volumeYtd / volumeBudget) * 100)}%`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Revenue per Employee</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`rev-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('revenuePerEmp', c.year, c.month, report.year, report.month)}
                    >
                      {cell(t?.revenuePerEmp, 2, c.visible)}
                    </TipTd>
                  );
                })}
                <td>{revenueYtd ? cell(revenueYtd, 2) : '—'}</td>
                <td>{revenueBudget != null ? cell(revenueBudget, 2) : '—'}</td>
                <td>
                  {revenueBudget && revenueYtd
                    ? `${Math.round((revenueYtd / revenueBudget) * 100)}%`
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <EmptyHint>
          Mar–Jun : valeurs du fichier EXCO de juin (figées). Mois sélectionné et suivants : saisie / calcul système.
        </EmptyHint>

        <h4 className="exco-trend-subtitle">2. Headcount</h4>
        <div className="exco-table-scroll">
          <table className="exco-table exco-trend-table">
            <thead>
              <tr>
                <th>Sites</th>
                {fyCols.map((c) => (
                  <th key={`hc-h-${c.index}`} className={c.isCurrent ? 'exco-month-current' : undefined}>
                    {c.label}
                  </th>
                ))}
                <th>
                  {report.prevPeriodLabel} → {report.periodLabel}
                </th>
                <th>YTD</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Plant', 'plant'],
                  ['HQ and Regions', 'hq'],
                  ['Lubudi', 'lubudi'],
                  ['Graduates', 'graduates'],
                  ['Total', 'headcount'],
                ] as const
              ).map(([label, key]) => {
                const prev = trends.find((t) => t.month === report.month - 1);
                const delta =
                  current && prev
                    ? current[key] - prev[key]
                    : current
                      ? current[key]
                      : null;
                return (
                  <tr key={label}>
                    <td>{label}</td>
                    {fyCols.map((c) => {
                      const t = trendAt(c.year, c.month);
                      return (
                        <TipTd
                          key={`${key}-${c.index}`}
                          className={c.isCurrent ? 'exco-month-current' : undefined}
                          tip={trendMetricHint(key, c.year, c.month, report.year, report.month)}
                        >
                          {c.visible && t ? t[key] : ''}
                        </TipTd>
                      );
                    })}
                    <td>
                      {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta}`}
                    </td>
                    <td>On track</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <h4 className="exco-trend-subtitle">3. Gender RATIO</h4>
        <div className="exco-table-scroll">
          <table className="exco-table exco-trend-table">
            <thead>
              <tr>
                <th>Gender</th>
                {fyCols.map((c) => (
                  <th key={`g-h-${c.index}`}>{c.label}</th>
                ))}
                <th>{report.periodLabel} — Sites</th>
                <th>{report.periodLabel} — HO</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Male</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`gm-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('genderMalePct', c.year, c.month, report.year, report.month)}
                    >
                      {pctCell(t?.genderMalePct, c.visible)}
                    </TipTd>
                  );
                })}
                <td>{pctCell(current?.genderMalePct)}</td>
                <td>—</td>
              </tr>
              <tr>
                <td>Female</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`gf-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('genderFemalePct', c.year, c.month, report.year, report.month)}
                    >
                      {pctCell(t?.genderFemalePct, c.visible)}
                    </TipTd>
                  );
                })}
                <td>{pctCell(current?.genderFemalePct)}</td>
                <td>—</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="exco-trend-subtitle">4. AGE</h4>
        <div className="exco-table-scroll">
          <table className="exco-table exco-trend-table">
            <thead>
              <tr>
                <th>Metric</th>
                {fyCols.map((c) => (
                  <th key={`a-h-${c.index}`}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Average Age</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`aa-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('averageAge', c.year, c.month, report.year, report.month)}
                    >
                      {cell(t?.averageAge, 1, c.visible)}
                    </TipTd>
                  );
                })}
              </tr>
              <tr>
                <td>Male Average Age</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`aam-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('averageAgeMale', c.year, c.month, report.year, report.month)}
                    >
                      {cell(t?.averageAgeMale, 1, c.visible)}
                    </TipTd>
                  );
                })}
              </tr>
              <tr>
                <td>Female Average Age</td>
                {fyCols.map((c) => {
                  const t = trendAt(c.year, c.month);
                  return (
                    <TipTd
                      key={`aaf-${c.index}`}
                      className={c.isCurrent ? 'exco-month-current' : undefined}
                      tip={trendMetricHint('averageAgeFemale', c.year, c.month, report.year, report.month)}
                    >
                      {cell(t?.averageAgeFemale, 1, c.visible)}
                    </TipTd>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MouvementsTab({ report }: { report: ExcoReportPayload }) {
  const c = report.computed;
  const fyCols = useMemo(
    () => excoFyColumns(report.year, report.month),
    [report.year, report.month],
  );

  const leaveRows = useMemo(() => {
    const keys = [
      { key: 'leavePlantAvgDays' as const, label: 'Plant (Average Days)' },
      { key: 'leaveHqAvgDays' as const, label: 'HQ and Region (Average Days)' },
      { key: 'leaveLubudiAvgDays' as const, label: 'Lubudi (Average Days)' },
      { key: 'leaveBalanceAvgDays' as const, label: 'All Company (Average Days)' },
    ];
    return keys.map((row) => ({
      label: row.label,
      values: fyCols.map((col) => {
        if (!col.visible || col.year !== report.year) return null;
        const t = c.trends.find((x) => x.month === col.month);
        const v = t?.[row.key];
        return typeof v === 'number' ? v : null;
      }),
    }));
  }, [c.trends, fyCols, report.year]);

  const leaveCosts = useMemo(
    () =>
      fyCols.map((col) => {
        if (!col.visible || col.year !== report.year) return null;
        const t = c.trends.find((x) => x.month === col.month);
        return t?.leaveProvisionUsd000 ?? null;
      }),
    [c.trends, fyCols, report.year],
  );

  const hasLeave = leaveRows.some((r) => r.values.some((v) => v != null));

  return (
    <div className="exco-grid">
      <div className="panel panel-padded">
        <SectionTitle>Staff movement — {report.periodLabel}</SectionTitle>
        <div className="exco-kpi-grid exco-kpi-grid-sm">
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">IN (Hires)</span>
            <strong className="exco-kpi-value">{c.hires}</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">OUT (Exits)</span>
            <strong className="exco-kpi-value">{c.exits}</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Turnover</span>
            <strong className="exco-kpi-value">{c.turnoverPct ?? '—'}%</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Attrition</span>
            <strong className="exco-kpi-value">{c.attritionPct ?? '—'}%</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Promotions mois</span>
            <strong className="exco-kpi-value">{c.promotionsThisMonth}</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Promotions YTD (FY)</span>
            <strong className="exco-kpi-value">{c.promotionsYtd}</strong>
          </div>
        </div>
      </div>

      <div className="panel panel-padded">
        <SectionTitle>Départs par raison</SectionTitle>
        {c.exitsByReason.length === 0 ? (
          <EmptyHint>Aucun départ ce mois.</EmptyHint>
        ) : (
          <table className="exco-table">
            <thead>
              <tr>
                <th>Raison</th>
                <th>Nombre</th>
                <th>Taux (÷ effectif)</th>
                <th>Évolution</th>
              </tr>
            </thead>
            <tbody>
              {c.exitsByReason.map((row) => {
                const hc = c.headcount > 0 ? c.headcount : 0;
                const pct = hc > 0 ? Math.round((row.value / hc) * 1000) / 10 : 0;
                const prev =
                  (c.prevExitsByReason || []).find(
                    (p) => p.label.toLowerCase() === row.label.toLowerCase(),
                  )?.value ?? 0;
                const prevHc = c.prevHeadcount != null && c.prevHeadcount > 0 ? c.prevHeadcount : 0;
                const rate = hc > 0 ? row.value / hc : null;
                const prevRate = prevHc > 0 ? prev / prevHc : null;
                let evo = '—';
                if (rate != null && prevRate != null && prevRate !== 0) {
                  const d = Math.round(((rate - prevRate) / Math.abs(prevRate)) * 1000) / 10;
                  evo = `${d > 0 ? '▲' : d < 0 ? '▼' : '•'} ${Math.abs(d)}%`;
                }
                return (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>
                      {row.value}/{hc || '—'}
                    </td>
                    <td>{pct}%</td>
                    <td>{evo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel panel-padded">
        <SectionTitle>
          Length of service (avg {c.averageSeniorityYears ?? '—'} years)
        </SectionTitle>
        <table className="exco-table">
          <thead>
            <tr>
              <th>Bande</th>
              <th>Effectif</th>
            </tr>
          </thead>
          <tbody>
            {c.seniorityBands.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel panel-padded">
        <SectionTitle hint="Leave Type = Annual · Closing Balance · survol du mois courant pour l’origine">
          6. Leaves
        </SectionTitle>
        {!hasLeave ? (
          <EmptyHint>
            Importez Leave Balances via « Générer le rapport » (écran Paramètres).
          </EmptyHint>
        ) : (
          <>
            <div className="exco-table-scroll">
              <table className="exco-table exco-trend-table">
                <thead>
                  <tr>
                    <th>Balance</th>
                    {fyCols.map((c) => (
                      <th key={c.index} className={c.isCurrent ? 'exco-month-current' : undefined}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leaveRows.map((row) => {
                    const metricKey =
                      row.label.startsWith('Plant')
                        ? 'leavePlantAvgDays'
                        : row.label.startsWith('HQ')
                          ? 'leaveHqAvgDays'
                          : row.label.startsWith('Lubudi')
                            ? 'leaveLubudiAvgDays'
                            : 'leaveBalanceAvgDays';
                    return (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        {row.values.map((v, i) => {
                          const col = fyCols[i];
                          return (
                            <TipTd
                              key={`${row.label}-${i}`}
                              className={col?.isCurrent ? 'exco-month-current' : undefined}
                              tip={
                                col
                                  ? trendMetricHint(
                                      metricKey,
                                      col.year,
                                      col.month,
                                      report.year,
                                      report.month,
                                    )
                                  : undefined
                              }
                            >
                              {v == null ? '' : Math.round(v)}
                            </TipTd>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h4 className="exco-trend-subtitle">COSTS (000 USD)</h4>
            <div className="exco-table-scroll">
              <table className="exco-table exco-trend-table">
                <thead>
                  <tr>
                    <th>Provision</th>
                    {fyCols.map((c) => (
                      <th key={`c-${c.index}`}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Provision (Leave not taken)</td>
                    {leaveCosts.map((v, i) => {
                      const col = fyCols[i];
                      return (
                        <TipTd
                          key={`prov-${i}`}
                          className={col?.isCurrent ? 'exco-month-current' : undefined}
                          tip={
                            col
                              ? trendMetricHint(
                                  'leaveProvisionUsd000',
                                  col.year,
                                  col.month,
                                  report.year,
                                  report.month,
                                )
                              : undefined
                          }
                        >
                          {v == null
                            ? ''
                            : v.toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                        </TipTd>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OtTab({
  report,
  overlays,
}: {
  report: ExcoReportPayload;
  overlays: ExcoOverlays;
  canEdit: boolean;
  onChange: (u: (p: ExcoOverlays) => ExcoOverlays) => void;
}) {
  const c = report.computed;
  const fyCols = excoFyColumns(report.year, report.month);
  const importSnap = overlays.overtimeImportsByMonth?.[String(report.month)];
  const fx = importSnap?.fxRateFcPerUsd ?? null;

  const deptRows = useMemo(() => {
    return (c.overtimeByDept || []).map((row) => {
      const hoursByMonth = row.hoursByMonth || Array(12).fill(null);
      const ytd = hoursByMonth.reduce<number>((s, h, i) => {
        const month = i + 1;
        if (month < 3 || month > report.month) return s;
        return s + (h || 0);
      }, 0);
      return {
        department: row.department,
        hoursByMonth,
        ytd: Math.round(ytd * 100) / 100,
      };
    });
  }, [c.overtimeByDept, report.month]);

  const fyHours = (hoursByMonth: Array<number | null>, col: (typeof fyCols)[number]) => {
    if (!col.visible || col.year !== report.year) return null;
    return hoursByMonth[col.month - 1] ?? null;
  };

  const totalByFyCol = useMemo(() => {
    return fyCols.map((col) => {
      if (!col.visible || col.year !== report.year) return null;
      const sum = deptRows.reduce((s, r) => s + (r.hoursByMonth[col.month - 1] || 0), 0);
      return Math.round(sum * 100) / 100;
    });
  }, [deptRows, fyCols, report.year]);

  const ytdTotal = deptRows.reduce((s, r) => s + r.ytd, 0);

  const leaveTop = useMemo(() => {
    return [...c.overtimeTopEmployees]
      .filter((e) => e.leaveBalance != null)
      .sort((a, b) => (b.leaveBalance || 0) - (a.leaveBalance || 0))
      .slice(0, 25);
  }, [c.overtimeTopEmployees]);

  const deptCross = useMemo(() => {
    const leaveMap = new Map<string, { leaveSum: number; leaveN: number }>();
    for (const e of c.overtimeTopEmployees) {
      const prev = leaveMap.get(e.department) || { leaveSum: 0, leaveN: 0 };
      if (e.leaveBalance != null) {
        prev.leaveSum += e.leaveBalance;
        prev.leaveN += 1;
      }
      leaveMap.set(e.department, prev);
    }
    return (c.overtimeByDept || []).map((row) => {
      const leave = leaveMap.get(row.department);
      return {
        department: row.department,
        hours: row.hours,
        costUsd: row.cost,
        leaveAvg: leave?.leaveN
          ? Math.round((leave.leaveSum / leave.leaveN) * 100) / 100
          : null,
      };
    });
  }, [c.overtimeByDept, c.overtimeTopEmployees]);

  const maxBar = Math.max(...deptRows.map((d) => d.ytd), 1);

  return (
    <div className="exco-grid">
      <div className="panel panel-padded">
        <SectionTitle hint="Capt.1 — FY Mar→Mar · départements = paramètres système · Mar–Jun figés · mois sélectionné mis à jour">
          OVERTIME — Hours
        </SectionTitle>
        {!deptRows.length ? (
          <EmptyHint>
            Aucune donnée OT — générez le rapport avec Component Posted Units.
          </EmptyHint>
        ) : (
          <>
            <div className="exco-table-scroll">
              <table className="exco-table exco-trend-table">
                <thead>
                  <tr>
                    <th>OVERTIME - HOURS</th>
                    {fyCols.map((col) => (
                      <th key={col.index} className={col.isCurrent ? 'exco-month-current' : undefined}>
                        {col.label}
                      </th>
                    ))}
                    <th>YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {deptRows.map((row) => (
                    <tr key={row.department}>
                      <td>{row.department}</td>
                      {fyCols.map((col) => {
                        const h = fyHours(row.hoursByMonth, col);
                        return (
                          <td
                            key={`${row.department}-${col.index}`}
                            className={col.isCurrent ? 'exco-month-current' : undefined}
                          >
                            {h == null
                              ? ''
                              : h.toLocaleString('en-US', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                          </td>
                        );
                      })}
                      <td>{row.ytd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                  <tr className="exco-total-row">
                    <td>Total</td>
                    {totalByFyCol.map((h, i) => (
                      <td key={`tot-${i}`}>
                        {h == null
                          ? ''
                          : h.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                      </td>
                    ))}
                    <td>{ytdTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h4 className="exco-trend-subtitle">Overtime — hours per Department YTD — %</h4>
            <div className="exco-ot-chart">
              {deptRows.map((row) => {
                const pct = ytdTotal > 0 ? Math.round((row.ytd / ytdTotal) * 100) : 0;
                const segments = row.hoursByMonth
                  .map((h, i) => ({ h: h || 0, month: i + 1 }))
                  .filter((s) => s.month >= 3 && s.month <= report.month && s.h > 0);
                return (
                  <div key={`bar-${row.department}`} className="exco-ot-chart-col">
                    <span className="exco-ot-chart-pct">{pct}%</span>
                    <div className="exco-ot-chart-bar-wrap">
                      <div
                        className="exco-ot-chart-stack"
                        style={{ height: `${Math.max(2, (row.ytd / maxBar) * 100)}%` }}
                        title={`${row.department}: ${row.ytd}h (${pct}%)`}
                      >
                        {segments.map((s) => (
                          <div
                            key={`${row.department}-seg-${s.month}`}
                            className="exco-ot-chart-seg"
                            style={{
                              flex: s.h,
                              background: otMonthSegmentColor(s.month),
                            }}
                            title={`${EXCO_FY_MONTH_LABELS[s.month - 3] || s.month}: ${s.h}h`}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="exco-ot-chart-label">{row.department}</span>
                  </div>
                );
              })}
            </div>
            <div className="exco-ot-legend" aria-label="Légende des mois">
              {fyCols
                .filter((c) => c.visible && c.year === report.year && c.month >= 3)
                .map((c) => (
                  <span key={`leg-${c.index}`} className="exco-ot-legend-item">
                    <i style={{ background: otMonthSegmentColor(c.month) }} />
                    {c.label}
                  </span>
                ))}
            </div>
          </>
        )}
      </div>

      <div className="exco-ot-capt2">
        <div className="panel panel-padded exco-ot-capt2-side">
          <SectionTitle hint="Tri Hours · top 10 en rouge">Overtime — Top Employees</SectionTitle>
          {!c.overtimeTopEmployees.length ? (
            <EmptyHint>Pas de détail OT.</EmptyHint>
          ) : (
            <div className="exco-table-scroll exco-ot-table-scroll">
              <table className="exco-table exco-ot-compact-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Names</th>
                    <th>Hrs</th>
                    <th>Cost</th>
                    <th>Leave</th>
                    <th>DPT</th>
                  </tr>
                </thead>
                <tbody>
                  {c.overtimeTopEmployees.slice(0, 25).map((row, i) => (
                    <tr key={row.matricule} className={i < 10 ? 'exco-ot-top10' : undefined}>
                      <td>{i + 1}</td>
                      <td title={row.nom}>{row.nom}</td>
                      <td>
                        {row.hours.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td>
                        {row.costUsd != null
                          ? row.costUsd.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              maximumFractionDigits: 0,
                            })
                          : row.costFc != null
                            ? `${Math.round(row.costFc).toLocaleString('fr-FR')} FC`
                            : '—'}
                      </td>
                      <td>
                        {overlays.leaveBalanceByMatricule[row.matricule] ?? row.leaveBalance ?? '—'}
                      </td>
                      <td>{row.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel panel-padded exco-ot-capt2-mid">
          <SectionTitle hint="Synthèse mois + croisement dept">
            Overview — {report.periodLabel}
          </SectionTitle>
          <ul className="exco-ot-overview">
            <li>Total workforce : <strong>{c.headcount}</strong> employees</li>
            <li>
              Employees with recorded hours : <strong>{c.employeesWithOt}</strong>
              {c.headcount ? ` (${Math.round((c.employeesWithOt / c.headcount) * 100)}%)` : ''}
            </li>
            <li>
              Total Overtime :{' '}
              <strong>{c.overtimeHoursTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong> hours
            </li>
            <li>
              Average hours :{' '}
              <strong>
                {c.employeesWithOt
                  ? (c.overtimeHoursTotal / c.employeesWithOt).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  : '—'}
              </strong>
            </li>
            <li>
              Total cost :{' '}
              <strong>
                {overlays.manualKpis.overtimeCost != null
                  ? overlays.manualKpis.overtimeCost.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    })
                  : '—'}
              </strong>
              {fx != null ? ` (taux ${fx.toLocaleString('fr-FR')} FC/USD)` : ''}
            </li>
            <li>
              Average remaining leave (OT) :{' '}
              <strong>
                {(() => {
                  const withLeave = c.overtimeTopEmployees.filter((e) => e.leaveBalance != null);
                  if (!withLeave.length) return '—';
                  const avg =
                    withLeave.reduce((s, e) => s + (e.leaveBalance || 0), 0) / withLeave.length;
                  return avg.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                })()}
              </strong>{' '}
              days
            </li>
          </ul>

          <h4 className="exco-trend-subtitle">Overtime vs Leave Balance per DEPT</h4>
          <div className="exco-table-scroll exco-ot-table-scroll">
            <table className="exco-table exco-ot-compact-table">
              <thead>
                <tr>
                  <th>DPT</th>
                  <th>Hrs</th>
                  <th>Cost</th>
                  <th>Leave</th>
                </tr>
              </thead>
              <tbody>
                {deptCross.map((row) => (
                  <tr key={`x-${row.department}`}>
                    <td>{row.department}</td>
                    <td>{row.hours.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>
                      {row.costUsd != null
                        ? row.costUsd.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 0,
                          })
                        : '—'}
                    </td>
                    <td>{row.leaveAvg ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel panel-padded exco-ot-capt2-side">
          <SectionTitle hint="Tri Leave · top 10 en rouge · coût au taux du jour">
            Leave Balance — Top Employees
          </SectionTitle>
          {!leaveTop.length ? (
            <EmptyHint>Ajoutez Leave Balances dans les paramètres puis régénérez le rapport.</EmptyHint>
          ) : (
            <div className="exco-table-scroll exco-ot-table-scroll">
              <table className="exco-table exco-ot-compact-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Names</th>
                    <th>Hrs</th>
                    <th>Cost</th>
                    <th>Leave</th>
                    <th>DPT</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTop.map((row, i) => (
                    <tr key={`lv-${row.matricule}`} className={i < 10 ? 'exco-ot-top10' : undefined}>
                      <td>{i + 1}</td>
                      <td title={row.nom}>{row.nom}</td>
                      <td>{row.hours.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                      <td>
                        {row.costUsd != null
                          ? row.costUsd.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              maximumFractionDigits: 0,
                            })
                          : '—'}
                      </td>
                      <td>{row.leaveBalance}</td>
                      <td>{row.department}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FormationTab({
  overlays,
  canEdit,
  onChange,
}: {
  overlays: ExcoOverlays;
  canEdit: boolean;
  onChange: (u: (p: ExcoOverlays) => ExcoOverlays) => void;
}) {
  const mk = overlays.manualKpis;
  const topics = overlays.trainingTopics;
  const upcoming = overlays.upcomingTrainings;

  const updateTopic = (listKey: 'trainingTopics' | 'upcomingTrainings', id: string, title: string) => {
    onChange((p) => ({
      ...p,
      [listKey]: p[listKey].map((t) => (t.id === id ? { ...t, title } : t)),
    }));
  };

  const addTopic = (listKey: 'trainingTopics' | 'upcomingTrainings') => {
    const row: ExcoTrainingTopic = { id: uid('tr'), title: '' };
    onChange((p) => ({ ...p, [listKey]: [...p[listKey], row] }));
  };

  const removeTopic = (listKey: 'trainingTopics' | 'upcomingTrainings', id: string) => {
    onChange((p) => ({ ...p, [listKey]: p[listKey].filter((t) => t.id !== id) }));
  };

  return (
    <div className="exco-grid">
      <div className="panel panel-padded">
        <SectionTitle>Training Dashboard</SectionTitle>
        <div className="exco-manual-grid">
          <NumberField
            label="Training hours YTD"
            unit="hrs"
            value={mk.trainingHours}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({ ...p, manualKpis: { ...p.manualKpis, trainingHours: v } }))
            }
          />
          <NumberField
            label="Training budget"
            unit="USD"
            value={mk.trainingBudget}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({ ...p, manualKpis: { ...p.manualKpis, trainingBudget: v } }))
            }
          />
          <NumberField
            label="Actual training cost"
            unit="USD"
            value={mk.trainingCost}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({ ...p, manualKpis: { ...p.manualKpis, trainingCost: v } }))
            }
          />
          <NumberField
            label="% Plant"
            unit="%"
            value={mk.trainingPlantPct}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({ ...p, manualKpis: { ...p.manualKpis, trainingPlantPct: v } }))
            }
          />
          <NumberField
            label="% HQ"
            unit="%"
            value={mk.trainingHqPct}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({ ...p, manualKpis: { ...p.manualKpis, trainingHqPct: v } }))
            }
          />
          <NumberField
            label="Soft skills %"
            unit="%"
            value={mk.softSkillsHoursPct}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({ ...p, manualKpis: { ...p.manualKpis, softSkillsHoursPct: v } }))
            }
          />
          <NumberField
            label="Technical skills %"
            unit="%"
            value={mk.technicalSkillsHoursPct}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({
                ...p,
                manualKpis: { ...p.manualKpis, technicalSkillsHoursPct: v },
              }))
            }
          />
          <NumberField
            label="Safety topics %"
            unit="%"
            value={mk.safetyTopicsHoursPct}
            disabled={!canEdit}
            onChange={(v) =>
              onChange((p) => ({
                ...p,
                manualKpis: { ...p.manualKpis, safetyTopicsHoursPct: v },
              }))
            }
          />
        </div>
      </div>

      <div className="panel panel-padded">
        <SectionTitle>List of training covered</SectionTitle>
        {topics.length === 0 && <EmptyHint>Aucune formation listée — ajoutez des lignes.</EmptyHint>}
        <div className="exco-list-editor">
          {topics.map((t, i) => (
            <div key={t.id} className="exco-list-row">
              <span>{i + 1}.</span>
              <input
                disabled={!canEdit}
                value={t.title}
                placeholder="Titre de la formation"
                onChange={(e) => updateTopic('trainingTopics', t.id, e.target.value)}
              />
              {canEdit && (
                <button type="button" className="btn btn-ghost" onClick={() => removeTopic('trainingTopics', t.id)}>
                  ×
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <button type="button" className="btn btn-secondary" onClick={() => addTopic('trainingTopics')}>
              + Ajouter une formation
            </button>
          )}
        </div>
      </div>

      <div className="panel panel-padded">
        <SectionTitle>Upcoming training sessions</SectionTitle>
        <div className="exco-list-editor">
          {upcoming.map((t) => (
            <div key={t.id} className="exco-list-row">
              <input
                disabled={!canEdit}
                value={t.title}
                placeholder="Session à venir"
                onChange={(e) => updateTopic('upcomingTrainings', t.id, e.target.value)}
              />
              {canEdit && (
                <button type="button" className="btn btn-ghost" onClick={() => removeTopic('upcomingTrainings', t.id)}>
                  ×
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <button type="button" className="btn btn-secondary" onClick={() => addTopic('upcomingTrainings')}>
              + Ajouter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CsrTab({ report }: { report: ExcoReportPayload }) {
  const summary = report.computed.csrSummary;

  return (
    <div className="exco-grid">
      <div className="panel panel-padded">
        <SectionTitle hint="Synthèse depuis le menu Projet (CSR + Cahier des charges)">
          CSR — FY
        </SectionTitle>
        <div className="exco-kpi-grid exco-kpi-grid-sm">
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Projets</span>
            <strong className="exco-kpi-value">{summary.total}</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">En cours</span>
            <strong className="exco-kpi-value">{summary.enCours}</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Terminés</span>
            <strong className="exco-kpi-value">{summary.termines}</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Non débutés</span>
            <strong className="exco-kpi-value">{summary.nonDebutes}</strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Budget prévu</span>
            <strong className="exco-kpi-value">
              {summary.budgetPrevu.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0,
              })}
            </strong>
          </div>
          <div className="exco-kpi-card">
            <span className="exco-kpi-label">Budget dépensé</span>
            <strong className="exco-kpi-value">
              {summary.budgetDepense.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                maximumFractionDigits: 0,
              })}
            </strong>
          </div>
        </div>
      </div>

      <div className="panel panel-padded">
        <SectionTitle>Répartition par type</SectionTitle>
        {summary.byType.length === 0 ? (
          <EmptyHint>Aucun projet.</EmptyHint>
        ) : (
          <table className="exco-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Nombre</th>
              </tr>
            </thead>
            <tbody>
              {summary.byType.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel panel-padded">
        <SectionTitle>Répartition par secteur</SectionTitle>
        {summary.bySecteur.length === 0 ? (
          <EmptyHint>Aucun secteur.</EmptyHint>
        ) : (
          <table className="exco-table">
            <thead>
              <tr>
                <th>Secteur</th>
                <th>CSR</th>
                <th>Cahier des charges</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.bySecteur.map((row) => (
                <tr key={row.label}>
                  <td>{row.label}</td>
                  <td>{row.csr}</td>
                  <td>{row.cahier}</td>
                  <td>{row.total}</td>
                </tr>
              ))}
              <tr className="exco-total-row">
                <td>Total</td>
                <td>{summary.bySecteur.reduce((s, r) => s + r.csr, 0)}</td>
                <td>{summary.bySecteur.reduce((s, r) => s + r.cahier, 0)}</td>
                <td>{summary.bySecteur.reduce((s, r) => s + r.total, 0)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RecrutementTab({
  report,
  overlays,
  canEdit,
  onChange,
}: {
  report: ExcoReportPayload;
  overlays: ExcoOverlays;
  canEdit: boolean;
  onChange: (u: (p: ExcoOverlays) => ExcoOverlays) => void;
}) {
  const rows = overlays.recruitment;
  const vacants = report.computed.vacantPostes;

  const update = (id: string, patch: Partial<ExcoRecruitmentRow>) => {
    onChange((p) => ({
      ...p,
      recruitment: p.recruitment.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const addRow = (category: 'replacement' | 'new') => {
    onChange((p) => ({
      ...p,
      recruitment: [
        ...p.recruitment,
        {
          id: uid('rec'),
          category,
          position: '',
          grade: '',
          status: '',
          comments: '',
          budgeted: '',
          department: '',
          location: '',
          contractType: '',
        },
      ],
    }));
  };

  const importVacants = () => {
    if (!vacants.length) {
      showError('Aucun poste vacant dans le module Postes');
      return;
    }
    onChange((p) => ({
      ...p,
      recruitment: [
        ...p.recruitment,
        ...vacants.map((v) => ({
          id: uid('rec'),
          category: 'new' as const,
          position: v.title,
          grade: v.grade,
          status: 'Ongoing',
          comments: v.notes || '',
          budgeted: '',
          department: v.department,
          location: v.location,
          contractType: '',
        })),
      ],
    }));
  };

  const renderTable = (category: 'replacement' | 'new', title: string) => {
    const subset = rows.filter((r) => r.category === category);
    return (
      <div className="panel panel-padded">
        <SectionTitle>{title}</SectionTitle>
        {subset.length === 0 ? (
          <EmptyHint>Aucune ligne — ajoutez ou importez depuis Postes vacants.</EmptyHint>
        ) : (
          <div className="exco-table-scroll">
            <table className="exco-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Grade</th>
                  <th>Status</th>
                  <th>Comments</th>
                  <th>Budgeted</th>
                  <th>Department</th>
                  <th>Location</th>
                  <th>Contract</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {subset.map((r) => (
                  <tr key={r.id}>
                    {(
                      [
                        'position',
                        'grade',
                        'status',
                        'comments',
                        'budgeted',
                        'department',
                        'location',
                        'contractType',
                      ] as const
                    ).map((field) => (
                      <td key={field}>
                        <input
                          className="exco-inline-input"
                          disabled={!canEdit}
                          value={r[field]}
                          onChange={(e) => update(r.id, { [field]: e.target.value })}
                        />
                      </td>
                    ))}
                    {canEdit && (
                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() =>
                            onChange((p) => ({
                              ...p,
                              recruitment: p.recruitment.filter((x) => x.id !== r.id),
                            }))
                          }
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && (
          <button type="button" className="btn btn-secondary" onClick={() => addRow(category)}>
            + Ajouter
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="exco-grid">
      {canEdit && (
        <div className="panel panel-padded exco-import-bar">
          <p>
            Postes vacants disponibles dans l’app : <strong>{vacants.length}</strong>
          </p>
          <button type="button" className="btn btn-secondary" onClick={importVacants}>
            Importer les postes vacants
          </button>
        </div>
      )}
      {renderTable('replacement', '1. Replacements')}
      {renderTable('new', '2. New positions')}
    </div>
  );
}

function GouvernanceTab({
  year,
  month,
  overlays,
  canEdit,
  onChange,
}: {
  year: number;
  month: number;
  overlays: ExcoOverlays;
  canEdit: boolean;
  onChange: (u: (p: ExcoOverlays) => ExcoOverlays) => void;
}) {
  const asOf = useMemo(() => {
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }, [year, month]);

  const [dashboard, setDashboard] = useState<AuditHrDashboard | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setDashboard(null);
    setLoadingAudit(true);
    (async () => {
      try {
        const res = await fetch(`/api/audit-hr?asOf=${encodeURIComponent(asOf)}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur');
        if (!cancelled) setDashboard(json.dashboard || null);
      } catch (err) {
        if (!cancelled) {
          setDashboard(null);
          showError(err instanceof Error ? err.message : 'Erreur Audit points');
        }
      } finally {
        if (!cancelled) setLoadingAudit(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asOf]);

  return (
    <div className="exco-grid">
      <div className="panel panel-padded">
        <SectionTitle hint="Cap 4 — même dashboard que le menu Audit points">
          Internal Audit — Findings
        </SectionTitle>
        <p className="exco-audit-link">
          <a href="/audit">Ouvrir Audit points →</a>
        </p>
        {loadingAudit ? (
          <div className="loading exco-audit-loading">Chargement du dashboard Audit…</div>
        ) : dashboard ? (
          <AuditHrDashboardPanels dashboard={dashboard} compact />
        ) : (
          <EmptyHint>Aucun finding — ajoutez les actions dans Audit points.</EmptyHint>
        )}
      </div>

      <div className="panel panel-padded">
        <SectionTitle>Policies</SectionTitle>
        <div className="exco-policy-grid">
          <LinesEditor
            label={`Expired policies pending update (${overlays.policies.expiredPendingUpdate.filter(Boolean).length})`}
            lines={overlays.policies.expiredPendingUpdate}
            disabled={!canEdit}
            onChange={(lines) =>
              onChange((p) => ({
                ...p,
                policies: { ...p.policies, expiredPendingUpdate: lines },
              }))
            }
          />
          <LinesEditor
            label={`Submitted to EXCO (${overlays.policies.submittedToExco.filter(Boolean).length})`}
            lines={overlays.policies.submittedToExco}
            disabled={!canEdit}
            onChange={(lines) =>
              onChange((p) => ({
                ...p,
                policies: { ...p.policies, submittedToExco: lines },
              }))
            }
          />
          <LinesEditor
            label={`Pending publication (${overlays.policies.pendingPublication.filter(Boolean).length})`}
            lines={overlays.policies.pendingPublication}
            disabled={!canEdit}
            onChange={(lines) =>
              onChange((p) => ({
                ...p,
                policies: { ...p.policies, pendingPublication: lines },
              }))
            }
          />
          <LinesEditor
            label={`Under communication (${overlays.policies.underCommunication.filter(Boolean).length})`}
            lines={overlays.policies.underCommunication}
            disabled={!canEdit}
            onChange={(lines) =>
              onChange((p) => ({
                ...p,
                policies: { ...p.policies, underCommunication: lines },
              }))
            }
          />
        </div>
      </div>
    </div>
  );
}
