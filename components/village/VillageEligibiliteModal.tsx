'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import { readApiJson, humanizeErrorMessage } from '@/lib/api-client-error';
import { showError, showSuccess } from '@/lib/swal';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import {
  compareNumber,
  compareText,
  type SortDir,
} from '@/lib/table-sort';
import { downloadVillageEligibiliteExport } from '@/lib/village-export';
import {
  computeEligibiliteTotalPct,
  ELIGIBILITE_CRITERIA,
  ELIGIBILITE_MAX_TOTAL,
  emptyEligibiliteScores,
  type EligibiliteCriterionKey,
  type VillageEligibiliteFamilyMember,
  type VillageEligibiliteRow,
  type VillageEligibiliteScores,
} from '@/lib/village-eligibilite';
import { isChildStatut, isSpouseStatut } from '@/lib/dependants-utils';

interface Props {
  open: boolean;
  onClose: () => void;
}

type DraftRow = VillageEligibiliteRow;

type SortKey =
  | 'n'
  | 'nom'
  | 'fonction'
  | 'departement'
  | 'grade'
  | 'anciennete'
  | 'dependants'
  | EligibiliteCriterionKey
  | 'totalPct';

type FilterKey = SortKey;

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  n: [],
  nom: [],
  fonction: [],
  departement: [],
  grade: [],
  anciennete: [],
  dependants: [],
  criticalPosition: [],
  seniorityEmployment: [],
  mobilityRequirement: [],
  talentAttraction: [],
  familyComposition: [],
  totalPct: [],
};

function parseScoreInput(raw: string, max: number): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(max, Math.round(n * 100) / 100));
}

function scoreValue(row: DraftRow, key: EligibiliteCriterionKey): number {
  const v = row.scores[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : -1;
}

function scoreFilterLabel(row: DraftRow, key: EligibiliteCriterionKey): string {
  const v = row.scores[key];
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '—';
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function ExcelIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h2l1.5 3L13 13h2" />
      <path d="M8 17h8" />
    </svg>
  );
}

function memberStatutLabel(statut: string): string {
  if (isSpouseStatut(statut)) return 'Conjoint(e)';
  if (isChildStatut(statut)) return 'Enfant';
  return statut || '—';
}

function FilterSortTh({
  label,
  column,
  sortKey,
  sortDir,
  onSortDir,
  values,
  selected,
  onChange,
  title,
  className,
  extraFilter,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortDir: (column: SortKey, dir: SortDir) => void;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  title?: string;
  className?: string;
  extraFilter?: {
    label: string;
    values: string[];
    selected: string[];
    onChange: (next: string[]) => void;
  };
}) {
  const active = sortKey === column;
  return (
    <th
      className={`th-filter${active ? ' is-sorted' : ''}${className ? ` ${className}` : ''}`}
      title={title}
    >
      <div className="village-eligibilite-th-inner">
        <TableHeaderFilter
          label={label}
          values={values}
          selected={selected}
          onChange={onChange}
          tooltip={title}
          sort={{
            active,
            dir: sortDir,
            onSort: (dir) => onSortDir(column, dir),
          }}
        />
        {extraFilter ? (
          <TableHeaderFilter
            label={extraFilter.label}
            values={extraFilter.values}
            selected={extraFilter.selected}
            onChange={extraFilter.onChange}
          />
        ) : null}
      </div>
    </th>
  );
}

