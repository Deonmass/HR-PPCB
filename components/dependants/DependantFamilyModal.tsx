'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import type { Dependant } from '@/lib/dependants-types';
import {
  getDependantDocumentLinkLabel,
} from '@/lib/dependants-columns';
import {
  buildFamilyGroups,
  isChildStatut,
  isEmployeeStatut,
  isSpouseStatut,
  type FamilyGroup,
} from '@/lib/dependants-utils';

interface Props {
  group: FamilyGroup;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
  deletingMemberId?: number | null;
  onClose: () => void;
  onEdit: (member: Dependant) => void;
  onDelete: (member: Dependant) => void;
  onAddMember: (matricule: string) => void;
}

function DetailRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number | null | undefined;
  href?: string;
}) {
  return (
    <div className="dependant-detail-row">
      <span className="dependant-detail-label">{label}</span>
      {href ? (
        <a
          className="dependant-detail-value dependant-detail-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={href}
        >
          Ouvrir le document
        </a>
      ) : (
        <span className="dependant-detail-value">{value ?? '—'}</span>
      )}
    </div>
  );
}

function isFemaleSexe(sexe: string | null | undefined): boolean {
  const normalized = (sexe ?? '').trim().toUpperCase();
  return normalized === 'F' || normalized === 'FEMME';
}

function GenderAvatar({
  member,
  variant,
}: {
  member: Dependant;
  variant: 'employee' | 'spouse' | 'child' | 'other';
}) {
  const female = isFemaleSexe(member.sexe);
  const className = [
    'dependant-family-avatar',
    female ? 'is-female' : 'is-male',
    variant === 'employee' ? 'is-employee' : '',
    variant === 'spouse' ? 'is-spouse' : '',
    variant === 'child' ? 'is-child' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} aria-hidden>
      <svg viewBox="0 0 24 24" fill="currentColor">
        {female ? (
          <>
            <circle cx="12" cy="8" r="4" />
            <path d="M12 13c-4 0-6 2.2-6 5.5V21h12v-2.5C18 15.2 16 13 12 13z" />
          </>
        ) : (
          <>
            <circle cx="12" cy="7.5" r="4" />
            <path d="M6 21v-1.8c0-3.1 2.7-5.2 6-5.2s6 2.1 6 5.2V21H6z" />
          </>
        )}
      </svg>
    </div>
  );
}

