'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import Link from 'next/link';
import ProjectPickerDropdown from '@/components/ProjectPickerDropdown';
import { usePermissions } from '@/contexts/PermissionContext';
import { showError, showSuccess } from '@/lib/swal';
import type { PosteFieldSuggestions, PostesBundle, VacantPosteInput } from '@/lib/postes-types';
import type { Employee } from '@/lib/types';

/* ── Types ─────────────────────────────────────────────────────── */

type DocProgress = 'idle' | 'running' | 'done' | 'error';

type NewcomerPoste = {
  id: string;
  source: 'catalog' | 'vacant';
  title: string;
  department: string;
  location: string;
  grade: string;
  costCenter: string;
  reportsTo: string;
  company: string;
};

const NEWCOMER_DOCS = [
  {
    id: 'declaration' as const,
    label: "Déclaration sur l'honneur",
  },
  {
    id: 'new-user-request' as const,
    label: 'New User Request Form',
  },
  {
    id: 'sap-input' as const,
    label: 'SAP Input form (HR DOC 14)',
  },
];

type DocId = (typeof NEWCOMER_DOCS)[number]['id'];

const EMPTY_VACANT: VacantPosteInput = {
  title: '',
  department: '',
  location: '',
  grade: '',
  reportsTo: '',
  costCenter: '',
  jobDescription: '',
  jobLevel: '',
  headcount: 1,
  notes: '',
};

const EMPTY_SUGGESTIONS: PosteFieldSuggestions = {
  departments: [],
  locations: [],
  grades: [],
  costCenters: [],
  reportsTo: [],
  titles: [],
};

/* ── Helpers ───────────────────────────────────────────────────── */

function isHrDepartment(value: string): boolean {
  const d = value.trim().toLowerCase();
  if (!d) return false;
  return (
    d.includes('human resources')
    || d.includes('ressources humaines')
    || d.includes('resource humaine')
    || d === 'rh'
    || d.startsWith('rh ')
    || d.includes(' hr')
    || /\brh\b/.test(d)
  );
}

/** Managers / responsables RH uniquement (exclut drivers, admin pure, etc.). */
function isHrManager(e: Employee): boolean {
  if (!isHrDepartment(e.departement || e.departmentHr || '')) return false;
  const title = `${e.jobTitle || ''} ${e.position || ''}`.trim().toLowerCase();
  if (!title) return false;
  return (
    /\bmanager\b/i.test(title)
    || /\bhead of\b/i.test(title)
    || /\bchef\b/i.test(title)
    || /\bdirecteur\b/i.test(title)
    || /\bresponsable\b/i.test(title)
  );
}

function isActiveEmployee(e: Employee): boolean {
  const statut = String(e.statut || '').toLowerCase();
  return !statut || statut === 'active' || statut === 'actif';
}

