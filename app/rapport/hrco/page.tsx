'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DashboardListModal, { type DashboardListRow } from '@/components/DashboardListModal';
import { usePermissions } from '@/contexts/PermissionContext';
import type { HrcoCell, HrcoNote, HrcoPerson, HrcoTable } from '@/lib/hrco-note';
import { showError } from '@/lib/swal';

type Drill = {
  title: string;
  matricules: string[];
  hoursByMatricule?: Record<string, number>;
};

const DRILL_COLUMNS = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'fonction', label: 'Fonction' },
  { key: 'departement', label: 'Département' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'grade', label: 'Grade' },
];

export default function HrcoNotePage() {
  const { can, isLoading, refresh } = usePermissions();
  const [note, setNote] = useState<HrcoNote | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);

  useEffect(() => {
    void refresh({ silent: true });
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/rapport/hrco-note', { cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Chargement impossible');
        if (!cancelled) setNote(body as HrcoNote);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Chargement impossible');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const peopleById = useMemo(() => {
    const map = new Map<string, HrcoPerson>();
    for (const person of note?.people || []) map.set(person.matricule, person);
    return map;
  }, [note]);

  const drillColumns = useMemo(() => {
    if (!drill?.hoursByMatricule) return DRILL_COLUMNS;
    return [...DRILL_COLUMNS, { key: 'heures', label: 'Heures', align: 'right' as const }];
  }, [drill]);

  const drillRows = useMemo<DashboardListRow[]>(() => {
    if (!drill) return [];
    const rows = drill.matricules.map((matricule) => {
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
      const response = await fetch('/api/rapport/hrco-note/docx', { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Téléchargement impossible');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'NOTE PRÉPARATOIRE DU COMITÉ DES RESSOURCES HUMAINES DU 26.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Téléchargement impossible');
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading || loading) return <div className="loading">Chargement…</div>;
  if (!can('exco.rapport', 'view')) return <div className="loading">Accès refusé.</div>;
  if (error || !note) return <div className="loading">{error || 'Note indisponible.'}</div>;

  return (
    <div className="hrco-note">
      <div className="page-header">
        <div>
          <p className="hrco-kicker">
            <Link href="/rapport">Rapport</Link>
            <span> / HRCO FY26</span>
          </p>
          <h2>{note.title}</h2>
          <p>
            Effectifs actifs au {note.asOfLabel} :{' '}
            <button
              type="button"
              className="hrco-count is-clickable"
              title="Voir la liste — effectif actif"
              onClick={() => setDrill({
                title: 'Voir la liste — effectif actif',
                matricules: note.activeMatricules,
              })}
            >
              {note.headcount}
            </button>
            {' '}salariés.
            Un clic sur un chiffre bleu ouvre les salariés qui le composent. Les autres montants sont ceux de la note d’origine.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => void downloadWord()} disabled={downloading}>
          {downloading ? 'Préparation…' : 'Télécharger le Word'}
        </button>
      </div>

      {note.sections.map((section) => {
        const filled = section.tables.filter((item) => item.hasSystemData);
        const empty = section.tables.filter((item) => !item.hasSystemData);
        return (
          <section key={section.id} className="hrco-section">
            <h3>{section.title}</h3>
            <ul className="hrco-points">
              {section.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {filled.map((item) => (
              <HrcoTableView
                key={item.id}
                table={item}
                onDrill={(cell, column) => {
                  if (!cell.matricules) return;
                  setDrill({
                    title: `Voir la liste — ${item.title} — ${column}`,
                    matricules: cell.matricules,
                    hoursByMatricule: cell.hoursByMatricule,
                  });
                }}
              />
            ))}
            {empty.length ? (
              <p className="hrco-empty-note">
                Laissé vide, donnée absente du registre : {empty.map((item) => item.title.replace(/^Tableau [\d.]+ – /, '')).join(' · ')}
              </p>
            ) : null}
          </section>
        );
      })}

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

function HrcoTableView({
  table,
  onDrill,
}: {
  table: HrcoTable;
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
                  const clickable = Array.isArray(cell?.matricules);
                  return (
                    <td key={`${rowIndex}-${cellIndex}`} className={cell?.source === 'system' ? 'is-system' : cell ? 'is-document' : 'is-empty'}>
                      {clickable && cell ? (
                        <button type="button" className="hrco-count is-clickable" title={`Voir la liste — ${column}`} onClick={() => onDrill(cell, column)}>
                          {cell.text || '0'}
                        </button>
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
