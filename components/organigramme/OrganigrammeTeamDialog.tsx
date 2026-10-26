'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { isCapitalHrCompany, orgPersonShortName, type OrgPosteGroup, type OrgPosteMember } from '@/lib/organigramme';

type ManagerBucket = {
  key: string;
  nom: string;
  jobTitle: string;
  members: OrgPosteMember[];
};

type Props = {
  group: OrgPosteGroup;
  hasFiche: (matricule: string) => boolean;
  canEditMember?: (member: OrgPosteMember) => boolean;
  onOpenFiche: (member: OrgPosteMember) => void;
  onEditManager?: (member: OrgPosteMember) => void;
  onEditGroupManager?: () => void;
  onContextMenu?: (event: React.MouseEvent, member: OrgPosteMember) => void;
  onClose: () => void;
};

function initials(nom: string): string {
  const short = orgPersonShortName(nom);
  const parts = short.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function groupMembersByManager(members: OrgPosteMember[]): ManagerBucket[] {
  const map = new Map<string, ManagerBucket>();
  const order: string[] = [];
  for (const member of members) {
    const key = member.managerId || '';
    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        key: key || '__none__',
        nom: member.managerNom || '',
        jobTitle: member.managerJobTitle || '',
        members: [],
      };
      map.set(key, bucket);
      order.push(key);
    }
    bucket.members.push(member);
  }
  return order
    .map((key) => map.get(key)!)
    .sort((a, b) => {
      if (!a.nom && b.nom) return 1;
      if (a.nom && !b.nom) return -1;
      return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
    });
}

function personMeta(member: OrgPosteMember): string {
  return [member.matricule, member.departement, member.service].filter(Boolean).join(' · ');
}

function chunkMembers(members: OrgPosteMember[], size: number): OrgPosteMember[][] {
  const rows: OrgPosteMember[][] = [];
  const width = Math.max(1, size);
  for (let index = 0; index < members.length; index += width) {
    rows.push(members.slice(index, index + width));
  }
  return rows;
}

function IconMore() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export default function OrganigrammeTeamDialog({
  group,
  hasFiche,
  canEditMember,
  onOpenFiche,
  onEditManager,
  onEditGroupManager,
  onContextMenu,
  onClose,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [perRow, setPerRow] = useState(4);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.org-menu')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const measure = () => {
      const card = 148;
      const gap = 12;
      const count = Math.floor((node.clientWidth + gap) / (card + gap));
      setPerRow(Math.max(1, Math.min(4, count || 1)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const buckets = useMemo(() => groupMembersByManager(group.members), [group.members]);
  const countLabel = `${group.members.length} agent${group.members.length > 1 ? 's' : ''}`;
  const editableCount = group.members.filter((member) => canEditMember?.(member)).length;

  return (
    <div className="org-dialog-backdrop" onClick={onClose}>
      <div
        className="org-dialog org-team-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-team-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="org-team-head">
          <div>
            <h3 id="org-team-title">{group.jobTitle || 'Poste'}</h3>
            <p className="org-dialog-who">{countLabel}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>

        <div className="org-team-board" ref={boardRef}>
          {buckets.map((bucket) => (
            <section key={bucket.key} className="org-team-tree">
              <article className="org-team-card is-manager">
                <span className={`org-chart-avatar org-team-avatar${bucket.nom ? '' : ' is-vacant'}`} aria-hidden>
                  {bucket.nom ? initials(bucket.nom) : '·'}
                </span>
                <span className="org-team-kicker">N+1</span>
                <strong>{bucket.nom ? orgPersonShortName(bucket.nom) : 'Sans N+1'}</strong>
                {bucket.jobTitle ? <span>{bucket.jobTitle}</span> : null}
              </article>
              <div className="org-team-branch">
                {chunkMembers(bucket.members, perRow).map((row, rowIndex) => (
                  <div key={row[0]?.id || rowIndex} className="org-team-rank">
                    {rowIndex > 0 ? <div className="org-team-join" aria-hidden /> : null}
                    <ul className="org-team-level">
                      {row.map((member) => {
                        const meta = personMeta(member);
                        const openable = Boolean(member.matricule) && !member.isContractant && !member.isExternal && hasFiche(member.matricule);
                        const editable = Boolean(canEditMember?.(member) && onEditManager);
                        return (
                          <li key={member.id} className="org-team-node">
                            <article
                              className={`org-team-card${member.isContractant ? ' is-contractant' : ''}${member.isContractant && isCapitalHrCompany(member.contractantName || member.nom) ? ' is-capital-hr' : ''}`}
                              onContextMenu={onContextMenu ? (event) => onContextMenu(event, member) : undefined}
                            >
                              <span
                                className={`org-chart-avatar org-team-avatar${member.isExternal ? ' is-vacant' : ''}${member.isContractant ? ' is-contractant' : ''}${member.isContractant && isCapitalHrCompany(member.contractantName || member.nom) ? ' is-capital-hr' : ''}`}
                                aria-hidden
                              >
                                {member.isExternal ? '·' : initials(member.nom)}
                              </span>
                              {openable ? (
                                <button type="button" className="org-team-card-name" onClick={() => onOpenFiche(member)}>
                                  {orgPersonShortName(member.nom) || member.nom}
                                </button>
                              ) : (
                                <strong className="org-team-card-name">{orgPersonShortName(member.nom) || member.nom}</strong>
                              )}
                              {meta ? <span className="org-team-card-meta">{meta}</span> : null}
                              <div className="org-team-card-tools">
                                {editable ? (
                                  <button type="button" className="org-team-mini" onClick={() => onEditManager?.(member)}>
                                    N+1
                                  </button>
                                ) : null}
                                {onContextMenu ? (
                                  <button
                                    type="button"
                                    className="org-chart-tool"
                                    aria-label={`Actions de ${orgPersonShortName(member.nom) || member.nom}`}
                                    onClick={(event) => onContextMenu(event, member)}
                                  >
                                    <IconMore />
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        {editableCount > 1 && onEditGroupManager ? (
          <div className="org-team-group-action">
            <button type="button" className="btn btn-secondary btn-sm" onClick={onEditGroupManager}>
              N+1 du groupe
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