function bundleToPostes(data: PostesBundle): NewcomerPoste[] {
  const fromCatalog: NewcomerPoste[] = data.groups.map((g) => ({
    id: `cat:${g.key}`,
    source: 'catalog',
    title: g.title,
    department: g.department || g.departments[0] || '',
    location: g.location || '',
    grade: g.grade || '',
    costCenter: g.costCenter || '',
    reportsTo: g.reportsTo || '',
    company: g.company || '',
  }));
  const fromVacants: NewcomerPoste[] = data.vacants.map((v) => ({
    id: `vac:${v.id}`,
    source: 'vacant',
    title: v.title,
    department: v.department || '',
    location: v.location || '',
    grade: v.grade || '',
    costCenter: v.costCenter || '',
    reportsTo: v.reportsTo || '',
    company: '',
  }));
  // Dédoublonnage par intitulé (catalogue prioritaire si même titre).
  const map = new Map<string, NewcomerPoste>();
  for (const p of [...fromCatalog, ...fromVacants]) {
    const key = p.title.trim().toLowerCase();
    if (!key) continue;
    if (!map.has(key)) map.set(key, p);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

function vacantToPoste(v: {
  id: string;
  title: string;
  department?: string;
  location?: string;
  grade?: string;
  costCenter?: string;
  reportsTo?: string;
}): NewcomerPoste {
  return {
    id: `vac:${v.id}`,
    source: 'vacant',
    title: v.title,
    department: v.department || '',
    location: v.location || '',
    grade: v.grade || '',
    costCenter: v.costCenter || '',
    reportsTo: v.reportsTo || '',
    company: '',
  };
}

function fileNameFromResponse(response: Response, fallback: string): string {
  const header = response.headers.get('X-File-Name');
  if (header) {
    try {
      return decodeURIComponent(header);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function filterPosteSuggestions(postes: NewcomerPoste[], query: string): NewcomerPoste[] {
  const q = query.trim().toLowerCase();
  if (!q) return postes.slice(0, 12);
  return postes
    .filter((p) => {
      const hay = [
        p.title,
        p.department,
        p.location,
        p.grade,
        p.costCenter,
        p.reportsTo,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 12);
}

/* ── Suggest / modal inputs ────────────────────────────────────── */

function SuggestField({
  listId,
  value,
  onChange,
  suggestions,
  placeholder,
  required,
  disabled,
}: {
  listId: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        disabled={disabled}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function PosteAddModal({
  open,
  initialTitle,
  suggestions,
  saving,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialTitle: string;
  suggestions: PosteFieldSuggestions;
  saving: boolean;
  onClose: () => void;
  onSaved: (poste: NewcomerPoste) => void;
}) {
  const [form, setForm] = useState<VacantPosteInput>({
    ...EMPTY_VACANT,
    title: initialTitle,
  });
  const [localSaving, setLocalSaving] = useState(false);
  const busy = saving || localSaving;

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_VACANT, title: initialTitle.trim() });
    }
  }, [open, initialTitle]);

  if (!open) return null;

  const handleSubmit = async () => {
    const title = form.title.trim();
    if (!title) {
      await showError('Intitulé du poste requis');
      return;
    }
    setLocalSaving(true);
    try {
      const res = await fetch('/api/employes/postes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vacant: {
            ...form,
            title,
            headcount: Math.max(1, Number(form.headcount) || 1),
          },
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            id?: string;
            title?: string;
            department?: string;
            location?: string;
            grade?: string;
            costCenter?: string;
            reportsTo?: string;
            error?: string;
          }
        | null;
      if (!res.ok) {
        throw new Error(json?.error || 'Enregistrement impossible');
      }
      if (!json?.id || !json.title) {
        throw new Error('Réponse invalide du serveur');
      }
      await showSuccess('Poste ajouté');
      onSaved(vacantToPoste({
        id: json.id,
        title: json.title,
        department: json.department,
        location: json.location,
        grade: json.grade,
        costCenter: json.costCenter,
        reportsTo: json.reportsTo,
      }));
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setLocalSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={() => !busy && onClose()}>
      <div className="modal modal-lg postes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Nouveau poste</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="postes-rename-hint">
            Ajoutez le poste au catalogue des vacants. Il sera sélectionné automatiquement.
          </p>
          <div className="mvt-form-grid">
            <label className="form-field form-field-span-2">
              <span>Intitulé du poste *</span>
              <SuggestField
                listId="nc-modal-title"
                value={form.title}
                onChange={(v) => setForm((f) => ({ ...f, title: v }))}
                suggestions={suggestions.titles}
                required
                disabled={busy}
              />
            </label>
            <label className="form-field">
              <span>Département</span>
              <SuggestField
                listId="nc-modal-dept"
                value={form.department || ''}
                onChange={(v) => setForm((f) => ({ ...f, department: v }))}
                suggestions={suggestions.departments}
                disabled={busy}
              />
            </label>
            <label className="form-field">
              <span>Localisation (Site)</span>
              <SuggestField
                listId="nc-modal-loc"
                value={form.location || ''}
                onChange={(v) => setForm((f) => ({ ...f, location: v }))}
                suggestions={suggestions.locations}
                disabled={busy}
              />
            </label>
            <label className="form-field">
              <span>Grade</span>
              <SuggestField
                listId="nc-modal-grade"
                value={form.grade || ''}
                onChange={(v) => setForm((f) => ({ ...f, grade: v }))}
                suggestions={suggestions.grades}
                disabled={busy}
              />
            </label>
            <label className="form-field">
              <span>Centre de coût</span>
              <SuggestField
                listId="nc-modal-cc"
                value={form.costCenter || ''}
                onChange={(v) => setForm((f) => ({ ...f, costCenter: v }))}
                suggestions={suggestions.costCenters}
                disabled={busy}
              />
            </label>
            <label className="form-field form-field-span-2">
              <span>Manager / Rapporte à</span>
              <SuggestField
                listId="nc-modal-manager"
                value={form.reportsTo || ''}
                onChange={(v) => setForm((f) => ({ ...f, reportsTo: v }))}
                suggestions={suggestions.reportsTo}
                disabled={busy}
              />
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleSubmit()}>
            {busy ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Enregistrement…
              </>
            ) : (
              'Enregistrer le poste'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function NewcomerDocsPage() {
  const { can, isLoading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [postes, setPostes] = useState<NewcomerPoste[]>([]);
  const [suggestions, setSuggestions] = useState<PosteFieldSuggestions>(EMPTY_SUGGESTIONS);
  const [hrAgents, setHrAgents] = useState<Employee[]>([]);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<NewcomerPoste | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [startDate, setStartDate] = useState(todayInputDate);
  const [hrName, setHrName] = useState('');

  const [checked, setChecked] = useState<Record<DocId, boolean>>({
    declaration: true,
    'new-user-request': true,
    'sap-input': true,
  });
  const [progress, setProgress] = useState<Partial<Record<DocId, DocProgress>>>({});
  const [generating, setGenerating] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [postesRes, empRes] = await Promise.all([
        fetch('/api/employes/postes'),
        fetch('/api/employees'),
      ]);
      if (postesRes.ok) {
        const data = (await postesRes.json()) as PostesBundle;
        setPostes(bundleToPostes(data));
        setSuggestions(data.suggestions || EMPTY_SUGGESTIONS);
      } else {
        setPostes([]);
        setSuggestions(EMPTY_SUGGESTIONS);
      }
      if (empRes.ok) {
        const employees = (await empRes.json()) as Employee[];
        const hr = (Array.isArray(employees) ? employees : [])
          .filter(isActiveEmployee)
          .filter(isHrManager)
          .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
        setHrAgents(hr);
        setHrName((current) => {
          if (current && hr.some((e) => e.nom === current)) return current;
          return hr.length === 1 ? hr[0].nom : '';
        });
      } else {
        setHrAgents([]);
      }
    } catch {
      setPostes([]);
      setHrAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setPickerOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [pickerOpen]);

  const filteredPostes = useMemo(
    () => filterPosteSuggestions(postes, query),
    [postes, query],
  );

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return postes.find((p) => p.title.trim().toLowerCase() === q) || null;
  }, [postes, query]);

  const showAddButton = Boolean(query.trim()) && !exactMatch && !selected;

  const selectPoste = (poste: NewcomerPoste) => {
    setSelected(poste);
    setQuery(poste.title);
    setPickerOpen(false);
  };

  // Si la saisie correspond exactement à un poste catalogue, le sélectionner automatiquement.
  useEffect(() => {
    if (!exactMatch) return;
    if (selected?.id === exactMatch.id) return;
    if (query.trim().toLowerCase() !== exactMatch.title.trim().toLowerCase()) return;
    setSelected(exactMatch);
  }, [exactMatch, query, selected]);

  const selectedDocs = useMemo(
    () => NEWCOMER_DOCS.filter((d) => checked[d.id]),
    [checked],
  );

  const canCreate = can('documents.newcomer', 'create');
  const canView = can('documents.newcomer', 'view') || canCreate || can('documents.newcomer', 'export');

  const handleGenerate = async () => {
    if (!selected) {
      await showError('Sélectionnez un poste');
      return;
    }
    if (!selectedDocs.length) {
      await showError('Sélectionnez au moins un document');
      return;
    }
    if (!startDate && selectedDocs.some((d) => d.id === 'new-user-request')) {
      await showError('La date de début est requise pour le New User Request Form');
      return;
    }
    if (!hrName.trim() && selectedDocs.some((d) => d.id === 'new-user-request')) {
      await showError('Sélectionnez un manager RH');
      return;
    }

    setGenerating(true);
    setProgress({});
    const payload = {
      jobTitle: selected.title,
      managerName: selected.reportsTo,
      managerFullNames: selected.reportsTo,
      startDate,
      siteLocation: selected.location,
      department: selected.department,
      costCentre: selected.costCenter,
      hrFullNames: hrName.trim(),
      grade: selected.grade,
    };

    let errors = 0;
    try {
      for (const doc of selectedDocs) {
        setProgress((prev) => ({ ...prev, [doc.id]: 'running' }));
        try {
          const res = await fetch('/api/documents/newcomer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doc: doc.id, ...payload }),
          });
          if (!res.ok) {
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(json?.error || `Erreur génération ${doc.label}`);
          }
          const blob = await res.blob();
          const ext = doc.id === 'sap-input' ? 'doc' : 'docx';
          const fileName = fileNameFromResponse(res, `${doc.label} - ${selected.title}.${ext}`);
          triggerBrowserDownload(blob, fileName);
          setProgress((prev) => ({ ...prev, [doc.id]: 'done' }));
        } catch (err) {
          errors += 1;
          setProgress((prev) => ({ ...prev, [doc.id]: 'error' }));
          const message = err instanceof Error ? err.message : 'Erreur';
          await showError(`${doc.label} : ${message}`);
        }
      }
      if (!errors) {
        await showSuccess(`${selectedDocs.length} document(s) téléchargé(s)`);
      }
    } finally {
      setGenerating(false);
    }
  };

  if (permLoading || loading) {
    return (
      <div className="loading" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' } as CSSProperties}>
        <span className="btn-spinner" aria-hidden="true" />
        Chargement…
      </div>
    );
  }

  if (!canView) {
    return <p className="docs-hub-empty">Vous n’avez pas accès aux documents Newcomer.</p>;
  }

  return (
    <>
      <div className="page-header newcomer-page-header">
        <h2>Newcomer</h2>
        <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
          ← Documents
        </Link>
      </div>

      <div className="panel newcomer-panel">
        <div className="form-group newcomer-poste-picker">
          <label>Poste</label>
          <div className="newcomer-poste-row">
            <div className="newcomer-poste-input-wrap" ref={wrapRef}>
              <input
                type="text"
                className="newcomer-poste-input"
                value={query}
                placeholder="Rechercher ou saisir un poste…"
                autoComplete="off"
                disabled={generating}
                onFocus={() => setPickerOpen(true)}
                onChange={(e) => {
                  const value = e.target.value;
                  setQuery(value);
                  setPickerOpen(true);
                  if (selected && value !== selected.title) setSelected(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPickerOpen(false);
                }}
              />
              <ProjectPickerDropdown
                anchorRef={wrapRef}
                listRef={listRef}
                open={pickerOpen && filteredPostes.length > 0}
              >
                {filteredPostes.map((poste) => (
                  <button
                    key={poste.id}
                    type="button"
                    className={`project-picker-option${selected?.id === poste.id ? ' active' : ''}`}
                    role="option"
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => selectPoste(poste)}
                  >
                    <span className="project-picker-name">{poste.title}</span>
                    <span className="project-picker-meta">
                      {[poste.department, poste.location, poste.grade].filter(Boolean).join(' · ')
                        || (poste.source === 'vacant' ? 'Vacant' : 'Catalogue')}
                    </span>
                  </button>
                ))}
              </ProjectPickerDropdown>
            </div>
            {showAddButton && (
              <button
                type="button"
                className="btn btn-primary newcomer-add-poste-btn"
                title="Ajouter ce poste"
                disabled={generating}
                onClick={() => setAddOpen(true)}
              >
                +
              </button>
            )}
          </div>
          {showAddButton && (
            <p className="newcomer-hint">
              Aucun poste « {query.trim()} » — cliquez sur <strong>+</strong> pour l’ajouter.
            </p>
          )}
        </div>

        {selected ? (
          <div className="newcomer-layout">
            <div className="newcomer-left">
              <h3 className="newcomer-section-title">Détails du poste</h3>
              <div className="table-wrap">
                <table className="data-table newcomer-detail-table">
                  <tbody>
                    <tr>
                      <th>Intitulé</th>
                      <td>{selected.title || '—'}</td>
                    </tr>
                    <tr>
                      <th>Département</th>
                      <td>{selected.department || '—'}</td>
                    </tr>
                    <tr>
                      <th>Site / Localisation</th>
                      <td>{selected.location || '—'}</td>
                    </tr>
                    <tr>
                      <th>Grade</th>
                      <td>{selected.grade || '—'}</td>
                    </tr>
                    <tr>
                      <th>Centre de coût</th>
                      <td>{selected.costCenter || '—'}</td>
                    </tr>
                    <tr>
                      <th>Manager</th>
                      <td>{selected.reportsTo || '—'}</td>
                    </tr>
                    <tr>
                      <th>Date de début</th>
                      <td>
                        <input
                          id="nc-start-date"
                          type="date"
                          className="newcomer-cell-input"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          disabled={generating}
                          aria-label="Date de début"
                        />
                      </td>
                    </tr>
                    <tr>
                      <th>Manager RH</th>
                      <td>
                        <select
                          id="nc-hr"
                          className="newcomer-cell-input"
                          value={hrName}
                          onChange={(e) => setHrName(e.target.value)}
                          disabled={generating || !hrAgents.length}
                          aria-label="Manager RH"
                        >
                          <option value="">— Choisir —</option>
                          {hrAgents.map((e) => (
                            <option key={e.matricule} value={e.nom}>
                              {e.nom}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="newcomer-right">
              <h3 className="newcomer-section-title">Documents à générer</h3>
              <div className="exit-docs-list newcomer-docs-list">
                {NEWCOMER_DOCS.map((doc) => {
                  const state = progress[doc.id] ?? 'idle';
                  return (
                    <label key={doc.id} className={`exit-docs-item is-${state}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(checked[doc.id])}
                        onChange={() =>
                          setChecked((prev) => ({ ...prev, [doc.id]: !prev[doc.id] }))
                        }
                        disabled={generating}
                      />
                      <span className="exit-docs-item-label">{doc.label}</span>
                      <span className="exit-docs-item-state" aria-hidden="true">
                        {state === 'running' && <span className="btn-spinner" />}
                        {state === 'done' && '✓'}
                        {state === 'error' && '✕'}
                      </span>
                    </label>
                  );
                })}
              </div>

              <div className="exit-docs-actions">
                {canCreate ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleGenerate()}
                    disabled={generating || !selectedDocs.length}
                  >
                    {generating ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Génération…
                      </>
                    ) : (
                      `Générer et télécharger ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''}`
                    )}
                  </button>
                ) : (
                  <p className="docs-hub-empty">
                    Vous n’avez pas la permission de générer ces documents.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="docs-generator-placeholder">
            Sélectionnez un poste pour afficher ses détails et générer les documents Newcomer.
          </p>
        )}
      </div>

      <PosteAddModal
        open={addOpen}
        initialTitle={query}
        suggestions={suggestions}
        saving={false}
        onClose={() => setAddOpen(false)}
        onSaved={(poste) => {
          setPostes((prev) => {
            const next = prev.filter(
              (p) => p.title.trim().toLowerCase() !== poste.title.trim().toLowerCase(),
            );
            return [poste, ...next].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
          });
          setAddOpen(false);
          selectPoste(poste);
        }}
      />
    </>
  );
}
