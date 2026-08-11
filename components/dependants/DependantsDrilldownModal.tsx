'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import DependantFamilyModal, { findFamilyGroup } from '@/components/dependants/DependantFamilyModal';
import DependantFormModal from '@/components/dependants/DependantFormModal';
import FamilyLocalisationModal from '@/components/dependants/FamilyLocalisationModal';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Dependant, DependantFormData } from '@/lib/dependants-types';
import {
  belongsToFamily,
  buildFamilyGroups,
  familyGroupKey,
  isEmployeeStatut,
  isSpouseStatut,
  type FamilyGroup,
} from '@/lib/dependants-utils';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

interface Props {
  title: string;
  dependants: Dependant[];
  /** Source complète pour retrouver la famille (view / localisation). */
  allDependants: Dependant[];
  onClose: () => void;
  onDependantSaved: (dependant: Dependant, action: 'create' | 'update') => void;
  onDependantDeleted: (id: number) => void;
  onFamilyUpdated: (dependants: Dependant[]) => void;
}

function memberMatchesSearch(item: Dependant, q: string): boolean {
  if (!q) return true;
  return (
    item.nom.toLowerCase().includes(q)
    || item.matricule.includes(q)
    || item.pactilis.toLowerCase().includes(q)
    || item.statut.toLowerCase().includes(q)
    || item.employeNom.toLowerCase().includes(q)
  );
}

