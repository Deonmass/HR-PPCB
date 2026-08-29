'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import {
  DOCUMENT_FIELDS,
  calcCellAggregateStats,
  calcRowCellStats,
  normalizeDocStatus,
} from '@/lib/documents';
import { formatRate } from '@/lib/format-rate';
import { buildInspectionAggregateLines } from '@/lib/audit-formulas';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import type { DocStatus, Employee } from '@/lib/types';
import AuditFormulaTooltip from './AuditFormulaTooltip';
import CriterionTooltip from './CriterionTooltip';

interface Props {
  filteredEmployees: Employee[];
  sort: 'nom' | 'pct-asc' | 'pct-desc';
  onUpdate: (employee: Employee) => void;
  readOnly?: boolean;
}

type FilterKey = 'matricule' | 'nom' | 'departement';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  matricule: [],
  nom: [],
  departement: [],
};

const STATUS_OPTIONS: { value: DocStatus; label: string }[] = [
  { value: 'Y', label: 'Y' },
  { value: 'N', label: 'N' },
  { value: 'NA', label: 'NA' },
];

function statusClass(status: DocStatus): string {
  if (status === 'Y') return 'cell-y';
  if (status === 'NA') return 'cell-na';
  return 'cell-n';
}

function DocColHeader({ index, label }: { index: number; label: string }) {
  const num = String(index).padStart(2, '0');
  return (
    <th className="doc-col-compact">
      <CriterionTooltip
        label={label}
        prefix={`Critère ${num}`}
        className="doc-col-tooltip-wrap"
        trigger={<span className="doc-col-trigger">{num}</span>}
      />
    </th>
  );
}

