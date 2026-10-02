'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import { triggerDownload } from '@/lib/declaration-download-client';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import { showError } from '@/lib/swal';
import type {
  PosteEffectifCapitalHrRow,
  PosteEffectifContractantColumn,
  PosteEffectifContractantRow,
  PosteEffectifPpcRow,
  PosteEffectifResumeRow,
  PostesEffectifsPayload,
} from '@/lib/postes-effectifs';

type PageTab = 'ppc' | 'capital' | 'resume' | string;
type DrillSide = 'ppc' | 'capital' | string;
type ResumeSortKey = 'poste' | 'ppcCount' | 'capitalHrCount' | string;
type SortDir = 'asc' | 'desc';

type PpcFilterKey =
  | 'nom'
  | 'matricule'
  | 'poste'
  | 'classification'
  | 'grade'
  | 'department'
  | 'localisation';
type CapitalFilterKey =
  | 'nom'
  | 'posteCapHr'
  | 'fonction'
  | 'classification'
  | 'department'
  | 'lieuAffectation';
type ResumeFilterKey = 'poste' | 'department' | 'location';

type DrillState = {
  side: DrillSide;
  poste: string | null;
  title: string;
  contractantId?: string;
};

const EMPTY_PPC: Record<PpcFilterKey, string[]> = {
  nom: [],
  matricule: [],
  poste: [],
  classification: [],
  grade: [],
  department: [],
  localisation: [],
};

const EMPTY_CAPITAL: Record<CapitalFilterKey, string[]> = {
  nom: [],
  posteCapHr: [],
  fonction: [],
  classification: [],
  department: [],
  lieuAffectation: [],
};

const EMPTY_RESUME: Record<ResumeFilterKey, string[]> = {
  poste: [],
  department: [],
  location: [],
};

const PPC_DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'nom', label: 'Nom' },
  { key: 'matricule', label: 'Matricule' },
  { key: 'poste', label: 'Poste' },
  { key: 'classification', label: 'Classification' },
  { key: 'grade', label: 'Grade' },
  { key: 'department', label: 'Département' },
  { key: 'localisation', label: 'Localisation' },
];

const CAPITAL_DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'nom', label: 'Nom' },
  { key: 'posteCapHr', label: 'Poste CapHR' },
  { key: 'fonction', label: 'Fonction' },
  { key: 'classification', label: 'Classification' },
  { key: 'department', label: 'Département' },
  { key: 'lieuAffectation', label: 'Affectation' },
];

