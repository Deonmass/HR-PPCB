'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import HomeBarChart from '@/components/home/HomeBarChart';
import HomeDonutChart from '@/components/home/HomeDonutChart';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import type {
  CatalogPosteUpdate,
  EmployeePosteUpdate,
  PosteFieldSuggestions,
  PosteGroup,
  PosteOccupant,
  PostesBundle,
  PostesDashboard,
  VacantPoste,
  VacantPosteInput,
} from '@/lib/postes-types';
import { writeRrfPrefill, type RrfPrefillPayload } from '@/lib/rrf-prefill';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import { startTopProgress } from '@/components/TopProgressBar';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

type PageTab = 'dashboard' | 'catalogue' | 'vacants';
type ModalMode = 'create' | 'edit' | 'view';

type CatalogFilterKey = 'poste' | 'occupants' | 'departements';
type VacantFilterKey = 'poste' | 'departement' | 'localisation' | 'grade' | 'effectif' | 'reportsTo';

const EMPTY_CATALOG_FILTERS: Record<CatalogFilterKey, string[]> = {
  poste: [],
  occupants: [],
  departements: [],
};

const EMPTY_VACANT_FILTERS: Record<VacantFilterKey, string[]> = {
  poste: [],
  departement: [],
  localisation: [],
  grade: [],
  effectif: [],
  reportsTo: [],
};

function catalogDepartementsValue(g: PosteGroup): string {
  return g.departments.join(', ') || '';
}

interface CatalogForm {
  fromTitle: string;
  title: string;
  department: string;
  location: string;
  grade: string;
  costCenter: string;
  reportsTo: string;
  company: string;
}

interface EmployeePosteForm extends EmployeePosteUpdate {
  nom: string;
}

const EMPTY_SUGGESTIONS: PosteFieldSuggestions = {
  departments: [],
  locations: [],
  grades: [],
  costCenters: [],
  reportsTo: [],
  titles: [],
};

const EMPTY_EMP_FORM: EmployeePosteForm = {
  matricule: '',
  nom: '',
  jobTitle: '',
  position: '',
  departement: '',
  departmentHr: '',
  grade: '',
  localisation: '',
  centreCout: '',
  lineManagerName: '',
  lineManagerPosition: '',
  patersonGrade: '',
  company: '',
};

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

function groupToCatalogForm(g: PosteGroup): CatalogForm {
  return {
    fromTitle: g.title,
    title: g.title,
    department: g.department || g.departments[0] || '',
    location: g.location || '',
    grade: g.grade || '',
    costCenter: g.costCenter || '',
    reportsTo: g.reportsTo || '',
    company: g.company || '',
  };
}

function occupantToForm(o: PosteOccupant): EmployeePosteForm {
  return {
    matricule: o.matricule,
    nom: o.nom,
    jobTitle: o.jobTitle || o.position || '',
    position: o.position || o.jobTitle || '',
    departement: o.departement,
    departmentHr: o.departement,
    grade: o.grade,
    localisation: o.localisation,
    centreCout: o.centreCout,
    lineManagerName: o.lineManagerName || '',
    lineManagerPosition: o.lineManagerPosition || '',
    patersonGrade: '',
    company: o.company,
  };
}

function employeeToForm(e: Employee): EmployeePosteForm {
  return {
    matricule: e.matricule,
    nom: e.nom,
    jobTitle: e.jobTitle || e.position || '',
    position: e.position || e.jobTitle || '',
    departement: e.departement || e.departmentHr || '',
    departmentHr: e.departmentHr || e.departement || '',
    grade: e.grade || '',
    localisation: e.localisation || '',
    centreCout: e.centreCout || '',
    lineManagerName: e.lineManagerName || '',
    lineManagerPosition: e.lineManagerPosition || '',
    patersonGrade: e.patersonGrade || '',
    company: e.company || '',
  };
}

function vacantToForm(v: VacantPoste): VacantPosteInput {
  return {
    title: v.title,
    department: v.department,
    location: v.location,
    grade: v.grade,
    reportsTo: v.reportsTo,
    costCenter: v.costCenter,
    jobDescription: v.jobDescription,
    jobLevel: v.jobLevel,
    headcount: v.headcount,
    notes: v.notes,
  };
}

function buildRrfUrl(v: VacantPoste | VacantPosteInput | {
  title: string;
  department?: string;
  location?: string;
  grade?: string;
  costCenter?: string;
  reportsTo?: string;
  headcount?: number;
  jobDescription?: string;
}): string {
  const params = new URLSearchParams();
  if (v.title) {
    params.set('positionTitle', v.title);
    params.set('jobTitle', v.title);
  }
  if (v.department) params.set('department', v.department);
  if (v.location) params.set('location', v.location);
  if (v.costCenter) params.set('costCenter', v.costCenter);
  if (v.reportsTo) params.set('reportsTo', v.reportsTo);
  if (v.grade) params.set('grade', v.grade);
  if (v.headcount) params.set('headcount', String(v.headcount));
  if ('jobDescription' in v && v.jobDescription) {
    params.set('jobDescription', v.jobDescription);
  }
  params.set('newOrReplacement', 'New position');
  return `/documents/rrf?${params.toString()}`;
}

function groupToRrfInput(g: PosteGroup): VacantPosteInput {
  return {
    title: g.title,
    department: g.department || g.departments[0] || '',
    location: g.location,
    grade: g.grade,
    costCenter: g.costCenter,
    reportsTo: g.reportsTo,
    headcount: 1,
  };
}

