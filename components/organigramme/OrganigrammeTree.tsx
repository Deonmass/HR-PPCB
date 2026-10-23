'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  countPosteDescendants,
  groupOrgNodesByPoste,
  type OrgChartNode,
  type OrgPosteGroup,
  type OrgPosteMember,
} from '@/lib/organigramme';

type Props = {
  roots: OrgChartNode[];
  search: string;
  expandAllKey: number;
  collapseAllKey: number;
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function memberMatches(member: OrgPosteMember, q: string): boolean {
  if (!q) return true;
  return fold(
    `${member.nom} ${member.matricule} ${member.departement} ${member.service} ${member.contractantName || ''}`,
  ).includes(q);
}

function groupMatches(group: OrgPosteGroup, q: string): boolean {
  if (!q) return true;
  if (fold(group.jobTitle).includes(q)) return true;
  if (group.members.some((m) => memberMatches(m, q))) return true;
  return group.children.some((c) => groupMatches(c, q));
}

function initials(nom: string): string {
  const parts = nom
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function displayName(nom: string): string {
  return nom.trim().toUpperCase();
}

function PosteCard({
  group,
  depth,
  search,
  forceExpand,
  forceCollapse,
}: {
  group: OrgPosteGroup;
  depth: number;
  search: string;
  forceExpand: number;
  forceCollapse: number;
}) {
  const q = fold(search.trim());
  const hasChildren = group.children.length > 0;
  const [open, setOpen] = useState(depth < 2);

  useEffect(() => {
    if (forceExpand > 0) setOpen(true);
  }, [forceExpand]);

  useEffect(() => {
    if (forceCollapse > 0) setOpen(depth === 0);
  }, [forceCollapse, depth]);

  useEffect(() => {
    if (q) setOpen(true);
  }, [q]);

  if (!groupMatches(group, q)) return null;

  const visibleChildren = q
    ? group.children.filter((c) => groupMatches(c, q))
    : group.children;
  const reports = countPosteDescendants(group);
  const multi = group.members.length > 1;
  const hit = q
    ? fold(group.jobTitle).includes(q) || group.members.some((m) => memberMatches(m, q))
    : false;
  const outside = group.members.some((m) => m.isOutsideScope);
  const external = group.members.every((m) => m.isExternal);
  const contractant = Boolean(group.isContractant);
  const companyLabel = group.members.find((m) => m.contractantName)?.contractantName;

  return (
    <li className={`org-chart-node${hasChildren && open ? ' has-open-children' : ''}`}>
      <div
        className={[
          'org-chart-card',
          multi ? 'is-multi' : '',
          external ? 'is-external' : '',
          outside ? 'is-outside' : '',
          contractant ? 'is-contractant' : '',
          hit ? 'is-hit' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="org-chart-card-avatars" aria-hidden>
          {group.members.slice(0, multi ? 4 : 1).map((m) => (
            <span
              key={m.id}
              className={`org-chart-avatar${m.isExternal ? ' is-vacant' : ''}${m.isContractant ? ' is-contractant' : ''}`}
              title={m.nom}
            >
              {m.isExternal ? '·' : initials(m.nom)}
            </span>
          ))}
          {group.members.length > 4 ? (
            <span className="org-chart-avatar is-more">+{group.members.length - 4}</span>
          ) : null}
        </div>

        <div className="org-chart-card-title">{group.jobTitle || '—'}</div>

        <div className="org-chart-card-people">
          {group.members.map((m) => (
            <div
              key={m.id}
              className={`org-chart-person${q && memberMatches(m, q) ? ' is-hit' : ''}`}
            >
              <span className="org-chart-person-name">{displayName(m.nom)}</span>
              {m.matricule ? <span className="org-chart-person-meta">{m.matricule}</span> : null}
            </div>
          ))}
        </div>

        <div className="org-chart-card-foot">
          {contractant ? <span className="org-chart-pill is-contractant">Contractant</span> : null}
          {contractant && companyLabel && companyLabel !== group.jobTitle ? (
            <span className="org-chart-pill is-contractant" title={companyLabel}>
              {companyLabel.length > 18 ? `${companyLabel.slice(0, 16)}…` : companyLabel}
            </span>
          ) : null}
          {multi ? <span className="org-chart-pill">{group.members.length} pers.</span> : null}
          {reports > 0 ? <span className="org-chart-pill">{reports} N-1</span> : null}
          {outside ? <span className="org-chart-pill is-warn">Hors périmètre</span> : null}
          {external ? <span className="org-chart-pill is-warn">Externe</span> : null}
          {hasChildren ? (
            <button
              type="button"
              className="org-chart-expand"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? '−' : '+'}
            </button>
          ) : null}
        </div>
      </div>

      {hasChildren && open && visibleChildren.length > 0 ? (
        <ul className="org-chart-children">
          {visibleChildren.map((child) => (
            <PosteCard
              key={child.id}
              group={child}
              depth={depth + 1}
              search={search}
              forceExpand={forceExpand}
              forceCollapse={forceCollapse}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function OrganigrammeTree({
  roots,
  search,
  expandAllKey,
  collapseAllKey,
}: Props) {
  const groups = useMemo(() => groupOrgNodesByPoste(roots), [roots]);

  const visible = useMemo(() => {
    const q = fold(search.trim());
    if (!q) return groups;
    return groups.filter((g) => groupMatches(g, q));
  }, [groups, search]);

  if (visible.length === 0) {
    return (
      <p className="org-empty">
        {search.trim()
          ? 'Aucun résultat pour cette recherche.'
          : 'Aucun employé à afficher pour ce périmètre.'}
      </p>
    );
  }

  return (
    <div className="org-chart-scroll">
      <ul className="org-chart-roots">
        {visible.map((group) => (
          <PosteCard
            key={group.id}
            group={group}
            depth={0}
            search={search}
            forceExpand={expandAllKey}
            forceCollapse={collapseAllKey}
          />
        ))}
      </ul>
    </div>
  );
}