export default function DependantsDrilldownModal({
  title,
  dependants,
  allDependants,
  onClose,
  onDependantSaved,
  onDependantDeleted,
  onFamilyUpdated,
}: Props) {
  const { can } = usePermissions();
  const canCreate = can('employes.dependants', 'create');
  const canEdit = can('employes.dependants', 'edit');
  const canDelete = can('employes.dependants', 'delete');

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; member: Dependant } | null>(null);
  const [viewGroup, setViewGroup] = useState<FamilyGroup | null>(null);
  const [formMember, setFormMember] = useState<Dependant | null>(null);
  const [addMatricule, setAddMatricule] = useState('');
  const [addLocalisation, setAddLocalisation] = useState('');
  const [localisationGroup, setLocalisationGroup] = useState<FamilyGroup | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const knownLocalisations = useMemo(
    () => [...new Set(allDependants.map((item) => item.localisation).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')),
    [allDependants],
  );

  const matchIds = useMemo(
    () => new Set(dependants.map((item) => item.id)),
    [dependants],
  );

  /** Familles : employé (même hors filtre) + enfants/conjoints ciblés. */
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buildFamilyGroups(allDependants)
      .map((group) => {
        const famille = group.famille.filter((member) => matchIds.has(member.id));
        const employeeMatched = matchIds.has(group.employee.id);
        return { ...group, famille, employeeMatched };
      })
      .filter((group) => group.famille.length > 0 || group.employeeMatched)
      .filter((group) => {
        if (!q) return true;
        if (memberMatchesSearch(group.employee, q)) return true;
        return group.famille.some((member) => memberMatchesSearch(member, q));
      })
      .map((group) => {
        if (!q) return group;
        const employeeHit = memberMatchesSearch(group.employee, q);
        return {
          ...group,
          famille: group.famille.filter((member) => memberMatchesSearch(member, q)),
          employeeMatched: group.employeeMatched && employeeHit,
        };
      })
      .filter((group) => group.famille.length > 0 || group.employeeMatched);
  }, [allDependants, matchIds, search]);

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const group of groups) next[group.matricule] = true;
    setExpanded(next);
  }, [groups]);

  const visibleCount = useMemo(
    () => groups.reduce(
      (sum, group) => sum + (matchIds.has(group.employee.id) ? 1 : 0) + group.famille.length,
      0,
    ),
    [groups, matchIds],
  );

  const toggleGroup = (matricule: string) => {
    setExpanded((prev) => ({ ...prev, [matricule]: !(prev[matricule] ?? true) }));
  };

  const openView = (member: Dependant) => {
    const group = findFamilyGroup(allDependants, member);
    if (group) setViewGroup(group);
  };

  const openFamilyLocalisation = (member: Dependant) => {
    const group = findFamilyGroup(allDependants, member);
    if (group) setLocalisationGroup(group);
  };

  const openAddMember = (matricule: string) => {
    const loc = allDependants.find(
      (item) => familyGroupKey(item) === matricule && isEmployeeStatut(item.statut),
    )?.localisation
      ?? allDependants.find((item) => familyGroupKey(item) === matricule)?.localisation
      ?? '';
    setAddMatricule(matricule);
    setAddLocalisation(loc);
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
      { id: 'view', label: 'Voir', icon: 'view', onClick: () => openView(member) },
    ];
    if (canCreate) {
      items.push({
        id: 'add',
        label: 'Ajouter un membre',
        icon: 'add',
        onClick: () => openAddMember(member.matricule),
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

  const openActions = (event: React.MouseEvent, member: Dependant) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({
      x: rect.left,
      y: rect.bottom + 4,
      member,
    });
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal dependants-drilldown-modal"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dependants-drilldown-title"
        >
          <div className="modal-header">
            <div>
              <h3 id="dependants-drilldown-title">{title}</h3>
              <p className="dependants-drilldown-meta">
                {visibleCount} bénéficiaire{visibleCount > 1 ? 's' : ''}
                {' · '}
                {groups.length} famille{groups.length > 1 ? 's' : ''}
                {search.trim() ? ' · filtrés' : ''}
              </p>
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>

          <div className="dependants-drilldown-toolbar">
            <input
              type="search"
              className="search-input"
              placeholder="Rechercher dans la liste…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="dependants-drilldown-table-wrap">
            {groups.length === 0 ? (
              <p className="empty-state">Aucun bénéficiaire.</p>
            ) : (
              <table className="dependants-drilldown-table">
                <thead>
                  <tr>
                    <th className="dependants-col-toggle" aria-label="Déplier" />
                    <th>Matricule</th>
                    <th>Nom</th>
                    <th>Statut</th>
                    <th>Sexe</th>
                    <th>Âge</th>
                    <th>Localisation</th>
                    <th>Pactilis</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => {
                    const isOpen = expanded[group.matricule] ?? true;
                    const hasFamily = group.famille.length > 0;
                    return (
                      <Fragment key={group.matricule}>
                        <tr
                          className="dependants-row-employee"
                          onDoubleClick={() => openView(group.employee)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setContextMenu({ x: event.clientX, y: event.clientY, member: group.employee });
                          }}
                        >
                          <td className="dependants-col-toggle">
                            {hasFamily ? (
                              <button
                                type="button"
                                className={`dependants-toggle-btn${isOpen ? ' is-open' : ''}`}
                                aria-expanded={isOpen}
                                onClick={() => toggleGroup(group.matricule)}
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            ) : null}
                          </td>
                          <td><strong>{group.employee.matricule}</strong></td>
                          <td><strong>{group.employee.nom}</strong></td>
                          <td>{group.employee.statut || '—'}</td>
                          <td>{group.employee.sexe || '—'}</td>
                          <td>{group.employee.age ?? '—'}</td>
                          <td>{group.employee.localisation.trim() || 'Non renseigné'}</td>
                          <td>{group.employee.pactilis || '—'}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={(event) => openActions(event, group.employee)}
                            >
                              Actions
                            </button>
                          </td>
                        </tr>
                        {isOpen && group.famille.map((member) => (
                          <tr
                            key={`${member.id}-${member.nom}`}
                            className={[
                              'dependants-row-family',
                              isSpouseStatut(member.statut) ? 'dependants-row-spouse' : '',
                            ].filter(Boolean).join(' ')}
                            onDoubleClick={() => openView(member)}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setContextMenu({ x: event.clientX, y: event.clientY, member });
                            }}
                          >
                            <td className="dependants-col-toggle" />
                            <td />
                            <td className="dependants-name-indent">{member.nom}</td>
                            <td>{member.statut || '—'}</td>
                            <td>{member.sexe || '—'}</td>
                            <td>{member.age ?? '—'}</td>
                            <td>{member.localisation.trim() || 'Non renseigné'}</td>
                            <td>{member.pactilis || '—'}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={(event) => openActions(event, member)}
                              >
                                Actions
                              </button>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
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
            setAddMatricule('');
            setAddLocalisation('');
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
              return key ? allDependants.filter((item) => belongsToFamily(item, key)) : [];
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

/** Utilitaire : bénéficiaires d’un site (y compris « Non renseigné »). */
export function dependantsForLocalisation(
  dependants: Dependant[],
  localisation: string,
): Dependant[] {
  if (localisation === 'Non renseigné' || localisation === '') {
    return dependants.filter((item) => !item.localisation.trim());
  }
  return dependants.filter((item) => item.localisation === localisation);
}

export function localisationLabel(value: string): string {
  return value.trim() || 'Non renseigné';
}