function toRrfPrefillPayload(
  v: VacantPoste | VacantPosteInput,
): RrfPrefillPayload {
  return {
    positionTitle: v.title || '',
    jobTitle: v.title || '',
    costCenter: v.costCenter || '',
    location: v.location || '',
    reportsTo: v.reportsTo || '',
    headcount: String(v.headcount || 1),
    jobDescription: String(
      'jobDescription' in v && v.jobDescription ? v.jobDescription : '',
    ),
    jobLevel: String('jobLevel' in v && v.jobLevel ? v.jobLevel : ''),
    newOrReplacement: 'New position',
  };
}

function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  listId,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  listId: string;
  required?: boolean;
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
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function DashboardView({
  dashboard,
  onOpenCatalogue,
  onOpenVacants,
}: {
  dashboard: PostesDashboard | null;
  onOpenCatalogue: () => void;
  onOpenVacants: () => void;
}) {
  if (!dashboard) {
    return <p className="empty-state">Aucune donnée de dashboard.</p>;
  }

  const barDept = dashboard.byDepartment.map((r) => ({
    label: r.label,
    value: r.value,
  }));
  const barLoc = dashboard.byLocation.map((r) => ({
    label: r.label,
    value: r.value,
  }));
  const barTop = dashboard.topPostes.map((r) => ({
    label: r.label,
    value: r.value,
  }));
  const slices = dashboard.occupancy.map((r) => ({
    label: r.label,
    value: r.value,
    color: r.color,
  }));

  return (
    <div className="mvt-dashboard postes-dashboard">
      <div className="travel-history-cards mvt-kpi-strip postes-kpi-strip">
        <button type="button" className="card card-glow card-glow-red travel-history-card postes-kpi-card" onClick={onOpenCatalogue}>
          <div className="card-label">Postes au catalogue</div>
          <div className="card-value">{dashboard.totalPostes}</div>
        </button>
        <button type="button" className="card card-glow card-glow-cyan travel-history-card postes-kpi-card" onClick={onOpenCatalogue}>
          <div className="card-label">Occupants actifs</div>
          <div className="card-value">{dashboard.totalOccupants}</div>
        </button>
        <button type="button" className="card card-glow card-glow-violet travel-history-card postes-kpi-card" onClick={onOpenVacants}>
          <div className="card-label">Slots vacants</div>
          <div className="card-value">{dashboard.totalVacantSlots}</div>
        </button>
        <div className="card card-glow card-glow-green travel-history-card postes-kpi-card">
          <div className="card-label">Poste mono-occupant</div>
          <div className="card-value">{dashboard.monoOccupant}</div>
        </div>
        <div className="card card-glow card-glow-amber travel-history-card postes-kpi-card">
          <div className="card-label">Poste multi-occupants</div>
          <div className="card-value">{dashboard.multiOccupant}</div>
        </div>
        <div className="card card-glow card-glow-cyan travel-history-card postes-kpi-card">
          <div className="card-label">Taux de multi-poste</div>
          <div className="card-value">
            {dashboard.totalPostes
              ? `${Math.round((dashboard.multiOccupant / dashboard.totalPostes) * 100)}%`
              : '—'}
          </div>
        </div>
      </div>

      <div className="postes-charts-grid home-charts-grid">
        <div className="postes-chart-host">
          <HomeBarChart
            title="Occupants par département"
            items={barDept}
            valueLabel="Agents"
            maxBars={8}
            emptyLabel="Aucun département"
          />
        </div>
        <div className="postes-chart-host">
          <HomeBarChart
            title="Top postes (effectif)"
            items={barTop}
            valueLabel="Occupants"
            maxBars={8}
            emptyLabel="Aucun poste"
          />
        </div>
        <div className="postes-chart-host">
          <HomeBarChart
            title="Occupants par localisation"
            items={barLoc}
            valueLabel="Agents"
            maxBars={6}
            emptyLabel="Aucune localisation"
          />
        </div>
        <div className="postes-chart-host">
          <HomeDonutChart
            title="Occupés vs vacants"
            slices={slices}
            centerLabel="Total"
            centerValue={dashboard.totalOccupants + dashboard.totalVacantSlots}
            emptyLabel="Aucune donnée"
          />
        </div>
      </div>
    </div>
  );
}

