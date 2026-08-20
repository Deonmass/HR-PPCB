'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BtnSpinner,
  IconExport,
  IconInfo,
  IconPolicy,
  IconUndo,
} from '@/components/overtime/TimesheetIcons';
import {
  compilationOtOnlyTotal,
  sumCompilationRow,
  type CompilationData,
  type CompilationRow,
} from '@/lib/timesheet-compilation';
import { parseCompilationExportBuffer } from '@/lib/timesheet-compilation-import';
import {
  applyCompilationPolicy,
  policyChangeKey,
  POLICY_RULES,
  type PolicyChange,
} from '@/lib/timesheet-compilation-policy';
import { downloadTimesheetWorkbook } from '@/lib/timesheet-export';
import { showError, showSuccess } from '@/lib/swal';

const OT_SUBCOLS: { key: 'ot13' | 'ot16' | 'ot2' | 'night'; label: string }[] = [
  { key: 'ot13', label: '1.3' },
  { key: 'ot16', label: '1.6' },
  { key: 'ot2', label: '2' },
  { key: 'night', label: 'N' },
];

const TG_POS = ['tg1', 'tg2', 'tg3', 'tg4', 'tg5'] as const;

function fmtHours(value: number): string {
  if (!value) return '';
  return (Math.round(value * 100) / 100).toFixed(2);
}

interface HoverPop {
  key: string;
  changes: PolicyChange[];
  x: number;
  y: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  canApplyPolicy?: boolean;
  canExport?: boolean;
}

