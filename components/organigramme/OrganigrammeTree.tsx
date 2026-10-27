'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import OrganigrammeTeamDialog from '@/components/organigramme/OrganigrammeTeamDialog';
import {
  countPosteDescendants,
  groupOrgNodesByPoste,
  isCapitalHrCompany,
  orgPersonShortName,
  orgSearchText,
  VACANT_POST_LABEL,
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
  onChangeDepartments?: (people: OrgPersonTarget[]) => void;
  selectionClearKey?: number;
};

type HiddenCard = {
  id: string;
  title: string;
  reports: number;
};

type MenuState = {
  x: number;
  y: number;
  person: OrgPersonTarget | null;
  people: OrgPersonTarget[];
  card: HiddenCard;
};

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function memberMatches(member: OrgPosteMember, q: string): boolean {
  if (!q) return true;
  const query = orgSearchText(q);
  return orgSearchText(
    `${member.nom} ${member.matricule} ${member.jobTitle} ${member.departement} ${member.service} ${member.contractantName || ''}`,
  ).includes(query);
}

function groupMatches(group: OrgPosteGroup, q: string): boolean {
  if (!q) return true;
  const query = orgSearchText(q);
  if (orgSearchText(group.jobTitle).includes(query)) return true;
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
  hiddenIds,
  selectedIds,
  onToggleSelect,
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
  hiddenIds: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string) => void;
  onOpenMenu: (event: React.MouseEvent, person: OrgPersonTarget | null, people: OrgPersonTarget[], card: HiddenCard) => void;
  onOpenTeam: (group: OrgPosteGroup) => void;
}) {
  const q = fold(search.trim());
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

  if (hiddenIds.has(group.id) || !groupMatches(group, q)) return null;

  const visibleChildren = (q
    ? group.children.filter((c) => groupMatches(c, q))
    : group.children
  ).filter((child) => !hiddenIds.has(child.id));
  const hasChildren = visibleChildren.length > 0;
  const reports = countPosteDescendants(group);
  const multi = group.members.length > 1;
  const hit = q
    ? fold(group.jobTitle).includes(q) || group.members.some((m) => memberMatches(m, q))
    : false;
  const outside = group.members.some((m) => m.isOutsideScope);
  const external = group.members.every((m) => m.isExternal);
  const contractant = Boolean(group.isContractant);
  const vacant = Boolean(group.isVacant);
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
  const selected = selectedIds.has(group.id);
  const selectable = editablePeople.length > 0;
  const openable = group.members.filter((member) => canOpenMember(member));

  const card: HiddenCard = {
    id: group.id,
    title: group.jobTitle || 'Carte',
    reports,
  };

  const openCardMenu = (event: React.MouseEvent, member?: OrgPosteMember) => {
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
      card,
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
          vacant ? 'is-vacant' : '',
          hit ? 'is-hit' : '',
          selected ? 'is-selected' : '',
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
          {vacant ? (
            <span className="org-chart-avatar is-poste-vacant" title={VACANT_POST_LABEL}>V</span>
          ) : group.members.slice(0, multi ? 4 : 1).map((m) => (
            <span
              key={m.id}
              className={`org-chart-avatar${m.isExternal ? ' is-vacant' : ''}${m.isContractant ? ' is-contractant' : ''}${m.isContractant && isCapitalHrCompany(m.contractantName || m.nom) ? ' is-capital-hr' : ''}`}
              title={m.nom}
            >
              {m.isExternal ? '·' : initials(m.nom)}
            </span>
          ))}
          {!vacant && group.members.length > 4 ? (
            <span className="org-chart-avatar is-more">+{group.members.length - 4}</span>
          ) : null}
        </div>

        <div className="org-chart-card-title">{group.jobTitle || '—'}</div>

        <div className="org-chart-card-people">
          {vacant ? (
            <div className="org-chart-person">
              <span className="org-chart-person-name">{VACANT_POST_LABEL}</span>
            </div>
          ) : group.members.map((m) => {
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
            {external && !vacant ? <span className="org-chart-pill is-warn">Externe</span> : null}
          </div>
          <div className="org-chart-card-tools">
            {selectable ? (
              <button
                type="button"
                className={`org-chart-tool org-chart-select${selected ? ' is-on' : ''}`}
                aria-pressed={selected}
                title={selected ? 'Retirer de la sélection' : 'Sélectionner cette carte'}
                aria-label={selected ? 'Retirer cette carte de la sélection' : 'Sélectionner cette carte'}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleSelect(group.id);
                }}
              >
                {selected ? '✓' : ''}
              </button>
            ) : null}
            <button
              type="button"
              className="org-chart-tool"
              title="Actions"
              aria-label="Actions de la carte"
              onClick={(event) => openCardMenu(event)}
            >
              <IconMore />
            </button>
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
              hiddenIds={hiddenIds}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
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
  onChangeDepartments,
  selectionClearKey = 0,
}: Props) {
  const groups = useMemo(() => groupOrgNodesByPoste(roots), [roots]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [team, setTeam] = useState<OrgPosteGroup | null>(null);
  const [hidden, setHidden] = useState<HiddenCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const hiddenIds = useMemo(() => new Set(hidden.map((card) => card.id)), [hidden]);

  useEffect(() => {
    if (selectionClearKey > 0) setSelectedIds(new Set());
  }, [selectionClearKey]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedPeople = useMemo(() => {
    if (!onChangeDepartments || selectedIds.size === 0) return [];
    const out: OrgPersonTarget[] = [];
    const seen = new Set<string>();
    const walk = (list: OrgPosteGroup[]) => {
      for (const group of list) {
        if (selectedIds.has(group.id)) {
          for (const member of group.members) {
            if (member.isExternal || member.isVacant) continue;
            const editable = member.isContractant
              ? canEditContractant && Boolean(member.contractantId && member.contractantEmployeeId)
              : canEdit && hasFiche(member.matricule);
            if (!editable) continue;
            const key = member.isContractant ? `c:${member.contractantEmployeeId}` : `i:${member.matricule}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(toTarget(member, group.jobTitle));
          }
        }
        walk(group.children);
      }
    };
    walk(groups);
    return out;
  }, [groups, selectedIds, onChangeDepartments, canEdit, canEditContractant, hasFiche]);

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

  const hideCard = (card: HiddenCard) => {
    setHidden((prev) => (prev.some((item) => item.id === card.id) ? prev : [...prev, card]));
    setMenu(null);
  };

  const showCard = (id: string) => {
    setHidden((prev) => prev.filter((item) => item.id !== id));
  };

  const openMenu = (event: React.MouseEvent, person: OrgPersonTarget | null, people: OrgPersonTarget[], card: HiddenCard) => {
    const showFiche = Boolean(person && !person.isContractant && hasFiche(person.matricule));
    const showPerson = Boolean(person && (
      person.isContractant
        ? canEditContractant && person.contractantEmployeeId
        : canEdit && hasFiche(person.matricule)
    ));
    const showGroup = people.length > 1;
    const showRole = Boolean(person && !person.isContractant && canEdit && hasFiche(person.matricule));
    const showSelect = Boolean(onChangeDepartments) && people.length > 0;
    const count = [showFiche, showPerson, showGroup, showRole, showSelect, true].filter(Boolean).length;
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
    setMenu({ x, y, person, people, card });
  };

  const hiddenBar = hidden.length > 0 ? (
    <div className="org-hidden-bar" aria-label="Cartes masquées">
      <span className="org-hidden-label">
        {hidden.length === 1 ? '1 carte masquée' : `${hidden.length} cartes masquées`}
      </span>
      {hidden.map((card) => (
        <span key={card.id} className="org-hidden-chip">
          <span>
            {card.title}
            {card.reports > 0 ? ` · ${card.reports} N-` : ''}
          </span>
          <button type="button" onClick={() => showCard(card.id)}>
            Afficher
          </button>
        </span>
      ))}
      {hidden.length > 1 ? (
        <button type="button" className="org-hidden-clear" onClick={() => setHidden([])}>
          Tout afficher
        </button>
      ) : null}
    </div>
  ) : null;

  const selectBar = onChangeDepartments && selectedIds.size > 0 ? (
    <div className="org-select-bar" aria-label="Cartes sélectionnées">
      <span className="org-hidden-label">
        {selectedIds.size === 1 ? '1 carte sélectionnée' : `${selectedIds.size} cartes sélectionnées`}
        {selectedPeople.length > 0
          ? ` · ${selectedPeople.length === 1 ? '1 agent' : `${selectedPeople.length} agents`}`
          : ''}
      </span>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        disabled={selectedPeople.length === 0}
        onClick={() => onChangeDepartments(selectedPeople)}
      >
        Changer le département
      </button>
      <button type="button" className="org-hidden-clear" onClick={() => setSelectedIds(new Set())}>
        Annuler
      </button>
    </div>
  ) : null;

  const shown = visible.filter((group) => !hiddenIds.has(group.id));

  if (shown.length === 0) {
    return (
      <>
        {selectBar}
        {hiddenBar}
        <p className="org-empty">
          {hidden.length > 0 && !search.trim()
            ? 'Toutes les cartes de ce niveau sont masquées.'
            : search.trim()
              ? 'Aucun résultat pour cette recherche.'
              : 'Aucun employé à afficher pour ce périmètre.'}
        </p>
      </>
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
  const selectOk = Boolean(onChangeDepartments && menu && menu.people.length > 0);

  return (
    <>
    {selectBar}
    {hiddenBar}
    <div className="org-chart-scroll" style={{ zoom }}>
      <ul className="org-chart-roots">
        {shown.map((group) => (
          <PosteCard
            key={group.id}
            group={group}
            depth={0}
            search={search}
            forceExpand={expandAllKey}
            forceCollapse={collapseAllKey}
            hasFiche={hasFiche}
            canEditMember={canEditMember}
            hiddenIds={hiddenIds}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
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
              openMenu(event, person, people, {
                id: team.id,
                title: team.jobTitle || 'Carte',
                reports: countPosteDescendants(team),
              });
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
            {selectOk && menu ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const id = menu.card.id;
                  setMenu(null);
                  toggleSelect(id);
                }}
              >
                {selectedIds.has(menu.card.id)
                  ? 'Retirer cette carte de la sélection'
                  : 'Sélectionner cette carte'}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="is-hide"
              onClick={() => hideCard(menu.card)}
            >
              {menu.card.reports > 0 ? 'Masquer cette carte et ses N-' : 'Masquer cette carte'}
            </button>
          </div>,
          document.body,
        )
        : null}
    </div>
    </>
  );
}
