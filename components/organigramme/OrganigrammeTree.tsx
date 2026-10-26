'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import OrganigrammeTeamDialog from '@/components/organigramme/OrganigrammeTeamDialog';
import {
  countPosteDescendants,
  groupOrgNodesByPoste,
  isCapitalHrCompany,
  orgPersonShortName,
  type OrgChartNode,
  type OrgPosteGroup,
  type OrgPosteMember,
} from '@/lib/organigramme';

export type OrgPersonTarget = {
  matricule: string;
  nom: string;
  jobTitle: string;
  departement: string;
  service: string;
  isContractant?: boolean;
  contractantId?: string;
  contractantEmployeeId?: string;
};

type Props = {
  roots: OrgChartNode[];
  search: string;
  expandAllKey: number;
  collapseAllKey: number;
  zoom: number;
  canEdit: boolean;
  canEditContractant: boolean;
  hasFiche: (matricule: string) => boolean;
  onOpenFiche: (person: OrgPersonTarget) => void;
  onEditManager: (person: OrgPersonTarget) => void;
  onEditGroupManager: (people: OrgPersonTarget[]) => void;
  onEditRole: (person: OrgPersonTarget) => void;
};

type MenuState = {
  x: number;
  y: number;
  person: OrgPersonTarget | null;
  people: OrgPersonTarget[];
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
    `${member.nom} ${member.matricule} ${member.jobTitle} ${member.departement} ${member.service} ${member.contractantName || ''}`,
  ).includes(q);
}

function groupMatches(group: OrgPosteGroup, q: string): boolean {
  if (!q) return true;
  if (fold(group.jobTitle).includes(q)) return true;
  if (group.members.some((m) => memberMatches(m, q))) return true;
  return group.children.some((c) => groupMatches(c, q));
}

