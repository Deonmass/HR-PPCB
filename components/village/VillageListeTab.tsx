'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import SortableTh, { type SortDir } from '@/components/SortableTh';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Dependant } from '@/lib/dependants-types';
import { isChildStatut, isSpouseStatut, type FamilyGroup } from '@/lib/dependants-utils';
import { promptSelect, showError, showSuccess } from '@/lib/swal';
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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    group: FamilyGroup;
    agent?: VillageAgentRow;
  } | null>(null);

  const canAssign = can('village.maisons', 'edit')
    || can('village.dependants-liste', 'edit')
    || can('employes.liste', 'edit')
    || can('employes.dependants', 'edit');

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

  const filteredSortedGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = groups.filter((group) => {
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
    groups,
    agents,
    search,
    filterMaison,
    maisonQuery,
    filterType,
    filterDept,
    sortKey,
    sortDir,
  ]);

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
        </div>

        <div className="dependants-table-wrap village-liste-table-scroll">
          <table className="dependants-table village-dependants-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <SortableTh label="Matricule" column="matricule" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Nom" column="nom" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Statut" column="statut" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Maison" column="maison" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Type" column="type" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Département" column="departement" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                <SortableTh label="Famille" column="famille" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
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
                            {isSpouseStatut(member.statut)
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