function DocCellWithTooltip({
  label,
  index,
  status,
  isSaving,
  disabled,
  onChange,
}: {
  label: string;
  index: number;
  status: DocStatus;
  isSaving: boolean;
  disabled?: boolean;
  onChange: (value: DocStatus) => void;
}) {
  return (
    <td className={`doc-cell ${statusClass(status)}`}>
      <CriterionTooltip
        label={label}
        prefix={`Critère ${String(index).padStart(2, '0')}`}
        className="doc-cell-tooltip-wrap"
        trigger={
          <span className="doc-select-wrap">
            <select
              className={`doc-select ${statusClass(status)}${isSaving ? ' saving' : ''}`}
              value={status}
              disabled={disabled || isSaving}
              onChange={(e) => onChange(e.target.value as DocStatus)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {isSaving && <span className="doc-select-spinner" aria-hidden="true" />}
          </span>
        }
      />
    </td>
  );
}

export default function DocumentsGridTab({
  filteredEmployees,
  sort,
  onUpdate,
  readOnly = false,
}: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(filteredEmployees, {
        matricule: (e) => e.matricule,
        nom: (e) => e.nom,
        departement: (e) => e.departement,
      }),
    [filteredEmployees],
  );

  const columnFiltered = useMemo(
    () =>
      filteredEmployees.filter(
        (e) =>
          matchesColumnFilter(colFilters.matricule, e.matricule) &&
          matchesColumnFilter(colFilters.nom, e.nom) &&
          matchesColumnFilter(colFilters.departement, e.departement),
      ),
    [filteredEmployees, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const sorted = useMemo(() => {
    let list = columnFiltered.map((e) => ({ emp: e, row: calcRowCellStats(e) }));

    if (sort === 'pct-asc') list.sort((a, b) => a.row.rate - b.row.rate);
    else if (sort === 'pct-desc') list.sort((a, b) => b.row.rate - a.row.rate);
    else list.sort((a, b) => a.emp.nom.localeCompare(b.emp.nom, 'fr'));

    return list;
  }, [columnFiltered, sort]);

  const aggregate = useMemo(
    () => calcCellAggregateStats(columnFiltered),
    [columnFiltered],
  );

  const globalFormulaLines = useMemo(
    () => buildInspectionAggregateLines(aggregate),
    [aggregate],
  );

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleChange = useCallback(
    async (matricule: string, docKey: string, value: DocStatus) => {
      const key = `${matricule}-${docKey}`;
      setSaving(key);
      try {
        const res = await fetch(`/api/employees/${matricule}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ docKey, value }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'Erreur sauvegarde');
        }
        const updated = (await res.json()) as Employee;
        onUpdate(updated);
        showToast(`Document mis à jour — ${updated.nom}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
      } finally {
        setSaving(null);
      }
    },
    [onUpdate],
  );

  return (
    <div className="grid-tab">
      {toast && <div className="toast">{toast}</div>}

      <div className="panel grid-panel">
        {activeFilterCount > 0 ? (
          <div className="factures-suivi-filter-bar">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setColFilters(EMPTY_FILTERS)}
            >
              Effacer les filtres ({activeFilterCount})
            </button>
            <span className="factures-suivi-toolbar-meta">
              {columnFiltered.length} / {filteredEmployees.length}
            </span>
          </div>
        ) : null}
        <div className="grid-scroll" ref={scrollRef}>
          <table className="docs-grid-table">
            <thead>
              <tr>
                <th className="sticky-col col-matricule th-filter">
                  <TableHeaderFilter
                    label="Matricule"
                    values={filterValues.matricule}
                    selected={colFilters.matricule}
                    onChange={(next) => setColFilters((p) => ({ ...p, matricule: next }))}
                  />
                </th>
                <th className="sticky-col col-nom th-filter">
                  <TableHeaderFilter
                    label="Nom & Prénom"
                    values={filterValues.nom}
                    selected={colFilters.nom}
                    onChange={(next) => setColFilters((p) => ({ ...p, nom: next }))}
                  />
                </th>
                <th className="sticky-col col-dept th-filter">
                  <TableHeaderFilter
                    label="Département"
                    values={filterValues.departement}
                    selected={colFilters.departement}
                    onChange={(next) => setColFilters((p) => ({ ...p, departement: next }))}
                  />
                </th>
                {DOCUMENT_FIELDS.map((f, i) => (
                  <DocColHeader key={f.key} index={i + 1} label={f.label} />
                ))}
                <th className="grid-sum-col">Y</th>
                <th className="grid-sum-col">NA</th>
                <th className="grid-sum-col">N</th>
                <th className="grid-rate-col sticky-rate">% conformité</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ emp, row }) => {
                const pctClass = row.rate >= 80 ? 'high' : row.rate >= 50 ? 'mid' : 'low';
                return (
                  <tr key={emp.matricule}>
                    <td className="sticky-col col-matricule"><strong>{emp.matricule}</strong></td>
                    <td className="sticky-col col-nom">{emp.nom}</td>
                    <td className="sticky-col col-dept">{emp.departement}</td>
                    {DOCUMENT_FIELDS.map((f, i) => {
                      const status = normalizeDocStatus(String(emp.documents?.[f.key] || ''));
                      const saveKey = `${emp.matricule}-${f.key}`;
                      const isSaving = saving === saveKey;
                      return (
                        <DocCellWithTooltip
                          key={f.key}
                          index={i + 1}
                          label={f.label}
                          status={status}
                          isSaving={isSaving}
                          disabled={readOnly}
                          onChange={(value) => handleChange(emp.matricule, f.key, value)}
                        />
                      );
                    })}
                    <td className="grid-sum-cell sum-y">{row.y}</td>
                    <td className="grid-sum-cell sum-na">{row.na}</td>
                    <td className="grid-sum-cell sum-n">{row.n}</td>
                    <td className="grid-rate-cell sticky-rate">
                      <div className="pct-cell">
                        <div className="progress-bar sm">
                          <div className={`progress-fill ${pctClass}`} style={{ width: `${row.rate}%` }} />
                        </div>
                        <span>{formatRate(row.rate)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="grid-summary-row grid-summary-sums">
                <td className="sticky-col col-matricule grid-footer-label" colSpan={3}>
                  <strong>Résumé global</strong>
                </td>
                {DOCUMENT_FIELDS.map((f) => (
                  <td key={f.key} className="grid-summary-empty" aria-hidden="true" />
                ))}
                <td className="grid-sum-cell sum-y"><strong>{aggregate.sumY}</strong></td>
                <td className="grid-sum-cell sum-na"><strong>{aggregate.sumNa}</strong></td>
                <td className="grid-sum-cell sum-n"><strong>{aggregate.sumN}</strong></td>
                <td className="grid-rate-cell sticky-rate">
                  <AuditFormulaTooltip
                    value={formatRate(aggregate.conformeRate)}
                    title="Taux conformité — INSPECTIONS l.25"
                    lines={globalFormulaLines}
                    className="pct-badge pct-conforme"
                  />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="legend grid-legend">
        <span><span className="legend-dot y" /> Y — Document présent</span>
        <span><span className="legend-dot n" /> N — Document manquant</span>
        <span><span className="legend-dot na" /> NA — Non applicable</span>
        <span className="legend-hint">% conformité reste visible à droite · Taux global = %Y + %NA</span>
      </div>
    </div>
  );
}
