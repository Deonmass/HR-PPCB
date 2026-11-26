'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import DashboardListModal, { type DashboardListRow } from '@/components/DashboardListModal';
import { usePermissions } from '@/contexts/PermissionContext';
import { defaultHrcoPeriod, HRCO_MONTHS, type HrcoCell, type HrcoNote, type HrcoPerson, type HrcoTable } from '@/lib/hrco-note';
import { showError } from '@/lib/swal';

type Drill = {
  title: string;
  matricules?: string[];
  hoursByMatricule?: Record<string, number>;
  detail?: Array<{ label: string; value: string }>;
  detailColumns?: { label: string; value: string };
};

const DRILL_COLUMNS = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'fonction', label: 'Fonction' },
  { key: 'departement', label: 'Département' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'grade', label: 'Grade' },
];

const INITIAL_PERIOD = defaultHrcoPeriod();
const MONTH_OPTIONS = HRCO_MONTHS.map((label, index) => ({
  value: index + 1,
  label: label.charAt(0).toUpperCase() + label.slice(1),
}));

export default function HrcoNotePage() {
  const { can, isLoading, refresh } = usePermissions();
  const [note, setNote] = useState<HrcoNote | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [year, setYear] = useState(INITIAL_PERIOD.year);
  const [fromMonth, setFromMonth] = useState(INITIAL_PERIOD.fromMonth);
  const [toMonth, setToMonth] = useState(INITIAL_PERIOD.toMonth);
  const [reloadKey, setReloadKey] = useState(0);
  const silentReload = useRef(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberPick, setMemberPick] = useState('');
  const [savingMembers, setSavingMembers] = useState(false);
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1];
  }, []);

  useEffect(() => {
    void refresh({ silent: true });
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const silent = silentReload.current;
    silentReload.current = false;
    if (!silent) {
      setLoading(true);
      setError('');
      setDrill(null);
    }
    (async () => {
      try {
        const response = await fetch(
          `/api/rapport/hrco-note?year=${year}&from=${fromMonth}&to=${toMonth}`,
          { cache: 'no-store' },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Chargement impossible');
        if (!cancelled) setNote(body as HrcoNote);
      } catch (err) {
        if (!cancelled) {
          setNote(null);
          setError(err instanceof Error ? err.message : 'Chargement impossible');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, fromMonth, toMonth, reloadKey]);

  const canEditMembers = can('exco.rapport', 'edit');

  const memberCandidates = useMemo(() => {
    const selected = new Set(note?.excoMatricules || []);
    const query = memberQuery.trim().toLowerCase();
    return (note?.people || [])
      .filter((person) => person.grade !== 'Sous-traitant' && !selected.has(person.matricule))
      .filter((person) => {
        if (!query) return true;
        return `${person.nom} ${person.matricule} ${person.departement} ${person.fonction}`.toLowerCase().includes(query);
      })
      .slice(0, 20);
  }, [note, memberQuery]);

  async function saveCells(tableId: string, cells: Array<{ rowIndex: number; colIndex: number; value: string }>) {
    try {
      const response = await fetch('/api/rapport/hrco-note/cells', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableId, cells }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Enregistrement impossible');
      silentReload.current = true;
      setReloadKey((current) => current + 1);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    }
  }

  async function saveMembers(matricules: string[]) {
    setSavingMembers(true);
    try {
      const response = await fetch('/api/rapport/hrco-note/exco-members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricules }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Enregistrement impossible');
      setMemberQuery('');
      setMemberPick('');
      setReloadKey((value) => value + 1);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSavingMembers(false);
    }
  }

  const peopleById = useMemo(() => {
    const map = new Map<string, HrcoPerson>();
    for (const person of note?.people || []) map.set(person.matricule, person);
    return map;
  }, [note]);

  const drillColumns = useMemo(() => {
    if (drill?.detail) return [
      { key: 'label', label: drill.detailColumns?.label || 'Mois' },
      { key: 'value', label: drill.detailColumns?.value || 'Montant', align: 'right' as const },
    ];
    if (!drill?.hoursByMatricule) return DRILL_COLUMNS;
    return [...DRILL_COLUMNS, { key: 'heures', label: 'Heures', align: 'right' as const }];
  }, [drill]);

  const drillRows = useMemo<DashboardListRow[]>(() => {
    if (!drill) return [];
    if (drill.detail) {
      return drill.detail.map((line, index) => ({
        id: `${line.label}-${index}`,
        cells: { label: line.label, value: line.value },
      }));
    }
    const rows = (drill.matricules || []).map((matricule) => {
      const person = peopleById.get(matricule);
      const hours = drill.hoursByMatricule?.[matricule];
      return {
        id: matricule,
        hours: hours ?? -1,
        cells: {
          matricule,
          nom: person?.nom || '—',
          fonction: person?.fonction || '—',
          departement: person?.departement || '—',
          localisation: person?.localisation || '—',
          grade: person?.grade || '—',
          heures: hours == null
            ? ''
            : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(hours),
        },
      };
    });
    if (drill.hoursByMatricule) rows.sort((a, b) => b.hours - a.hours);
    return rows;
  }, [drill, peopleById]);

  async function downloadWord() {
    setDownloading(true);
    try {
      const response = await fetch(
        `/api/rapport/hrco-note/docx?year=${year}&from=${fromMonth}&to=${toMonth}`,
        { cache: 'no-store' },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Téléchargement impossible');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'note-preparatoire-comite-rh.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Téléchargement impossible');
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) return <div className="loading">Chargement…</div>;
  if (!can('exco.rapport', 'view')) return <div className="loading">Accès refusé.</div>;

  return (
    <div className="hrco-note">
      <div className="page-header">
        <div>
          <p className="hrco-kicker">
            <Link href="/rapport">Rapport</Link>
            <span> / HRCO FY26</span>
          </p>
          <h2>{note?.title || 'NOTE PRÉPARATOIRE DU COMITÉ DES RESSOURCES HUMAINES'}</h2>
          <p>
            {note ? (
              <>
                Effectifs en poste au {note.asOfLabel} ({note.periodLabel}) :{' '}
                <button
                  type="button"
                  className="hrco-count is-clickable"
                  title="Voir la liste — effectif de la période"
                  onClick={() => setDrill({
                    title: `Voir la liste — effectif au ${note.asOfLabel}`,
                    matricules: note.activeMatricules,
                  })}
                >
                  {note.headcount}
                </button>
                {' '}salariés.
              </>
            ) : 'Choisissez la période à afficher.'}
            {' '}Un clic sur un chiffre bleu ouvre les salariés qui le composent.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void downloadWord()} disabled={downloading || !note}>
          {downloading ? 'Préparation…' : 'Télécharger le Word'}
        </button>
      </div>

      <div className="hrco-period">
        <label>
          Année
          <select
            className="filter-select"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {yearOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <label>
          De
          <select
            className="filter-select"
            value={fromMonth}
            onChange={(event) => {
              const next = Number(event.target.value);
              setFromMonth(next);
              if (toMonth < next) setToMonth(next);
            }}
          >
            {MONTH_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          À
          <select
            className="filter-select"
            value={toMonth}
            onChange={(event) => {
              const next = Number(event.target.value);
              setToMonth(next < fromMonth ? fromMonth : next);
            }}
          >
            {MONTH_OPTIONS.filter((option) => option.value >= fromMonth).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <div className="loading">Chargement…</div> : null}
      {!loading && error ? <div className="loading">{error}</div> : null}
      {!loading && !error && note ? (
      <>
      {note.sections.map((section) => (
          <section key={section.id} className="hrco-section">
            <h3>{section.title}</h3>
            {section.tables.map((item) => (
              <Fragment key={item.id}>
                <HrcoTableView
                  table={item}
                  canEdit={canEditMembers}
                  people={note.people}
                  classificationTitles={note.classificationTitles || []}
                  onCommit={(rowIndex, colIndex, value) => void saveCells(item.id, [{ rowIndex, colIndex, value }])}
                  onCommitRow={(rowIndex, cells) => void saveCells(item.id, cells.map((cell) => ({ rowIndex, ...cell })))}
                  onDrill={(cell, column) => {
                    if (cell.detail?.length) {
                      setDrill({
                        title: `Voir le détail — ${item.title} — ${column}`,
                        detail: cell.detail,
                        detailColumns: cell.detailColumns,
                      });
                      return;
                    }
                    if (!cell.matricules) return;
                    setDrill({
                      title: `Voir la liste — ${item.title} — ${column}`,
                      matricules: cell.matricules,
                      hoursByMatricule: cell.hoursByMatricule,
                    });
                  }}
                />
                {section.id === '2' && item.id === '2.justif' ? (
                  <ExcoMembersCard
                    note={note}
                    peopleById={peopleById}
                    canEdit={canEditMembers}
                    saving={savingMembers}
                    query={memberQuery}
                    pick={memberPick}
                    candidates={memberCandidates}
                    onQuery={setMemberQuery}
                    onPick={setMemberPick}
                    onSave={(matricules) => void saveMembers(matricules)}
                  />
                ) : null}
              </Fragment>
            ))}
          </section>
        ))}
      </>
      ) : null}

      {drill ? (
        <DashboardListModal
          title={drill.title}
          columns={drillColumns}
          rows={drillRows}
          onClose={() => setDrill(null)}
          searchPlaceholder="Rechercher un salarié…"
        />
      ) : null}
    </div>
  );
}

function ExcoMembersCard({
  note,
  peopleById,
  canEdit,
  saving,
  query,
  pick,
  candidates,
  onQuery,
  onPick,
  onSave,
}: {
  note: HrcoNote;
  peopleById: Map<string, HrcoPerson>;
  canEdit: boolean;
  saving: boolean;
  query: string;
  pick: string;
  candidates: HrcoPerson[];
  onQuery: (value: string) => void;
  onPick: (value: string) => void;
  onSave: (matricules: string[]) => void;
}) {
  const members = note.excoMatricules;
  return (
    <article className="hrco-card">
      <header>
        <h4>Membres EXCO</h4>
        <p>
          {note.excoCustom
            ? 'Liste enregistrée. Ces personnes composent la ligne EXCO, y compris dans le détail au clic.'
            : 'Liste par défaut : les grades E. Ajoutez les autres membres, ils sont plus de trois.'}
        </p>
      </header>
      <ul className="hrco-exco-list">
        {members.map((matricule) => {
          const person = peopleById.get(matricule);
          return (
            <li key={matricule}>
              <span>{person?.nom || matricule}</span>
              {canEdit ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onSave(members.filter((item) => item !== matricule))}
                >
                  Retirer
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {canEdit ? (
        <div className="hrco-exco-add">
          <input
            className="filter-select"
            value={query}
            placeholder="Nom, matricule, département"
            onChange={(event) => {
              onQuery(event.target.value);
              onPick('');
            }}
          />
          <select
            className="filter-select"
            value={pick}
            onChange={(event) => onPick(event.target.value)}
          >
            <option value="">Choisir un salarié</option>
            {candidates.map((person) => (
              <option key={person.matricule} value={person.matricule}>
                {person.nom} · {person.departement || person.fonction}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !pick}
            onClick={() => onSave([...members, pick])}
          >
            {saving ? 'Enregistrement…' : 'Ajouter un membre EXCO'}
          </button>
        </div>
      ) : (
        <p>La modification demande le droit d’édition du rapport EXCO.</p>
      )}
    </article>
  );
}

function SuggestCell({
  value,
  kind,
  people,
  classificationTitles,
  ariaLabel,
  onText,
  onEmployee,
}: {
  value: string;
  kind: 'employee' | 'classification';
  people: HrcoPerson[];
  classificationTitles: string[];
  ariaLabel: string;
  onText: (value: string) => void;
  onEmployee: (person: HrcoPerson) => void;
}) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const picking = useRef(false);
  const query = text.trim().toLowerCase();
  const employees = useMemo(() => {
    if (kind !== 'employee' || query.length < 1) return [];
    return people
      .filter((person) => person.grade !== 'Sous-traitant')
      .filter((person) => `${person.nom} ${person.matricule} ${person.fonction}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [kind, people, query]);
  const titles = useMemo(() => {
    if (kind !== 'classification' || query.length < 1) return [];
    return classificationTitles.filter((title) => title.toLowerCase().includes(query)).slice(0, 8);
  }, [kind, classificationTitles, query]);
  const count = kind === 'employee' ? employees.length : titles.length;

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const element = inputRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setBox({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, text]);

  function commitText(next: string) {
    const trimmed = next.trim();
    if (kind === 'employee') {
      const exact = people.filter((person) => (
        person.grade !== 'Sous-traitant' && person.nom.toLowerCase() === trimmed.toLowerCase()
      ));
      if (exact.length === 1) {
        onEmployee(exact[0]);
        return;
      }
    }
    if (kind === 'classification') {
      const exact = classificationTitles.find((title) => title.toLowerCase() === trimmed.toLowerCase());
      if (exact) {
        if (exact !== value) onText(exact);
        return;
      }
    }
    if (trimmed !== value) onText(trimmed);
  }

  function pickEmployee(person: HrcoPerson) {
    picking.current = false;
    setText(person.nom);
    setOpen(false);
    onEmployee(person);
  }

  function pickTitle(title: string) {
    picking.current = false;
    setText(title);
    setOpen(false);
    if (title !== value) onText(title);
  }

  return (
    <>
      <input
        ref={inputRef}
        className="hrco-cell-input"
        value={text}
        aria-label={ariaLabel}
        placeholder={kind === 'employee' ? 'Nom du salarié' : 'Fonction classifiée'}
        autoComplete="off"
        onChange={(event) => {
          setText(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          picking.current = false;
          setOpen(true);
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (picking.current) {
              picking.current = false;
              setOpen(false);
              return;
            }
            setOpen(false);
            commitText(text);
          }, 180);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((current) => Math.min(current + 1, Math.max(count - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (kind === 'employee' && employees[active]) pickEmployee(employees[active]);
            else if (kind === 'classification' && titles[active]) pickTitle(titles[active]);
            else {
              commitText(text);
              setOpen(false);
            }
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && box && count > 0 ? (
        <ul className="hrco-suggest-list" style={{ top: box.top, left: box.left, width: box.width }}>
          {kind === 'employee'
            ? employees.map((person, index) => (
              <li key={person.matricule}>
                <button
                  type="button"
                  className={index === active ? 'is-active' : undefined}
                  onMouseDown={(event) => {
                    picking.current = true;
                    event.preventDefault();
                  }}
                  onClick={() => pickEmployee(person)}
                >
                  <strong>{person.nom}</strong>
                  <span>{person.fonction || person.matricule}</span>
                </button>
              </li>
            ))
            : titles.map((title, index) => (
              <li key={title}>
                <button
                  type="button"
                  className={index === active ? 'is-active' : undefined}
                  onMouseDown={(event) => {
                    picking.current = true;
                    event.preventDefault();
                  }}
                  onClick={() => pickTitle(title)}
                >
                  {title}
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </>
  );
}

function HrcoTableView({
  table,
  canEdit,
  people,
  classificationTitles,
  onCommit,
  onCommitRow,
  onDrill,
}: {
  table: HrcoTable;
  canEdit: boolean;
  people: HrcoPerson[];
  classificationTitles: string[];
  onCommit: (rowIndex: number, colIndex: number, value: string) => void;
  onCommitRow: (rowIndex: number, cells: Array<{ colIndex: number; value: string }>) => void;
  onDrill: (cell: HrcoCell, column: string) => void;
}) {
  return (
    <article className="hrco-card">
      <header>
        <h4>
          {table.title}
          {table.owner ? <span> · {table.owner}</span> : null}
        </h4>
        <p>{table.source}</p>
      </header>
      <div className="hrco-table-wrap">
        <table className="hrco-table">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={row.total ? 'is-total' : undefined}>
                {row.cells.map((cell, cellIndex) => {
                  const column = table.columns[cellIndex] || '';
                  const clickable = Array.isArray(cell?.matricules) || Boolean(cell?.detail?.length);
                  const editable = canEdit && !row.total && (cell == null || cell.source === 'manual');
                  const suggest = table.id === '1.4' && cellIndex === 1
                    ? 'employee'
                    : table.id === '1.4' && cellIndex === 3
                      ? 'classification'
                      : null;
                  return (
                    <td key={`${rowIndex}-${cellIndex}`} className={cell?.source === 'system' ? 'is-system' : cell?.source === 'manual' ? 'is-manual' : cell ? 'is-document' : 'is-empty'}>
                      {clickable && cell ? (
                        <button type="button" className="hrco-count is-clickable" title={`Voir la liste — ${column}`} onClick={() => onDrill(cell, column)}>
                          {cell.text || '0'}
                        </button>
                      ) : editable && suggest ? (
                        <SuggestCell
                          value={cell?.text || ''}
                          kind={suggest}
                          people={people}
                          classificationTitles={classificationTitles}
                          ariaLabel={`${table.title} ${column}`}
                          onText={(value) => onCommit(rowIndex, cellIndex, value)}
                          onEmployee={(person) => onCommitRow(rowIndex, [
                            { colIndex: 1, value: person.nom },
                            { colIndex: 2, value: person.fonction },
                          ])}
                        />
                      ) : editable ? (
                        <input
                          key={`${rowIndex}-${cellIndex}-${cell?.text || ''}`}
                          className="hrco-cell-input"
                          defaultValue={cell?.text || ''}
                          aria-label={`${table.title} ${column}`}
                          placeholder="Saisir"
                          onBlur={(event) => {
                            const next = event.target.value.trim();
                            if (next === (cell?.text || '')) return;
                            onCommit(rowIndex, cellIndex, next);
                          }}
                        />
                      ) : (
                        cell?.text || ''
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
