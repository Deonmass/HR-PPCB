'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { isChildStatut, isSpouseStatut } from '@/lib/dependants-utils';
import { formatDisplayName } from '@/lib/format-display-name';
import { HORS_EFFECTIF_DEPT, type VillageDrilldownRow } from '@/lib/village-agents';

interface Props {
  title: string;
  rows: VillageDrilldownRow[];
  onClose: () => void;
  /** Affiche la colonne Localisation (ex. autres sites). */
  showLocalisation?: boolean;
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

function memberStatutLabel(statut: string): string {
  if (isSpouseStatut(statut)) return 'Conjoint(e)';
  if (isChildStatut(statut)) return 'Enfant';
  return statut || '—';
}

function rowMatchesSearch(row: VillageDrilldownRow, q: string): boolean {
  if (!q) return true;
  const hay = [
    row.matricule,
    row.nom,
    row.numeroVilla,
    row.typeMaison,
    row.departement,
    row.localisation ?? '',
    ...row.famille.map((m) => `${m.nom} ${m.matricule} ${m.statut}`),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export default function VillageDrilldownModal({
  title,
  rows,
  onClose,
  showLocalisation = false,
}: Props) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => rowMatchesSearch(row, q));
  }, [rows, search]);

  const toggle = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !(prev[id] ?? false) }));
  };

  return (
    <div className="modal-overlay open dashboard-list-overlay" onClick={onClose} role="presentation">
      <div
        className="modal dependants-drilldown-modal dashboard-list-modal village-drilldown-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            <p className="dependants-drilldown-meta">
              {filtered.length} élément{filtered.length !== 1 ? 's' : ''}
              {search.trim() && filtered.length !== rows.length
                ? ` sur ${rows.length}`
                : ''}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="dependants-drilldown-toolbar">
          <input
            type="search"
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher matricule, nom, maison…"
            autoFocus
          />
        </div>

        <div className="dependants-drilldown-table-wrap">
          {filtered.length === 0 ? (
            <p className="empty-state">Aucun élément à afficher.</p>
          ) : (
            <table className="dependants-drilldown-table village-drilldown-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }} />
                  <th>Matricule</th>
                  <th>Nom</th>
                  <th>Maison</th>
                  <th>Type</th>
                  <th>Département</th>
                  {showLocalisation ? <th>Localisation</th> : null}
                  <th>Famille</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const hasFamily = row.famille.length > 0;
                  const isOpen = expanded[row.id] ?? false;
                  const isHorsEffectif =
                    row.externe || row.departement === HORS_EFFECTIF_DEPT;
                  return (
                    <Fragment key={row.id}>
                      <tr
                        className={`dependants-family-row${row.emptyMaison ? ' village-drilldown-empty' : ''}`}
                      >
                        <td>
                          {hasFamily ? (
                            <button
                              type="button"
                              className="btn-icon village-collapse-btn"
                              aria-expanded={isOpen}
                              onClick={() => toggle(row.id)}
                              title={isOpen ? 'Replier' : 'Déplier'}
                            >
                              <CollapseIcon open={isOpen} />
                            </button>
                          ) : null}
                        </td>
                        <td>{row.matricule || '—'}</td>
                        <td>
                          {row.emptyMaison ? (
                            <span className="village-drilldown-vide">Vide</span>
                          ) : isHorsEffectif ? (
                            <strong className="village-occupant-externe">
                              {formatDisplayName(row.nom)}
                            </strong>
                          ) : (
                            <strong>{formatDisplayName(row.nom)}</strong>
                          )}
                        </td>
                        <td>
                          <strong>{row.numeroVilla || '—'}</strong>
                        </td>
                        <td>{row.typeMaison || '—'}</td>
                        <td>
                          {isHorsEffectif ? (
                            <span className="village-occupant-externe">
                              {row.departement || HORS_EFFECTIF_DEPT}
                            </span>
                          ) : (
                            row.departement || '—'
                          )}
                        </td>
                        {showLocalisation ? (
                          <td>{row.localisation || '—'}</td>
                        ) : null}
                        <td>
                          {row.emptyMaison
                            ? '—'
                            : `${row.famille.length} dépendant${row.famille.length !== 1 ? 's' : ''}`}
                        </td>
                      </tr>
                      {isOpen &&
                        hasFamily &&
                        row.famille.map((member) => (
                          <tr
                            key={`${row.id}-${member.id}`}
                            className="dependants-member-row"
                          >
                            <td />
                            <td>{member.matricule}</td>
                            <td>{formatDisplayName(member.nom)}</td>
                            <td>{row.numeroVilla || '—'}</td>
                            <td>{row.typeMaison || '—'}</td>
                            <td>{member.departement || '—'}</td>
                            {showLocalisation ? (
                              <td>{member.localisation || row.localisation || '—'}</td>
                            ) : null}
                            <td>{memberStatutLabel(member.statut)}</td>
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
  );
}
