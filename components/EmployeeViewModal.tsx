'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  calcDocumentCompletion,
  calcRowCellStats,
  DOCUMENT_FIELDS,
  normalizeDocStatus,
} from '@/lib/documents';
import type { Dependant } from '@/lib/dependants-types';
import {
  buildFamilyGroups,
  isChildStatut,
  isSpouseStatut,
  type FamilyGroup,
} from '@/lib/dependants-utils';
import { computeAgeFromDisplayDate, computeFinPeriodeEssai } from '@/lib/employee-columns';
import {
  EMPLOYEE_STATUTS,
  RAISON_EXITS,
  TYPE_CONTRATS,
  isRealExitRaison,
} from '@/lib/employee-columns';
import type { VillageMaison } from '@/lib/village-types';
import { confirmAction, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

type TabId = 'infos' | 'docs' | 'famille';

type EditableKey = Exclude<
  keyof Employee,
  | 'documents'
  | 'age'
  | 'matricule'
  | 'patersonGrade'
  | 'position'
  | 'personnelSubArea'
  | 'dateFinPeriodeEssai'
>;

type FieldKey = EditableKey | 'age' | 'matricule' | 'dateFinPeriodeEssai';

interface FieldDef {
  key: FieldKey;
  label: string;
  editable?: boolean;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: readonly string[];
}

interface Props {
  employee: Employee;
  canEdit?: boolean;
  onClose: () => void;
  onUpdated?: (employee: Employee) => void;
}

const GENDER_OPTIONS = ['Male', 'Female'] as const;
const MARITAL_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'] as const;

const IDENTITY_FIELDS: FieldDef[] = [
  { key: 'matricule', label: 'Matricule', editable: false },
  { key: 'nom', label: 'Nom & prénom' },
  { key: 'company', label: 'Société' },
  { key: 'gender', label: 'Genre', type: 'select', options: GENDER_OPTIONS },
  { key: 'dateOfBirth', label: 'Date de naissance', type: 'date' },
  { key: 'age', label: 'Âge', editable: false },
  { key: 'nationality', label: 'Nationalité' },
  { key: 'maritalStatus', label: 'État civil', type: 'select', options: MARITAL_OPTIONS },
  { key: 'numberOfChildren', label: 'Nombre d\'enfants', type: 'number' },
  { key: 'appointmentDate', label: 'Date d\'embauche', type: 'date' },
];

const ORG_FIELDS: FieldDef[] = [
  { key: 'departement', label: 'Département' },
  { key: 'departmentHr', label: 'Département HR' },
  { key: 'grade', label: 'Grade' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'jobTitle', label: 'Intitulé du poste' },
  { key: 'centreCout', label: 'Centre de coût' },
  { key: 'employeeSubGroup', label: 'Sous-groupe' },
  { key: 'payrollArea', label: 'Payroll Area' },
  { key: 'personnelArea', label: 'Personnel Area' },
];

const CONTRACT_FIELDS: FieldDef[] = [
  { key: 'typeContrat', label: 'Type de contrat', type: 'select', options: TYPE_CONTRATS },
  { key: 'periodeEssaiMois', label: "Période d'essai (mois)", type: 'number' },
  { key: 'dateFinPeriodeEssai', label: "Date fin période d'essai", type: 'date', editable: false },
  { key: 'dateFinContrat', label: 'Date fin contrat', type: 'date' },
  { key: 'raisonExit', label: 'Raison exit', type: 'select', options: RAISON_EXITS },
  { key: 'statut', label: 'Statut', type: 'select', options: EMPLOYEE_STATUTS },
];

const MANAGER_FIELDS: FieldDef[] = [
  { key: 'lineManagerName', label: 'Line Manager' },
  { key: 'lineManagerPosition', label: 'Poste du manager' },
];

/** Affichage jj/mm/aaaa → valeur input[type=date] aaaa-mm-jj. */
function toDateInputValue(display: string): string {
  const raw = display.trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
}

/** Valeur input[type=date] → affichage jj/mm/aaaa. */
function fromDateInputValue(iso: string): string {
  const raw = iso.trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function isFemaleSexe(sexe: string | null | undefined): boolean {
  const n = (sexe ?? '').trim().toUpperCase();
  return n === 'F' || n === 'FEMME' || n === 'FEMALE';
}

function genderFromEmployee(employee: Employee): string {
  if (/^f/i.test(employee.gender)) return 'F';
  if (/^m/i.test(employee.gender)) return 'M';
  return '';
}

function FamilyAvatar({ sexe, variant }: { sexe: string; variant: string }) {
  const female = isFemaleSexe(sexe);
  return (
    <div className={`dependant-family-avatar ${female ? 'is-female' : 'is-male'} ${variant}`} aria-hidden>
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

function FamilyTreeConnector({ hasSpouse, childCount }: { hasSpouse: boolean; childCount: number }) {
  if (childCount === 0) return null;
  const nodeW = 88;
  const parentGap = 14;
  const childGap = 10;
  const stemH = 10;
  const dropH = 10;
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
  const childCenters = Array.from({ length: childCount }, (_, i) => childrenStart + i * (nodeW + childGap) + nodeW / 2);
  const segments: string[] = [];
  if (hasSpouse) segments.push(`M ${parentLeftX} 0 L ${parentRightX} 0`);
  segments.push(`M ${joinX} 0 L ${joinX} ${barY}`);
  if (childCount === 1) {
    const childX = childCenters[0];
    if (Math.abs(joinX - childX) < 0.5) segments.push(`M ${joinX} ${barY} L ${childX} ${height}`);
    else {
      segments.push(`M ${joinX} ${barY} L ${childX} ${barY}`);
      segments.push(`M ${childX} ${barY} L ${childX} ${height}`);
    }
  } else {
    segments.push(`M ${childCenters[0]} ${barY} L ${childCenters[childCount - 1]} ${barY}`);
    childCenters.forEach((childX) => segments.push(`M ${childX} ${barY} L ${childX} ${height}`));
  }
  return (
    <svg className="dependant-family-tree-svg employee-family-tree-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {segments.map((d, i) => (
        <path key={i} d={d} className="dependant-family-tree-svg-line" fill="none" />
      ))}
    </svg>
  );
}

function FamilyMemberCard({
  name,
  meta,
  sexe,
  variant,
}: {
  name: string;
  meta: string;
  sexe: string;
  variant: string;
}) {
  return (
    <div className={`dependant-family-node employee-family-node ${variant}`}>
      <FamilyAvatar sexe={sexe} variant={variant} />
      <div className="dependant-family-node-name">{name}</div>
      <div className="dependant-family-node-meta">{meta}</div>
    </div>
  );
}

function FamilyOrgChart({ group, employee }: { group: FamilyGroup | null; employee: Employee }) {
  const spouse = group?.famille.find((m) => isSpouseStatut(m.statut));
  const children = useMemo(
    () => (group?.famille.filter((m) => isChildStatut(m.statut)) ?? [])
      .sort((a, b) => (a.age ?? 999) - (b.age ?? 999)),
    [group],
  );
  const others = group?.famille.filter((m) => !isSpouseStatut(m.statut) && !isChildStatut(m.statut)) ?? [];
  const empSexe = group?.employee.sexe || genderFromEmployee(employee);

  return (
    <div className="employee-family-org">
      <div className="dependant-family-tree">
        <div className={`dependant-family-tree-parents${spouse ? ' has-couple' : ''}`}>
          <FamilyMemberCard
            name={employee.nom}
            meta={`${employee.matricule}${employee.age != null ? ` · ${employee.age} ans` : ''}`}
            sexe={empSexe}
            variant="is-employee"
          />
          {spouse && (
            <FamilyMemberCard
              name={spouse.nom}
              meta={`${spouse.statut}${spouse.age != null ? ` · ${spouse.age} ans` : ''}`}
              sexe={spouse.sexe}
              variant="is-spouse"
            />
          )}
        </div>
        {children.length > 0 && (
          <>
            <FamilyTreeConnector hasSpouse={Boolean(spouse)} childCount={children.length} />
            <div className="dependant-family-tree-children">
              {children.map((child) => (
                <FamilyMemberCard
                  key={`${child.id}-${child.nom}`}
                  name={child.nom}
                  meta={`${child.statut}${child.age != null ? ` · ${child.age} ans` : ''}`}
                  sexe={child.sexe}
                  variant="is-child"
                />
              ))}
            </div>
          </>
        )}
        {others.length > 0 && (
          <div className="dependant-family-tree-others">
            {others.map((member) => (
              <FamilyMemberCard
                key={`${member.id}-${member.nom}`}
                name={member.nom}
                meta={member.statut}
                sexe={member.sexe}
                variant="is-other"
              />
            ))}
          </div>
        )}
      </div>
      {!group && (
        <p className="employee-family-empty">Aucune composition familiale trouvée pour ce matricule.</p>
      )}
    </div>
  );
}

export default function EmployeeViewModal({ employee, canEdit = false, onClose, onUpdated }: Props) {
  const [tab, setTab] = useState<TabId>('infos');
  const [draft, setDraft] = useState<Employee>(employee);
  const [editingKey, setEditingKey] = useState<EditableKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [maisons, setMaisons] = useState<VillageMaison[]>([]);
  const [numeroVilla, setNumeroVilla] = useState('');
  const [assigningMaison, setAssigningMaison] = useState(false);

  useEffect(() => {
    setDraft(employee);
    setEditingKey(null);
  }, [employee]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/village/maisons', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json() as { maisons?: VillageMaison[] };
        if (!cancelled) setMaisons(json.maisons ?? []);
      } catch {
        if (!cancelled) setMaisons([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const villa = familyGroup?.employee.numeroVilla?.trim() || '';
    setNumeroVilla(villa);
  }, [familyGroup, employee.matricule]);

  const resolvedAge = useMemo(() => {
    const fromDob = computeAgeFromDisplayDate(draft.dateOfBirth);
    if (fromDob != null) return fromDob;
    if (draft.age != null && draft.age > 0) return draft.age;
    return null;
  }, [draft.dateOfBirth, draft.age]);

  const resolvedFinEssai = useMemo(
    () => computeFinPeriodeEssai(draft.appointmentDate, draft.periodeEssaiMois),
    [draft.appointmentDate, draft.periodeEssaiMois],
  );

  const loadFamily = useCallback(async () => {
    setFamilyLoading(true);
    try {
      const res = await fetch('/api/dependants', { cache: 'no-store' });
      if (!res.ok) {
        setFamilyGroup(null);
        return;
      }
      const json = await res.json() as { dependants?: Dependant[] };
      const groups = buildFamilyGroups(json.dependants ?? []);
      setFamilyGroup(groups.find((g) => g.matricule === employee.matricule) ?? null);
    } catch {
      setFamilyGroup(null);
    } finally {
      setFamilyLoading(false);
    }
  }, [employee.matricule]);

  useEffect(() => {
    void loadFamily();
  }, [loadFamily]);

  const saveMaisonAssignment = async () => {
    if (!canEdit) return;
    setAssigningMaison(true);
    try {
      const res = await fetch('/api/village/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: employee.matricule,
          numeroVilla,
          setLocalisationZamba: Boolean(numeroVilla),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Affectation impossible');
      await showSuccess(numeroVilla ? `Maison ${numeroVilla} affectée` : 'Maison libérée');
      await loadFamily();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Affectation impossible');
    } finally {
      setAssigningMaison(false);
    }
  };

  useEffect(() => {
    if (tab === 'famille') void loadFamily();
  }, [tab, loadFamily]);

  const completion = calcDocumentCompletion(draft);
  const cellStats = calcRowCellStats(draft);
  const rateCls = completion.pct >= 80 ? 'high' : completion.pct >= 50 ? 'mid' : 'low';

  const startEdit = (field: FieldDef) => {
    if (!canEdit || field.editable === false || field.key === 'age' || field.key === 'matricule') return;
    const key = field.key as EditableKey;
    const current = draft[key];
    const raw = current == null ? '' : String(current);
    setEditingKey(key);
    setEditValue(field.type === 'date' ? toDateInputValue(raw) : raw);
  };

  const cancelEdit = () => {
    if (saving) return;
    setEditingKey(null);
    setEditValue('');
  };

  const saveField = async (overrideValue?: string) => {
    if (!editingKey || saving) return;
    const valueToSave = overrideValue !== undefined ? overrideValue : editValue;
    const fieldDef =
      [...IDENTITY_FIELDS, ...ORG_FIELDS, ...CONTRACT_FIELDS, ...MANAGER_FIELDS]
        .find((f) => f.key === editingKey);

    const preview: Employee = { ...draft };
    if (editingKey === 'numberOfChildren' || editingKey === 'periodeEssaiMois') {
      (preview as unknown as Record<string, unknown>)[editingKey] =
        valueToSave.trim() === '' ? null : Number(valueToSave);
    } else if (fieldDef?.type === 'date') {
      (preview as unknown as Record<string, unknown>)[editingKey] = fromDateInputValue(valueToSave);
    } else {
      (preview as unknown as Record<string, unknown>)[editingKey] = valueToSave;
    }
    if (editingKey === 'raisonExit') {
      if (isRealExitRaison(preview.raisonExit)) {
        preview.statut = 'Inactive';
      } else if (/^na$/i.test(String(preview.raisonExit || '').trim()) || !String(preview.raisonExit || '').trim()) {
        preview.raisonExit = 'NA';
        preview.statut = 'Active';
      }
    }
    if (editingKey === 'statut' && preview.statut !== 'Inactive') {
      preview.raisonExit = 'NA';
    }
    // Inactive reste sélectionnable même si la raison est encore NA ;
    // une vraie raison force déjà Inactive via raisonExit.

    const confirmed = await confirmAction(
      'Confirmer la modification ?',
      fieldDef
        ? `${fieldDef.label} : ${
            fieldDef.type === 'date'
              ? display(fromDateInputValue(valueToSave) || '—')
              : display(valueToSave || '—')
          }`
        : 'Enregistrer cette modification ?',
      'Enregistrer',
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const next: Employee = { ...preview };

      if (editingKey === 'dateOfBirth') {
        next.age = computeAgeFromDisplayDate(next.dateOfBirth);
      }
      if (
        editingKey === 'appointmentDate'
        || editingKey === 'periodeEssaiMois'
      ) {
        next.dateFinPeriodeEssai = computeFinPeriodeEssai(
          next.appointmentDate,
          next.periodeEssaiMois,
        );
      }

      const res = await fetch(`/api/employees/${encodeURIComponent(employee.matricule)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Enregistrement impossible');
      }
      const saved = (await res.json()) as Employee;
      setDraft(saved);
      onUpdated?.(saved);
      setEditingKey(null);
      setEditValue('');
      await showSuccess('Modification enregistrée');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const renderInlineEditor = (field: FieldDef) => {
    const disabled = saving;
    if (field.type === 'select' && field.options) {
      return (
        <select
          autoFocus
          className="employee-inline-select"
          value={editValue}
          disabled={disabled}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveField();
            if (e.key === 'Escape') cancelEdit();
          }}
        >
          {field.key !== 'statut' && field.key !== 'raisonExit' && <option value="">—</option>}
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }
    if (field.type === 'date') {
      return (
        <input
          autoFocus
          type="date"
          className="employee-inline-date"
          value={editValue}
          disabled={disabled}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveField();
            if (e.key === 'Escape') cancelEdit();
          }}
        />
      );
    }
    return (
      <input
        autoFocus
        type={field.type === 'number' ? 'number' : 'text'}
        min={field.type === 'number' ? 0 : undefined}
        step={field.key === 'periodeEssaiMois' ? '0.5' : field.type === 'number' ? '1' : undefined}
        value={editValue}
        disabled={disabled}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void saveField();
          if (e.key === 'Escape') cancelEdit();
        }}
      />
    );
  };

  const renderSection = (title: string, fields: FieldDef[]) => (
    <section className="employee-view-section">
      <div className="employee-view-section-label">{title}</div>
      <table className="employee-view-table">
        <tbody>
          {fields.map((field) => {
            const isAge = field.key === 'age';
            const isFinEssai = field.key === 'dateFinPeriodeEssai';
            const value = isAge
              ? resolvedAge
              : isFinEssai
                ? resolvedFinEssai
                : draft[field.key as keyof Employee];
            const isEditing = editingKey === field.key;
            const canFieldEdit = canEdit && field.editable !== false && !isAge && field.key !== 'matricule';

            return (
              <tr key={field.key} className={isEditing && saving ? 'is-saving' : undefined}>
                <th scope="row">{field.label}</th>
                <td>
                  {isEditing ? (
                    <div className={`employee-inline-edit${saving ? ' is-saving' : ''}`}>
                      {renderInlineEditor(field)}
                      <button
                        type="button"
                        className="btn btn-primary btn-sm btn-with-icon employee-inline-save-btn"
                        disabled={saving}
                        title={saving ? 'Enregistrement…' : 'Enregistrer'}
                        aria-label={saving ? 'Enregistrement en cours' : 'Enregistrer'}
                        onClick={() => void saveField()}
                      >
                        {saving ? (
                          <span className="btn-spinner" aria-hidden="true" />
                        ) : (
                          'OK'
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        disabled={saving}
                        onClick={cancelEdit}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="employee-view-value-row">
                      <span>{display(value as string | number | null)}</span>
                      {canFieldEdit && (
                        <button
                          type="button"
                          className="employee-edit-icon-btn"
                          title={`Modifier ${field.label}`}
                          disabled={saving}
                          onClick={() => startEdit(field)}
                        >
                          <EditIcon />
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-lg employee-view-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>{draft.nom}</h3>
            <p className="modal-subtitle">{draft.matricule} · {draft.departement || '—'}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>&times;</button>
        </div>

        <div className="modal-tabs employee-view-tabs">
          <button type="button" className={`modal-tab-btn${tab === 'infos' ? ' active' : ''}`} onClick={() => setTab('infos')}>
            Informations générales
          </button>
          <button type="button" className={`modal-tab-btn${tab === 'docs' ? ' active' : ''}`} onClick={() => setTab('docs')}>
            Documents du dossier
          </button>
          <button type="button" className={`modal-tab-btn${tab === 'famille' ? ' active' : ''}`} onClick={() => setTab('famille')}>
            Composition familiale
          </button>
        </div>

        <div className="modal-body employee-view-body">
          {tab === 'infos' && (
            <>
              {renderSection('Identité', IDENTITY_FIELDS)}
              {renderSection('Poste & organisation', ORG_FIELDS)}
              <section className="employee-view-section">
                <div className="employee-view-section-label">Logement village</div>
                <div className="village-assign-row">
                  <select
                    className="filter-select"
                    value={numeroVilla}
                    disabled={!canEdit || assigningMaison}
                    onChange={(e) => setNumeroVilla(e.target.value)}
                  >
                    <option value="">Aucune maison (Kimpese)</option>
                    {maisons.map((m) => (
                      <option key={m.numero} value={m.numero}>
                        {m.numero}{m.taille ? ` · ${m.taille}` : ''}{m.typeMaison ? ` · ${m.typeMaison}` : ''}
                      </option>
                    ))}
                  </select>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={assigningMaison}
                      onClick={() => void saveMaisonAssignment()}
                    >
                      {assigningMaison ? '…' : 'Affecter'}
                    </button>
                  )}
                </div>
                <p className="panel-meta" style={{ marginTop: 8 }}>
                  Écrit Numero Villa / Type de maison sur DEPENDANTS (et localisation Zamba si une maison est choisie).
                </p>
              </section>
              {renderSection('Contrat & sortie', CONTRACT_FIELDS)}
              {renderSection('Manager', MANAGER_FIELDS)}
            </>
          )}

          {tab === 'docs' && (
            <section className="employee-view-section">
              <div className="employee-docs-summary">
                <div className={`employee-docs-rate employee-docs-rate-${rateCls}`}>
                  <span className="employee-docs-rate-value">{completion.pct}%</span>
                  <span className="employee-docs-rate-label">Conformité</span>
                </div>
                <div className="employee-docs-stats">
                  <span className="employee-docs-pill employee-docs-pill-y">Y · {cellStats.y}</span>
                  <span className="employee-docs-pill employee-docs-pill-na">NA · {cellStats.na}</span>
                  <span className="employee-docs-pill employee-docs-pill-n">N · {cellStats.n}</span>
                  <span className="employee-docs-meta">
                    {completion.complete}/{completion.applicable} applicables · Check Documents
                  </span>
                </div>
                <div className="progress-wrap employee-docs-progress">
                  <div className="progress-bar">
                    <div className={`progress-fill ${rateCls}`} style={{ width: `${completion.pct}%` }} />
                  </div>
                </div>
              </div>
              <ul className="employee-docs-list">
                {DOCUMENT_FIELDS.map((field) => {
                  const status = normalizeDocStatus(String(draft.documents?.[field.key] || ''));
                  return (
                    <li key={field.key} className={`employee-docs-item status-${status.toLowerCase()}`}>
                      <span className="employee-docs-item-label">{field.label}</span>
                      <span className={`employee-docs-badge status-${status.toLowerCase()}`}>{status}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {tab === 'famille' && (
            <section className="employee-view-section">
              {familyLoading ? (
                <div className="loading">Chargement de la famille…</div>
              ) : (
                <FamilyOrgChart group={familyGroup} employee={draft} />
              )}
            </section>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
