'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DependantFamilyModal, { findFamilyGroup } from '@/components/dependants/DependantFamilyModal';
import DependantFormModal from '@/components/dependants/DependantFormModal';
import FamilyLocalisationModal from '@/components/dependants/FamilyLocalisationModal';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Dependant, DependantFormData } from '@/lib/dependants-types';
import {
  belongsToFamily,
  buildFamilyGroups,
  familyGroupKey,
  isConjointEmployeStatut,
  isEmployeeStatut,
  isSpouseStatut,
  type FamilyGroup,
} from '@/lib/dependants-utils';
import { getDependantDocumentLinkLabel } from '@/lib/dependants-columns';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

type FilterKey =
  | 'matricule'
  | 'pactilis'
  | 'statut'
  | 'sexe'
  | 'nom'
  | 'departement'
  | 'localisation'
  | 'age';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  matricule: [],
  pactilis: [],
  statut: [],
  sexe: [],
  nom: [],
  departement: [],
  localisation: [],
  age: [],
};

function ageFilterValue(age: number | null | undefined): string {
  return age == null ? '' : String(age);
}

function memberMatchesColFilters(
  item: Dependant,
  colFilters: Record<FilterKey, string[]>,
): boolean {
  return (
    matchesColumnFilter(colFilters.matricule, item.matricule) &&
    matchesColumnFilter(colFilters.pactilis, item.pactilis) &&
    matchesColumnFilter(colFilters.statut, item.statut) &&
    matchesColumnFilter(colFilters.sexe, item.sexe) &&
    matchesColumnFilter(colFilters.nom, item.nom) &&
    matchesColumnFilter(colFilters.departement, item.departement) &&
    matchesColumnFilter(colFilters.localisation, item.localisation) &&
    matchesColumnFilter(colFilters.age, ageFilterValue(item.age))
  );
}

export interface DependantFilters {
  search: string;
  statut: string;
  localisation: string;
  departement: string;
  /** Champ vide à rechercher (ex. localisation, pactilis…). */
  emptyField: string;
}

/** Valeur spéciale : localisation non renseignée. */
export const EMPTY_LOCALISATION_VALUE = '__empty__';

export const EMPTY_FIELD_OPTIONS = [
  { id: 'localisation', label: 'Localisation vide' },
  { id: 'pactilis', label: 'N° Pactilis vide' },
  { id: 'sexe', label: 'Sexe vide' },
  { id: 'dateNaissance', label: 'Date de naissance vide' },
  { id: 'lienDocument', label: 'Fichier / document vide' },
  { id: 'departement', label: 'Département vide' },
  { id: 'commentaires', label: 'Commentaires vides' },
  { id: 'numeroVilla', label: 'N° villa vide' },
  { id: 'typeMaison', label: 'Type maison vide' },
] as const;

export function isDependantFieldEmpty(item: Dependant, field: string): boolean {
  switch (field) {
    case 'localisation':
      return !item.localisation.trim();
    case 'pactilis':
      return !item.pactilis.trim();
    case 'sexe':
      return !item.sexe.trim();
    case 'dateNaissance':
      return !item.dateNaissance.trim();
    case 'lienDocument':
      return !item.lienDocument.trim();
    case 'departement':
      return !item.departement.trim();
    case 'commentaires':
      return !item.commentaires.trim();
    case 'numeroVilla':
      return !String(item.numeroVilla ?? '').trim();
    case 'typeMaison':
      return !String(item.typeMaison ?? '').trim();
    default:
      return false;
  }
}

interface FilterBarProps {
  dependants: Dependant[];
  filters: DependantFilters;
  onFiltersChange: (filters: DependantFilters) => void;
}

