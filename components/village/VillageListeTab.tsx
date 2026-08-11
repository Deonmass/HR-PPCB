'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import type { SortDir } from '@/components/SortableTh';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Dependant } from '@/lib/dependants-types';
import { isChildStatut, isSpouseStatut, type FamilyGroup } from '@/lib/dependants-utils';
import { promptSelect, showError, showSuccess } from '@/lib/swal';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import {
  compareMaisonNumero,
  compareNumber,
  compareText,
  toggleSortDir,
} from '@/lib/table-sort';
import type { Employee } from '@/lib/types';
import {
  buildVillageFamilyGroups,
  buildZambaAgentsFromEmployees,
  HORS_EFFECTIF_DEPT,
  splitVillageKimpese,
  type VillageAgentRow,
} from '@/lib/village-agents';
import { formatDisplayName } from '@/lib/format-display-name';
import type { VillageMaison } from '@/lib/village-types';
import VillageSkeleton from '@/components/village/VillageSkeleton';

type Tab = 'village' | 'kimpese';
type SortKey = 'matricule' | 'nom' | 'statut' | 'maison' | 'type' | 'departement' | 'famille';
type FilterKey = SortKey;

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  matricule: [],
  nom: [],
  statut: [],
  maison: [],
  type: [],
  departement: [],
  famille: [],
};

