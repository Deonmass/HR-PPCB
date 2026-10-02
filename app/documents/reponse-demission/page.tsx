'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  NOTICE_BAND_OPTIONS,
  civilityFromGender,
  computeResignationNotice,
  employerSiteLabel,
  formatLetterName,
  isNoticeBand,
  noticeBandFromGrade,
  parseFlexibleDate,
  type NoticeBand,
} from '@/lib/reponse-demission';
import { showError } from '@/lib/swal';
import type { Employee } from '@/lib/types';

const SHORT_MONTHS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function fileNameFromResponse(response: Response, fallback: string): string {
  const header = response.headers.get('X-File-Name');
  if (!header) return fallback;
  try {
    return decodeURIComponent(header);
  } catch {
    return fallback;
  }
}

function formatShortFr(date: Date): string {
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

function formatFromTo(start: Date, end: Date): string {
  const startLabel = start.getFullYear() === end.getFullYear()
    ? formatShortFr(start)
    : `${formatShortFr(start)} ${start.getFullYear()}`;
  return `du ${startLabel} au ${formatShortFr(end)} ${end.getFullYear()}`;
}

/** Le énième jour à partir de `start` inclus, dimanches exclus. */
function nthDayExcludingSunday(start: Date, count: number): Date {
  if (count <= 0) return new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let remaining = count;
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  for (let guard = 0; guard < 8000 && remaining > 0; guard += 1) {
    if (cursor.getDay() !== 0) {
      remaining -= 1;
      if (remaining === 0) return cursor;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return cursor;
}

/** Jours du lendemain de `from` jusqu’à `to` inclus, dimanches exclus. */
function daysExcludingSundays(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  const forward = end >= start;
  const cursor = new Date(forward ? start : end);
  const last = new Date(forward ? end : start);
  cursor.setDate(cursor.getDate() + 1);
  let count = 0;
  while (cursor <= last) {
    if (cursor.getDay() !== 0) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return forward ? count : -count;
}

export default function ReponseDemissionPage() {
  const { can, isLoading } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [letterDate, setLetterDate] = useState(todayIso);
  const [demissionDate, setDemissionDate] = useState('');
  const [desiredEndDate, setDesiredEndDate] = useState('');
  const [band, setBand] = useState<NoticeBand | ''>('');
  const [unionDelegate, setUnionDelegate] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/employees').then((res) => (res.ok ? res.json() : [])),
      fetch('/api/employees/exits').then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([active, left]) => {
        if (cancelled) return;
        const current = Array.isArray(active) ? (active as Employee[]) : [];
        const exited = Array.isArray(left) ? (left as Employee[]) : [];
        const seen = new Set(current.map((employee) => employee.matricule));
        setEmployees([
          ...current,
          ...exited.filter((employee) => !seen.has(employee.matricule)),
        ]);
      })
      .catch(() => {
        if (!cancelled) setEmployees([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const notice = useMemo(() => {
    if (!selected || !isNoticeBand(band) || !letterDate) return null;
    const hire = parseFlexibleDate(selected.appointmentDate || '');
    const letter = parseFlexibleDate(letterDate);
    if (!hire || !letter) return null;
    return computeResignationNotice(band, hire, letter, unionDelegate);
  }, [selected, band, letterDate, unionDelegate]);

  const selectEmployee = (employee: Employee) => {
    setSelected(employee);
    setQuery(employee.nom);
    setBand(noticeBandFromGrade(employee.grade || '') ?? '');
    setUnionDelegate(false);
    setDemissionDate('');
    setDesiredEndDate('');
  };

  const handleGenerate = async () => {
    if (!selected) return;
    if (!isNoticeBand(band)) {
      await showError('Choisissez la catégorie de préavis');
      return;
    }
    if (!letterDate) {
      await showError('Indiquez la date de la lettre');
      return;
    }
    if (!desiredEndDate) {
      await showError('Indiquez la date de départ');
      return;
    }
    if (!parseFlexibleDate(selected.appointmentDate || '')) {
      await showError('Date d’engagement manquante sur la fiche de l’employé');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/documents/reponse-demission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: selected.matricule,
          documentDate: letterDate,
          resignationDate: letterDate,
          desiredEndDate,
          band,
          unionDelegate,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || 'Génération impossible');
      }
      const blob = await res.blob();
      const fileName = fileNameFromResponse(
        res,
        `Réponse démission - ${selected.nom}.docx`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Génération impossible');
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || loading) return <div className="loading">Chargement...</div>;

  if (!can('documents.reponse-demission', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  const canCreate = can('documents.reponse-demission', 'create');
  const rule = isNoticeBand(band) ? NOTICE_BAND_OPTIONS.find((item) => item.id === band) : null;
  const yearWord = notice && notice.years > 1 ? 'ans' : 'an';
  const desired = parseFlexibleDate(desiredEndDate);
  const demission = parseFlexibleDate(demissionDate);
  const demissionStart = demission
    ? new Date(demission.getFullYear(), demission.getMonth(), demission.getDate() + 1)
    : null;
  const remainingDays = desired && demission ? daysExcludingSundays(demission, desired) : null;

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Réponse démission</h2>
          <p>
            Lettre de réponse à une démission. Le nom, la fonction et le matricule viennent de
            la fiche. Le préavis est calculé selon la catégorie et l’ancienneté, puis divisé
            par deux.
          </p>
        </div>
        <div className="demission-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRulesOpen(true)}
          >
            Info
          </button>
          <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
            ← Documents
          </Link>
        </div>
      </div>

      <div className="panel docs-generator-panel demission-generator-panel">
        <div className="form-group docs-generator-picker">
          <label>Agent concerné</label>
          <EmployeeSuggestInput
            employees={employees}
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (selected && value !== selected.nom) setSelected(null);
            }}
            onEmployeeSelect={selectEmployee}
            placeholder="Rechercher un agent (nom ou matricule)…"
          />
        </div>

        {selected ? (
          canCreate ? (
            <>
              <div className="exit-docs-employee">
                <strong>
                  {civilityFromGender(selected.gender)} {formatLetterName(selected.nom)}
                </strong>
                <span>
                  {selected.jobTitle || selected.position || '—'}
                  {' · '}
                  Mat. {selected.matricule}
                  {' — '}
                  {employerSiteLabel(selected.company || '', selected.localisation || '') || '—'}
                  {' · '}
                  Grade {selected.grade || '—'}
                  {' · '}
                  Engagement {selected.appointmentDate || '—'}
                </span>
              </div>

              <div className="demission-form-row">
                <div>
                  <div className="form-group">
                    <label>Catégorie de préavis</label>
                    <select
                      value={band}
                      onChange={(event) => {
                        const value = event.target.value;
                        setBand(isNoticeBand(value) ? value : '');
                      }}
                      disabled={generating}
                    >
                      <option value="">Choisir…</option>
                      {NOTICE_BAND_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} {option.grades} — {option.baseDays} + {option.perYearDays} j/an
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="demission-union-check">
                    <input
                      type="checkbox"
                      checked={unionDelegate}
                      onChange={(event) => setUnionDelegate(event.target.checked)}
                      disabled={generating}
                    />
                    Délégation syndicale
                  </label>
                  <div className="form-group">
                    <label>Date de la lettre</label>
                    <input
                      type="date"
                      className="input-date"
                      value={letterDate}
                      onChange={(event) => setLetterDate(event.target.value)}
                      disabled={generating}
                    />
                  </div>
                  <div className="demission-date-row">
                    <div className="form-group">
                      <label>Date de démission</label>
                      <input
                        type="date"
                        className="input-date"
                        value={demissionDate}
                        onChange={(event) => setDemissionDate(event.target.value)}
                        disabled={generating}
                      />
                    </div>
                    <div className="form-group">
                      <label>Date départ</label>
                      <input
                        type="date"
                        className="input-date"
                        value={desiredEndDate}
                        onChange={(event) => setDesiredEndDate(event.target.value)}
                        disabled={generating}
                      />
                    </div>
                    <div className="form-group demission-days-field">
                      <label>Jours restants</label>
                      <input
                        readOnly
                        value={remainingDays === null ? '' : String(remainingDays)}
                        placeholder="—"
                        aria-label="Jours restants hors dimanche"
                      />
                      <span className="demission-days-hint">hors dimanche</span>
                    </div>
                  </div>
                </div>

                <aside className="demission-notice" aria-live="polite">
                  {notice && rule ? (
                    <>
                      <div>
                        <p className="demission-kicker">
                          {notice.unionDelegate ? 'Délégation syndicale' : 'Préavis de démission'}
                        </p>
                        <p className="demission-stat">
                          <b>{notice.servedDays}</b>
                          <span>jours</span>
                        </p>
                      </div>
                      <div>
                        <p className="demission-kicker">
                          {rule.label} {selected.grade || rule.grades}
                        </p>
                        <p className="demission-formula">
                          {notice.unionDelegate ? '(' : ''}
                          <span className="demission-chip">{notice.baseDays}</span>
                          {' + '}
                          <span className="demission-chip">{notice.perYearDays}</span>
                          {` × ${notice.years} ${yearWord}`}
                          {notice.unionDelegate ? ') × 2' : ''}
                          {' = '}
                          <span className="demission-chip">{notice.fullDays}</span>
                        </p>
                        <p className="demission-meta">
                          {notice.fullDays} jours
                          {demissionStart
                            ? ` = ${formatFromTo(demissionStart, nthDayExcludingSunday(demissionStart, notice.fullDays))}`
                            : ''}
                        </p>
                        <p className="demission-meta">
                          Moitié {notice.servedDays} jours
                          {demissionStart
                            ? ` = ${formatFromTo(demissionStart, nthDayExcludingSunday(demissionStart, notice.servedDays))}`
                            : ''}
                        </p>
                      </div>
                    </>
                  ) : (
                    <p className="demission-meta">Le préavis s’affiche ici.</p>
                  )}
                </aside>
              </div>

              <div className="exit-docs-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Génération…
                    </>
                  ) : (
                    'Générer la lettre'
                  )}
                </button>
              </div>
            </>
          ) : (
            <p className="docs-hub-empty">
              Vous n’avez pas la permission de générer ce document.
            </p>
          )
        ) : (
          <p className="docs-generator-placeholder">
            Sélectionnez un agent pour préparer sa réponse à démission.
          </p>
        )}
      </div>

      {rulesOpen && (
        <div className="modal-overlay" onClick={() => setRulesOpen(false)} role="presentation">
          <div
            className="modal modal-form"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="demission-rules-title"
          >
            <div className="modal-header">
              <h3 id="demission-rules-title">Règle de calcul du préavis</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setRulesOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="demission-rules-lead">
                Préavis = jours de base + jours par année entière d’ancienneté.
                Une démission retient la moitié. La délégation syndicale double d’abord le préavis, puis la démission en retient la moitié.
              </p>
              <table className="demission-rules-table">
                <thead>
                  <tr>
                    <th>Catégorie</th>
                    <th>Grades</th>
                    <th>Formule</th>
                    <th>Résultat démission</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTICE_BAND_OPTIONS.map((option) => (
                    <tr key={option.id}>
                      <td>{option.label}</td>
                      <td>{option.grades}</td>
                      <td>
                        <span className="demission-chip">{option.baseDays}</span>
                        {' + '}
                        <span className="demission-chip">{option.perYearDays}</span>
                        {' × années'}
                      </td>
                      <td><span className="demission-chip">moitié</span></td>
                    </tr>
                  ))}
                  <tr>
                    <td>Délégation syndicale</td>
                    <td>Toutes</td>
                    <td>(base + jours × années) × 2</td>
                    <td><span className="demission-chip">moitié</span></td>
                  </tr>
                </tbody>
              </table>
              <p className="demission-rules-note">
                La période part du lendemain de la lettre et compte les jours du lundi au samedi.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setRulesOpen(false)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
