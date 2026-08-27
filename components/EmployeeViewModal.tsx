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
import {
  ESSAI_ACTIONS,
  ESSAI_COMMENTAIRES,
  ESSAI_STATUTS_EVAL,
  computeFinContratFromDuree,
  essaiStatutClass,
  hasCddVersCdiHistory,
  resolveEssaiEcheanceEval,
  resolveEssaiStatutEval,
} from '@/lib/employees-trial';
import { confirmAction, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import type { DepartmentSetting, ServiceSetting } from '@/lib/auth-types';
import { applyEmployeeServicePrefill } from '@/lib/employee-utils';
import ExitDocsModal from '@/components/documents/ExitDocsModal';
import { usePermissions } from '@/contexts/PermissionContext';

type TabId = 'infos' | 'essai' | 'cddVersCdi' | 'docs' | 'famille';

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
  /** Onglet ouvert à l'affichage (ex. 'essai' depuis la liste période d'essai). */
  initialTab?: TabId;
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

const ORG_FIELDS_BASE: FieldDef[] = [
  { key: 'departement', label: 'Département', type: 'select', options: [] },
  { key: 'service', label: 'Service', type: 'select', options: [] },
  { key: 'grade', label: 'Grade' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'jobTitle', label: 'Intitulé du poste' },
  { key: 'centreCout', label: 'Centre de coût' },
  { key: 'cnss', label: 'CNSS' },
  { key: 'nif', label: 'NIF' },
  { key: 'employeeSubGroup', label: 'Sous-groupe' },
  { key: 'payrollArea', label: 'Payroll Area' },
  { key: 'personnelArea', label: 'Personnel Area' },
];

const CONTRACT_FIELDS: FieldDef[] = [
  { key: 'typeContrat', label: 'Type de contrat', type: 'select', options: TYPE_CONTRATS },
  { key: 'dureeContratMois', label: 'Durée contrat (mois)', type: 'number' },
  { key: 'dateFinContrat', label: 'Date fin contrat', type: 'date' },
  { key: 'raisonExit', label: 'Raison exit', type: 'select', options: RAISON_EXITS },
  { key: 'statut', label: 'Statut', type: 'select', options: EMPLOYEE_STATUTS },
];

const ESSAI_PERIOD_FIELDS: FieldDef[] = [
  { key: 'periodeEssaiMois', label: "Période d'essai (mois)", type: 'number' },
  { key: 'dateFinPeriodeEssai', label: "Date fin période d'essai", type: 'date', editable: false },
  { key: 'appointmentDate', label: "Début d'essai (embauche)", type: 'date', editable: false },
];

const TRIAL_EVAL_FIELDS: FieldDef[] = [
  { key: 'essaiActions', label: 'Actions évaluation', type: 'select', options: ESSAI_ACTIONS },
  { key: 'essaiResponsable', label: 'Responsable évaluation' },
  { key: 'essaiEcheanceEval', label: 'Échéance évaluation', type: 'date' },
  { key: 'essaiStatutEval', label: 'Statut évaluation', type: 'select', options: ESSAI_STATUTS_EVAL, editable: false },
  { key: 'essaiCommentaire', label: 'Commentaire évaluation', type: 'select', options: ESSAI_COMMENTAIRES },
];

const CDD_VERSCDI_FIELDS: FieldDef[] = [
  { key: 'cddHistoriqueDebut', label: 'Début CDD', type: 'date' },
  { key: 'cddHistoriqueFin', label: 'Fin CDD', type: 'date' },
  { key: 'cddHistoriqueDureeMois', label: 'Durée CDD (mois)', type: 'number' },
  { key: 'datePassageCdi', label: 'Date passage CDI', type: 'date' },
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

export default function EmployeeViewModal({ employee, canEdit = false, initialTab = 'infos', onClose, onUpdated }: Props) {
  const { can } = usePermissions();
  const [tab, setTab] = useState<TabId>(initialTab);
  const [draft, setDraft] = useState<Employee>(employee);
  const [exitDocsOpen, setExitDocsOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<EditableKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [departmentNames, setDepartmentNames] = useState<string[]>([]);
  const [departments, setDepartments] = useState<DepartmentSetting[]>([]);
  const [services, setServices] = useState<ServiceSetting[]>([]);

  useEffect(() => {
    setDraft(applyEmployeeServicePrefill(employee));
    setEditingKey(null);
    setTab((current) => {
      if (current === 'cddVersCdi' && !hasCddVersCdiHistory(employee)) return 'infos';
      return current;
    });
  }, [employee]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/settings/departments').then((res) => (res.ok ? res.json() : [])),
      fetch('/api/settings/services').then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([deptJson, svcJson]: [unknown, unknown]) => {
        if (cancelled) return;
        const deptList = Array.isArray(deptJson) ? (deptJson as DepartmentSetting[]) : [];
        const svcList = Array.isArray(svcJson) ? (svcJson as ServiceSetting[]) : [];
        setDepartments(deptList);
        setServices(svcList);
        const names = deptList.map((item) => String(item.name || '').trim()).filter(Boolean);
        setDepartmentNames([...new Set(names)].sort((a, b) => a.localeCompare(b, 'fr')));
      })
      .catch(() => {
        if (!cancelled) {
          setDepartments([]);
          setServices([]);
          setDepartmentNames([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const orgFields = useMemo((): FieldDef[] => {
    const currentDept = (draft.departement || '').trim();
    const deptOptions = [...departmentNames];
    if (currentDept && !deptOptions.includes(currentDept)) deptOptions.unshift(currentDept);

    const deptId = departments.find(
      (d) => d.name.trim().toLowerCase() === currentDept.toLowerCase(),
    )?.id;
    const svcOptions = (deptId
      ? services.filter((s) => s.departmentId === deptId)
      : []
    )
      .map((s) => s.name.trim())
      .filter(Boolean);
    const currentSvc = (draft.service || '').trim();
    if (currentSvc && !svcOptions.includes(currentSvc)) svcOptions.unshift(currentSvc);

    return ORG_FIELDS_BASE.map((field) => {
      if (field.key === 'departement') return { ...field, type: 'select' as const, options: deptOptions };
      if (field.key === 'service') return { ...field, type: 'select' as const, options: svcOptions };
      return field;
    });
  }, [departmentNames, departments, services, draft.departement, draft.service]);

  const showCddVersCdiTab = useMemo(() => hasCddVersCdiHistory(draft), [draft]);

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

  const resolvedEssaiStatut = useMemo(
    () => resolveEssaiStatutEval({
      appointmentDate: draft.appointmentDate,
      periodeEssaiMois: draft.periodeEssaiMois,
      dateFinPeriodeEssai: resolvedFinEssai || draft.dateFinPeriodeEssai,
      essaiCommentaire: draft.essaiCommentaire,
    }),
    [draft.appointmentDate, draft.periodeEssaiMois, draft.dateFinPeriodeEssai, resolvedFinEssai, draft.essaiCommentaire],
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
      const asHead = groups.find((g) => g.matricule === employee.matricule);
      const asMember = groups.find((g) =>
        g.famille.some((m) => m.matricule === employee.matricule),
      );
      setFamilyGroup(asHead ?? asMember ?? null);
    } catch {
      setFamilyGroup(null);
    } finally {
      setFamilyLoading(false);
    }
  }, [employee.matricule]);

  useEffect(() => {
    void loadFamily();
  }, [loadFamily]);

  useEffect(() => {
    if (tab === 'famille') void loadFamily();
  }, [tab, loadFamily]);

  const villaNumber = familyGroup?.employee.numeroVilla?.trim() || '';
  const isVillageResident = Boolean(villaNumber);

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
      [...IDENTITY_FIELDS, ...orgFields, ...CONTRACT_FIELDS, ...ESSAI_PERIOD_FIELDS, ...TRIAL_EVAL_FIELDS, ...CDD_VERSCDI_FIELDS, ...MANAGER_FIELDS]
        .find((f) => f.key === editingKey);

    const preview: Employee = { ...draft };
    if (
      editingKey === 'numberOfChildren'
      || editingKey === 'periodeEssaiMois'
      || editingKey === 'dureeContratMois'
      || editingKey === 'cddHistoriqueDureeMois'
    ) {
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
    if (editingKey === 'departement') {
      Object.assign(preview, applyEmployeeServicePrefill({ ...preview, service: '' }));
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
      if (
        editingKey === 'appointmentDate'
        || editingKey === 'dureeContratMois'
      ) {
        const duree = next.dureeContratMois;
        if (duree != null && Number.isFinite(duree) && duree > 0) {
          next.dateFinContrat = computeFinContratFromDuree(
            next.appointmentDate,
            duree,
          ) || next.dateFinContrat;
        }
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
            const isEssaiStatut = field.key === 'essaiStatutEval';
            const value = isAge
              ? resolvedAge
              : isFinEssai
                ? resolvedFinEssai
                : isEssaiStatut
                  ? resolvedEssaiStatut
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
          <button type="button" className={`modal-tab-btn${tab === 'essai' ? ' active' : ''}`} onClick={() => setTab('essai')}>
            Période d&apos;essai
          </button>
          {showCddVersCdiTab && (
            <button type="button" className={`modal-tab-btn${tab === 'cddVersCdi' ? ' active' : ''}`} onClick={() => setTab('cddVersCdi')}>
              CDD vers CDI
            </button>
          )}
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
              {renderSection('Poste & organisation', orgFields)}
              {isVillageResident ? (
                <section className="employee-view-section">
                  <div className="employee-view-section-label">Logement village</div>
                  <table className="employee-view-table">
                    <tbody>
                      <tr>
                        <th scope="row">N° villa</th>
                        <td>
                          <div className="employee-view-value-row">
                            <span>{villaNumber}</span>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              ) : null}
              <div className="employee-contract-exit-block">
                {renderSection('Contrat & sortie', CONTRACT_FIELDS)}
                {can('documents.exit', 'create') && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm employee-exit-docs-btn"
                    onClick={() => setExitDocsOpen(true)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Générer les documents d’exit
                  </button>
                )}
              </div>
              {renderSection('Manager', MANAGER_FIELDS)}
            </>
          )}

          {tab === 'essai' && (
            <div className={`employee-essai-panel ${essaiStatutClass(resolvedEssaiStatut)}`}>
              <div className="employee-essai-status-banner">
                <span className="employee-essai-status-meta">
                  Échéance&nbsp;: <strong>{resolveEssaiEcheanceEval(draft) || '—'}</strong>
                  {' · '}
                  Fin essai&nbsp;: <strong>{resolvedFinEssai || draft.dateFinPeriodeEssai || '—'}</strong>
                </span>
                <span
                  className={`employee-essai-banner-icon ${essaiStatutClass(resolvedEssaiStatut)}`}
                  title={resolvedEssaiStatut}
                  aria-label={resolvedEssaiStatut}
                >
                  {/^overdue$/i.test(resolvedEssaiStatut) ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v6" strokeLinecap="round" />
                      <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </div>
              {renderSection("Période d'essai", ESSAI_PERIOD_FIELDS)}
              {renderSection('Évaluation', TRIAL_EVAL_FIELDS)}
            </div>
          )}

          {tab === 'cddVersCdi' && showCddVersCdiTab && (
            <div className="employee-cdd-vers-cdi-panel">
              <div className="employee-essai-status-banner">
                <span className="employee-essai-status-meta">
                  Historique CDD conservé lors du passage en CDI
                  {draft.datePassageCdi ? (
                    <>
                      {' · '}Passage&nbsp;: <strong>{draft.datePassageCdi}</strong>
                    </>
                  ) : null}
                </span>
                <span className="employee-essai-banner-icon is-on-time" title="CDD vers CDI" aria-hidden>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14" strokeLinecap="round" />
                    <path d="M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </div>
              {renderSection('Passage CDD → CDI', CDD_VERSCDI_FIELDS)}
              <p className="employee-cdd-vers-cdi-hint">
                L&apos;historique CDD est enregistré automatiquement quand le type de contrat passe de CDD à CDI.
                Vous pouvez aussi le saisir ou le corriger ici.
              </p>
            </div>
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

      {exitDocsOpen && (
        <ExitDocsModal employee={draft} onClose={() => setExitDocsOpen(false)} />
      )}
    </div>
  );
}