function matchesSearch(haystack: string, q: string): boolean {
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

function foldPoste(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function posteMatches(rowPoste: string, target: string | null): boolean {
  if (!target) return true;
  const a = foldPoste(rowPoste === '—' ? 'Not specified' : rowPoste);
  const b = foldPoste(target === '—' ? 'Not specified' : target);
  return a === b;
}

export default function PostesEffectifsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<PageTab>('ppc');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportIncludePpc, setExportIncludePpc] = useState(true);
  const [exportContractantIds, setExportContractantIds] = useState<string[]>([]);
  const [data, setData] = useState<PostesEffectifsPayload | null>(null);
  const [search, setSearch] = useState('');
  const [ppcFilters, setPpcFilters] = useState(EMPTY_PPC);
  const [capitalFilters, setCapitalFilters] = useState(EMPTY_CAPITAL);
  const [contractantFilters, setContractantFilters] = useState(EMPTY_CAPITAL);
  const [resumeFilters, setResumeFilters] = useState(EMPTY_RESUME);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [resumeSortKey, setResumeSortKey] = useState<ResumeSortKey>('poste');
  const [resumeSortDir, setResumeSortDir] = useState<SortDir>('asc');

  const canExport =
    can('employes.classification', 'export')
    || can('employes.classification', 'view')
    || can('employes.postes', 'export')
    || can('employes.postes', 'view')
    || can('employes.liste', 'export')
    || can('employes.liste', 'view')
    || can('employes.contractants', 'export')
    || can('employes.contractants', 'view');

  const gate = [
    { menuId: 'employes.classification', action: 'view' as const },
    { menuId: 'employes.postes', action: 'view' as const },
    { menuId: 'employes.liste', action: 'view' as const },
    { menuId: 'employes.contractants', action: 'view' as const },
  ];

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/employes/postes/effectifs');
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || 'Chargement impossible');
        setData(null);
        return;
      }
      setData(json as PostesEffectifsPayload);
      const payload = json as PostesEffectifsPayload;
      const ids = [
        ...(payload.meta.capitalHrContractantId ? [payload.meta.capitalHrContractantId] : []),
        ...payload.meta.autresContractants.map((c) => c.id),
      ];
      setExportContractantIds(ids);
      setExportIncludePpc(true);
    } catch {
      await showError('Chargement impossible');
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    if (tab === 'ppc' || tab === 'capital' || tab === 'resume') return;
    if (!data.meta.autresContractants.some((c) => c.id === tab)) setTab('ppc');
  }, [data, tab]);

  const q = search.trim().toLowerCase();
  const capitalLabel = data?.meta.contractantNom || 'Capital HR';
  const autresCols = data?.meta.autresContractants || [];
  const activeContractant = autresCols.find((c) => c.id === tab) || null;

  const contractantCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.autres || []) {
      map.set(row.contractantId, (map.get(row.contractantId) || 0) + 1);
    }
    return map;
  }, [data?.autres]);

  useEffect(() => {
    if (tab !== 'ppc' && tab !== 'capital' && tab !== 'resume') {
      setContractantFilters(EMPTY_CAPITAL);
    }
  }, [tab]);

  const ppcRows = useMemo(() => {
    const list = data?.ppc || [];
    return list.filter((row) => {
      if (!matchesSearch(
        `${row.nom} ${row.matricule} ${row.poste} ${row.classification} ${row.department} ${row.localisation}`,
        q,
      )) return false;
      if (!matchesColumnFilter(ppcFilters.nom, row.nom)) return false;
      if (!matchesColumnFilter(ppcFilters.matricule, row.matricule)) return false;
      if (!matchesColumnFilter(ppcFilters.poste, row.poste)) return false;
      if (!matchesColumnFilter(ppcFilters.classification, row.classification)) return false;
      if (!matchesColumnFilter(ppcFilters.grade, row.grade)) return false;
      if (!matchesColumnFilter(ppcFilters.department, row.department)) return false;
      if (!matchesColumnFilter(ppcFilters.localisation, row.localisation)) return false;
      return true;
    });
  }, [data?.ppc, q, ppcFilters]);

  const capitalRows = useMemo(() => {
    const list = data?.capitalHr || [];
    return list.filter((row) => {
      if (!matchesSearch(
        `${row.nom} ${row.posteCapHr} ${row.fonction} ${row.classification} ${row.department} ${row.lieuAffectation}`,
        q,
      )) return false;
      if (!matchesColumnFilter(capitalFilters.nom, row.nom)) return false;
      if (!matchesColumnFilter(capitalFilters.posteCapHr, row.posteCapHr)) return false;
      if (!matchesColumnFilter(capitalFilters.fonction, row.fonction)) return false;
      if (!matchesColumnFilter(capitalFilters.classification, row.classification)) return false;
      if (!matchesColumnFilter(capitalFilters.department, row.department)) return false;
      if (!matchesColumnFilter(capitalFilters.lieuAffectation, row.lieuAffectation)) return false;
      return true;
    });
  }, [data?.capitalHr, q, capitalFilters]);

  const contractantRows = useMemo(() => {
    if (!activeContractant) return [] as PosteEffectifContractantRow[];
    const list = (data?.autres || []).filter((row) => row.contractantId === activeContractant.id);
    return list.filter((row) => {
      if (!matchesSearch(
        `${row.nom} ${row.fonction} ${row.classification} ${row.department} ${row.lieuAffectation}`,
        q,
      )) return false;
      if (!matchesColumnFilter(contractantFilters.nom, row.nom)) return false;
      if (!matchesColumnFilter(contractantFilters.fonction, row.fonction)) return false;
      if (!matchesColumnFilter(contractantFilters.classification, row.classification)) return false;
      if (!matchesColumnFilter(contractantFilters.department, row.department)) return false;
      if (!matchesColumnFilter(contractantFilters.lieuAffectation, row.lieuAffectation)) return false;
      return true;
    });
  }, [data?.autres, activeContractant, q, contractantFilters]);

  const resumeRows = useMemo(() => {
    const list = data?.resume || [];
    const filtered = list.filter((row) => {
      if (!matchesSearch(`${row.poste} ${row.department} ${row.location}`, q)) return false;
      if (!matchesColumnFilter(resumeFilters.poste, row.poste)) return false;
      if (!matchesColumnFilter(resumeFilters.department, row.department)) return false;
      if (!matchesColumnFilter(resumeFilters.location, row.location)) return false;
      return true;
    });
    const dir = resumeSortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (resumeSortKey === 'poste') {
        return dir * a.poste.localeCompare(b.poste, 'en', { sensitivity: 'base' });
      }
      let va = 0;
      let vb = 0;
      if (resumeSortKey === 'ppcCount') {
        va = a.ppcCount;
        vb = b.ppcCount;
      } else if (resumeSortKey === 'capitalHrCount') {
        va = a.capitalHrCount;
        vb = b.capitalHrCount;
      } else {
        va = a.autresCounts[resumeSortKey] || 0;
        vb = b.autresCounts[resumeSortKey] || 0;
      }
      if (va !== vb) return dir * (va - vb);
      return a.poste.localeCompare(b.poste, 'en', { sensitivity: 'base' });
    });
  }, [data?.resume, q, resumeFilters, resumeSortKey, resumeSortDir]);

  const toggleResumeSort = useCallback((key: ResumeSortKey) => {
    setResumeSortKey((prev) => {
      if (prev === key) {
        setResumeSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setResumeSortDir(key === 'poste' ? 'asc' : 'desc');
      return key;
    });
  }, []);

  const exportExcel = useCallback(async () => {
    if (!exportIncludePpc && exportContractantIds.length === 0) {
      await showError('Sélectionnez au moins PPC ou un contractant');
      return;
    }
    setExporting(true);
    try {
      const res = await fetch('/api/employes/postes/effectifs/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includePpc: exportIncludePpc,
          contractantIds: exportContractantIds,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        await showError(json?.error || 'Export impossible');
        return;
      }
      const blob = await res.blob();
      const headerName = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/i)?.[1];
      triggerDownload(blob, headerName || 'POSTES_EFFECTIFS.xlsx');
      setExportOpen(false);
    } catch {
      await showError('Export impossible');
    } finally {
      setExporting(false);
    }
  }, [exportIncludePpc, exportContractantIds]);

  const ppcFilterValues = useMemo(
    () =>
      buildColumnFilterValues(data?.ppc || [], {
        nom: (r) => r.nom,
        matricule: (r) => r.matricule,
        poste: (r) => r.poste,
        classification: (r) => r.classification,
        grade: (r) => r.grade,
        department: (r) => r.department,
        localisation: (r) => r.localisation,
      }),
    [data?.ppc],
  );

  const capitalFilterValues = useMemo(
    () =>
      buildColumnFilterValues(data?.capitalHr || [], {
        nom: (r) => r.nom,
        posteCapHr: (r) => r.posteCapHr,
        fonction: (r) => r.fonction,
        classification: (r) => r.classification,
        department: (r) => r.department,
        lieuAffectation: (r) => r.lieuAffectation,
      }),
    [data?.capitalHr],
  );

  const contractantFilterValues = useMemo(() => {
    const list = activeContractant
      ? (data?.autres || []).filter((r) => r.contractantId === activeContractant.id)
      : [];
    return buildColumnFilterValues(list, {
      nom: (r) => r.nom,
      fonction: (r) => r.fonction,
      classification: (r) => r.classification,
      department: (r) => r.department,
      lieuAffectation: (r) => r.lieuAffectation,
    });
  }, [data?.autres, activeContractant]);

  const resumeFilterValues = useMemo(
    () =>
      buildColumnFilterValues(data?.resume || [], {
        poste: (r) => r.poste,
        department: (r) => r.department,
        location: (r) => r.location,
      }),
    [data?.resume],
  );

  const activeFilters =
    tab === 'ppc'
      ? countActiveColumnFilters(ppcFilters)
      : tab === 'capital'
        ? countActiveColumnFilters(capitalFilters)
        : tab === 'resume'
          ? countActiveColumnFilters(resumeFilters)
          : countActiveColumnFilters(contractantFilters);

  const clearFilters = () => {
    if (tab === 'ppc') setPpcFilters(EMPTY_PPC);
    else if (tab === 'capital') setCapitalFilters(EMPTY_CAPITAL);
    else if (tab === 'resume') setResumeFilters(EMPTY_RESUME);
    else setContractantFilters(EMPTY_CAPITAL);
  };

  const openDrill = useCallback((
    side: DrillSide,
    poste: string | null,
    label: string,
    contractantId?: string,
  ) => {
    setDrill({
      side,
      poste,
      contractantId,
      title: poste
        ? `Voir la liste — ${label} · ${poste}`
        : `Voir la liste — ${label}`,
    });
  }, []);

  const drillRows: DashboardListRow[] = useMemo(() => {
    if (!drill || !data) return [];
    if (drill.side === 'ppc') {
      return data.ppc
        .filter((row) => posteMatches(row.poste, drill.poste))
        .map((row) => ({
          id: row.id,
          cells: {
            nom: row.nom,
            matricule: row.matricule,
            poste: row.poste,
            classification: row.classification,
            grade: row.grade,
            department: row.department,
            localisation: row.localisation,
          },
        }));
    }
    if (drill.side === 'capital') {
      return data.capitalHr
        .filter((row) => posteMatches(row.fonction, drill.poste))
        .map((row) => ({
          id: row.id,
          cells: {
            nom: row.nom,
            posteCapHr: row.posteCapHr,
            fonction: row.fonction,
            classification: row.classification,
            department: row.department,
            lieuAffectation: row.lieuAffectation,
          },
        }));
    }
    const contractantId = drill.contractantId || drill.side;
    return data.autres
      .filter((row) => row.contractantId === contractantId && posteMatches(row.fonction, drill.poste))
      .map((row) => ({
        id: row.id,
        cells: {
          nom: row.nom,
          fonction: row.fonction,
          classification: row.classification,
          department: row.department,
          lieuAffectation: row.lieuAffectation,
        },
      }));
  }, [drill, data]);

  const drillColumns =
    drill?.side === 'ppc' ? PPC_DRILL_COLUMNS : CAPITAL_DRILL_COLUMNS;

  const meta = data?.meta;

  if (loading) {
    return (
      <PermissionGate anyOf={gate}>
        <div className="loading">Chargement des effectifs par poste…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate anyOf={gate}>
      <div className="mvt-page postes-page cls-page">
        <div className="postes-sticky">
          <div className="page-header page-header-with-tabs mvt-page-header">
            <div>
              <div className="page-header-title-row">
                <h2>Poste</h2>
                <RefreshButton onClick={() => load(true)} loading={refreshing} />
              </div>
              <p className="mvt-page-sub">
                Effectifs PPC, {capitalLabel} (Zamba + Kinshasa) et autres contractants selon la classification des postes
              </p>
            </div>
            <div className="page-header-actions mvt-header-actions employees-header-actions cls-header-actions">
              <div className="tabs header-tabs header-tabs-compact mvt-tabs" role="tablist">
                {(
                  [
                    ['ppc', `PPC (${meta?.ppcTotal ?? 0})`],
                    ['capital', `${capitalLabel} (${meta?.capitalHrTotal ?? 0})`],
                    ...autresCols.map((c) => [
                      c.id,
                      `${c.nom} (${contractantCounts.get(c.id) ?? 0})`,
                    ] as const),
                    ['resume', `Résumé (${meta?.postesTotal ?? 0})`],
                  ] as Array<readonly [string, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`tab-btn tab-btn-sm mvt-tab-btn${tab === id ? ' active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mvt-search">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  placeholder={
                    tab === 'resume'
                      ? 'Rechercher un poste…'
                      : tab === 'ppc'
                        ? 'Rechercher un employé…'
                        : 'Rechercher un agent…'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Rechercher"
                />
                {search ? (
                  <button type="button" className="mvt-search-clear" aria-label="Effacer" onClick={() => setSearch('')}>
                    ×
                  </button>
                ) : null}
              </div>
              {canExport ? (
                <button
                  type="button"
                  className="btn btn-outline btn-export btn-with-icon btn-sm"
                  disabled={!data}
                  onClick={() => setExportOpen(true)}
                  title="Exporter Excel — choisir les sources"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Export
                </button>
              ) : null}
              {activeFilters > 0 ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                  Effacer les filtres ({activeFilters})
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="postes-body is-table">
          {tab === 'ppc' && (
            <PpcTable
              rows={ppcRows}
              filterValues={ppcFilterValues}
              filters={ppcFilters}
              setFilters={setPpcFilters}
            />
          )}
          {tab === 'capital' && (
            <CapitalTable
              rows={capitalRows}
              filterValues={capitalFilterValues}
              filters={capitalFilters}
              setFilters={setCapitalFilters}
              label={capitalLabel}
              missing={!meta?.contractantNom}
              showPosteCapHr
            />
          )}
          {activeContractant ? (
            <CapitalTable
              rows={contractantRows}
              filterValues={{
                nom: contractantFilterValues.nom,
                posteCapHr: [],
                fonction: contractantFilterValues.fonction,
                classification: contractantFilterValues.classification,
                department: contractantFilterValues.department,
                lieuAffectation: contractantFilterValues.lieuAffectation,
              }}
              filters={contractantFilters}
              setFilters={setContractantFilters}
              label={activeContractant.nom}
              missing={false}
            />
          ) : null}
          {tab === 'resume' && (
            <ResumeTable
              rows={resumeRows}
              filterValues={resumeFilterValues}
              filters={resumeFilters}
              setFilters={setResumeFilters}
              capitalLabel={capitalLabel}
              autresCols={autresCols}
              onCountClick={openDrill}
              sortKey={resumeSortKey}
              sortDir={resumeSortDir}
              onSort={toggleResumeSort}
            />
          )}
        </div>

        {drill ? (
          <DashboardListModal
            title={drill.title}
            columns={drillColumns}
            rows={drillRows}
            onClose={() => setDrill(null)}
            searchPlaceholder="Rechercher un employé…"
            className="dashboard-list-modal--wrap-names"
          />
        ) : null}

        {exportOpen ? (
          <div className="modal-overlay" onClick={() => !exporting && setExportOpen(false)}>
            <div className="modal modal-form" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h3>Export effectifs par poste</h3>
                <button type="button" className="modal-close" onClick={() => setExportOpen(false)} disabled={exporting}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p className="text-muted" style={{ marginTop: 0 }}>
                  Cochez les sources à inclure dans l’Excel (feuille Summary + feuilles détaillées).
                </p>
                <label className="postes-export-check">
                  <input
                    type="checkbox"
                    checked={exportIncludePpc}
                    onChange={(e) => setExportIncludePpc(e.target.checked)}
                  />
                  <span>PPC ({meta?.ppcTotal ?? 0})</span>
                </label>
                {meta?.capitalHrContractantId ? (
                  <label className="postes-export-check">
                    <input
                      type="checkbox"
                      checked={exportContractantIds.includes(meta.capitalHrContractantId)}
                      onChange={(e) => {
                        const id = meta.capitalHrContractantId!;
                        setExportContractantIds((prev) =>
                          e.target.checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
                        );
                      }}
                    />
                    <span>{capitalLabel} ({meta.capitalHrTotal})</span>
                  </label>
                ) : null}
                {autresCols.map((c) => (
                  <label key={c.id} className="postes-export-check">
                    <input
                      type="checkbox"
                      checked={exportContractantIds.includes(c.id)}
                      onChange={(e) => {
                        setExportContractantIds((prev) =>
                          e.target.checked ? [...new Set([...prev, c.id])] : prev.filter((x) => x !== c.id),
                        );
                      }}
                    />
                    <span>{c.nom} ({contractantCounts.get(c.id) ?? 0})</span>
                  </label>
                ))}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setExportOpen(false)} disabled={exporting}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-accent btn-with-icon"
                  disabled={exporting || (!exportIncludePpc && exportContractantIds.length === 0)}
                  onClick={() => void exportExcel()}
                >
                  {exporting ? <span className="btn-spinner" aria-hidden /> : null}
                  {exporting ? 'Export…' : 'Exporter'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PermissionGate>
  );
}

function CountButton({
  value,
  title,
  onClick,
}: {
  value: number;
  title: string;
  onClick: () => void;
}) {
  if (value <= 0) {
    return <span>{value}</span>;
  }
  return (
    <button
      type="button"
      className="mvt-stat-click is-clickable"
      title={title}
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        color: 'var(--accent, #e30613)',
        fontWeight: 700,
        textDecoration: 'underline',
        textUnderlineOffset: 2,
      }}
    >
      {value}
    </button>
  );
}

function PpcTable({
  rows,
  filterValues,
  filters,
  setFilters,
}: {
  rows: PosteEffectifPpcRow[];
  filterValues: Record<PpcFilterKey, string[]>;
  filters: Record<PpcFilterKey, string[]>;
  setFilters: (next: Record<PpcFilterKey, string[]>) => void;
}) {
  return (
    <div className="mvt-liste">
      <div className="table-wrap">
        <table className="data-table mvt-table postes-compact-table">
          <thead>
            <tr>
              <th>
                <TableHeaderFilter
                  label="Nom"
                  values={filterValues.nom}
                  selected={filters.nom}
                  onChange={(next) => setFilters({ ...filters, nom: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Matricule"
                  values={filterValues.matricule}
                  selected={filters.matricule}
                  onChange={(next) => setFilters({ ...filters, matricule: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Poste"
                  values={filterValues.poste}
                  selected={filters.poste}
                  onChange={(next) => setFilters({ ...filters, poste: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Classification"
                  values={filterValues.classification}
                  selected={filters.classification}
                  onChange={(next) => setFilters({ ...filters, classification: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Grade"
                  values={filterValues.grade}
                  selected={filters.grade}
                  onChange={(next) => setFilters({ ...filters, grade: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Département"
                  values={filterValues.department}
                  selected={filters.department}
                  onChange={(next) => setFilters({ ...filters, department: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Localisation"
                  values={filterValues.localisation}
                  selected={filters.localisation}
                  onChange={(next) => setFilters({ ...filters, localisation: next })}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  Aucun employé PPC trouvé.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="postes-row">
                  <td><strong>{row.nom}</strong></td>
                  <td>{row.matricule}</td>
                  <td>{row.poste}</td>
                  <td>{row.classification}</td>
                  <td>{row.grade}</td>
                  <td>{row.department}</td>
                  <td>{row.localisation}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CapitalTable({
  rows,
  filterValues,
  filters,
  setFilters,
  label,
  missing,
  showPosteCapHr = false,
}: {
  rows: Array<PosteEffectifCapitalHrRow | PosteEffectifContractantRow>;
  filterValues: Record<CapitalFilterKey, string[]>;
  filters: Record<CapitalFilterKey, string[]>;
  setFilters: (next: Record<CapitalFilterKey, string[]>) => void;
  label: string;
  missing: boolean;
  showPosteCapHr?: boolean;
}) {
  const colSpan = showPosteCapHr ? 6 : 5;
  return (
    <div className="mvt-liste">
      {missing ? (
        <p className="empty-state" style={{ marginBottom: 12 }}>
          Contractant {label} introuvable dans la liste des contractants.
        </p>
      ) : null}
      <div className="table-wrap">
        <table className="data-table mvt-table postes-compact-table">
          <thead>
            <tr>
              <th>
                <TableHeaderFilter
                  label="Nom"
                  values={filterValues.nom}
                  selected={filters.nom}
                  onChange={(next) => setFilters({ ...filters, nom: next })}
                />
              </th>
              {showPosteCapHr ? (
                <th>
                  <TableHeaderFilter
                    label="Poste CapHR"
                    values={filterValues.posteCapHr}
                    selected={filters.posteCapHr}
                    onChange={(next) => setFilters({ ...filters, posteCapHr: next })}
                  />
                </th>
              ) : null}
              <th>
                <TableHeaderFilter
                  label="Fonction"
                  values={filterValues.fonction}
                  selected={filters.fonction}
                  onChange={(next) => setFilters({ ...filters, fonction: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Classification"
                  values={filterValues.classification}
                  selected={filters.classification}
                  onChange={(next) => setFilters({ ...filters, classification: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Département"
                  values={filterValues.department}
                  selected={filters.department}
                  onChange={(next) => setFilters({ ...filters, department: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Affectation"
                  values={filterValues.lieuAffectation}
                  selected={filters.lieuAffectation}
                  onChange={(next) => setFilters({ ...filters, lieuAffectation: next })}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="empty-state">
                  Aucun agent {label} trouvé.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="postes-row">
                  <td><strong>{row.nom}</strong></td>
                  {showPosteCapHr ? (
                    <td>{'posteCapHr' in row ? row.posteCapHr : '—'}</td>
                  ) : null}
                  <td>{row.fonction}</td>
                  <td>{row.classification}</td>
                  <td>{row.department}</td>
                  <td>{row.lieuAffectation}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ResumeTable({
  rows,
  filterValues,
  filters,
  setFilters,
  capitalLabel,
  autresCols,
  onCountClick,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: PosteEffectifResumeRow[];
  filterValues: Record<ResumeFilterKey, string[]>;
  filters: Record<ResumeFilterKey, string[]>;
  setFilters: (next: Record<ResumeFilterKey, string[]>) => void;
  capitalLabel: string;
  autresCols: PosteEffectifContractantColumn[];
  onCountClick: (
    side: DrillSide,
    poste: string | null,
    label: string,
    contractantId?: string,
  ) => void;
  sortKey: ResumeSortKey;
  sortDir: SortDir;
  onSort: (key: ResumeSortKey) => void;
}) {
  const totalPpc = rows.reduce((s, r) => s + r.ppcCount, 0);
  const totalChr = rows.reduce((s, r) => s + r.capitalHrCount, 0);
  const totalAutres = autresCols.map((col) => ({
    id: col.id,
    nom: col.nom,
    total: rows.reduce((s, r) => s + (r.autresCounts[col.id] || 0), 0),
  }));
  const colCount = 5 + autresCols.length;

  const sortMark = (key: ResumeSortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  return (
    <div className="mvt-liste">
      <div className="table-wrap">
        <table className="data-table mvt-table postes-compact-table postes-effectifs-resume-table">
          <thead>
            <tr>
              <th>
                <div className="postes-effectifs-sort-head">
                  <TableHeaderFilter
                    label="Poste"
                    values={filterValues.poste}
                    selected={filters.poste}
                    onChange={(next) => setFilters({ ...filters, poste: next })}
                  />
                  <button
                    type="button"
                    className={`compilation-sort-btn${sortKey === 'poste' ? ' is-sorted' : ''}`}
                    onClick={() => onSort('poste')}
                    title="Trier par poste"
                    aria-label="Trier par poste"
                  >
                    {sortKey === 'poste' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                  </button>
                </div>
              </th>
              <th>
                <TableHeaderFilter
                  label="Department"
                  values={filterValues.department}
                  selected={filters.department}
                  onChange={(next) => setFilters({ ...filters, department: next })}
                />
              </th>
              <th>
                <TableHeaderFilter
                  label="Location"
                  values={filterValues.location}
                  selected={filters.location}
                  onChange={(next) => setFilters({ ...filters, location: next })}
                />
              </th>
              <th style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  className={`compilation-sort-btn postes-effectifs-th-sort${sortKey === 'ppcCount' ? ' is-sorted' : ''}`}
                  onClick={() => onSort('ppcCount')}
                  title="Trier par effectif PPC"
                >
                  Employés PPC{sortMark('ppcCount')}
                </button>
              </th>
              <th style={{ textAlign: 'right' }}>
                <button
                  type="button"
                  className={`compilation-sort-btn postes-effectifs-th-sort${sortKey === 'capitalHrCount' ? ' is-sorted' : ''}`}
                  onClick={() => onSort('capitalHrCount')}
                  title={`Trier par effectif ${capitalLabel}`}
                >
                  Employés {capitalLabel}{sortMark('capitalHrCount')}
                </button>
              </th>
              {autresCols.map((col) => (
                <th key={col.id} style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className={`compilation-sort-btn postes-effectifs-th-sort${sortKey === col.id ? ' is-sorted' : ''}`}
                    onClick={() => onSort(col.id)}
                    title={`Trier par effectif ${col.nom}`}
                  >
                    {col.nom}{sortMark(col.id)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="empty-state">
                  Aucun poste à résumer.
                </td>
              </tr>
            ) : (
              <>
                {rows.map((row) => (
                  <tr key={row.poste} className="postes-row">
                    <td><strong>{row.poste}</strong></td>
                    <td>{row.department === '—' ? '' : row.department}</td>
                    <td>{row.location === '—' ? '' : row.location}</td>
                    <td style={{ textAlign: 'right' }}>
                      <CountButton
                        value={row.ppcCount}
                        title={`Voir la liste — PPC · ${row.poste}`}
                        onClick={() => onCountClick('ppc', row.poste, 'PPC')}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <CountButton
                        value={row.capitalHrCount}
                        title={`Voir la liste — ${capitalLabel} · ${row.poste}`}
                        onClick={() => onCountClick('capital', row.poste, capitalLabel)}
                      />
                    </td>
                    {autresCols.map((col) => (
                      <td key={col.id} style={{ textAlign: 'right' }}>
                        <CountButton
                          value={row.autresCounts[col.id] || 0}
                          title={`Voir la liste — ${col.nom} · ${row.poste}`}
                          onClick={() => onCountClick(col.id, row.poste, col.nom, col.id)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="postes-row postes-effectifs-total-row">
                  <td><strong>Total</strong></td>
                  <td />
                  <td />
                  <td style={{ textAlign: 'right' }}>
                    <CountButton
                      value={totalPpc}
                      title="Voir la liste — PPC (tous postes)"
                      onClick={() => onCountClick('ppc', null, 'PPC')}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <CountButton
                      value={totalChr}
                      title={`Voir la liste — ${capitalLabel} (tous postes)`}
                      onClick={() => onCountClick('capital', null, capitalLabel)}
                    />
                  </td>
                  {totalAutres.map((col) => (
                    <td key={col.id} style={{ textAlign: 'right' }}>
                      <CountButton
                        value={col.total}
                        title={`Voir la liste — ${col.nom} (tous postes)`}
                        onClick={() => onCountClick(col.id, null, col.nom, col.id)}
                      />
                    </td>
                  ))}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