export default function VillageEligibiliteModal({ open, onClose }: Props) {
  const { can } = usePermissions();
  const canEdit =
    can('village.maisons', 'edit') ||
    can('village.maisons', 'create') ||
    can('village.dependants-liste', 'edit');
  const canExport = can('village.maisons', 'export') || can('village.maisons', 'view');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [search, setSearch] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('nom');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [familyPanel, setFamilyPanel] = useState<{
    matricule: string;
    nom: string;
    famille: VillageEligibiliteFamilyMember[];
  } | null>(null);

  const normalizeRows = useCallback((list: VillageEligibiliteRow[]): DraftRow[] => {
    return list.map((row) => {
      const scores = { ...emptyEligibiliteScores(), ...row.scores };
      return {
        ...row,
        dateEmbauche: String(row.dateEmbauche || '').trim(),
        dependantsCount: Number(row.dependantsCount) || 0,
        ancienneteYears: Number(row.ancienneteYears) || -1,
        famille: Array.isArray(row.famille) ? row.famille : [],
        scores,
        totalPct: computeEligibiliteTotalPct(scores),
      };
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 10_000);

    setLoading(true);
    setSearch('');
    setColFilters(EMPTY_FILTERS);
    setFamilyPanel(null);

    void (async () => {
      try {
        const res = await fetch('/api/village/eligibilite', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const json = await readApiJson<{
          rows?: VillageEligibiliteRow[];
          updatedAt?: string | null;
          error?: string;
        }>(res, 'Chargement de l’éligibilité impossible');
        if (cancelled) return;
        setRows(normalizeRows(json.rows ?? []));
        setUpdatedAt(json.updatedAt ?? null);
        setDirty(false);
      } catch (err) {
        if (cancelled) return;
        showError(
          humanizeErrorMessage(
            err,
            'Chargement de l’éligibilité impossible. Réessayez.',
          ),
        );
        setRows([]);
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [open, normalizeRows]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (familyPanel) {
        setFamilyPanel(null);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, familyPanel]);

  const onSortDir = (column: SortKey, dir: SortDir) => {
    setSortKey(column);
    setSortDir(dir);
  };

  const setColFilter = (key: FilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.matricule, row.nom, row.fonction, row.departement, row.grade]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(searchFiltered, {
        n: (r) => String(r.n),
        nom: (r) => r.nom,
        fonction: (r) => r.fonction,
        departement: (r) => r.departement,
        grade: (r) => r.grade,
        anciennete: (r) => r.anciennete,
        dependants: (r) => String(r.dependantsCount),
        criticalPosition: (r) => scoreFilterLabel(r, 'criticalPosition'),
        seniorityEmployment: (r) => scoreFilterLabel(r, 'seniorityEmployment'),
        mobilityRequirement: (r) => scoreFilterLabel(r, 'mobilityRequirement'),
        talentAttraction: (r) => scoreFilterLabel(r, 'talentAttraction'),
        familyComposition: (r) => scoreFilterLabel(r, 'familyComposition'),
        totalPct: (r) => `${r.totalPct}%`,
      }),
    [searchFiltered],
  );

  const activeFilterCount = countActiveColumnFilters(colFilters);

  const displayed = useMemo(() => {
    let list = searchFiltered.filter(
      (row) =>
        matchesColumnFilter(colFilters.n, String(row.n)) &&
        matchesColumnFilter(colFilters.nom, row.nom) &&
        matchesColumnFilter(colFilters.fonction, row.fonction) &&
        matchesColumnFilter(colFilters.departement, row.departement) &&
        matchesColumnFilter(colFilters.grade, row.grade) &&
        matchesColumnFilter(colFilters.anciennete, row.anciennete) &&
        matchesColumnFilter(colFilters.dependants, String(row.dependantsCount)) &&
        matchesColumnFilter(
          colFilters.criticalPosition,
          scoreFilterLabel(row, 'criticalPosition'),
        ) &&
        matchesColumnFilter(
          colFilters.seniorityEmployment,
          scoreFilterLabel(row, 'seniorityEmployment'),
        ) &&
        matchesColumnFilter(
          colFilters.mobilityRequirement,
          scoreFilterLabel(row, 'mobilityRequirement'),
        ) &&
        matchesColumnFilter(
          colFilters.talentAttraction,
          scoreFilterLabel(row, 'talentAttraction'),
        ) &&
        matchesColumnFilter(
          colFilters.familyComposition,
          scoreFilterLabel(row, 'familyComposition'),
        ) &&
        matchesColumnFilter(colFilters.totalPct, `${row.totalPct}%`),
    );

    list = list.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'n':
          cmp = compareNumber(a.n, b.n);
          break;
        case 'nom':
          cmp = compareText(a.nom, b.nom) || compareText(a.matricule, b.matricule);
          break;
        case 'fonction':
          cmp = compareText(a.fonction, b.fonction);
          break;
        case 'departement':
          cmp = compareText(a.departement, b.departement);
          break;
        case 'grade':
          cmp = compareText(a.grade, b.grade);
          break;
        case 'anciennete':
          cmp = compareNumber(a.ancienneteYears, b.ancienneteYears);
          break;
        case 'dependants':
          cmp = compareNumber(a.dependantsCount, b.dependantsCount);
          break;
        case 'totalPct':
          cmp = compareNumber(a.totalPct, b.totalPct);
          break;
        default:
          cmp = compareNumber(scoreValue(a, sortKey), scoreValue(b, sortKey));
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [searchFiltered, colFilters, sortKey, sortDir]);

  const setScore = (
    matricule: string,
    key: EligibiliteCriterionKey,
    raw: string,
    max: number,
  ) => {
    if (key === 'familyComposition') return;
    const value = parseScoreInput(raw, max);
    setRows((prev) =>
      prev.map((row) => {
        if (row.matricule !== matricule) return row;
        const scores: VillageEligibiliteScores = { ...row.scores, [key]: value };
        return {
          ...row,
          scores,
          totalPct: computeEligibiliteTotalPct(scores),
        };
      }),
    );
    setDirty(true);
  };

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/village/eligibilite', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: rows.map((row) => ({
            matricule: row.matricule,
            scores: row.scores,
            note: row.note,
          })),
        }),
      });
      const json = await readApiJson<{
        rows?: VillageEligibiliteRow[];
        updatedAt?: string | null;
        error?: string;
      }>(res, 'Enregistrement impossible');
      setRows(normalizeRows(json.rows ?? []));
      setUpdatedAt(json.updatedAt ?? null);
      setDirty(false);
      showSuccess('Éligibilité enregistrée.');
    } catch (err) {
      showError(
        humanizeErrorMessage(err, 'Enregistrement impossible. Réessayez.'),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    try {
      if (dirty && canEdit) {
        const res = await fetch('/api/village/eligibilite', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entries: rows.map((row) => ({
              matricule: row.matricule,
              scores: row.scores,
              note: row.note,
            })),
          }),
          signal: controller.signal,
        });
        const json = await readApiJson<{
          rows?: VillageEligibiliteRow[];
          updatedAt?: string | null;
          error?: string;
        }>(res, 'Enregistrement avant export impossible');
        setRows(normalizeRows(json.rows ?? []));
        setUpdatedAt(json.updatedAt ?? null);
        setDirty(false);
      }
      await downloadVillageEligibiliteExport({ signal: controller.signal });
      showSuccess('Export Excel téléchargé.');
    } catch (err) {
      showError(
        humanizeErrorMessage(err, 'Export Excel impossible. Réessayez.'),
      );
    } finally {
      window.clearTimeout(timeoutId);
      setExporting(false);
    }
  };

  if (!open) return null;

  const modal = (
    <div
      className="modal-overlay open dashboard-list-overlay village-eligibilite-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal dependants-drilldown-modal dashboard-list-modal village-eligibilite-modal village-eligibilite-modal-full"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label="Éligibilité au village"
      >
        <div className="modal-header village-eligibilite-modal-header">
          <div className="village-eligibilite-header-left">
            <div>
              <h3>Éligibilité au village</h3>
              <p className="dependants-drilldown-meta">
                Agents à Kimpese · {displayed.length} élément
                {displayed.length !== 1 ? 's' : ''}
                {updatedAt
                  ? ` · maj ${new Date(updatedAt).toLocaleString('fr-FR')}`
                  : ''}
                {dirty ? ' · non enregistré' : ''}
              </p>
            </div>
          </div>
          <div className="village-eligibilite-header-actions">
            {activeFilterCount > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setColFilters(EMPTY_FILTERS)}
              >
                Effacer filtres ({activeFilterCount})
              </button>
            ) : null}
            {canExport ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm village-eligibilite-excel-btn"
                disabled={exporting || loading}
                onClick={() => void handleExport()}
              >
                {exporting ? (
                  <span className="btn-spinner" aria-hidden />
                ) : (
                  <ExcelIcon />
                )}
                {exporting ? 'Export…' : 'Excel'}
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="btn btn-sm village-eligibilite-save-btn"
                disabled={saving || loading || !dirty}
                onClick={() => void handleSave()}
              >
                <SaveIcon />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            ) : null}
            <button
              type="button"
              className="btn-icon dashboard-list-close"
              onClick={onClose}
              aria-label="Fermer"
            >
              ×
            </button>
          </div>
        </div>

        <div className="village-eligibilite-hint-bar">
          <input
            type="search"
            className="search-input village-eligibilite-hint-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher matricule, nom, fonction…"
            autoFocus
          />
          <ul className="village-eligibilite-legend" aria-label="Règles de notation">
            <li>
              <strong>Cotes</strong>
              <span>chaque critère se note de 0 à 20</span>
            </li>
            <li>
              <strong>Family auto</strong>
              <span>seul = 0 · 3 × nb dépendants · max 20</span>
            </li>
            <li>
              <strong>% éligibilité</strong>
              <span>somme des 5 cotes (max {ELIGIBILITE_MAX_TOTAL})</span>
            </li>
          </ul>
        </div>

        <div className="dependants-drilldown-table-wrap village-eligibilite-table-wrap">
          {loading ? (
            <div className="village-eligibilite-loading" role="status" aria-live="polite">
              <span className="village-eligibilite-spinner" aria-hidden />
              <p>Chargement de l’éligibilité…</p>
              <span className="village-eligibilite-loading-sub">Maximum 10 secondes</span>
            </div>
          ) : displayed.length === 0 ? (
            <p className="empty-state">Aucun agent à Kimpese.</p>
          ) : (
            <table className="dependants-drilldown-table village-eligibilite-table">
              <thead>
                <tr>
                  <FilterSortTh
                    label="N°"
                    column="n"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortDir={onSortDir}
                    values={filterValues.n}
                    selected={colFilters.n}
                    onChange={setColFilter('n')}
                    className="village-eligibilite-col-n"
                  />
                  <FilterSortTh
                    label="Matricule et nom"
                    column="nom"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortDir={onSortDir}
                    values={filterValues.nom}
                    selected={colFilters.nom}
                    onChange={setColFilter('nom')}
                  />
                  <FilterSortTh
                    label="Fonction"
                    column="fonction"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortDir={onSortDir}
                    values={filterValues.fonction}
                    selected={colFilters.fonction}
                    onChange={setColFilter('fonction')}
                    className="village-eligibilite-col-fonction"
                    extraFilter={{
                      label: 'Dépt',
                      values: filterValues.departement,
                      selected: colFilters.departement,
                      onChange: setColFilter('departement'),
                    }}
                  />
                  <FilterSortTh
                    label="Grade"
                    column="grade"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortDir={onSortDir}
                    values={filterValues.grade}
                    selected={colFilters.grade}
                    onChange={setColFilter('grade')}
                    className="village-eligibilite-col-grade"
                  />
                  <FilterSortTh
                    label="Ancienneté"
                    column="anciennete"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortDir={onSortDir}
                    values={filterValues.anciennete}
                    selected={colFilters.anciennete}
                    onChange={setColFilter('anciennete')}
                    className="village-eligibilite-col-anciennete"
                  />
                  <FilterSortTh
                    label="Dépendants"
                    column="dependants"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortDir={onSortDir}
                    values={filterValues.dependants}
                    selected={colFilters.dependants}
                    onChange={setColFilter('dependants')}
                    className="village-eligibilite-col-dep"
                    title="Personnes sous l’employé (hors employé)"
                  />
                  {ELIGIBILITE_CRITERIA.map((c) => (
                    <FilterSortTh
                      key={c.key}
                      column={c.key}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onSortDir={onSortDir}
                      values={filterValues[c.key]}
                      selected={colFilters[c.key]}
                      onChange={setColFilter(c.key)}
                      label={`${c.compact}/${c.max}`}
                      title={`${c.label} (0–${c.max})`}
                      className="village-eligibilite-crit-col"
                    />
                  ))}
                  <FilterSortTh
                    label="% élig."
                    column="totalPct"
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onSortDir={onSortDir}
                    values={filterValues.totalPct}
                    selected={colFilters.totalPct}
                    onChange={setColFilter('totalPct')}
                    className="village-eligibilite-col-total"
                  />
                </tr>
              </thead>
              <tbody>
                {displayed.map((row) => (
                  <tr key={row.matricule}>
                    <td className="village-eligibilite-col-n">{row.n}</td>
                    <td>
                      <div className="village-eligibilite-identity">
                        <span className="village-eligibilite-mat">{row.matricule}</span>
                        <strong>{row.nom}</strong>
                      </div>
                    </td>
                    <td className="village-eligibilite-col-fonction">
                      <div className="village-eligibilite-fonction-cell">
                        <span className="village-eligibilite-fonction-label" title={row.fonction}>
                          {row.fonction}
                        </span>
                        {row.departement && row.departement !== '—' ? (
                          <span className="village-eligibilite-dept-badge" title={row.departement}>
                            {row.departement}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="village-eligibilite-col-grade">{row.grade}</td>
                    <td
                      className="village-eligibilite-col-anciennete"
                      title={
                        row.dateEmbauche
                          ? `Date d’embauche : ${row.dateEmbauche}`
                          : 'Date d’embauche non renseignée'
                      }
                    >
                      {row.anciennete}
                    </td>
                    <td className="village-eligibilite-col-dep village-eligibilite-dep-cell">
                      {row.dependantsCount > 0 ? (
                        <button
                          type="button"
                          className="village-eligibilite-dep-btn"
                          onClick={() =>
                            setFamilyPanel({
                              matricule: row.matricule,
                              nom: row.nom,
                              famille: row.famille,
                            })
                          }
                          title={`Voir la liste — ${row.dependantsCount} dépendant${row.dependantsCount !== 1 ? 's' : ''}`}
                        >
                          {row.dependantsCount}
                        </button>
                      ) : (
                        <span title="Aucun dépendant">0</span>
                      )}
                    </td>
                    {ELIGIBILITE_CRITERIA.map((c) => {
                      const value = row.scores[c.key];
                      const isFamily = c.key === 'familyComposition';
                      return (
                        <td
                          key={c.key}
                          className="village-eligibilite-score-cell village-eligibilite-crit-col"
                        >
                          {isFamily ? (
                            <span
                              className="village-eligibilite-score-auto"
                              title={`Family auto : 3 × ${row.dependantsCount} dépendant${row.dependantsCount !== 1 ? 's' : ''} = ${typeof value === 'number' ? value : 0}/20`}
                            >
                              {typeof value === 'number' ? value : '—'}
                            </span>
                          ) : (
                            <input
                              type="number"
                              className="village-eligibilite-score-input"
                              min={0}
                              max={c.max}
                              step={1}
                              disabled={!canEdit}
                              value={value ?? ''}
                              onChange={(event) =>
                                setScore(row.matricule, c.key, event.target.value, c.max)
                              }
                              aria-label={`${c.label} — ${row.nom}`}
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="village-eligibilite-total village-eligibilite-col-total">
                      <strong>{row.totalPct}%</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {familyPanel ? (
        <div
          className="village-eligibilite-family-overlay"
          onClick={() => setFamilyPanel(null)}
          role="presentation"
        >
          <div
            className="village-eligibilite-family-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal
            aria-label={`Dépendants de ${familyPanel.nom}`}
          >
            <div className="village-eligibilite-family-header">
              <div>
                <h4>Dépendants</h4>
                <p>
                  {familyPanel.matricule} · {familyPanel.nom} · {familyPanel.famille.length}{' '}
                  personne{familyPanel.famille.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                className="btn-icon dashboard-list-close"
                onClick={() => setFamilyPanel(null)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            {familyPanel.famille.length === 0 ? (
              <p className="empty-state">Aucun dépendant.</p>
            ) : (
              <table className="village-eligibilite-family-table">
                <thead>
                  <tr>
                    <th>Matricule</th>
                    <th>Nom</th>
                    <th>Statut</th>
                    <th>Sexe</th>
                    <th>Âge</th>
                  </tr>
                </thead>
                <tbody>
                  {familyPanel.famille.map((member) => (
                    <tr key={member.id}>
                      <td>{member.matricule || '—'}</td>
                      <td>
                        <strong>{member.nom}</strong>
                      </td>
                      <td>{memberStatutLabel(member.statut)}</td>
                      <td>{member.sexe || '—'}</td>
                      <td>{member.age || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