function FilterSortTh({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  values,
  selected,
  onChange,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (column: string) => void;
  values: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const active = sortKey === column;
  return (
    <th className={`th-filter sortable-th${active ? ' is-sorted' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <TableHeaderFilter
          label={label}
          values={values}
          selected={selected}
          onChange={onChange}
        />
        <button
          type="button"
          className="sortable-th-btn"
          onClick={() => onSort(column)}
          title={`Trier par ${label}`}
          style={{ padding: '0 4px', flexShrink: 0 }}
        >
          <span className="sortable-th-icon" aria-hidden>
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </div>
    </th>
  );
}

function CollapseIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`village-collapse-icon${open ? ' is-open' : ''}`}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
    >
      <path
        d="M9 6.5 15.5 12 9 17.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function VillageListeTab() {
  const { can } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [maisons, setMaisons] = useState<VillageMaison[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [tab, setTab] = useState<Tab>('village');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');
  const [maisonQuery, setMaisonQuery] = useState('');
  const [filterMaison, setFilterMaison] = useState('');
  const [maisonSuggestOpen, setMaisonSuggestOpen] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('maison');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    group: FamilyGroup;
    agent?: VillageAgentRow;
  } | null>(null);

  const canAssign = can('village.maisons', 'edit')
    || can('village.dependants-liste', 'edit');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resEmployees, resDependants, resMaisons] = await Promise.all([
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/dependants', { cache: 'no-store' }),
        fetch('/api/village/maisons', { cache: 'no-store' }),
      ]);
      const employeesJson = (await resEmployees.json()) as Employee[] | { error?: string };
      const dependantsJson = (await resDependants.json()) as { dependants?: Dependant[] };
      const maisonsJson = (await resMaisons.json()) as {
        maisons?: VillageMaison[];
        error?: string;
      };
      setEmployees(Array.isArray(employeesJson) ? employeesJson : []);
      setDependants(dependantsJson.dependants ?? []);
      setMaisons(Array.isArray(maisonsJson.maisons) ? maisonsJson.maisons : []);
    } catch {
      setEmployees([]);
      setDependants([]);
      setMaisons([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setColFilters(EMPTY_FILTERS);
  }, [tab]);

  const zamba = useMemo(
    () => buildZambaAgentsFromEmployees(employees, dependants),
    [employees, dependants],
  );
  const { village: villageList, kimpese: kimpeseList } = useMemo(
    () => splitVillageKimpese(zamba),
    [zamba],
  );
  const agents = tab === 'village' ? villageList : kimpeseList;
  const groups = useMemo(
    () => buildVillageFamilyGroups(agents, dependants),
    [agents, dependants],
  );

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of maisons) {
      const t = (m.typeMaison || m.taille || '').trim();
      if (t) set.add(t);
    }
    for (const a of agents) {
      const t = (a.typeMaison || '').trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [maisons, agents]);

  const deptOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      const d = (a.departement || '').trim();
      if (d) set.add(d);
    }
    const hasHorsEffectif = maisons.some((m) => {
      const ext = m.occupantExterne?.trim();
      if (!ext) return false;
      const key = m.numero.trim().toLowerCase();
      return !villageList.some((a) => a.numeroVilla.trim().toLowerCase() === key);
    });
    if (hasHorsEffectif) set.add(HORS_EFFECTIF_DEPT);
    return [...set].sort((a, b) => {
      if (a === HORS_EFFECTIF_DEPT) return 1;
      if (b === HORS_EFFECTIF_DEPT) return -1;
      return a.localeCompare(b, 'fr');
    });
  }, [agents, maisons, villageList]);

  const toolbarFilteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((group) => {
      const agent = agents.find((a) => a.matricule === group.matricule);
      const maison = agent?.numeroVilla || group.employee.numeroVilla || '';
      const type = agent?.typeMaison || group.employee.typeMaison || '';
      const dept = agent?.departement || group.employee.departement || '';
      if (filterMaison && maison !== filterMaison) return false;
      if (
        !filterMaison
        && maisonQuery.trim()
        && !maison.toLowerCase().includes(maisonQuery.trim().toLowerCase())
      ) {
        return false;
      }
      if (filterType && type !== filterType) return false;
      // Hors effectif = non-employés : masquer les familles employés
      if (filterDept === HORS_EFFECTIF_DEPT) return false;
      if (filterDept && dept !== filterDept) return false;
      if (!q) return true;
      const hay = [
        group.matricule,
        group.employee.nom,
        group.employee.statut,
        maison,
        type,
        dept,
        ...group.famille.map((m) => m.nom),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [groups, agents, search, filterMaison, maisonQuery, filterType, filterDept]);

  const groupCell = useCallback(
    (group: FamilyGroup, key: FilterKey): string => {
      const agent = agents.find((a) => a.matricule === group.matricule);
      switch (key) {
        case 'matricule':
          return group.matricule;
        case 'nom':
          return group.employee.nom;
        case 'statut':
          return group.employee.statut;
        case 'maison':
          return agent?.numeroVilla || group.employee.numeroVilla || '';
        case 'type':
          return agent?.typeMaison || group.employee.typeMaison || '';
        case 'departement':
          return agent?.departement || group.employee.departement || '';
        case 'famille':
          return `${group.famille.length} dépendant${group.famille.length !== 1 ? 's' : ''}`;
        default:
          return '';
      }
    },
    [agents],
  );

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarFilteredGroups, {
        matricule: (g) => groupCell(g, 'matricule'),
        nom: (g) => groupCell(g, 'nom'),
        statut: (g) => groupCell(g, 'statut'),
        maison: (g) => groupCell(g, 'maison'),
        type: (g) => groupCell(g, 'type'),
        departement: (g) => groupCell(g, 'departement'),
        famille: (g) => groupCell(g, 'famille'),
      }),
    [toolbarFilteredGroups, groupCell],
  );

  const filteredSortedGroups = useMemo(() => {
    let list = toolbarFilteredGroups.filter((group) =>
      (Object.keys(colFilters) as FilterKey[]).every((key) =>
        matchesColumnFilter(colFilters[key], groupCell(group, key)),
      ),
    );

    const dir = sortDir === 'asc' ? 1 : -1;
    list = [...list].sort((ga, gb) => {
      const aa = agents.find((a) => a.matricule === ga.matricule);
      const ab = agents.find((a) => a.matricule === gb.matricule);
      const maisonA = aa?.numeroVilla || ga.employee.numeroVilla || '';
      const maisonB = ab?.numeroVilla || gb.employee.numeroVilla || '';
      let cmp = 0;
      switch (sortKey) {
        case 'matricule':
          cmp = compareText(ga.matricule, gb.matricule);
          break;
        case 'nom':
          cmp = compareText(ga.employee.nom, gb.employee.nom);
          break;
        case 'statut':
          cmp = compareText(ga.employee.statut, gb.employee.statut);
          break;
        case 'maison':
          cmp = compareMaisonNumero(maisonA, maisonB);
          break;
        case 'type':
          cmp = compareText(
            aa?.typeMaison || ga.employee.typeMaison || '',
            ab?.typeMaison || gb.employee.typeMaison || '',
          );
          break;
        case 'departement':
          cmp = compareText(
            aa?.departement || ga.employee.departement || '',
            ab?.departement || gb.employee.departement || '',
          );
          break;
        case 'famille':
          cmp = compareNumber(ga.famille.length, gb.famille.length);
          break;
        default:
          cmp = 0;
      }
      return cmp * dir;
    });
    return list;
  }, [
    toolbarFilteredGroups,
    colFilters,
    groupCell,
    agents,
    sortKey,
    sortDir,
  ]);

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const setColFilter = (key: FilterKey) => (next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const employeeVillaKeys = useMemo(() => {
    const set = new Set<string>();
    for (const a of villageList) {
      const key = a.numeroVilla.trim().toLowerCase();
      if (key) set.add(key);
    }
    return set;
  }, [villageList]);

  const horsEffectifMaisons = useMemo(
    () =>
      maisons.filter((m) => {
        const ext = m.occupantExterne?.trim();
        if (!ext) return false;
        return !employeeVillaKeys.has(m.numero.trim().toLowerCase());
      }),
    [maisons, employeeVillaKeys],
  );

  const externeCount = horsEffectifMaisons.length;

  const externeOccupants = useMemo(() => {
    if (tab !== 'village') return [];
    if (filterDept && filterDept !== HORS_EFFECTIF_DEPT) return [];
    const q = search.trim().toLowerCase();
    return horsEffectifMaisons
      .filter((m) => {
        if (filterMaison && m.numero !== filterMaison) return false;
        if (
          !filterMaison
          && maisonQuery.trim()
          && !m.numero.toLowerCase().includes(maisonQuery.trim().toLowerCase())
        ) {
          return false;
        }
        const type = (m.typeMaison || m.taille || '').trim();
        if (filterType && type !== filterType) return false;
        if (!q) return true;
        const hay = `${m.occupantExterne} ${m.numero} ${type}`.toLowerCase();
        return hay.includes(q);
      })
      .filter((m) => {
        const type = (m.typeMaison || m.taille || '').trim();
        return (
          matchesColumnFilter(colFilters.matricule, '') &&
          matchesColumnFilter(colFilters.nom, formatDisplayName(m.occupantExterne)) &&
          matchesColumnFilter(colFilters.statut, 'Hors effectif') &&
          matchesColumnFilter(colFilters.maison, m.numero) &&
          matchesColumnFilter(colFilters.type, type) &&
          matchesColumnFilter(colFilters.departement, HORS_EFFECTIF_DEPT) &&
          matchesColumnFilter(colFilters.famille, '')
        );
      })
      .sort((a, b) => {
        if (sortKey === 'maison') {
          return compareMaisonNumero(a.numero, b.numero) * (sortDir === 'asc' ? 1 : -1);
        }
        if (sortKey === 'nom') {
          return (
            compareText(a.occupantExterne, b.occupantExterne) * (sortDir === 'asc' ? 1 : -1)
          );
        }
        if (sortKey === 'type') {
          return (
            compareText(a.typeMaison || a.taille, b.typeMaison || b.taille)
            * (sortDir === 'asc' ? 1 : -1)
          );
        }
        return compareMaisonNumero(a.numero, b.numero);
      });
  }, [
    tab,
    horsEffectifMaisons,
    search,
    filterMaison,
    maisonQuery,
    filterType,
    filterDept,
    colFilters,
    sortKey,
    sortDir,
  ]);

  const toggle = (matricule: string) => {
    setExpanded((prev) => ({ ...prev, [matricule]: !prev[matricule] }));
  };

  const onSort = (column: string) => {
    const next = toggleSortDir(sortKey, sortDir, column);
    setSortKey(next.key as SortKey);
    setSortDir(next.dir);
  };

  const maisonSuggestions = useMemo(() => {
    const q = maisonQuery.trim().toLowerCase();
    const sorted = [...maisons].sort((a, b) => compareMaisonNumero(a.numero, b.numero));
    if (!q) return sorted.slice(0, 12);
    return sorted
      .filter((m) => m.numero.toLowerCase().includes(q))
      .slice(0, 12);
  }, [maisons, maisonQuery]);

  const assignMaison = async (matricule: string, numeroVilla: string, nom = '', ancienNumero = '') => {
    setAssigning(true);
    try {
      const res = await fetch('/api/village/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule,
          numeroVilla,
          setLocalisationZamba: Boolean(numeroVilla),
          nom,
          ancienNumero,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Affectation impossible');
      await showSuccess(numeroVilla ? `Maison ${numeroVilla} affectée` : 'Maison libérée');
      await load();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Affectation impossible');
    } finally {
      setAssigning(false);
    }
  };

  const openAssignDialog = async (group: FamilyGroup, currentVilla: string) => {
    if (assigning) return;
    const sortedMaisons = [...maisons].sort((a, b) =>
      compareMaisonNumero(a.numero, b.numero),
    );
    const inputOptions: Record<string, string> = {
      '': 'Aucune maison (Kimpese)',
    };
    for (const m of sortedMaisons) {
      const type = m.typeMaison || m.taille;
      inputOptions[m.numero] = type ? `${m.numero} · ${type}` : m.numero;
    }
    const chosen = await promptSelect(`Affecter — ${group.employee.nom}`, {
      text: 'Choisir une maison (liste complète)',
      inputOptions,
      inputValue: currentVilla || '',
      confirmText: 'Affecter',
    });
    if (chosen === null) return;
    await assignMaison(group.matricule, chosen, group.employee.nom, currentVilla);
  };

  const openContextMenu = (
    event: React.MouseEvent,
    group: FamilyGroup,
    agent?: VillageAgentRow,
  ) => {
    if (!canAssign) return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, group, agent });
  };

  const buildContextItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const currentVilla =
      contextMenu.agent?.numeroVilla || contextMenu.group.employee.numeroVilla || '';
    return [
      {
        id: 'assign',
        label: currentVilla ? 'Changer de maison…' : 'Affecter une maison…',
        icon: 'home',
        onClick: () => {
          void openAssignDialog(contextMenu.group, currentVilla);
        },
      },
      ...(currentVilla
        ? [
            {
              id: 'release',
              label: 'Libérer la maison',
              icon: 'toggle' as const,
              onClick: () => {
                void assignMaison(
                  contextMenu.group.matricule,
                  '',
                  contextMenu.group.employee.nom,
                  currentVilla,
                );
              },
            },
          ]
        : []),
      {
        id: 'expand',
        label: expanded[contextMenu.group.matricule] ? 'Replier la famille' : 'Déplier la famille',
        icon: 'view',
        onClick: () => toggle(contextMenu.group.matricule),
      },
    ];
  };

  if (loading) {
    return (
      <div className="panel panel-padded village-liste-panel">
        <VillageSkeleton variant="liste" />
      </div>
    );
  }

  return (
    <>
      <div className="panel panel-padded village-liste-panel">
        <div className="village-list-filters village-toolbar-row">
          <div className="tabs header-tabs header-tabs-compact village-liste-subtabs">
            <button
              type="button"
              className={`tab-btn tab-btn-sm${tab === 'village' ? ' active' : ''}`}
              onClick={() => setTab('village')}
            >
              Village ({villageList.length + externeCount})
            </button>
            <button
              type="button"
              className={`tab-btn tab-btn-sm${tab === 'kimpese' ? ' active' : ''}`}
              onClick={() => setTab('kimpese')}
            >
              Kimpese ({kimpeseList.length})
            </button>
          </div>
          <input
            type="search"
            className="search-input village-toolbar-search"
            placeholder="Rechercher matricule, nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="village-maison-suggest">
            <input
              type="search"
              className="filter-select village-toolbar-filter"
              placeholder="N° maison…"
              value={maisonQuery}
              onChange={(e) => {
                const value = e.target.value;
                setMaisonQuery(value);
                setFilterMaison('');
                setMaisonSuggestOpen(true);
              }}
              onFocus={() => setMaisonSuggestOpen(true)}
              onBlur={() => {
                window.setTimeout(() => setMaisonSuggestOpen(false), 150);
              }}
            />
            {maisonSuggestOpen && maisonSuggestions.length > 0 && (
              <ul className="village-maison-suggest-list" role="listbox">
                <li>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setMaisonQuery('');
                      setFilterMaison('');
                      setMaisonSuggestOpen(false);
                    }}
                  >
                    Toutes les maisons
                  </button>
                </li>
                {maisonSuggestions.map((m) => (
                  <li key={m.numero}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setMaisonQuery(m.numero);
                        setFilterMaison(m.numero);
                        setMaisonSuggestOpen(false);
                      }}
                    >
                      <strong>{m.numero}</strong>
                      {(m.typeMaison || m.taille) ? (
                        <span> · {m.typeMaison || m.taille}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select
            className="filter-select village-toolbar-filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">Tous les types</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            className="filter-select village-toolbar-filter"
            value={filterDept}
            onChange={(e) => setFilterDept(e.target.value)}
          >
            <option value="">Tous les départements</option>
            {deptOptions.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setColFilters(EMPTY_FILTERS)}
            >
              Effacer les filtres ({activeFilterCount})
            </button>
          ) : null}
        </div>

        <div className="dependants-table-wrap village-liste-table-scroll">
          <table className="dependants-table village-dependants-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <FilterSortTh
                  label="Matricule"
                  column="matricule"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  values={filterValues.matricule}
                  selected={colFilters.matricule}
                  onChange={setColFilter('matricule')}
                />
                <FilterSortTh
                  label="Nom"
                  column="nom"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  values={filterValues.nom}
                  selected={colFilters.nom}
                  onChange={setColFilter('nom')}
                />
                <FilterSortTh
                  label="Statut"
                  column="statut"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  values={filterValues.statut}
                  selected={colFilters.statut}
                  onChange={setColFilter('statut')}
                />
                <FilterSortTh
                  label="Maison"
                  column="maison"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  values={filterValues.maison}
                  selected={colFilters.maison}
                  onChange={setColFilter('maison')}
                />
                <FilterSortTh
                  label="Type"
                  column="type"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  values={filterValues.type}
                  selected={colFilters.type}
                  onChange={setColFilter('type')}
                />
                <FilterSortTh
                  label="Département"
                  column="departement"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  values={filterValues.departement}
                  selected={colFilters.departement}
                  onChange={setColFilter('departement')}
                />
                <FilterSortTh
                  label="Famille"
                  column="famille"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={onSort}
                  values={filterValues.famille}
                  selected={colFilters.famille}
                  onChange={setColFilter('famille')}
                />
              </tr>
            </thead>
            <tbody>
              {filteredSortedGroups.length === 0 && externeOccupants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    Aucune famille pour cette vue.
                  </td>
                </tr>
              ) : (
                <>
                  {filteredSortedGroups.flatMap((group) => {
                    const agent = agents.find((a) => a.matricule === group.matricule);
                    const isOpen = expanded[group.matricule] ?? false;
                    const members = group.famille;
                    const currentVilla = agent?.numeroVilla || group.employee.numeroVilla || '';
                    const head = (
                      <tr
                        key={group.matricule}
                        className={`dependants-family-row${canAssign ? ' has-context-menu' : ''}`}
                        onContextMenu={(e) => openContextMenu(e, group, agent)}
                      >
                        <td>
                          <button
                            type="button"
                            className="btn-icon village-collapse-btn"
                            aria-expanded={isOpen}
                            onClick={() => toggle(group.matricule)}
                            title={isOpen ? 'Replier' : 'Déplier'}
                          >
                            <CollapseIcon open={isOpen} />
                          </button>
                        </td>
                        <td>{group.matricule}</td>
                        <td><strong>{group.employee.nom}</strong></td>
                        <td>{group.employee.statut}</td>
                        <td>{currentVilla || '—'}</td>
                        <td>{agent?.typeMaison || group.employee.typeMaison || '—'}</td>
                        <td>{agent?.departement || group.employee.departement || '—'}</td>
                        <td>{members.length} dépendant{members.length !== 1 ? 's' : ''}</td>
                      </tr>
                    );
                    if (!isOpen) return [head];
                    return [
                      head,
                      ...members.map((member) => (
                        <tr key={`${group.matricule}-${member.id}`} className="dependants-member-row">
                          <td />
                          <td>{member.matricule}</td>
                          <td>{member.nom}</td>
                          <td>
                            {/conjoint\s*employ/i.test(member.statut)
                              ? 'Conjoint employé'
                              : isSpouseStatut(member.statut)
                                ? 'Conjoint(e)'
                                : isChildStatut(member.statut)
                                  ? 'Enfant'
                                  : member.statut}
                          </td>
                          <td>{currentVilla || '—'}</td>
                          <td>{agent?.typeMaison || '—'}</td>
                          <td>{member.departement || '—'}</td>
                          <td />
                        </tr>
                      )),
                    ];
                  })}
                  {externeOccupants.map((m) => (
                    <tr key={`externe-${m.numero}`} className="village-externe-row">
                      <td />
                      <td>—</td>
                      <td>
                        <strong className="village-occupant-externe">
                          {formatDisplayName(m.occupantExterne)}
                        </strong>
                      </td>
                      <td>
                        <span className="village-occupant-externe">Hors effectif</span>
                      </td>
                      <td>{m.numero}</td>
                      <td>{m.typeMaison || m.taille || '—'}</td>
                      <td>
                        <span className="village-occupant-externe">Hors effectif</span>
                      </td>
                      <td>—</td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