function CatalogPosteModal({
  open,
  mode,
  form,
  occupantCount,
  suggestions,
  saving,
  onClose,
  onChange,
  onSubmit,
  onEditFromView,
  onOpenOccupants,
}: {
  open: boolean;
  mode: ModalMode;
  form: CatalogForm;
  occupantCount: number;
  suggestions: PosteFieldSuggestions;
  saving: boolean;
  onClose: () => void;
  onChange: (next: CatalogForm) => void;
  onSubmit: () => void;
  onEditFromView?: () => void;
  onOpenOccupants?: () => void;
}) {
  if (!open) return null;
  const readOnly = mode === 'view';
  const title =
    mode === 'view' ? 'Détail du poste' : mode === 'edit' ? 'Modifier le poste' : 'Nouveau poste';

  return (
    <div className="modal-overlay open" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg postes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          {mode !== 'create' && (
            <p className="postes-rename-hint">
              {occupantCount} occupant{occupantCount > 1 ? 's' : ''} · les modifications s’appliquent
              à toutes les fiches employés de ce poste.
            </p>
          )}
          <div className="mvt-form-grid">
            <label className="form-field form-field-span-2">
              <span>Intitulé du poste *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.title || '—'}</div>
              ) : (
                <SuggestInput
                  listId="cat-title-list"
                  value={form.title}
                  onChange={(v) => onChange({ ...form, title: v })}
                  suggestions={suggestions.titles}
                  placeholder="Intitulé"
                  required
                />
              )}
            </label>

            <label className="form-field">
              <span>Département</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.department || '—'}</div>
              ) : (
                <SuggestInput
                  listId="cat-dept-list"
                  value={form.department}
                  onChange={(v) => onChange({ ...form, department: v })}
                  suggestions={suggestions.departments}
                />
              )}
            </label>

            <label className="form-field">
              <span>Localisation</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.location || '—'}</div>
              ) : (
                <SuggestInput
                  listId="cat-loc-list"
                  value={form.location}
                  onChange={(v) => onChange({ ...form, location: v })}
                  suggestions={suggestions.locations}
                />
              )}
            </label>

            <label className="form-field">
              <span>Grade</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.grade || '—'}</div>
              ) : (
                <SuggestInput
                  listId="cat-grade-list"
                  value={form.grade}
                  onChange={(v) => onChange({ ...form, grade: v })}
                  suggestions={suggestions.grades}
                />
              )}
            </label>

            <label className="form-field">
              <span>Centre de coût</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.costCenter || '—'}</div>
              ) : (
                <SuggestInput
                  listId="cat-cc-list"
                  value={form.costCenter}
                  onChange={(v) => onChange({ ...form, costCenter: v })}
                  suggestions={suggestions.costCenters}
                />
              )}
            </label>

            <label className="form-field">
              <span>Rapporte à</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.reportsTo || '—'}</div>
              ) : (
                <SuggestInput
                  listId="cat-report-list"
                  value={form.reportsTo}
                  onChange={(v) => onChange({ ...form, reportsTo: v })}
                  suggestions={suggestions.reportsTo}
                />
              )}
            </label>

            <label className="form-field">
              <span>Société</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.company || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => onChange({ ...form, company: e.target.value })}
                />
              )}
            </label>
          </div>
        </div>
        <div className="modal-footer">
          {mode === 'view' ? (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Fermer
              </button>
              {onOpenOccupants && (
                <button type="button" className="btn btn-outline" onClick={onOpenOccupants}>
                  Occupants
                </button>
              )}
              {onEditFromView && (
                <button type="button" className="btn btn-primary" onClick={onEditFromView}>
                  Modifier
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={onSubmit}>
                {saving ? 'Enregistrement…' : 'Enregistrer sur les fiches employés'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function OccupantsModal({
  open,
  group,
  canEdit,
  onClose,
  onEditOccupant,
  onViewOccupant,
}: {
  open: boolean;
  group: PosteGroup | null;
  canEdit: boolean;
  onClose: () => void;
  onEditOccupant: (o: PosteOccupant) => void;
  onViewOccupant: (o: PosteOccupant) => void;
}) {
  if (!open || !group) return null;
  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-lg postes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Occupants — {group.title}</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <p className="postes-rename-hint">
            {group.count} agent{group.count > 1 ? 's' : ''} sur ce poste
            {group.department ? ` · ${group.department}` : ''}
          </p>
          {group.occupants.length === 0 ? (
            <p className="empty-state">Aucun occupant.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table postes-compact-table">
                <thead>
                  <tr>
                    <th>Matricule</th>
                    <th>Agent</th>
                    <th>Département</th>
                    <th>Grade</th>
                    <th>Localisation</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {group.occupants.map((o) => (
                    <tr
                      key={o.matricule}
                      onDoubleClick={() => onViewOccupant(o)}
                    >
                      <td>{o.matricule}</td>
                      <td>{o.nom}</td>
                      <td>{o.departement || '—'}</td>
                      <td>{o.grade || '—'}</td>
                      <td>{o.localisation || '—'}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => onViewOccupant(o)}
                        >
                          Voir
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => onEditOccupant(o)}
                          >
                            Modifier
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function EmployeePosteModal({
  open,
  mode,
  form,
  suggestions,
  saving,
  onClose,
  onChange,
  onSubmit,
  onEditFromView,
}: {
  open: boolean;
  mode: ModalMode;
  form: EmployeePosteForm;
  suggestions: PosteFieldSuggestions;
  saving: boolean;
  onClose: () => void;
  onChange: (next: EmployeePosteForm) => void;
  onSubmit: () => void;
  onEditFromView?: () => void;
}) {
  if (!open) return null;
  const readOnly = mode === 'view';

  return (
    <div className="modal-overlay open" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg postes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {mode === 'view'
              ? 'Fiche poste — agent'
              : 'Modifier le poste de l’agent'}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="mvt-form-grid">
            <div className="form-field form-field-span-2">
              <span>Agent</span>
              <div className="mvt-readonly-value">
                <strong>{form.nom || '—'}</strong>
                <span>{form.matricule}</span>
              </div>
            </div>

            <label className="form-field form-field-span-2">
              <span>Poste / Job title *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.jobTitle || '—'}</div>
              ) : (
                <SuggestInput
                  listId="emp-title-list"
                  value={form.jobTitle}
                  onChange={(v) => onChange({ ...form, jobTitle: v })}
                  suggestions={suggestions.titles}
                  placeholder="Rechercher un poste…"
                  required
                />
              )}
            </label>

            <label className="form-field">
              <span>Position (SAP)</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.position || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.position || ''}
                  onChange={(e) => onChange({ ...form, position: e.target.value })}
                />
              )}
            </label>

            <label className="form-field">
              <span>Département</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.departement || '—'}</div>
              ) : (
                <SuggestInput
                  listId="emp-dept-list"
                  value={form.departement || ''}
                  onChange={(v) =>
                    onChange({ ...form, departement: v, departmentHr: v })
                  }
                  suggestions={suggestions.departments}
                />
              )}
            </label>

            <label className="form-field">
              <span>Grade</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.grade || '—'}</div>
              ) : (
                <SuggestInput
                  listId="emp-grade-list"
                  value={form.grade || ''}
                  onChange={(v) => onChange({ ...form, grade: v })}
                  suggestions={suggestions.grades}
                />
              )}
            </label>

            <label className="form-field">
              <span>Localisation</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.localisation || '—'}</div>
              ) : (
                <SuggestInput
                  listId="emp-loc-list"
                  value={form.localisation || ''}
                  onChange={(v) => onChange({ ...form, localisation: v })}
                  suggestions={suggestions.locations}
                />
              )}
            </label>

            <label className="form-field">
              <span>Centre de coût</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.centreCout || '—'}</div>
              ) : (
                <SuggestInput
                  listId="emp-cc-list"
                  value={form.centreCout || ''}
                  onChange={(v) => onChange({ ...form, centreCout: v })}
                  suggestions={suggestions.costCenters}
                />
              )}
            </label>

            <label className="form-field">
              <span>Rapporte à (N+1)</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.lineManagerName || '—'}</div>
              ) : (
                <SuggestInput
                  listId="emp-report-list"
                  value={form.lineManagerName || ''}
                  onChange={(v) => onChange({ ...form, lineManagerName: v })}
                  suggestions={suggestions.reportsTo}
                />
              )}
            </label>

            <label className="form-field">
              <span>Poste N+1</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.lineManagerPosition || '—'}</div>
              ) : (
                <SuggestInput
                  listId="emp-report-pos-list"
                  value={form.lineManagerPosition || ''}
                  onChange={(v) => onChange({ ...form, lineManagerPosition: v })}
                  suggestions={suggestions.titles}
                />
              )}
            </label>

            <label className="form-field">
              <span>Société</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.company || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.company || ''}
                  onChange={(e) => onChange({ ...form, company: e.target.value })}
                />
              )}
            </label>
          </div>
        </div>
        <div className="modal-footer">
          {mode === 'view' ? (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Fermer
              </button>
              {onEditFromView && (
                <button type="button" className="btn btn-primary" onClick={onEditFromView}>
                  Modifier
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={onSubmit}>
                {saving ? 'Enregistrement…' : 'Enregistrer sur la fiche employé'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VacantModal({
  open,
  mode,
  form,
  suggestions,
  saving,
  onClose,
  onChange,
  onSubmit,
  onEditFromView,
  onGenerateRrf,
}: {
  open: boolean;
  mode: ModalMode;
  form: VacantPosteInput;
  suggestions: PosteFieldSuggestions;
  saving: boolean;
  onClose: () => void;
  onChange: (next: VacantPosteInput) => void;
  onSubmit: () => void;
  onEditFromView?: () => void;
  onGenerateRrf?: () => void;
}) {
  if (!open) return null;
  const readOnly = mode === 'view';

  return (
    <div className="modal-overlay open" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg postes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {mode === 'create'
              ? 'Nouveau poste vacant'
              : mode === 'edit'
                ? 'Modifier le poste vacant'
                : 'Détail poste vacant'}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="mvt-form-grid">
            <label className="form-field form-field-span-2">
              <span>Intitulé du poste *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.title || '—'}</div>
              ) : (
                <SuggestInput
                  listId="vac-title-list"
                  value={form.title}
                  onChange={(v) => onChange({ ...form, title: v })}
                  suggestions={suggestions.titles}
                  required
                />
              )}
            </label>

            <label className="form-field">
              <span>Département</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.department || '—'}</div>
              ) : (
                <SuggestInput
                  listId="vac-dept-list"
                  value={form.department || ''}
                  onChange={(v) => onChange({ ...form, department: v })}
                  suggestions={suggestions.departments}
                />
              )}
            </label>

            <label className="form-field">
              <span>Localisation</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.location || '—'}</div>
              ) : (
                <SuggestInput
                  listId="vac-loc-list"
                  value={form.location || ''}
                  onChange={(v) => onChange({ ...form, location: v })}
                  suggestions={suggestions.locations}
                />
              )}
            </label>

            <label className="form-field">
              <span>Grade</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.grade || '—'}</div>
              ) : (
                <SuggestInput
                  listId="vac-grade-list"
                  value={form.grade || ''}
                  onChange={(v) => onChange({ ...form, grade: v })}
                  suggestions={suggestions.grades}
                />
              )}
            </label>

            <label className="form-field">
              <span>Rapporte à</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.reportsTo || '—'}</div>
              ) : (
                <SuggestInput
                  listId="vac-report-list"
                  value={form.reportsTo || ''}
                  onChange={(v) => onChange({ ...form, reportsTo: v })}
                  suggestions={suggestions.reportsTo}
                />
              )}
            </label>

            <label className="form-field">
              <span>Centre de coût</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.costCenter || '—'}</div>
              ) : (
                <SuggestInput
                  listId="vac-cc-list"
                  value={form.costCenter || ''}
                  onChange={(v) => onChange({ ...form, costCenter: v })}
                  suggestions={suggestions.costCenters}
                />
              )}
            </label>

            <label className="form-field">
              <span>Effectif à recruter</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.headcount ?? 1}</div>
              ) : (
                <input
                  type="number"
                  min={1}
                  value={form.headcount ?? 1}
                  onChange={(e) =>
                    onChange({ ...form, headcount: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              )}
            </label>

            <label className="form-field form-field-span-2">
              <span>Description du poste</span>
              {readOnly ? (
                <div className="mvt-readonly-value mvt-readonly-notes">
                  {form.jobDescription || '—'}
                </div>
              ) : (
                <textarea
                  rows={3}
                  value={form.jobDescription || ''}
                  onChange={(e) => onChange({ ...form, jobDescription: e.target.value })}
                />
              )}
            </label>

            <label className="form-field form-field-span-2">
              <span>Notes</span>
              {readOnly ? (
                <div className="mvt-readonly-value mvt-readonly-notes">{form.notes || '—'}</div>
              ) : (
                <textarea
                  rows={2}
                  value={form.notes || ''}
                  onChange={(e) => onChange({ ...form, notes: e.target.value })}
                />
              )}
            </label>
          </div>
        </div>
        <div className="modal-footer">
          {mode === 'view' ? (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Fermer
              </button>
              {onGenerateRrf && (
                <button type="button" className="btn btn-outline" onClick={onGenerateRrf}>
                  Générer RRF
                </button>
              )}
              {onEditFromView && (
                <button type="button" className="btn btn-primary" onClick={onEditFromView}>
                  Modifier
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={onSubmit}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PostesPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canEdit =
    can('employes.postes', 'edit')
    || can('employes.postes', 'create')
    || can('employes.liste', 'edit')
    || can('employes.liste', 'create');
  const canDelete =
    can('employes.postes', 'delete') || can('employes.liste', 'delete');

  const [tab, setTab] = useState<PageTab>('catalogue');
  const [bundle, setBundle] = useState<PostesBundle | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [catalogFilters, setCatalogFilters] = useState(EMPTY_CATALOG_FILTERS);
  const [vacantFilters, setVacantFilters] = useState(EMPTY_VACANT_FILTERS);
  const [saving, setSaving] = useState(false);

  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogMode, setCatalogMode] = useState<ModalMode>('view');
  const [catalogForm, setCatalogForm] = useState<CatalogForm | null>(null);
  const [catalogGroup, setCatalogGroup] = useState<PosteGroup | null>(null);

  const [occOpen, setOccOpen] = useState(false);
  const [occGroup, setOccGroup] = useState<PosteGroup | null>(null);

  const [empModal, setEmpModal] = useState(false);
  const [empMode, setEmpMode] = useState<ModalMode>('edit');
  const [empForm, setEmpForm] = useState<EmployeePosteForm>(EMPTY_EMP_FORM);

  const [vacModal, setVacModal] = useState(false);
  const [vacMode, setVacMode] = useState<ModalMode>('create');
  const [vacForm, setVacForm] = useState<VacantPosteInput>(EMPTY_VACANT);
  const [vacActive, setVacActive] = useState<VacantPoste | null>(null);

  const [ctxMenu, setCtxMenu] = useState<
    | { x: number; y: number; kind: 'group'; item: PosteGroup }
    | { x: number; y: number; kind: 'vacant'; item: VacantPoste }
    | null
  >(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resP, resE] = await Promise.all([
        fetch('/api/employes/postes'),
        fetch('/api/employees'),
      ]);
      const jsonP = await resP.json();
      const jsonE = await resE.json();
      if (!resP.ok) {
        await showError(jsonP?.error || 'Chargement impossible');
        setBundle(null);
      } else {
        setBundle(jsonP as PostesBundle);
      }
      setEmployees(resE.ok && Array.isArray(jsonE) ? jsonE : []);
    } catch {
      await showError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const suggestions = bundle?.suggestions || EMPTY_SUGGESTIONS;
  const groups = bundle?.groups || [];
  const vacants = bundle?.vacants || [];
  const dashboard = bundle?.dashboard || null;

  const toolbarGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const hay = [
        g.title,
        ...g.departments,
        g.location,
        g.grade,
        g.costCenter,
        String(g.count),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [groups, search]);

  const catalogFilterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarGroups, {
        poste: (g) => g.title,
        occupants: (g) => String(g.count),
        departements: (g) => catalogDepartementsValue(g),
      }),
    [toolbarGroups],
  );

  const filteredGroups = useMemo(
    () =>
      toolbarGroups.filter(
        (g) =>
          matchesColumnFilter(catalogFilters.poste, g.title) &&
          matchesColumnFilter(catalogFilters.occupants, String(g.count)) &&
          matchesColumnFilter(catalogFilters.departements, catalogDepartementsValue(g)),
      ),
    [toolbarGroups, catalogFilters],
  );

  const toolbarVacants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vacants;
    return vacants.filter((v) => {
      const hay = [
        v.title,
        v.department,
        v.location,
        v.grade,
        v.costCenter,
        v.reportsTo,
        v.notes,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [vacants, search]);

  const vacantFilterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarVacants, {
        poste: (v) => v.title,
        departement: (v) => v.department,
        localisation: (v) => v.location,
        grade: (v) => v.grade,
        effectif: (v) => String(v.headcount),
        reportsTo: (v) => v.reportsTo,
      }),
    [toolbarVacants],
  );

  const filteredVacants = useMemo(
    () =>
      toolbarVacants.filter(
        (v) =>
          matchesColumnFilter(vacantFilters.poste, v.title) &&
          matchesColumnFilter(vacantFilters.departement, v.department) &&
          matchesColumnFilter(vacantFilters.localisation, v.location) &&
          matchesColumnFilter(vacantFilters.grade, v.grade) &&
          matchesColumnFilter(vacantFilters.effectif, String(v.headcount)) &&
          matchesColumnFilter(vacantFilters.reportsTo, v.reportsTo),
      ),
    [toolbarVacants, vacantFilters],
  );

  const catalogActiveFilters = useMemo(
    () => countActiveColumnFilters(catalogFilters),
    [catalogFilters],
  );
  const vacantActiveFilters = useMemo(
    () => countActiveColumnFilters(vacantFilters),
    [vacantFilters],
  );

  const openViewPoste = (g: PosteGroup) => {
    setCatalogGroup(g);
    setCatalogForm(groupToCatalogForm(g));
    setCatalogMode('view');
    setCatalogOpen(true);
  };

  const openEditPoste = (g: PosteGroup) => {
    setCatalogGroup(g);
    setCatalogForm(groupToCatalogForm(g));
    setCatalogMode('edit');
    setCatalogOpen(true);
  };

  const openOccupants = (g: PosteGroup) => {
    setOccGroup(g);
    setOccOpen(true);
  };

  const openEmployeeFromOccupant = (o: PosteOccupant, mode: ModalMode) => {
    const full = employees.find(
      (e) => e.matricule.trim().toLowerCase() === o.matricule.trim().toLowerCase(),
    );
    setEmpForm(full ? employeeToForm(full) : occupantToForm(o));
    setEmpMode(mode);
    setEmpModal(true);
  };

  const saveCatalog = async () => {
    if (!catalogForm?.title?.trim()) {
      await showError('Intitulé du poste requis');
      return;
    }
    setSaving(true);
    try {
      const payload: CatalogPosteUpdate = {
        fromTitle: catalogForm.fromTitle,
        title: catalogForm.title.trim(),
        department: catalogForm.department,
        location: catalogForm.location,
        grade: catalogForm.grade,
        costCenter: catalogForm.costCenter,
        reportsTo: catalogForm.reportsTo,
        company: catalogForm.company,
        applyMeta: true,
      };
      const res = await fetch('/api/employes/postes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-catalog', catalog: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess(`${json.updated || 0} fiche(s) employé mise(s) à jour`);
      setCatalogOpen(false);
      await load(true);
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const saveEmployeePoste = async () => {
    if (!empForm.matricule.trim() || !empForm.jobTitle.trim()) {
      await showError('Matricule et poste requis');
      return;
    }
    setSaving(true);
    try {
      const payload: EmployeePosteUpdate = {
        matricule: empForm.matricule,
        jobTitle: empForm.jobTitle.trim(),
        position: empForm.position?.trim() || empForm.jobTitle.trim(),
        departement: empForm.departement,
        departmentHr: empForm.departmentHr || empForm.departement,
        grade: empForm.grade,
        localisation: empForm.localisation,
        centreCout: empForm.centreCout,
        lineManagerName: empForm.lineManagerName,
        lineManagerPosition: empForm.lineManagerPosition,
        patersonGrade: empForm.patersonGrade,
        company: empForm.company,
      };
      const res = await fetch('/api/employes/postes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-employee', employee: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess('Fiche employé mise à jour');
      setEmpModal(false);
      // refresh occupants modal group if open
      await load(true);
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const saveVacant = async () => {
    if (!vacForm.title?.trim()) {
      await showError('Intitulé requis');
      return;
    }
    setSaving(true);
    try {
      const isEdit = vacMode === 'edit' && vacActive;
      const res = await fetch(
        isEdit ? `/api/employes/postes/${vacActive.id}` : '/api/employes/postes',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isEdit ? vacForm : { vacant: vacForm }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess(isEdit ? 'Poste vacant mis à jour' : 'Poste vacant créé');
      setVacModal(false);
      setVacActive(null);
      await load(true);
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const deleteVacant = async (v: VacantPoste) => {
    const ok = await confirmDelete(
      `Supprimer le poste vacant « ${v.title} » ?`,
      'Cette action est irréversible.',
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/employes/postes/${v.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Poste vacant supprimé');
      await load(true);
    } catch {
      await showError('Erreur de suppression');
    }
  };

  const generateRrf = (
    v: VacantPoste | VacantPosteInput | ReturnType<typeof groupToRrfInput>,
  ) => {
    const payload = toRrfPrefillPayload(v);
    writeRrfPrefill(payload);
    startTopProgress();
    router.push(buildRrfUrl(v));
  };

  const generateRrfFromGroup = (g: PosteGroup) => {
    generateRrf(groupToRrfInput(g));
  };

  // Keep occupants modal group in sync after reload
  useEffect(() => {
    if (!occOpen || !bundle) return;
    setOccGroup((prev) => {
      if (!prev) return prev;
      const next =
        bundle.groups.find((g) => g.key === prev.key)
        || bundle.groups.find(
          (g) => g.title.toLowerCase() === prev.title.toLowerCase(),
        );
      return next || prev;
    });
  }, [bundle, occOpen]);

  const ctxItems = useMemo((): ContextMenuItem[] => {
    if (!ctxMenu) return [];
    if (ctxMenu.kind === 'group') {
      const g = ctxMenu.item;
      const items: ContextMenuItem[] = [
        {
          id: 'view',
          label: 'Voir le poste',
          icon: 'view',
          onClick: () => openViewPoste(g),
        },
      ];
      if (canEdit) {
        items.push({
          id: 'edit',
          label: 'Modifier le poste',
          icon: 'edit',
          onClick: () => openEditPoste(g),
        });
      }
      items.push(
        {
          id: 'occupants',
          label: 'Occupants',
          icon: 'view',
          onClick: () => openOccupants(g),
        },
        {
          id: 'rrf',
          label: 'Générer le RRF',
          icon: 'doc',
          onClick: () => generateRrfFromGroup(g),
        },
      );
      if (canEdit) {
        items.push({
          id: 'vacant',
          label: 'Créer un vacant',
          icon: 'add',
          onClick: () => {
            setVacActive(null);
            setVacForm({
              ...EMPTY_VACANT,
              title: g.title,
              department: g.department || g.departments[0] || '',
              location: g.location,
              grade: g.grade,
              costCenter: g.costCenter,
              reportsTo: g.reportsTo,
            });
            setVacMode('create');
            setVacModal(true);
          },
        });
      }
      return items;
    }
    const v = ctxMenu.item;
    const items: ContextMenuItem[] = [
      {
        id: 'view',
        label: 'Voir',
        icon: 'view',
        onClick: () => {
          setVacActive(v);
          setVacForm(vacantToForm(v));
          setVacMode('view');
          setVacModal(true);
        },
      },
      {
        id: 'rrf',
        label: 'Générer le RRF',
        icon: 'doc',
        onClick: () => generateRrf(v),
      },
    ];
    if (canEdit) {
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => {
          setVacActive(v);
          setVacForm(vacantToForm(v));
          setVacMode('edit');
          setVacModal(true);
        },
      });
    }
    if (canDelete) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => void deleteVacant(v),
      });
    }
    return items;
  }, [ctxMenu, canEdit, canDelete]);

  if (loading) {
    return (
      <PermissionGate
        anyOf={[
          { menuId: 'employes.postes', action: 'view' },
          { menuId: 'employes.liste', action: 'view' },
        ]}
      >
        <div className="loading">Chargement des postes…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'employes.postes', action: 'view' },
        { menuId: 'employes.liste', action: 'view' },
      ]}
    >
      <div className="mvt-page postes-page">
        <div className="postes-sticky">
          <div className="page-header page-header-with-tabs mvt-page-header">
            <div>
              <div className="page-header-title-row">
                <h2>Postes</h2>
                <RefreshButton onClick={() => load(true)} loading={refreshing} />
              </div>
              <p className="mvt-page-sub">
                Catalogue des postes, occupants et postes vacants
              </p>
            </div>
            <div className="page-header-actions mvt-header-actions">
              <div className="tabs header-tabs header-tabs-compact mvt-tabs" role="tablist">
                {(
                  [
                    ['dashboard', 'Dashboard'],
                    ['catalogue', 'Catalogue'],
                    ['vacants', 'Vacants'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`tab-btn tab-btn-sm mvt-tab-btn${tab === id ? ' active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {canEdit && tab === 'vacants' && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm mvt-primary-btn"
                  onClick={() => {
                    setVacActive(null);
                    setVacForm({ ...EMPTY_VACANT });
                    setVacMode('create');
                    setVacModal(true);
                  }}
                >
                  + Poste vacant
                </button>
              )}
            </div>
          </div>

          {(tab === 'catalogue' || tab === 'vacants') && (
            <div className="mvt-toolbar postes-sticky-toolbar">
              <div className="mvt-search">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  placeholder={
                    tab === 'catalogue'
                      ? 'Rechercher un poste…'
                      : 'Rechercher un poste vacant…'
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Rechercher"
                />
                {search ? (
                  <button
                    type="button"
                    className="mvt-search-clear"
                    aria-label="Effacer"
                    onClick={() => setSearch('')}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              {tab === 'catalogue' && catalogActiveFilters > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setCatalogFilters(EMPTY_CATALOG_FILTERS)}
                >
                  Effacer les filtres ({catalogActiveFilters})
                </button>
              ) : null}
              {tab === 'vacants' && vacantActiveFilters > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setVacantFilters(EMPTY_VACANT_FILTERS)}
                >
                  Effacer les filtres ({vacantActiveFilters})
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className={`postes-body${tab === 'dashboard' ? ' is-dashboard' : ' is-table'}`}>
          {tab === 'dashboard' && (
            <DashboardView
              dashboard={dashboard}
              onOpenCatalogue={() => setTab('catalogue')}
              onOpenVacants={() => setTab('vacants')}
            />
          )}

          {tab === 'catalogue' && (
            <div className="mvt-table-panel postes-table-panel">
              {filteredGroups.length === 0 ? (
                <p className="empty-state">Aucun poste trouvé dans le fichier employés.</p>
              ) : (
                <div className="table-wrap postes-table-wrap">
                  <table className="data-table mvt-table postes-compact-table">
                    <thead>
                      <tr>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Poste"
                            values={catalogFilterValues.poste}
                            selected={catalogFilters.poste}
                            onChange={(next) => setCatalogFilters((p) => ({ ...p, poste: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Occupants"
                            values={catalogFilterValues.occupants}
                            selected={catalogFilters.occupants}
                            onChange={(next) => setCatalogFilters((p) => ({ ...p, occupants: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Départements"
                            values={catalogFilterValues.departements}
                            selected={catalogFilters.departements}
                            onChange={(next) => setCatalogFilters((p) => ({ ...p, departements: next }))}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGroups.map((g) => (
                        <tr
                          key={g.key}
                          className="postes-row"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'group', item: g });
                          }}
                          onDoubleClick={() => openViewPoste(g)}
                          title="Clic droit : actions · double-clic : voir"
                        >
                          <td>{g.title}</td>
                          <td>
                            <span className="postes-count-badge">{g.count}</span>
                          </td>
                          <td className="muted">
                            {g.departments.slice(0, 3).join(', ') || '—'}
                            {g.departments.length > 3 ? '…' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'vacants' && (
            <div className="mvt-table-panel postes-table-panel">
              {filteredVacants.length === 0 ? (
                <div className="postes-empty-vacants">
                  <p className="empty-state">
                    Aucun poste vacant enregistré.
                    {canEdit
                      ? ' Créez un poste non affecté pour préparer un recrutement (RRF).'
                      : ''}
                  </p>
                </div>
              ) : (
                <div className="table-wrap postes-table-wrap">
                  <table className="data-table mvt-table postes-compact-table">
                    <thead>
                      <tr>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Poste"
                            values={vacantFilterValues.poste}
                            selected={vacantFilters.poste}
                            onChange={(next) => setVacantFilters((p) => ({ ...p, poste: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Département"
                            values={vacantFilterValues.departement}
                            selected={vacantFilters.departement}
                            onChange={(next) => setVacantFilters((p) => ({ ...p, departement: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Localisation"
                            values={vacantFilterValues.localisation}
                            selected={vacantFilters.localisation}
                            onChange={(next) => setVacantFilters((p) => ({ ...p, localisation: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Grade"
                            values={vacantFilterValues.grade}
                            selected={vacantFilters.grade}
                            onChange={(next) => setVacantFilters((p) => ({ ...p, grade: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Effectif"
                            values={vacantFilterValues.effectif}
                            selected={vacantFilters.effectif}
                            onChange={(next) => setVacantFilters((p) => ({ ...p, effectif: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Rapporte à"
                            values={vacantFilterValues.reportsTo}
                            selected={vacantFilters.reportsTo}
                            onChange={(next) => setVacantFilters((p) => ({ ...p, reportsTo: next }))}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVacants.map((v) => (
                        <tr
                          key={v.id}
                          className="postes-row"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'vacant', item: v });
                          }}
                          onDoubleClick={() => {
                            setVacActive(v);
                            setVacForm(vacantToForm(v));
                            setVacMode('view');
                            setVacModal(true);
                          }}
                          title="Clic droit : actions · double-clic : voir"
                        >
                          <td>{v.title}</td>
                          <td>{v.department || '—'}</td>
                          <td>{v.location || '—'}</td>
                          <td>{v.grade || '—'}</td>
                          <td>
                            <span className="postes-count-badge">{v.headcount}</span>
                          </td>
                          <td>{v.reportsTo || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
        {catalogForm && (
          <CatalogPosteModal
            open={catalogOpen}
            mode={catalogMode}
            form={catalogForm}
            occupantCount={catalogGroup?.count || 0}
            suggestions={suggestions}
            saving={saving}
            onClose={() => setCatalogOpen(false)}
            onChange={setCatalogForm}
            onSubmit={() => void saveCatalog()}
            onEditFromView={canEdit ? () => setCatalogMode('edit') : undefined}
            onOpenOccupants={
              catalogGroup
                ? () => {
                    setCatalogOpen(false);
                    openOccupants(catalogGroup);
                  }
                : undefined
            }
          />
        )}

        <OccupantsModal
          open={occOpen}
          group={occGroup}
          canEdit={canEdit}
          onClose={() => setOccOpen(false)}
          onEditOccupant={(o) => openEmployeeFromOccupant(o, 'edit')}
          onViewOccupant={(o) => openEmployeeFromOccupant(o, 'view')}
        />

        <EmployeePosteModal
          open={empModal}
          mode={empMode}
          form={empForm}
          suggestions={suggestions}
          saving={saving}
          onClose={() => setEmpModal(false)}
          onChange={setEmpForm}
          onSubmit={() => void saveEmployeePoste()}
          onEditFromView={canEdit ? () => setEmpMode('edit') : undefined}
        />

        <VacantModal
          open={vacModal}
          mode={vacMode}
          form={vacForm}
          suggestions={suggestions}
          saving={saving}
          onClose={() => {
            setVacModal(false);
            setVacActive(null);
          }}
          onChange={setVacForm}
          onSubmit={() => void saveVacant()}
          onEditFromView={canEdit ? () => setVacMode('edit') : undefined}
          onGenerateRrf={() => generateRrf(vacForm)}
        />

        {ctxMenu && (
          <RowContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            items={ctxItems}
            onClose={() => setCtxMenu(null)}
          />
        )}
      </div>
    </PermissionGate>
  );
}