function MemberNode({
  member,
  variant,
  canEdit,
  canDelete,
  isDeleting,
  onEdit,
  onDelete,
}: {
  member: Dependant;
  variant: 'employee' | 'spouse' | 'child' | 'other';
  canEdit: boolean;
  canDelete: boolean;
  isDeleting?: boolean;
  onEdit: (member: Dependant) => void;
  onDelete: (member: Dependant) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const menuItems: ContextMenuItem[] = [];
  if (canEdit) {
    menuItems.push({
      id: 'edit',
      label: 'Modifier',
      icon: 'edit',
      onClick: () => onEdit(member),
    });
  }
  if (canDelete) {
    menuItems.push({
      id: 'delete',
      label: 'Supprimer',
      icon: 'delete',
      danger: true,
      onClick: () => onDelete(member),
    });
  }

  const openMenu = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenu({ x: rect.right, y: rect.bottom + 4 });
  };

  return (
    <>
      <div className="dependant-family-node">
        {menuItems.length > 0 && (
          <button
            type="button"
            className="dependant-family-node-menu"
            aria-label="Actions"
            disabled={isDeleting}
            onClick={openMenu}
          >
            {isDeleting ? (
              <span className="btn-spinner dependant-family-node-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                <circle cx="12" cy="5" r="1.75" />
                <circle cx="12" cy="12" r="1.75" />
                <circle cx="12" cy="19" r="1.75" />
              </svg>
            )}
          </button>
        )}
        <GenderAvatar member={member} variant={variant} />
        <strong className="dependant-family-node-name" title={member.nom}>{member.nom}</strong>
        <span className="dependant-family-badge">{member.statut}</span>
        {member.lienDocument?.trim() && (
          <a
            className="dependant-family-doc-link"
            href={member.lienDocument.trim()}
            target="_blank"
            rel="noopener noreferrer"
            title={getDependantDocumentLinkLabel(member.statut)}
            onClick={(event) => event.stopPropagation()}
          >
            Document
          </a>
        )}
        <span className="dependant-family-node-meta">
          {member.sexe}
          {member.age != null ? ` · ${member.age} ans` : ''}
          {member.localisation ? ` · ${member.localisation}` : ''}
        </span>
      </div>
      {menu && (
        <RowContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

function FamilyTreeConnector({
  hasSpouse,
  childCount,
}: {
  hasSpouse: boolean;
  childCount: number;
}) {
  if (childCount === 0) return null;

  const nodeW = 120;
  const parentGap = 20;
  const childGap = 16;
  const stemH = 14;
  const dropH = 14;

  const childrenWidth = childCount * nodeW + (childCount - 1) * childGap;
  const parentsWidth = hasSpouse ? nodeW * 2 + parentGap : nodeW;
  const width = Math.max(childrenWidth, parentsWidth);
  const height = stemH + dropH;
  const barY = stemH;

  const parentsStart = (width - parentsWidth) / 2;
  const parentLeftX = parentsStart + nodeW / 2;
  const parentRightX = hasSpouse ? parentsStart + nodeW + parentGap + nodeW / 2 : parentLeftX;
  const joinX = hasSpouse ? (parentLeftX + parentRightX) / 2 : parentLeftX;

  const childrenStart = (width - childrenWidth) / 2;
  const childCenters = Array.from({ length: childCount }, (_, index) => (
    childrenStart + index * (nodeW + childGap) + nodeW / 2
  ));

  const segments: string[] = [];

  if (hasSpouse) {
    segments.push(`M ${parentLeftX} 0 L ${parentRightX} 0`);
  }

  segments.push(`M ${joinX} 0 L ${joinX} ${barY}`);

  if (childCount === 1) {
    const childX = childCenters[0];
    if (Math.abs(joinX - childX) < 0.5) {
      segments.push(`M ${joinX} ${barY} L ${childX} ${height}`);
    } else {
      segments.push(`M ${joinX} ${barY} L ${childX} ${barY}`);
      segments.push(`M ${childX} ${barY} L ${childX} ${height}`);
    }
  } else {
    const leftX = childCenters[0];
    const rightX = childCenters[childCount - 1];
    segments.push(`M ${leftX} ${barY} L ${rightX} ${barY}`);
    childCenters.forEach((childX) => {
      segments.push(`M ${childX} ${barY} L ${childX} ${height}`);
    });
  }

  return (
    <svg
      className="dependant-family-tree-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      {segments.map((segment, index) => (
        <path
          key={index}
          d={segment}
          className="dependant-family-tree-svg-line"
          fill="none"
        />
      ))}
    </svg>
  );
}

export default function DependantFamilyModal({
  group,
  canEdit,
  canDelete,
  canCreate,
  deletingMemberId = null,
  onClose,
  onEdit,
  onDelete,
  onAddMember,
}: Props) {
  const spouse = group.famille.find((member) => isSpouseStatut(member.statut));
  const children = useMemo(
    () => group.famille
      .filter((member) => isChildStatut(member.statut))
      .sort((a, b) => (a.age ?? 999) - (b.age ?? 999)),
    [group.famille],
  );
  const others = group.famille.filter(
    (member) => !isSpouseStatut(member.statut) && !isChildStatut(member.statut),
  );

  const employeeVariant = isEmployeeStatut(group.employee.statut) ? 'employee' : 'other';

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal dependant-family-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header dependant-family-modal-header">
          <div>
            <h3>Famille — {group.employee.nom}</h3>
            <p className="modal-subtitle">Matricule {group.employee.matricule} · {group.employee.departement || '—'}</p>
          </div>
          <div className="dependant-family-modal-header-actions">
            {canCreate && (
              <button
                type="button"
                className="btn btn-accent btn-sm"
                onClick={() => onAddMember(group.matricule)}
              >
                + Ajouter un membre
              </button>
            )}
            <button type="button" className="modal-close" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="modal-body dependant-family-modal-body">
          <aside className="dependant-family-details-panel">
            <div className="dependant-details-grid">
              <DetailRow label="Matricule" value={group.employee.matricule} />
              <DetailRow label="N° Pactilis" value={group.employee.pactilis} />
              <DetailRow label="Statut" value={group.employee.statut} />
              <DetailRow label="Sexe" value={group.employee.sexe} />
              <DetailRow label="Localisation" value={group.employee.localisation} />
              <DetailRow label="Date naissance" value={group.employee.dateNaissance} />
              <DetailRow label="Âge" value={group.employee.age} />
              <DetailRow label="Composition" value={group.employee.compositionFamille} />
              <DetailRow label="Enfants" value={group.employee.enfants} />
              <DetailRow label="Total" value={group.employee.total} />
              <DetailRow label="Département" value={group.employee.departement} />
              <DetailRow label="Commentaires" value={group.employee.commentaires} />
              {group.employee.lienDocument?.trim() && (
                <DetailRow
                  label={getDependantDocumentLinkLabel(group.employee.statut)}
                  value={group.employee.lienDocument}
                  href={group.employee.lienDocument.trim()}
                />
              )}
              {spouse?.lienDocument?.trim() && (
                <DetailRow
                  label={`${getDependantDocumentLinkLabel(spouse.statut)} — ${spouse.nom}`}
                  value={spouse.lienDocument}
                  href={spouse.lienDocument.trim()}
                />
              )}
              {children.filter((child) => child.lienDocument?.trim()).map((child) => (
                <DetailRow
                  key={`doc-${child.id}`}
                  label={`${getDependantDocumentLinkLabel(child.statut)} — ${child.nom}`}
                  value={child.lienDocument}
                  href={child.lienDocument.trim()}
                />
              ))}
            </div>
          </aside>

          <section className="dependant-family-tree-panel">
            <div className="dependant-family-tree">
              <div className={`dependant-family-tree-parents${spouse ? ' has-couple' : ''}`}>
                <MemberNode
                  member={group.employee}
                  variant={employeeVariant}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  isDeleting={deletingMemberId === group.employee.id}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
                {spouse && (
                  <MemberNode
                    member={spouse}
                    variant="spouse"
                    canEdit={canEdit}
                    canDelete={canDelete}
                    isDeleting={deletingMemberId === spouse.id}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                )}
              </div>

              {children.length > 0 && (
                <>
                  <FamilyTreeConnector hasSpouse={Boolean(spouse)} childCount={children.length} />
                  <div className="dependant-family-tree-children">
                    {children.map((child) => (
                      <MemberNode
                        key={`${child.id}-${child.nom}`}
                        member={child}
                        variant="child"
                        canEdit={canEdit}
                        canDelete={canDelete}
                        isDeleting={deletingMemberId === child.id}
                        onEdit={onEdit}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </>
              )}

              {others.length > 0 && (
                <div className="dependant-family-tree-others">
                  {others.map((member) => (
                    <MemberNode
                      key={`${member.id}-${member.nom}`}
                      member={member}
                      variant="other"
                      canEdit={canEdit}
                      canDelete={canDelete}
                      isDeleting={deletingMemberId === member.id}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function findFamilyGroup(dependants: Dependant[], member: Dependant): FamilyGroup | null {
  const groups = buildFamilyGroups(dependants);
  return groups.find((g) => g.matricule === member.matricule) ?? null;
}