export function DependantsFilterBar({ dependants, filters, onFiltersChange }: FilterBarProps) {
  const statuts = useMemo(
    () => [...new Set(dependants.map((item) => item.statut).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [dependants],
  );
  const localisations = useMemo(
    () => [...new Set(dependants.map((item) => item.localisation).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [dependants],
  );
  const departements = useMemo(
    () => [...new Set(dependants.map((item) => item.departement).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr')),
    [dependants],
  );
  const hasEmptyLocalisation = useMemo(
    () => dependants.some((item) => !item.localisation.trim()),
    [dependants],
  );

  return (
    <div className="dependants-list-toolbar">
      <input
        type="search"
        className="search-input"
        placeholder="Rechercher nom, matricule, employé..."
        value={filters.search}
        onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
      />
      <select
        className="filter-select"
        value={filters.statut}
        onChange={(event) => onFiltersChange({ ...filters, statut: event.target.value })}
      >
        <option value="">Tous les statuts</option>
        {statuts.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select
        className="filter-select"
        value={filters.localisation}
        onChange={(event) => onFiltersChange({ ...filters, localisation: event.target.value })}
      >
        <option value="">Toutes les localisations</option>
        {hasEmptyLocalisation ? (
          <option value={EMPTY_LOCALISATION_VALUE}>Non renseigné</option>
        ) : null}
        {localisations.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select
        className="filter-select"
        value={filters.departement}
        onChange={(event) => onFiltersChange({ ...filters, departement: event.target.value })}
      >
        <option value="">Tous les départements</option>
        {departements.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <select
        className="filter-select"
        value={filters.emptyField}
        onChange={(event) => onFiltersChange({ ...filters, emptyField: event.target.value })}
        title="Filtrer les lignes avec une colonne vide"
      >
        <option value="">Colonnes vides…</option>
        {EMPTY_FIELD_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

interface Props {
  dependants: Dependant[];
  filters: DependantFilters;
  onDependantSaved: (dependant: Dependant, action: 'create' | 'update') => void;
  onDependantDeleted: (id: number) => void;
  onFamilyUpdated: (dependants: Dependant[]) => void;
  /** Liste des sortis (EXIT) : consultation seule. */
  readOnly?: boolean;
  /** Surligne les lignes (ex. scolarisés sans preuve). */
  highlightRow?: (dependant: Dependant) => boolean;
  /** Ne garde que les familles contenant au moins une ligne surlignée. */
  onlyHighlightedFamilies?: boolean;
  /** N'affiche dans la famille que les membres surlignés (ex. enfants ≥ 21 sans preuve). */
  onlyHighlightedMembers?: boolean;
  /** Déplie automatiquement les familles. */
  defaultExpandAll?: boolean;
}

interface FamilyDocLink {
  id: number;
  nom: string;
  statut: string;
  href: string;
  label: string;
}

function collectFamilyDocLinks(group: FamilyGroup): FamilyDocLink[] {
  return [group.employee, ...group.famille]
    .map((member) => {
      const href = member.lienDocument?.trim();
      if (!href) return null;
      return {
        id: member.id,
        nom: member.nom,
        statut: member.statut,
        href,
        label: getDependantDocumentLinkLabel(member.statut),
      };
    })
    .filter((item): item is FamilyDocLink => item != null);
}

export function matchesDependantFilters(
  item: Dependant,
  filters: DependantFilters,
): boolean {
  const q = filters.search.trim().toLowerCase();
  const matchSearch = !q
    || item.nom.toLowerCase().includes(q)
    || item.matricule.includes(q)
    || item.pactilis.includes(q)
    || item.employeNom.toLowerCase().includes(q)
    || item.departement.toLowerCase().includes(q);
  const matchStatut = !filters.statut || item.statut === filters.statut;
  const matchLocalisation = !filters.localisation
    || (filters.localisation === EMPTY_LOCALISATION_VALUE
      ? !item.localisation.trim()
      : item.localisation === filters.localisation);
  const matchDepartement = !filters.departement || item.departement === filters.departement;
  const matchEmpty = !filters.emptyField || isDependantFieldEmpty(item, filters.emptyField);
  return matchSearch && matchStatut && matchLocalisation && matchDepartement && matchEmpty;
}

function groupMatchesFilters(group: FamilyGroup, filters: DependantFilters): boolean {
  const members = [group.employee, ...group.famille];
  return members.some((item) => matchesDependantFilters(item, filters));
}

function AgeCell({ age }: { age: number | null }) {
  if (age == null) return <>—</>;
  return (
    <span className={age > 17 ? 'dependants-age-over' : undefined}>
      {age}
    </span>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function DocumentFileCell({ item }: { item: Dependant }) {
  const href = item.lienDocument?.trim();
  if (!href) {
    return <span className="dependants-file-empty">—</span>;
  }

  return (
    <a
      className="dependants-file-btn"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={getDependantDocumentLinkLabel(item.statut)}
      aria-label={`Ouvrir le document — ${item.nom}`}
      onClick={(event) => event.stopPropagation()}
    >
      <FileIcon />
    </a>
  );
}

function FamilyDocumentsCell({
  group,
  open,
  onToggle,
}: {
  group: FamilyGroup;
  open: boolean;
  onToggle: (anchor: HTMLElement | null) => void;
}) {
  const links = useMemo(() => collectFamilyDocLinks(group), [group]);
  const btnRef = useRef<HTMLButtonElement>(null);

  if (!links.length) {
    return <span className="dependants-file-empty">—</span>;
  }

  return (
    <button
      ref={btnRef}
      type="button"
      className={`dependants-file-btn${open ? ' is-open' : ''}`}
      title={`${links.length} document(s) dans la famille`}
      aria-label={`Voir les documents de la famille — ${group.employee.nom}`}
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(open ? null : btnRef.current);
      }}
    >
      <FileIcon />
      {links.length > 1 && (
        <span className="dependants-file-count">{links.length}</span>
      )}
    </button>
  );
}

function FamilyDocumentsPopover({
  group,
  anchor,
  onClose,
}: {
  group: FamilyGroup;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const links = useMemo(() => collectFamilyDocLinks(group), [group]);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = 280;
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8,
    );
    const top = Math.min(rect.bottom + 6, window.innerHeight - 8);
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="dependants-family-docs-popover"
      style={{ top: pos.top, left: pos.left }}
      role="dialog"
      aria-label="Documents de la famille"
    >
      <div className="dependants-family-docs-title">Documents — {group.employee.nom}</div>
      <ul className="dependants-family-docs-list">
        {links.map((link) => (
          <li key={link.id}>
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="dependants-family-docs-link"
            >
              <span className="dependants-family-docs-name">{link.nom}</span>
              <span className="dependants-family-docs-meta">
                {link.statut} · {link.label}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  );
}

export default function DependantsListTab({
  dependants,
  filters,
  onDependantSaved,
  onDependantDeleted,
  onFamilyUpdated,
  readOnly = false,
  highlightRow,
  onlyHighlightedFamilies = false,
  onlyHighlightedMembers = false,
  defaultExpandAll = false,
}: Props) {
  const { can } = usePermissions();
  const canCreate =
    !readOnly && can('employes.dependants', 'create');
  const canEdit =
    !readOnly && can('employes.dependants', 'edit');
  const canDelete =
    !readOnly && can('employes.dependants', 'delete');

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: Dependant } | null>(null);
  const [viewGroup, setViewGroup] = useState<FamilyGroup | null>(null);
  const [formMember, setFormMember] = useState<Dependant | null>(null);
  const [addMatricule, setAddMatricule] = useState('');
  const [addLocalisation, setAddLocalisation] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [localisationGroup, setLocalisationGroup] = useState<FamilyGroup | null>(null);
  const [docsPopover, setDocsPopover] = useState<{ group: FamilyGroup; anchor: HTMLElement } | null>(null);

  const knownLocalisations = useMemo(
    () => [...new Set(dependants.map((item) => item.localisation).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')),
    [dependants],
  );

  const toolbarGroups = useMemo(() => {
    const allGroups = buildFamilyGroups(dependants);
    const hasActiveFilters = Boolean(
      filters.search.trim()
      || filters.statut
      || filters.localisation
      || filters.departement
      || filters.emptyField,
    );

    let filtered = allGroups.filter((group) => groupMatchesFilters(group, filters));

    // Avec filtre : garder l'employé en tête et n'afficher sous collapse
    // que les enfants / conjoints qui matchent (sinon toute la famille).
    if (hasActiveFilters && !onlyHighlightedMembers) {
      filtered = filtered.map((group) => {
        const employeeMatches = matchesDependantFilters(group.employee, filters);
        const matchingFamille = group.famille.filter((member) =>
          matchesDependantFilters(member, filters),
        );
        return {
          ...group,
          famille: matchingFamille.length > 0 || !employeeMatches
            ? matchingFamille
            : group.famille,
        };
      }).filter((group) =>
        matchesDependantFilters(group.employee, filters) || group.famille.length > 0,
      );
    }

    if (!highlightRow || (!onlyHighlightedFamilies && !onlyHighlightedMembers)) return filtered;

    return filtered
      .map((group) => {
        if (!onlyHighlightedMembers) return group;
        return {
          ...group,
          famille: group.famille.filter((member) => highlightRow(member)),
        };
      })
      .filter((group) => {
        if (onlyHighlightedMembers) return group.famille.length > 0;
        return (
          highlightRow(group.employee)
          || group.famille.some((member) => highlightRow(member))
        );
      });
  }, [dependants, filters, onlyHighlightedFamilies, onlyHighlightedMembers, highlightRow]);

  const filterMembers = useMemo(() => {
    const rows: Dependant[] = [];
    for (const group of toolbarGroups) {
      rows.push(group.employee, ...group.famille);
    }
    return rows;
  }, [toolbarGroups]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(filterMembers, {
        matricule: (r) => r.matricule,
        pactilis: (r) => r.pactilis,
        statut: (r) => r.statut,
        sexe: (r) => r.sexe,
        nom: (r) => r.nom,
        departement: (r) => r.departement,
        localisation: (r) => r.localisation,
        age: (r) => ageFilterValue(r.age),
      }),
    [filterMembers],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const groups = useMemo(() => {
    if (activeFilterCount === 0) return toolbarGroups;
    return toolbarGroups
      .map((group) => {
        const employeeMatches = memberMatchesColFilters(group.employee, colFilters);
        const matchingFamille = group.famille.filter((member) =>
          memberMatchesColFilters(member, colFilters),
        );
        return {
          ...group,
          famille: matchingFamille.length > 0 || !employeeMatches
            ? matchingFamille
            : group.famille,
        };
      })
      .filter((group) =>
        memberMatchesColFilters(group.employee, colFilters) || group.famille.length > 0,
      );
  }, [toolbarGroups, colFilters, activeFilterCount]);

  useEffect(() => {
    if (!defaultExpandAll) return;
    const next: Record<string, boolean> = {};
    for (const group of groups) next[group.matricule] = true;
    setExpanded(next);
  }, [defaultExpandAll, groups]);

  const toggleGroup = (matricule: string) => {
    setExpanded((prev) => ({ ...prev, [matricule]: !(prev[matricule] ?? false) }));
  };

  const openView = (member: Dependant) => {
    const group = findFamilyGroup(dependants, member);
    if (group) setViewGroup(group);
  };

  const openFamilyLocalisation = (member: Dependant) => {
    const group = findFamilyGroup(dependants, member);
    if (group) setLocalisationGroup(group);
  };

  const openAddMember = (matricule: string) => {
    const employeeLoc = dependants.find(
      (item) => familyGroupKey(item) === matricule && isEmployeeStatut(item.statut),
    )?.localisation
      ?? dependants.find((item) => familyGroupKey(item) === matricule)?.localisation
      ?? '';
    setAddMatricule(matricule);
    setAddLocalisation(employeeLoc);
    setFormMember(null);
  };

  const handleSave = async (data: DependantFormData) => {
    const isEdit = formMember != null;
    const url = isEdit ? `/api/dependants/${formMember.id}` : '/api/dependants';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      await showError(err.error || 'Erreur lors de l\'enregistrement');
      throw new Error(err.error);
    }
    const saved = await res.json() as Dependant;
    setFormMember(null);
    setAddMatricule('');
    setAddLocalisation('');
    setViewGroup(null);
    onDependantSaved(saved, isEdit ? 'update' : 'create');
  };

  const handleFamilyLocalisation = async (localisation: string) => {
    if (!localisationGroup) return;
    const res = await fetch('/api/dependants/family-localisation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matricule: localisationGroup.matricule,
        localisation,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      await showError(err.error || 'Impossible d\'appliquer la localisation');
      throw new Error(err.error);
    }
    const data = await res.json() as { dependants: Dependant[] };
    onFamilyUpdated(data.dependants);
    await showSuccess(`Localisation « ${localisation} » appliquée à ${data.dependants.length} membre(s)`);
  };

  const handleDelete = async (member: Dependant) => {
    if (!(await confirmDelete('Supprimer ce bénéficiaire ?', member.nom))) return;
    setDeletingId(member.id);
    try {
      const res = await fetch(`/api/dependants/${member.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        await showError(err.error || 'Suppression impossible');
        return;
      }
      setViewGroup(null);
      onDependantDeleted(member.id);
    } finally {
      setDeletingId(null);
    }
  };

  const getContextMenuItems = (member: Dependant): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      {
        id: 'view',
        label: 'Voir',
        icon: 'view',
        onClick: () => openView(member),
      },
    ];
    if (canCreate) {
      items.push({
        id: 'add',
        label: 'Ajouter un membre',
        icon: 'add',
        onClick: () => openAddMember(familyGroupKey(member)),
      });
    }
    if (canEdit) {
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => {
          setFormMember(member);
          setAddMatricule('');
          setAddLocalisation('');
        },
      });
      if (isEmployeeStatut(member.statut)) {
        items.push({
          id: 'family-localisation',
          label: 'Localisation famille',
          icon: 'toggle',
          onClick: () => openFamilyLocalisation(member),
        });
      }
    }
    if (canDelete) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => void handleDelete(member),
      });
    }
    return items;
  };

  const openContextMenu = (event: React.MouseEvent, member: Dependant) => {
    event.preventDefault();
    event.stopPropagation();
    const items = getContextMenuItems(member);
    if (!items.length) return;
    setContextMenu({ x: event.clientX, y: event.clientY, member });
  };

  const renderRowCells = (
    item: Dependant,
    options?: {
      isEmployee?: boolean;
      indentName?: boolean;
      group?: FamilyGroup;
    },
  ) => {
    // Conjoint employé : reste dans la famille, mais affiche son propre matricule.
    const showOwnMatricule = Boolean(
      options?.isEmployee
      || isConjointEmployeStatut(item.statut)
      || (item.familyMatricule && item.matricule.trim() && item.matricule.trim() !== item.familyMatricule.trim()),
    );
    return (
    <>
      <td>{item.id || '—'}</td>
      <td>
        {showOwnMatricule ? (
          options?.isEmployee ? <strong>{item.matricule}</strong> : item.matricule
        ) : (
          ''
        )}
      </td>
      <td>{item.pactilis || '—'}</td>
      <td>{item.statut}</td>
      <td>{item.sexe}</td>
      <td className={options?.indentName ? 'dependants-name-indent' : undefined}>
        {options?.isEmployee ? <strong>{item.nom}</strong> : item.nom}
      </td>
      <td>{item.departement || '—'}</td>
      <td>{item.localisation}</td>
      <td><AgeCell age={item.age} /></td>
      <td className="dependants-col-file">
        {options?.isEmployee && options.group ? (
          <FamilyDocumentsCell
            group={options.group}
            open={docsPopover?.group.matricule === options.group.matricule}
            onToggle={(anchor) => {
              if (!anchor || !options.group) {
                setDocsPopover(null);
                return;
              }
              setDocsPopover({ group: options.group, anchor });
            }}
          />
        ) : (
          <DocumentFileCell item={item} />
        )}
      </td>
    </>
    );
  };

  return (
    <>
      <div className="dependants-list-body">
        <div className="panel dependants-list-panel">
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
                {groups.length} / {toolbarGroups.length} famille{toolbarGroups.length > 1 ? 's' : ''}
              </span>
            </div>
          ) : null}
          <div className="dependants-table-wrap">
            <table className="dependants-table">
              <thead>
                <tr>
                  <th className="dependants-col-toggle" aria-label="Déplier" />
                  <th className="dependants-col-num">N°</th>
                  <th className="dependants-col-matricule th-filter">
                    <TableHeaderFilter
                      label="Matricule"
                      values={filterValues.matricule}
                      selected={colFilters.matricule}
                      onChange={(next) => setColFilters((p) => ({ ...p, matricule: next }))}
                    />
                  </th>
                  <th className="dependants-col-pactilis th-filter">
                    <TableHeaderFilter
                      label="N° Pactilis"
                      values={filterValues.pactilis}
                      selected={colFilters.pactilis}
                      onChange={(next) => setColFilters((p) => ({ ...p, pactilis: next }))}
                    />
                  </th>
                  <th className="dependants-col-statut th-filter">
                    <TableHeaderFilter
                      label="Statut"
                      values={filterValues.statut}
                      selected={colFilters.statut}
                      onChange={(next) => setColFilters((p) => ({ ...p, statut: next }))}
                    />
                  </th>
                  <th className="dependants-col-sexe th-filter">
                    <TableHeaderFilter
                      label="Sexe"
                      values={filterValues.sexe}
                      selected={colFilters.sexe}
                      onChange={(next) => setColFilters((p) => ({ ...p, sexe: next }))}
                    />
                  </th>
                  <th className="dependants-col-nom th-filter">
                    <TableHeaderFilter
                      label="Nom et prénoms"
                      values={filterValues.nom}
                      selected={colFilters.nom}
                      onChange={(next) => setColFilters((p) => ({ ...p, nom: next }))}
                    />
                  </th>
                  <th className="dependants-col-dept th-filter">
                    <TableHeaderFilter
                      label="Département"
                      values={filterValues.departement}
                      selected={colFilters.departement}
                      onChange={(next) => setColFilters((p) => ({ ...p, departement: next }))}
                    />
                  </th>
                  <th className="dependants-col-loc th-filter">
                    <TableHeaderFilter
                      label="Localisation"
                      values={filterValues.localisation}
                      selected={colFilters.localisation}
                      onChange={(next) => setColFilters((p) => ({ ...p, localisation: next }))}
                    />
                  </th>
                  <th className="dependants-col-age th-filter">
                    <TableHeaderFilter
                      label="Âge"
                      values={filterValues.age}
                      selected={colFilters.age}
                      onChange={(next) => setColFilters((p) => ({ ...p, age: next }))}
                    />
                  </th>
                  <th className="dependants-col-file">Fichier</th>
                </tr>
              </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={11} className="empty-state">
                    {readOnly
                      ? 'Aucun bénéficiaire lié à un employé sorti (EXIT).'
                      : 'Aucun bénéficiaire pour ces filtres.'}
                  </td>
                </tr>
              ) : null}
              {groups.map((group) => {
                const isOpen = expanded[group.matricule] ?? false;
                const hasFamily = group.famille.length > 0;

                return (
                  <Fragment key={group.matricule}>
                    <tr
                      className={[
                        'dependants-row-employee',
                        'dependants-row-context',
                        hasFamily ? 'dependants-row-expandable' : '',
                        highlightRow?.(group.employee) ? 'dependants-row-scolarise' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={hasFamily ? () => toggleGroup(group.matricule) : undefined}
                      onContextMenu={(event) => openContextMenu(event, group.employee)}
                    >
                      <td className="dependants-col-toggle">
                        {hasFamily && (
                          <button
                            type="button"
                            className={`dependants-toggle-btn${isOpen ? ' is-open' : ''}`}
                            aria-expanded={isOpen}
                            aria-label={isOpen ? 'Replier la famille' : 'Déplier la famille'}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleGroup(group.matricule);
                            }}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </button>
                        )}
                      </td>
                      {renderRowCells(group.employee, { isEmployee: true, group })}
                    </tr>
                    {isOpen && group.famille.map((member) => (
                      <tr
                        key={`${member.id}-${member.matricule}-${member.nom}`}
                        className={[
                          'dependants-row-context',
                          'dependants-row-family',
                          isSpouseStatut(member.statut) ? 'dependants-row-spouse' : '',
                          highlightRow?.(member) ? 'dependants-row-scolarise' : '',
                        ].filter(Boolean).join(' ')}
                        onContextMenu={(event) => openContextMenu(event, member)}
                      >
                        <td className="dependants-col-toggle" />
                        {renderRowCells(member, { indentName: true })}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {contextMenu && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.member)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {docsPopover && (
        <FamilyDocumentsPopover
          group={docsPopover.group}
          anchor={docsPopover.anchor}
          onClose={() => setDocsPopover(null)}
        />
      )}

      {viewGroup && (
        <DependantFamilyModal
          group={viewGroup}
          canEdit={canEdit}
          canDelete={canDelete}
          canCreate={canCreate}
          deletingMemberId={deletingId}
          onClose={() => setViewGroup(null)}
          onEdit={(member) => {
            setViewGroup(null);
            setFormMember(member);
          }}
          onDelete={(member) => void handleDelete(member)}
          onAddMember={(matricule) => {
            setViewGroup(null);
            openAddMember(matricule);
          }}
        />
      )}

      {localisationGroup && (
        <FamilyLocalisationModal
          matricule={localisationGroup.matricule}
          employeeName={localisationGroup.employee.nom}
          currentLocalisation={localisationGroup.employee.localisation}
          knownLocalisations={knownLocalisations}
          onClose={() => setLocalisationGroup(null)}
          onApply={handleFamilyLocalisation}
        />
      )}

      {(formMember || addMatricule) && (
        <DependantFormModal
          dependant={formMember}
          familyMembers={
            (() => {
              const key = formMember ? familyGroupKey(formMember) : addMatricule;
              return key ? dependants.filter((item) => belongsToFamily(item, key)) : [];
            })()
          }
          defaultMatricule={addMatricule || (formMember ? familyGroupKey(formMember) : '')}
          defaultLocalisation={addLocalisation}
          onClose={() => {
            setFormMember(null);
            setAddMatricule('');
            setAddLocalisation('');
          }}
          onSave={handleSave}
        />
      )}

    </>
  );
}