function initials(nom: string): string {
  const short = orgPersonShortName(nom);
  const parts = short.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function toTarget(member: OrgPosteMember, jobTitle: string): OrgPersonTarget {
  return {
    matricule: member.matricule,
    nom: member.nom,
    jobTitle: member.jobTitle || jobTitle,
    departement: member.departement,
    service: member.service,
    isContractant: member.isContractant,
    contractantId: member.contractantId,
    contractantEmployeeId: member.contractantEmployeeId,
  };
}

function IconChevron({ up }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {up ? <polyline points="6 14 12 8 18 14" /> : <polyline points="6 10 12 16 18 10" />}
    </svg>
  );
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

function PosteCard({
  group,
  depth,
  search,
  forceExpand,
  forceCollapse,
  hasFiche,
  canEditMember,
  onOpenMenu,
  onOpenTeam,
}: {
  group: OrgPosteGroup;
  depth: number;
  search: string;
  forceExpand: number;
  forceCollapse: number;
  hasFiche: (matricule: string) => boolean;
  canEditMember: (member: OrgPosteMember) => boolean;
  onOpenMenu: (event: React.MouseEvent, person: OrgPersonTarget | null, people: OrgPersonTarget[]) => void;
  onOpenTeam: (group: OrgPosteGroup) => void;
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
  const capitalHr = contractant && group.members.length > 0 && group.members.every((member) => (
    isCapitalHrCompany(member.contractantName || member.nom)
  ));
  const canOpenMember = (member: OrgPosteMember) => (
    canEditMember(member)
    || (!member.isContractant && !member.isExternal && hasFiche(member.matricule))
  );
  const editablePeople = group.members
    .filter((member) => canEditMember(member))
    .map((member) => toTarget(member, group.jobTitle));
  const openable = group.members.filter((member) => canOpenMember(member));

  const openCardMenu = (event: React.MouseEvent, member?: OrgPosteMember) => {
    if (openable.length === 0) return;
    let personMember: OrgPosteMember | undefined;
    if (member && canOpenMember(member)) {
      personMember = member;
    } else if (!member) {
      personMember = openable.find((item) => canEditMember(item))
        || openable.find((item) => !item.isContractant && hasFiche(item.matricule))
        || openable[0];
    }
    onOpenMenu(
      event,
      personMember ? toTarget(personMember, group.jobTitle) : null,
      editablePeople,
    );
  };

  return (
    <li className={`org-chart-node${hasChildren && open ? ' has-open-children' : ''}`}>
      <div
        className={[
          'org-chart-card',
          multi ? 'is-multi' : '',
          external ? 'is-external' : '',
          outside ? 'is-outside' : '',
          contractant ? 'is-contractant' : '',
          capitalHr ? 'is-capital-hr' : '',
          hit ? 'is-hit' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={multi ? 'Voir les agents' : undefined}
        onClick={(event) => {
          if (!multi) return;
          if ((event.target as HTMLElement).closest('button')) return;
          onOpenTeam(group);
        }}
        onContextMenu={(event) => {
          const row = (event.target as HTMLElement).closest('[data-org-person]');
          const id = row?.getAttribute('data-org-person');
          const member = id ? group.members.find((item) => item.id === id) : undefined;
          openCardMenu(event, member);
        }}
      >
        <div className="org-chart-card-avatars" aria-hidden>
          {group.members.slice(0, multi ? 4 : 1).map((m) => (
            <span
              key={m.id}
              className={`org-chart-avatar${m.isExternal ? ' is-vacant' : ''}${m.isContractant ? ' is-contractant' : ''}${m.isContractant && isCapitalHrCompany(m.contractantName || m.nom) ? ' is-capital-hr' : ''}`}
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
          {group.members.map((m) => {
            const short = orgPersonShortName(m.nom);
            return (
              <div
                key={m.id}
                data-org-person={m.id}
                className={`org-chart-person${q && memberMatches(m, q) ? ' is-hit' : ''}`}
              >
                <span className="org-chart-person-name" title={m.nom}>{short || m.nom}</span>
              </div>
            );
          })}
        </div>

        <div className="org-chart-card-foot">
          <div className="org-chart-card-pills">
            {multi ? <span className="org-chart-pill">{group.members.length} pers.</span> : null}
            {reports > 0 ? <span className="org-chart-pill">{reports} N-1</span> : null}
            {outside ? <span className="org-chart-pill is-warn">Hors périmètre</span> : null}
            {external ? <span className="org-chart-pill is-warn">Externe</span> : null}
          </div>
          <div className="org-chart-card-tools">
            {openable.length > 0 ? (
              <button
                type="button"
                className="org-chart-tool"
                title="Actions"
                aria-label="Actions de la carte"
                onClick={(event) => openCardMenu(event)}
              >
                <IconMore />
              </button>
            ) : null}
            {hasChildren ? (
              <button
                type="button"
                className="org-chart-tool"
                aria-expanded={open}
                title={open ? 'Replier' : 'Déplier'}
                aria-label={open ? 'Replier' : 'Déplier'}
                onClick={() => setOpen((v) => !v)}
              >
                <IconChevron up={open} />
              </button>
            ) : null}
          </div>
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
              hasFiche={hasFiche}
              canEditMember={canEditMember}
              onOpenMenu={onOpenMenu}
              onOpenTeam={onOpenTeam}
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
  zoom,
  canEdit,
  canEditContractant,
  hasFiche,
  onOpenFiche,
  onEditManager,
  onEditGroupManager,
  onEditRole,
}: Props) {
  const groups = useMemo(() => groupOrgNodesByPoste(roots), [roots]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [team, setTeam] = useState<OrgPosteGroup | null>(null);

  const visible = useMemo(() => {
    const q = fold(search.trim());
    if (!q) return groups;
    return groups.filter((g) => groupMatches(g, q));
  }, [groups, search]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: Event) => {
      const target = event.target;
      const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
      if (element?.closest('.org-menu')) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', close, true);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const canEditMember = (member: OrgPosteMember) => {
    if (member.isExternal) return false;
    if (member.isContractant) {
      return canEditContractant && Boolean(member.contractantId && member.contractantEmployeeId);
    }
    return canEdit && hasFiche(member.matricule);
  };

  const openMenu = (event: React.MouseEvent, person: OrgPersonTarget | null, people: OrgPersonTarget[]) => {
    const showFiche = Boolean(person && !person.isContractant && hasFiche(person.matricule));
    const showPerson = Boolean(person && (
      person.isContractant
        ? canEditContractant && person.contractantEmployeeId
        : canEdit && hasFiche(person.matricule)
    ));
    const showGroup = people.length > 1;
    const showRole = Boolean(person && !person.isContractant && canEdit && hasFiche(person.matricule));
    const count = [showFiche, showPerson, showGroup, showRole].filter(Boolean).length;
    if (count === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const width = 280;
    const height = 16 + count * 38;
    const tool = event.currentTarget instanceof HTMLElement && event.currentTarget.classList.contains('org-chart-tool')
      ? event.currentTarget
      : null;
    const rect = tool?.getBoundingClientRect();
    const anchorTop = rect ? rect.top : event.clientY;
    const anchorBottom = rect ? rect.bottom : event.clientY;
    const anchorRight = rect ? rect.right : event.clientX;
    const dialog = document.querySelector('.org-team-dialog');
    const box = dialog?.getBoundingClientRect();
    let left = anchorRight - width;
    let top = anchorTop - height - 8;
    if (top < (box?.top ?? 8) + 8) top = anchorBottom + 8;
    const minX = (box?.left ?? 8) + 8;
    const maxX = (box?.right ?? window.innerWidth) - width - 8;
    const minY = (box?.top ?? 8) + 8;
    const maxY = (box?.bottom ?? window.innerHeight) - height - 8;
    const x = Math.max(8, minX, Math.min(left, maxX, window.innerWidth - width - 8));
    const y = Math.max(8, minY, Math.min(top, maxY, window.innerHeight - height - 8));
    setMenu({ x, y, person, people });
  };

  if (visible.length === 0) {
    return (
      <p className="org-empty">
        {search.trim()
          ? 'Aucun résultat pour cette recherche.'
          : 'Aucun employé à afficher pour ce périmètre.'}
      </p>
    );
  }

  const ficheOk = Boolean(
    menu?.person && !menu.person.isContractant && hasFiche(menu.person.matricule),
  );
  const editPersonOk = Boolean(menu?.person && (
    menu.person.isContractant
      ? canEditContractant && menu.person.contractantId && menu.person.contractantEmployeeId
      : canEdit && hasFiche(menu.person.matricule)
  ));
  const editGroupOk = Boolean(menu && menu.people.length > 1);
  const editRoleOk = Boolean(
    menu?.person && !menu.person.isContractant && canEdit && hasFiche(menu.person.matricule),
  );

  return (
    <div className="org-chart-scroll" style={{ zoom }}>
      <ul className="org-chart-roots">
        {visible.map((group) => (
          <PosteCard
            key={group.id}
            group={group}
            depth={0}
            search={search}
            forceExpand={expandAllKey}
            forceCollapse={collapseAllKey}
            hasFiche={hasFiche}
            canEditMember={canEditMember}
            onOpenMenu={openMenu}
            onOpenTeam={setTeam}
          />
        ))}
      </ul>
      {team && typeof document !== 'undefined'
        ? createPortal(
          <OrganigrammeTeamDialog
            group={team}
            hasFiche={hasFiche}
            canEditMember={canEditMember}
            onClose={() => setTeam(null)}
            onOpenFiche={(member) => {
              const person = toTarget(member, team.jobTitle);
              setTeam(null);
              onOpenFiche(person);
            }}
            onEditManager={(member) => {
              setTeam(null);
              onEditManager(toTarget(member, team.jobTitle));
            }}
            onEditGroupManager={team.members.filter(canEditMember).length > 1
              ? () => {
                const people = team.members.filter(canEditMember).map((member) => toTarget(member, team.jobTitle));
                setTeam(null);
                onEditGroupManager(people);
              }
              : undefined}
            onContextMenu={(event, member) => {
              const people = team.members.filter(canEditMember).map((item) => toTarget(item, team.jobTitle));
              const person = canEditMember(member) || (!member.isContractant && hasFiche(member.matricule))
                ? toTarget(member, team.jobTitle)
                : null;
              openMenu(event, person, people);
            }}
          />,
          document.body,
        )
        : null}
      {menu && typeof document !== 'undefined'
        ? createPortal(
          <div
            className="org-menu"
            style={{ left: menu.x, top: menu.y, zIndex: 130000 }}
            role="menu"
            onClick={(event) => event.stopPropagation()}
          >
            {ficheOk && menu.person ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const person = menu.person;
                  setMenu(null);
                  if (person) onOpenFiche(person);
                }}
              >
                Voir la fiche
              </button>
            ) : null}
            {editPersonOk && menu.person ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const person = menu.person;
                  setMenu(null);
                  if (person) onEditManager(person);
                }}
              >
                {menu.people.length > 1
                  ? `Modifier le N+1 de ${orgPersonShortName(menu.person.nom)}`
                  : 'Modifier N+1'}
              </button>
            ) : null}
            {editGroupOk ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const people = menu.people;
                  setMenu(null);
                  onEditGroupManager(people);
                }}
              >
                {`Modifier le N+1 du groupe (${menu.people.length})`}
              </button>
            ) : null}
            {editRoleOk && menu.person ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const person = menu.person;
                  setMenu(null);
                  if (person) onEditRole(person);
                }}
              >
                Changer de département et de poste
              </button>
            ) : null}
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}