export default function TimesheetCompilationSimulationModal({
  open,
  onClose,
  canApplyPolicy = true,
  canExport = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fileName, setFileName] = useState('');
  const [data, setData] = useState<CompilationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [policyApplied, setPolicyApplied] = useState(false);
  const [subTab, setSubTab] = useState<'sans' | 'avec'>('sans');
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  const [infoOpen, setInfoOpen] = useState(false);
  const [hoverPop, setHoverPop] = useState<HoverPop | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const resetState = () => {
    setFileName('');
    setData(null);
    setPolicyApplied(false);
    setSubTab('sans');
    setReverted(new Set());
    setSearchQuery('');
    setHoverPop(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseCompilationExportBuffer(buffer, {
        fileName: file.name,
        department: 'Simulation',
      });
      setData({
        ...parsed,
        rows: parsed.rows.map((row) => ({
          ...row,
          weeks: row.weeks.map((week) => ({ ...week })),
        })),
        weeks: parsed.weeks.map((week) => ({ ...week })),
      });
      setFileName(file.name);
      setPolicyApplied(false);
      setSubTab('sans');
      setReverted(new Set());
      setSearchQuery('');
      setHoverPop(null);
      setLoading(false);
      void showSuccess(
        `${parsed.rows.length} agent(s) · ${parsed.weeks.length} semaine(s) chargée(s) — simulation hors base`,
      );
    } catch (err) {
      setData(null);
      setLoading(false);
      await showError(err instanceof Error ? err.message : 'Import impossible');
    }
  };

  const rawRows = useMemo<CompilationRow[]>(() => data?.rows ?? [], [data]);
  const policy = useMemo(() => applyCompilationPolicy(rawRows), [rawRows]);

  const weekChangeMap = useMemo(() => {
    const map = new Map<string, PolicyChange[]>();
    for (const change of policy.changes) {
      const key = policyChangeKey(change.matricule, change.weekPos);
      const arr = map.get(key) ?? [];
      arr.push(change);
      map.set(key, arr);
    }
    return map;
  }, [policy]);

  const usePolicyView = policyApplied && subTab === 'avec';

  const baseRows = useMemo<CompilationRow[]>(() => {
    if (!usePolicyView) return rawRows;
    return policy.rows.map((prow, index) => {
      const raw = rawRows[index];
      const weeks = prow.weeks.map((week, weekPos) => {
        const key = policyChangeKey(prow.matricule, weekPos);
        if (weekChangeMap.has(key) && reverted.has(key)) return raw.weeks[weekPos];
        return week;
      });
      return { ...prow, weeks };
    });
  }, [usePolicyView, rawRows, policy, weekChangeMap, reverted]);

  const displayRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return baseRows;
    return baseRows.filter((row) => {
      const haystack =
        `${row.matricule} ${row.nom} ${row.departement} ${row.localisation} ${row.grade}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [baseRows, searchQuery]);

  const weeks = data?.weeks ?? [];
  const hasData = Boolean(data && data.rows.length && weeks.length);

  const grandTotals = useMemo(() => {
    const acc = { ot13: 0, ot16: 0, ot2: 0, night: 0 };
    for (const row of displayRows) {
      const t = sumCompilationRow(row);
      acc.ot13 += t.ot13;
      acc.ot16 += t.ot16;
      acc.ot2 += t.ot2;
      acc.night += t.night;
    }
    return acc;
  }, [displayRows]);

  const nightNormalTotal = useMemo(
    () => displayRows.reduce((sum, row) => sum + row.nightNormal, 0),
    [displayRows],
  );

  const handleApplyPolicy = () => {
    setPolicyApplied(true);
    setSubTab('avec');
    setReverted(new Set());
  };

  const handleUndo = useCallback((key: string) => {
    setReverted((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    setHoverPop(null);
  }, []);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setHoverPop(null), 160);
  };

  const openHoverPop = (event: React.MouseEvent, key: string, changes: PolicyChange[]) => {
    clearHideTimer();
    const rect = event.currentTarget.getBoundingClientRect();
    setHoverPop({ key, changes, x: rect.left, y: rect.bottom + 4 });
  };

  const handleExport = async () => {
    if (!data || exporting) return;
    setExporting(true);
    try {
      const policyChanges = usePolicyView
        ? policy.changes.filter(
            (change) => !reverted.has(policyChangeKey(change.matricule, change.weekPos)),
          )
        : undefined;
      const response = await fetch('/api/timesheet/compilation/simulation-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { ...data, rows: data.rows },
          ...(usePolicyView
            ? { policyRows: baseRows, policyChanges }
            : {}),
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? 'Export impossible');
      }
      const buffer = await response.arrayBuffer();
      downloadTimesheetWorkbook(buffer, 'Compilation-OT-simulation.xlsx');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="modal-overlay open compilation-sim-overlay" onClick={handleClose}>
      <div
        className="modal compilation-sim-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header compilation-sim-header">
          <div>
            <h3>Simulation — Compilation OT</h3>
            <p className="timesheet-manager-modal-subtitle">
              {fileName
                ? `Fichier : ${fileName}`
                : 'Importez un export Compilation pour simuler la politique'}
              {hasData ? ` · ${displayRows.length} agent(s)` : ''}
            </p>
          </div>
          <div className="compilation-sim-header-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm btn-with-icon"
              onClick={() => inputRef.current?.click()}
            >
              {data ? 'Charger un autre fichier' : 'Uploader Excel'}
            </button>
            <button type="button" className="modal-close" onClick={handleClose}>
              ×
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="modal-body compilation-sim-body">
          {!hasData ? (
            <div className="compilation-sim-empty">
              <p className="overtime-compilation-placeholder">
                Uploadez un fichier Excel au format de l&apos;export Compilation
                (feuille <strong>Compilation</strong> : Matricule, semaines 1.3 / 1.6 / 2 / N…).
              </p>
              <button
                type="button"
                className="btn btn-primary btn-with-icon"
                onClick={() => inputRef.current?.click()}
              >
                Sélectionner le fichier
              </button>
              {loading ? (
                <p className="compilation-sim-hint">
                  <span className="compilation-inline-spinner" aria-hidden="true" />
                  Chargement du fichier…
                </p>
              ) : null}
            </div>
          ) : (
            <div className="timesheet-compilation-view compilation-sim-view">
              <div className="panel timesheet-calendar-panel timesheet-calendar-panel-full">
                <div className="timesheet-calendar-header compilation-header">
                  {policyApplied ? (
                    <div className="compilation-subtabs">
                      <button
                        type="button"
                        className={`compilation-subtab${subTab === 'sans' ? ' active' : ''}`}
                        onClick={() => setSubTab('sans')}
                      >
                        Compilation sans politique
                      </button>
                      <button
                        type="button"
                        className={`compilation-subtab${subTab === 'avec' ? ' active' : ''}`}
                        onClick={() => setSubTab('avec')}
                      >
                        Compilation avec politique
                        {subTab === 'avec' ? (
                          <span
                            className="compilation-info-btn"
                            role="button"
                            tabIndex={0}
                            title="Règles de la politique"
                            onClick={(e) => {
                              e.stopPropagation();
                              setInfoOpen(true);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setInfoOpen(true);
                              }
                            }}
                          >
                            <IconInfo size={14} />
                          </span>
                        ) : null}
                      </button>
                    </div>
                  ) : (
                    <h3>
                      Simulation
                      <span className="compilation-sim-badge">Hors base</span>
                    </h3>
                  )}
                  <label className="overtime-inline-field overtime-inline-field-search compilation-sim-search">
                    <span>Recherche</span>
                    <input
                      type="search"
                      className="search-input"
                      placeholder="Matricule, nom…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </label>
                </div>

                <div className="compilation-table-wrap">
                  <table className="compilation-table">
                    <thead>
                      <tr>
                        <th rowSpan={3} className="compilation-freeze compilation-freeze-mat">
                          Matricule
                        </th>
                        <th rowSpan={3} className="compilation-freeze compilation-freeze-name">
                          Employee Name
                        </th>
                        <th rowSpan={3} className="compilation-left">
                          Departement
                        </th>
                        <th rowSpan={3} className="compilation-left">
                          Localisation
                        </th>
                        <th rowSpan={3}>Grade</th>
                        {weeks.map((week) => (
                          <th key={`w-${week.index}`} colSpan={4} className="compilation-group">
                            {week.label}
                          </th>
                        ))}
                        <th rowSpan={2} className="compilation-group">
                          Timesheet
                        </th>
                        <th
                          colSpan={5}
                          rowSpan={2}
                          className="compilation-group compilation-group-total compilation-sticky-right-head"
                        >
                          Total Général
                        </th>
                      </tr>
                      <tr>
                        {weeks.map((week) => (
                          <th key={`r-${week.index}`} colSpan={4} className="compilation-range">
                            {week.range}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {weeks.map((week) =>
                          OT_SUBCOLS.map((col) => (
                            <th
                              key={`h-${week.index}-${col.key}`}
                              className="compilation-num-col"
                            >
                              {col.label}
                            </th>
                          )),
                        )}
                        <th className="compilation-num-col compilation-night-col">N</th>
                        {['1.3', '1.6', '2', 'N', 'Total'].map((label, i) => (
                          <th
                            key={`ht-${TG_POS[i]}`}
                            className={`compilation-num-col compilation-total-col compilation-tg ${TG_POS[i]}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayRows.map((row) => {
                        const totals = sumCompilationRow(row);
                        const totalNight = totals.night + row.nightNormal;
                        const grandTotal = compilationOtOnlyTotal(totals);
                        const tgValues = [
                          totals.ot13,
                          totals.ot16,
                          totals.ot2,
                          totalNight,
                          grandTotal,
                        ];
                        return (
                          <tr key={row.matricule}>
                            <td className="compilation-freeze compilation-freeze-mat">
                              {row.matricule}
                            </td>
                            <td className="compilation-freeze compilation-freeze-name">
                              {row.nom}
                            </td>
                            <td className="compilation-left">{row.departement}</td>
                            <td className="compilation-left">{row.localisation}</td>
                            <td>{row.grade}</td>
                            {row.weeks.map((week, weekPos) => {
                              const wkey = policyChangeKey(row.matricule, weekPos);
                              const changes = weekChangeMap.get(wkey);
                              const modified =
                                usePolicyView && Boolean(changes) && !reverted.has(wkey);
                              return OT_SUBCOLS.map((col) => {
                                const isModCell =
                                  modified && (col.key === 'ot13' || col.key === 'ot16');
                                return (
                                  <td
                                    key={`c-${row.matricule}-${weekPos}-${col.key}`}
                                    className={`compilation-num-col${isModCell ? ' compilation-modified' : ''}`}
                                    onMouseEnter={
                                      isModCell && changes
                                        ? (e) => openHoverPop(e, wkey, changes)
                                        : undefined
                                    }
                                    onMouseLeave={isModCell ? scheduleHide : undefined}
                                  >
                                    {fmtHours(week[col.key])}
                                  </td>
                                );
                              });
                            })}
                            <td className="compilation-num-col compilation-night-col">
                              {fmtHours(row.nightNormal)}
                            </td>
                            {tgValues.map((value, i) => (
                              <td
                                key={`ct-${row.matricule}-${TG_POS[i]}`}
                                className={`compilation-num-col compilation-total-col compilation-tg ${TG_POS[i]}${
                                  i === 4 && value > 100 ? ' compilation-over-100' : ''
                                }`}
                              >
                                {fmtHours(value)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="compilation-total-row">
                        <td className="compilation-freeze compilation-freeze-mat" colSpan={2}>
                          Total général
                        </td>
                        <td className="compilation-left" />
                        <td className="compilation-left" />
                        <td />
                        {weeks.map((week, weekPos) =>
                          OT_SUBCOLS.map((col) => {
                            const total = displayRows.reduce(
                              (sum, row) => sum + (row.weeks[weekPos]?.[col.key] ?? 0),
                              0,
                            );
                            return (
                              <td
                                key={`ft-${week.index}-${col.key}`}
                                className="compilation-num-col"
                              >
                                {fmtHours(total)}
                              </td>
                            );
                          }),
                        )}
                        <td className="compilation-num-col compilation-night-col">
                          {fmtHours(nightNormalTotal)}
                        </td>
                        {[
                          grandTotals.ot13,
                          grandTotals.ot16,
                          grandTotals.ot2,
                          grandTotals.night + nightNormalTotal,
                          compilationOtOnlyTotal(grandTotals),
                        ].map((value, i) => (
                          <td
                            key={`ftg-${TG_POS[i]}`}
                            className={`compilation-num-col compilation-total-col compilation-tg ${TG_POS[i]}`}
                          >
                            {fmtHours(value)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="timesheet-calendar-panel-footer compilation-footer">
                  <div className="compilation-footer-left">
                    {canApplyPolicy && !policyApplied ? (
                      <>
                        <button
                          type="button"
                          className="btn-apply-policy btn-with-icon"
                          onClick={handleApplyPolicy}
                        >
                          <IconPolicy size={14} />
                          Appliquer la politique
                        </button>
                        <button
                          type="button"
                          className="compilation-info-btn compilation-info-btn-standalone"
                          title="Règles de la politique"
                          onClick={() => setInfoOpen(true)}
                        >
                          <IconInfo size={16} />
                        </button>
                      </>
                    ) : null}
                    {policyApplied ? (
                      <span className="compilation-sim-hint">
                        Simulation hors base — la politique ne modifie pas les données réelles
                      </span>
                    ) : (
                      <span className="compilation-sim-hint">
                        Fichier importé en mémoire uniquement
                      </span>
                    )}
                  </div>
                  {canExport ? (
                    <button
                      type="button"
                      className="btn-header-export btn-with-icon"
                      onClick={() => void handleExport()}
                      disabled={exporting}
                    >
                      {exporting ? <BtnSpinner /> : <IconExport size={13} />}
                      Exporter Excel
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {hoverPop
        ? createPortal(
            <div
              className="compilation-cell-pop"
              style={{ left: hoverPop.x, top: hoverPop.y }}
              onMouseEnter={clearHideTimer}
              onMouseLeave={scheduleHide}
            >
              <div className="compilation-cell-pop-title">Modification politique</div>
              <ul className="compilation-cell-pop-list">
                {hoverPop.changes.map((change, idx) => (
                  <li key={`${change.field}-${change.from}-${change.to}-${idx}`}>
                    <strong>
                      {change.field === 'ot13'
                        ? '1.3'
                        : change.field === 'ot16'
                          ? '1.6'
                          : change.field}
                    </strong>
                    {' : '}
                    {fmtHours(change.from) || '0'} → {fmtHours(change.to) || '0'}
                  </li>
                ))}
              </ul>
              <p className="compilation-cell-pop-reason">{hoverPop.changes[0]?.reason}</p>
              <button
                type="button"
                className="compilation-cell-pop-undo btn-with-icon"
                onClick={() => handleUndo(hoverPop.key)}
              >
                <IconUndo size={12} />
                Annuler
              </button>
            </div>,
            document.body,
          )
        : null}

      {infoOpen
        ? createPortal(
            <div className="modal-overlay" onClick={() => setInfoOpen(false)}>
              <div
                className="modal modal-form compilation-policy-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <h3>Politique de la convention collective</h3>
                    <p className="timesheet-manager-modal-subtitle">
                      Règles appliquées lors de la transformation (simulation)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="modal-close"
                    onClick={() => setInfoOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body">
                  <ol className="compilation-policy-rules">
                    {POLICY_RULES.map((rule) => (
                      <li key={rule.id}>
                        <strong>{rule.title}</strong>
                        <p>{rule.description}</p>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setInfoOpen(false)}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>,
    document.body,
  );
}
