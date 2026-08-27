'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import ContractantsDashboard from '@/components/contractants/ContractantsDashboard';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  CONTRACTANT_EMPLOYEE_STATUTS,
  CONTRACTANT_ETATS_CIVILS,
  CONTRACTANT_SEXES,
  etatCivilLabel,
  resolveContractantServiceStyle,
  type Contractant,
  type ContractantEmployee,
  type ContractantEmployeeStatut,
  type ContractantEtatCivilId,
  type ContractantSexe,
} from '@/lib/contractants-types';
import { DEFAULT_LOCALISATIONS } from '@/lib/localisations';
import { compareExcoDepartments } from '@/lib/exco-department-map';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import { confirmAction, confirmDelete, closeSwal, showActionLoading, showError, showSuccess, showSuccessHtml } from '@/lib/swal';

type PageTab = 'dashboard' | 'contractants' | 'employes';

type EmpFilterKey =
  | 'nom'
  | 'sexe'
  | 'lieuAffectation'
  | 'fonction'
  | 'departement'
  | 'telephone'
  | 'etatCivil'
  | 'statut'
  | 'contractant';

type ContractorForm = {
  denomination: string;
  typeService: string;
};

type EmployeeForm = {
  contractantId: string;
  nom: string;
  sexe: ContractantSexe | '';
  lieuAffectation: string;
  fonction: string;
  departement: string;
  telephone: string;
  etatCivil: ContractantEtatCivilId;
  statut: ContractantEmployeeStatut;
};

type FlatEmployee = ContractantEmployee & {
  contractantId: string;
  contractantNom: string;
  typeService: string;
};

const EMPTY_CONTRACTOR: ContractorForm = { denomination: '', typeService: '' };
const EMPTY_EMPLOYEE: Omit<EmployeeForm, 'contractantId'> = {
  nom: '',
  sexe: '',
  lieuAffectation: 'Zamba',
  fonction: '',
  departement: '',
  telephone: '',
  etatCivil: 'C',
  statut: 'Permanent',
};
const EMPTY_EMP_FILTERS: Record<EmpFilterKey, string[]> = {
  nom: [],
  sexe: [],
  lieuAffectation: [],
  fonction: [],
  departement: [],
  telephone: [],
  etatCivil: [],
  statut: [],
  contractant: [],
};

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function EmptyUsersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function EmptySearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

function ServiceIcon({ kind }: { kind: ReturnType<typeof resolveContractantServiceStyle>['kind'] }) {
  const common = {
    viewBox: '0 0 24 24',
    width: 22,
    height: 22,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
  };
  switch (kind) {
    case 'nettoyage':
      return (
        <svg {...common}>
          <path d="M4 20h16" />
          <path d="M9 20V9l-3 2" />
          <path d="M12 20V4l7 4v4" />
          <path d="M15 10h3" />
        </svg>
      );
    case 'placement':
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="3" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a3 3 0 0 1 0 5.74" />
        </svg>
      );
    case 'securite':
      return (
        <svg {...common}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case 'catering':
      return (
        <svg {...common}>
          <path d="M3 11h18v2a7 7 0 0 1-7 7h-4a7 7 0 0 1-7-7v-2z" />
          <path d="M7 11V7a2 2 0 0 1 2-2h0" />
          <path d="M12 11V4" />
          <path d="M17 11V7a2 2 0 0 0-2-2h0" />
        </svg>
      );
    case 'transport':
      return (
        <svg {...common}>
          <rect x="1" y="7" width="15" height="10" rx="2" />
          <path d="M16 10h4l3 3v4h-7V10z" />
          <circle cx="5.5" cy="19" r="2" />
          <circle cx="18.5" cy="19" r="2" />
        </svg>
      );
    case 'travaux':
      return (
        <svg {...common}>
          <path d="M2 20h20" />
          <path d="M5 20V10l7-5 7 5v10" />
          <path d="M9 20v-5h6v5" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
      );
  }
}

export default function ContractantsPage() {
  const { can } = usePermissions();
  const canCreate = can('employes.contractants', 'create') || can('employes.liste', 'create');
  const canEdit = can('employes.contractants', 'edit') || can('employes.liste', 'edit');
  const canDelete = can('employes.contractants', 'delete') || can('employes.liste', 'delete');

  const [tab, setTab] = useState<PageTab>('contractants');
  const [contractants, setContractants] = useState<Contractant[]>([]);
  const [departements, setDepartements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [colFilters, setColFilters] = useState<Record<EmpFilterKey, string[]>>(EMPTY_EMP_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const pendingContractantFilter = useRef<string | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const importTargetIdRef = useRef<string | null>(null);

  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; kind: 'contractant'; contractant: Contractant }
    | { x: number; y: number; kind: 'employee'; employee: FlatEmployee }
    | null
  >(null);

  const [viewEmployee, setViewEmployee] = useState<FlatEmployee | null>(null);

  const [contractorModal, setContractorModal] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    form: ContractorForm;
    saving: boolean;
  } | null>(null);

  const [employeeModal, setEmployeeModal] = useState<{
    mode: 'create' | 'edit';
    id?: string;
    form: EmployeeForm;
    saving: boolean;
  } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resContractants, resDepts] = await Promise.all([
        fetch('/api/employes/contractants'),
        fetch('/api/settings/departments'),
      ]);
      const data = await resContractants.json();
      if (!resContractants.ok) {
        await showError(data?.error || 'Chargement impossible');
        setContractants([]);
      } else {
        setContractants(Array.isArray(data.contractants) ? data.contractants : []);
      }
      if (resDepts.ok) {
        const deptData = await resDepts.json();
        const list = Array.isArray(deptData)
          ? deptData
          : Array.isArray(deptData?.departments)
            ? deptData.departments
            : [];
        setDepartements(
          list
            .map((d: { name?: string; label?: string } | string) =>
              typeof d === 'string' ? d : d.name || d.label || '',
            )
            .map((s: string) => s.trim())
            .filter(Boolean),
        );
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
      setContractants([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSearch('');
    setSearchOpen(false);
    if (tab !== 'contractants') setSelectedId(null);
    if (tab === 'employes' && pendingContractantFilter.current) {
      setColFilters({
        ...EMPTY_EMP_FILTERS,
        contractant: [pendingContractantFilter.current],
      });
      pendingContractantFilter.current = null;
    } else if (tab !== 'employes') {
      setColFilters(EMPTY_EMP_FILTERS);
    }
  }, [tab]);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onPointerDown = (event: globalThis.MouseEvent) => {
      const target = event.target as Node;
      if (searchWrapRef.current?.contains(target)) return;
      if (!search.trim()) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [searchOpen, search]);

  const allEmployees = useMemo<FlatEmployee[]>(() => {
    const rows: FlatEmployee[] = [];
    for (const c of contractants) {
      for (const e of c.employees) {
        rows.push({
          ...e,
          contractantId: c.id,
          contractantNom: c.denomination,
          typeService: c.typeService,
        });
      }
    }
    return rows.sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));
  }, [contractants]);

  const localisationOptions = useMemo(() => [...DEFAULT_LOCALISATIONS], []);

  const departementOptions = useMemo(() => {
    const set = new Set<string>();
    for (const d of departements) if (d.trim()) set.add(d.trim());
    for (const e of allEmployees) if (e.departement.trim()) set.add(e.departement.trim());
    return [...set].sort(compareExcoDepartments);
  }, [departements, allEmployees]);

  const stats = useMemo(() => {
    const hommes = allEmployees.filter((e) => e.sexe === 'M').length;
    const femmes = allEmployees.filter((e) => e.sexe === 'F').length;
    return {
      contractants: contractants.length,
      employes: allEmployees.length,
      hommes,
      femmes,
    };
  }, [contractants, allEmployees]);

  const filteredContractants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contractants;
    return contractants.filter(
      (c) =>
        c.denomination.toLowerCase().includes(q)
        || c.typeService.toLowerCase().includes(q),
    );
  }, [contractants, search]);

  const searchedEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allEmployees;
    return allEmployees.filter(
      (e) =>
        e.nom.toLowerCase().includes(q)
        || e.fonction.toLowerCase().includes(q)
        || e.departement.toLowerCase().includes(q)
        || e.lieuAffectation.toLowerCase().includes(q)
        || e.telephone.toLowerCase().includes(q)
        || e.contractantNom.toLowerCase().includes(q)
        || etatCivilLabel(e.etatCivil).toLowerCase().includes(q),
    );
  }, [allEmployees, search]);

  const empFilterValues = useMemo(
    () =>
      buildColumnFilterValues(searchedEmployees, {
        nom: (e) => e.nom,
        sexe: (e) => e.sexe,
        lieuAffectation: (e) => e.lieuAffectation,
        fonction: (e) => e.fonction,
        departement: (e) => e.departement,
        telephone: (e) => e.telephone,
        etatCivil: (e) => etatCivilLabel(e.etatCivil),
        statut: (e) => e.statut,
        contractant: (e) => e.contractantNom,
      }),
    [searchedEmployees],
  );

  const filteredEmployees = useMemo(
    () =>
      searchedEmployees.filter(
        (e) =>
          matchesColumnFilter(colFilters.nom, e.nom)
          && matchesColumnFilter(colFilters.sexe, e.sexe)
          && matchesColumnFilter(colFilters.lieuAffectation, e.lieuAffectation)
          && matchesColumnFilter(colFilters.fonction, e.fonction)
          && matchesColumnFilter(colFilters.departement, e.departement)
          && matchesColumnFilter(colFilters.telephone, e.telephone)
          && matchesColumnFilter(colFilters.etatCivil, etatCivilLabel(e.etatCivil))
          && matchesColumnFilter(colFilters.statut, e.statut)
          && matchesColumnFilter(colFilters.contractant, e.contractantNom),
      ),
    [searchedEmployees, colFilters],
  );

  const activeEmpFilterCount = useMemo(
    () => countActiveColumnFilters(colFilters),
    [colFilters],
  );

  const selected = useMemo(
    () => contractants.find((c) => c.id === selectedId) ?? null,
    [contractants, selectedId],
  );

  useEffect(() => {
    if (selectedId && !contractants.some((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [contractants, selectedId]);

  const openCreateContractor = () => {
    setContractorModal({ mode: 'create', form: { ...EMPTY_CONTRACTOR }, saving: false });
  };

  const openEditContractor = (c: Contractant) => {
    setContractorModal({
      mode: 'edit',
      id: c.id,
      form: { denomination: c.denomination, typeService: c.typeService },
      saving: false,
    });
  };

  const defaultContractantIdForEmployee = () => {
    if (selected) return selected.id;
    if (colFilters.contractant.length === 1) {
      const name = colFilters.contractant[0];
      return contractants.find((c) => c.denomination === name)?.id || '';
    }
    return contractants[0]?.id || '';
  };

  const openCreateEmployee = (contractantId?: string) => {
    if (contractants.length === 0) {
      void showError('Créez d’abord un contractant.');
      return;
    }
    setEmployeeModal({
      mode: 'create',
      form: {
        ...EMPTY_EMPLOYEE,
        contractantId: contractantId || defaultContractantIdForEmployee(),
      },
      saving: false,
    });
  };

  const openEditEmployee = (e: ContractantEmployee, contractantId: string) => {
    setEmployeeModal({
      mode: 'edit',
      id: e.id,
      form: {
        contractantId,
        nom: e.nom,
        sexe: e.sexe,
        lieuAffectation: e.lieuAffectation,
        fonction: e.fonction,
        departement: e.departement,
        telephone: e.telephone,
        etatCivil: e.etatCivil,
        statut: e.statut || 'Permanent',
      },
      saving: false,
    });
  };

  const handlePlusClick = () => {
    if (tab === 'employes') {
      openCreateEmployee();
      return;
    }
    if (tab === 'contractants' && selected) {
      openCreateEmployee(selected.id);
      return;
    }
    openCreateContractor();
  };

  const openEmployeesForContractant = (c: Contractant) => {
    pendingContractantFilter.current = c.denomination;
    setSelectedId(null);
    setTab('employes');
  };

  const saveContractor = async () => {
    if (!contractorModal) return;
    setContractorModal({ ...contractorModal, saving: true });
    showActionLoading('Enregistrement…');
    try {
      const isEdit = contractorModal.mode === 'edit' && contractorModal.id;
      const res = await fetch(
        isEdit ? `/api/employes/contractants/${contractorModal.id}` : '/api/employes/contractants',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contractorModal.form),
        },
      );
      const data = await res.json();
      closeSwal();
      if (!res.ok) {
        await showError(data?.error || 'Enregistrement impossible');
        setContractorModal({ ...contractorModal, saving: false });
        return;
      }
      await showSuccess(isEdit ? 'Contractant mis à jour' : 'Contractant créé');
      setContractorModal(null);
      await load(true);
    } catch (err) {
      closeSwal();
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
      setContractorModal({ ...contractorModal, saving: false });
    }
  };

  const removeContractor = async (c: Contractant) => {
    const ok = await confirmDelete(
      `Supprimer « ${c.denomination} » ?`,
      `${c.employees.length} employé(s) seront également supprimés.`,
    );
    if (!ok) return;
    showActionLoading('Suppression…');
    try {
      const res = await fetch(`/api/employes/contractants/${c.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      closeSwal();
      if (!res.ok) {
        await showError(data?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Contractant supprimé');
      if (selectedId === c.id) setSelectedId(null);
      await load(true);
    } catch (err) {
      closeSwal();
      await showError(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  const openCardMenu = (e: ReactMouseEvent, c: Contractant) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, kind: 'contractant', contractant: c });
  };

  const openEmployeeMenu = (e: ReactMouseEvent, employee: FlatEmployee) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, kind: 'employee', employee });
  };

  const openViewEmployee = (e: FlatEmployee) => {
    setViewEmployee(e);
  };

  const startEmployeeImport = (c: Contractant) => {
    importTargetIdRef.current = c.id;
    importFileRef.current?.click();
  };

  const handleImportFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const contractantId = importTargetIdRef.current;
    e.target.value = '';
    importTargetIdRef.current = null;
    if (!file || !contractantId) return;

    const target = contractants.find((c) => c.id === contractantId);
    const ok = await confirmAction(
      `Importer dans « ${target?.denomination || 'contractant'} » ?`,
      'Les nouveaux employés seront ajoutés. Les noms déjà présents seront ignorés.',
      'Importer',
    );
    if (!ok) return;

    showActionLoading('Import…');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/employes/contractants/${contractantId}/employees/import`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      closeSwal();
      if (!res.ok) {
        await showError(data?.error || 'Import impossible');
        return;
      }
      const imported = Number(data.imported) || 0;
      const alreadyPresent = Array.isArray(data.alreadyPresent)
        ? data.alreadyPresent.map((n: unknown) => String(n || '').trim()).filter(Boolean)
        : [];
      const parts: string[] = [];
      parts.push(`<p><strong>${imported}</strong> employé(s) ajouté(s).</p>`);
      if (alreadyPresent.length > 0) {
        const list = alreadyPresent
          .map((n: string) => `<li>${n.replace(/</g, '&lt;')}</li>`)
          .join('');
        parts.push(
          `<p><strong>${alreadyPresent.length}</strong> agent(s) déjà inclus (non importés) :</p>`
          + `<ul style="text-align:left;max-height:220px;overflow:auto;margin:0.4rem 0 0;padding-left:1.2rem">${list}</ul>`,
        );
      }
      await showSuccessHtml(parts.join(''), 'Import terminé');
      await load(true);
    } catch (err) {
      closeSwal();
      await showError(err instanceof Error ? err.message : 'Import impossible');
    }
  };

  const buildContextItems = (): ContextMenuItem[] => {
    if (!contextMenu) return [];

    if (contextMenu.kind === 'employee') {
      const emp = contextMenu.employee;
      const items: ContextMenuItem[] = [
        {
          id: 'view',
          label: 'Voir',
          icon: 'view',
          onClick: () => openViewEmployee(emp),
        },
      ];
      if (canEdit) {
        items.push({
          id: 'edit',
          label: 'Modifier',
          icon: 'edit',
          onClick: () => openEditEmployee(emp, emp.contractantId),
        });
      }
      if (canDelete) {
        items.push({
          id: 'delete',
          label: 'Supprimer',
          icon: 'delete',
          danger: true,
          onClick: () => {
            void removeEmployee(emp, emp.contractantId);
          },
        });
      }
      return items;
    }

    const c = contextMenu.contractant;
    const items: ContextMenuItem[] = [];
    if (canEdit) {
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => openEditContractor(c),
      });
    }
    if (canDelete) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => {
          void removeContractor(c);
        },
      });
    }
    if (canEdit || canCreate) {
      items.push({
        id: 'import',
        label: 'Mise à jour',
        icon: 'import',
        onClick: () => startEmployeeImport(c),
      });
    }
    return items;
  };

  const saveEmployee = async () => {
    if (!employeeModal) return;
    if (!employeeModal.form.contractantId) {
      await showError('Sélectionnez un contractant.');
      return;
    }
    setEmployeeModal({ ...employeeModal, saving: true });
    showActionLoading('Enregistrement…');
    try {
      const isEdit = employeeModal.mode === 'edit' && employeeModal.id;
      const cid = employeeModal.form.contractantId;
      const payload = {
        nom: employeeModal.form.nom,
        sexe: employeeModal.form.sexe,
        lieuAffectation: employeeModal.form.lieuAffectation,
        fonction: employeeModal.form.fonction,
        departement: employeeModal.form.departement,
        telephone: employeeModal.form.telephone,
        etatCivil: employeeModal.form.etatCivil,
        statut: employeeModal.form.statut,
      };
      const res = await fetch(
        isEdit
          ? `/api/employes/contractants/${cid}/employees/${employeeModal.id}`
          : `/api/employes/contractants/${cid}/employees`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      closeSwal();
      if (!res.ok) {
        await showError(data?.error || 'Enregistrement impossible');
        setEmployeeModal({ ...employeeModal, saving: false });
        return;
      }
      await showSuccess(isEdit ? 'Employé mis à jour' : 'Employé ajouté');
      setEmployeeModal(null);
      await load(true);
      if (!isEdit) {
        setTab('employes');
      }
    } catch (err) {
      closeSwal();
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
      setEmployeeModal({ ...employeeModal, saving: false });
    }
  };

  const removeEmployee = async (e: ContractantEmployee, contractantId: string) => {
    const ok = await confirmDelete(`Supprimer « ${e.nom} » ?`);
    if (!ok) return;
    showActionLoading('Suppression…');
    try {
      const res = await fetch(
        `/api/employes/contractants/${contractantId}/employees/${e.id}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      closeSwal();
      if (!res.ok) {
        await showError(data?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Employé supprimé');
      await load(true);
    } catch (err) {
      closeSwal();
      await showError(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  const subtitle = useMemo(() => {
    if (tab === 'dashboard') {
      return `${stats.contractants} contractant${stats.contractants > 1 ? 's' : ''} · ${stats.employes} employé${stats.employes > 1 ? 's' : ''}`;
    }
    if (tab === 'employes') {
      const filterHint =
        colFilters.contractant.length === 1 ? ` · ${colFilters.contractant[0]}` : '';
      return `${filteredEmployees.length} employé${filteredEmployees.length > 1 ? 's' : ''} contractant${filteredEmployees.length > 1 ? 's' : ''}${filterHint}`;
    }
    if (selected) return selected.denomination;
    return `${filteredContractants.length} contractant${filteredContractants.length > 1 ? 's' : ''}`;
  }, [tab, stats, filteredEmployees.length, filteredContractants.length, selected, colFilters.contractant]);

  const plusTitle =
    tab === 'employes' || (tab === 'contractants' && selected)
      ? 'Ajouter un employé'
      : 'Ajouter un contractant';

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'employes.contractants', action: 'view' },
        { menuId: 'employes.liste', action: 'view' },
      ]}
    >
      <div className="contractants-page">
        <div className="contractants-sticky">
          <div className="page-header page-header-with-tabs contractants-header">
            <div>
              <div className="page-header-title-row">
                <h2>Contractants</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
              <p>{subtitle}</p>
            </div>
            <div className="contractants-header-actions">
              {(tab === 'contractants' || tab === 'employes') && !selected && (
                <div
                  ref={searchWrapRef}
                  className={`search-expand-wrap${searchOpen ? ' search-expand-open' : ''}${search.trim() ? ' search-expand-active' : ''}`}
                >
                  <button
                    type="button"
                    className="search-toggle-btn"
                    onClick={() => setSearchOpen((open) => !open)}
                    title="Rechercher"
                    aria-label="Rechercher"
                    aria-expanded={searchOpen}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.5" y1="16.5" x2="21" y2="21" />
                    </svg>
                  </button>
                  <div className="search-expand-panel">
                    <input
                      ref={searchInputRef}
                      type="search"
                      className="search-input search-input-expand"
                      placeholder={
                        tab === 'employes'
                          ? 'Employé, fonction, contractant…'
                          : 'Rechercher un contractant…'
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape' && !search.trim()) setSearchOpen(false);
                      }}
                    />
                  </div>
                </div>
              )}
              <div className="tabs header-tabs header-tabs-compact contractants-tabs">
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`}
                  onClick={() => setTab('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${tab === 'contractants' ? ' active' : ''}`}
                  onClick={() => setTab('contractants')}
                >
                  Contractants
                  <span className="employees-tab-count">{stats.contractants}</span>
                </button>
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${tab === 'employes' ? ' active' : ''}`}
                  onClick={() => setTab('employes')}
                >
                  Liste employés
                  <span className="employees-tab-count">{stats.employes}</span>
                </button>
              </div>
              {canCreate && (
                <button
                  type="button"
                  className="btn btn-accent btn-icon-only"
                  onClick={handlePlusClick}
                  title={plusTitle}
                  aria-label={plusTitle}
                >
                  <PlusIcon />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="contractants-body">
        {loading ? (
          <div className="loading">Chargement...</div>
        ) : tab === 'dashboard' ? (
          <ContractantsDashboard contractants={contractants} employees={allEmployees} />
        ) : tab === 'employes' ? (
          <div className="panel contractants-emp-list-panel">
            {activeEmpFilterCount > 0 && (
              <div className="contractants-table-filter-bar">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setColFilters(EMPTY_EMP_FILTERS)}
                >
                  Effacer les filtres ({activeEmpFilterCount})
                </button>
              </div>
            )}
            <div className="table-wrap contractants-emp-table-wrap">
              <table className="contractants-table contractants-table-compact">
                <thead>
                  <tr>
                    <th>
                      <TableHeaderFilter
                        label="Noms"
                        values={empFilterValues.nom}
                        selected={colFilters.nom}
                        onChange={(next) => setColFilters((p) => ({ ...p, nom: next }))}
                      />
                    </th>
                    <th>
                      <TableHeaderFilter
                        label="Sexe"
                        values={empFilterValues.sexe}
                        selected={colFilters.sexe}
                        onChange={(next) => setColFilters((p) => ({ ...p, sexe: next }))}
                      />
                    </th>
                    <th>
                      <TableHeaderFilter
                        label="Lieu"
                        values={empFilterValues.lieuAffectation}
                        selected={colFilters.lieuAffectation}
                        onChange={(next) => setColFilters((p) => ({ ...p, lieuAffectation: next }))}
                      />
                    </th>
                    <th>
                      <TableHeaderFilter
                        label="Fonction"
                        values={empFilterValues.fonction}
                        selected={colFilters.fonction}
                        onChange={(next) => setColFilters((p) => ({ ...p, fonction: next }))}
                      />
                    </th>
                    <th>
                      <TableHeaderFilter
                        label="Dépt."
                        values={empFilterValues.departement}
                        selected={colFilters.departement}
                        onChange={(next) => setColFilters((p) => ({ ...p, departement: next }))}
                      />
                    </th>
                    <th>
                      <TableHeaderFilter
                        label="Statut"
                        values={empFilterValues.statut}
                        selected={colFilters.statut}
                        onChange={(next) => setColFilters((p) => ({ ...p, statut: next }))}
                      />
                    </th>
                    <th>
                      <TableHeaderFilter
                        label="Contractant"
                        values={empFilterValues.contractant}
                        selected={colFilters.contractant}
                        onChange={(next) => setColFilters((p) => ({ ...p, contractant: next }))}
                      />
                    </th>
                    <th className="col-actions"> </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length === 0 ? (
                    <tr className="contractants-empty-row">
                      <td colSpan={8}>
                        <div className="contractants-empty-state">
                          <span className="contractants-empty-icon" aria-hidden>
                            {search.trim() || activeEmpFilterCount > 0 ? (
                              <EmptySearchIcon />
                            ) : (
                              <EmptyUsersIcon />
                            )}
                          </span>
                          <p>
                            {search.trim() || activeEmpFilterCount > 0
                              ? 'Aucun résultat pour cette recherche.'
                              : 'Aucun employé contractant.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((e) => (
                      <tr
                        key={`${e.contractantId}-${e.id}`}
                        onContextMenu={(ev) => openEmployeeMenu(ev, e)}
                      >
                        <td className="contractants-col-nom" title={e.nom}>{e.nom}</td>
                        <td className="contractants-col-sexe">{e.sexe || '—'}</td>
                        <td className="contractants-col-lieu" title={e.lieuAffectation}>{e.lieuAffectation || '—'}</td>
                        <td className="contractants-col-fonc" title={e.fonction || undefined}>{e.fonction || '—'}</td>
                        <td className="contractants-col-dept" title={e.departement || undefined}>{e.departement || '—'}</td>
                        <td className="contractants-col-statut">
                          <span
                            className={
                              e.statut === 'Permanent'
                                ? 'contractant-statut is-permanent'
                                : 'contractant-statut is-journalier'
                            }
                          >
                            {e.statut}
                          </span>
                        </td>
                        <td className="contractants-col-contractant" title={e.contractantNom}>{e.contractantNom}</td>
                        <td className="col-actions">
                          <button
                            type="button"
                            className="contractants-row-menu-btn"
                            aria-label={`Actions ${e.nom}`}
                            title="Actions"
                            onClick={(ev) => openEmployeeMenu(ev, e)}
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                              <circle cx="12" cy="5" r="1.6" fill="currentColor" />
                              <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                              <circle cx="12" cy="19" r="1.6" fill="currentColor" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : selected ? (
          <div className="contractants-detail">
            <div className="contractants-detail-toolbar">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedId(null)}
              >
                ← Retour
              </button>
              <div className="contractants-detail-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => openEmployeesForContractant(selected)}
                >
                  Voir les employés
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => openEditContractor(selected)}
                  >
                    Modifier
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void removeContractor(selected)}
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
            <div className="panel contractants-detail-head">
              <div>
                <h3>{selected.denomination}</h3>
                <p className="text-muted">{selected.typeService}</p>
              </div>
              <div className="contractants-detail-stats">
                <span><strong>{selected.employees.length}</strong> emp.</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {filteredContractants.length === 0 ? (
              <div className="panel contractants-empty">
                <div className="contractants-empty-state">
                  <span className="contractants-empty-icon" aria-hidden>
                    {search.trim() ? <EmptySearchIcon /> : <EmptyUsersIcon />}
                  </span>
                  <p>
                    {contractants.length === 0
                      ? 'Aucun contractant. Cliquez + pour créer le premier.'
                      : 'Aucun résultat pour cette recherche.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="contractants-grid">
                {filteredContractants.map((c) => {
                  const style = resolveContractantServiceStyle(c.typeService);
                  const permanents = c.employees.filter((e) => e.statut === 'Permanent').length;
                  const journaliers = c.employees.filter((e) => e.statut === 'Journalier').length;
                  const showMenu = canEdit || canDelete || canCreate;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      className="contractant-card"
                      style={{ ['--card-accent' as string]: style.color }}
                      onClick={() => openEmployeesForContractant(c)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openEmployeesForContractant(c);
                        }
                      }}
                    >
                      <div className="contractant-card-accent" aria-hidden />
                      <div className="contractant-card-body">
                        <div className="contractant-card-top">
                          <span className="contractant-card-icon" style={{ color: style.color }}>
                            <ServiceIcon kind={style.kind} />
                          </span>
                          <div className="contractant-card-titles">
                            <h3>{c.denomination}</h3>
                            <p className="contractant-card-service">{c.typeService || '—'}</p>
                          </div>
                          <span className="contractant-card-count">{c.employees.length}</span>
                        </div>
                        <div className="contractant-card-points">
                          <span className="contractant-point is-permanent">
                            <i className="contractant-dot" aria-hidden />
                            <strong>{permanents}</strong>
                            permanent{permanents !== 1 ? 's' : ''}
                          </span>
                          <span className="contractant-point is-journalier">
                            <i className="contractant-dot" aria-hidden />
                            <strong>{journaliers}</strong>
                            journalier{journaliers !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      {showMenu && (
                        <button
                          type="button"
                          className="contractant-card-menu-btn"
                          aria-label={`Actions ${c.denomination}`}
                          title="Actions"
                          onClick={(e) => openCardMenu(e, c)}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
                            <circle cx="12" cy="5" r="1.6" fill="currentColor" />
                            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                            <circle cx="12" cy="19" r="1.6" fill="currentColor" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      </div>

      {contractorModal && (
        <div className="modal-overlay open" onClick={() => !contractorModal.saving && setContractorModal(null)}>
          <div className="modal contractants-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {contractorModal.mode === 'create' ? 'Nouveau contractant' : 'Modifier le contractant'}
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !contractorModal.saving && setContractorModal(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Dénomination *</label>
                <input
                  required
                  autoFocus
                  value={contractorModal.form.denomination}
                  onChange={(e) =>
                    setContractorModal({
                      ...contractorModal,
                      form: { ...contractorModal.form, denomination: e.target.value },
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Type de service *</label>
                <input
                  required
                  value={contractorModal.form.typeService}
                  onChange={(e) =>
                    setContractorModal({
                      ...contractorModal,
                      form: { ...contractorModal.form, typeService: e.target.value },
                    })
                  }
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" disabled={contractorModal.saving} onClick={() => setContractorModal(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={contractorModal.saving} onClick={() => void saveContractor()}>
                {contractorModal.saving ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    Enregistrement…
                  </>
                ) : (
                  'Enregistrer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {employeeModal && (
        <div className="modal-overlay open" onClick={() => !employeeModal.saving && setEmployeeModal(null)}>
          <div className="modal contractants-modal contractants-emp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {employeeModal.mode === 'create' ? 'Nouvel employé' : 'Modifier l’employé'}
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !employeeModal.saving && setEmployeeModal(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Contractant *</label>
                <select
                  required
                  value={employeeModal.form.contractantId}
                  disabled={employeeModal.mode === 'edit'}
                  onChange={(e) =>
                    setEmployeeModal({
                      ...employeeModal,
                      form: { ...employeeModal.form, contractantId: e.target.value },
                    })
                  }
                >
                  <option value="">Sélectionner…</option>
                  {contractants.map((c) => (
                    <option key={c.id} value={c.id}>{c.denomination}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Noms et post-noms *</label>
                <input
                  required
                  autoFocus
                  value={employeeModal.form.nom}
                  onChange={(e) =>
                    setEmployeeModal({
                      ...employeeModal,
                      form: { ...employeeModal.form, nom: e.target.value },
                    })
                  }
                />
              </div>
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label>Sexe</label>
                  <select
                    value={employeeModal.form.sexe}
                    onChange={(e) =>
                      setEmployeeModal({
                        ...employeeModal,
                        form: {
                          ...employeeModal.form,
                          sexe: e.target.value as ContractantSexe | '',
                        },
                      })
                    }
                  >
                    <option value="">— Non renseigné</option>
                    {CONTRACTANT_SEXES.map((s) => (
                      <option key={s} value={s}>{s === 'M' ? 'M — Masculin' : 'F — Féminin'}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>État civil *</label>
                  <select
                    required
                    value={employeeModal.form.etatCivil}
                    onChange={(e) =>
                      setEmployeeModal({
                        ...employeeModal,
                        form: {
                          ...employeeModal.form,
                          etatCivil: e.target.value as ContractantEtatCivilId,
                        },
                      })
                    }
                  >
                    {CONTRACTANT_ETATS_CIVILS.map((item) => (
                      <option key={item.id} value={item.id}>{item.id} — {item.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Lieu d&apos;affectation *</label>
                <select
                  required
                  value={employeeModal.form.lieuAffectation || 'Zamba'}
                  onChange={(e) =>
                    setEmployeeModal({
                      ...employeeModal,
                      form: { ...employeeModal.form, lieuAffectation: e.target.value },
                    })
                  }
                >
                  {localisationOptions.map((loc) => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Fonction</label>
                <input
                  value={employeeModal.form.fonction}
                  onChange={(e) =>
                    setEmployeeModal({
                      ...employeeModal,
                      form: { ...employeeModal.form, fonction: e.target.value },
                    })
                  }
                />
              </div>
              <div className="form-group">
                <label>Département *</label>
                <input
                  required
                  list="contractant-dept-list"
                  value={employeeModal.form.departement}
                  onChange={(e) =>
                    setEmployeeModal({
                      ...employeeModal,
                      form: { ...employeeModal.form, departement: e.target.value },
                    })
                  }
                  placeholder="Suggestion depuis les départements RH"
                />
                <datalist id="contractant-dept-list">
                  {departementOptions.map((d) => (
                    <option key={d} value={d} />
                  ))}
                </datalist>
              </div>
              <div className="form-group">
                <label>Numéro téléphone</label>
                <input
                  value={employeeModal.form.telephone}
                  onChange={(e) =>
                    setEmployeeModal({
                      ...employeeModal,
                      form: { ...employeeModal.form, telephone: e.target.value },
                    })
                  }
                  placeholder="+243…"
                />
              </div>
              <div className="form-group">
                <label>Statut *</label>
                <select
                  required
                  value={employeeModal.form.statut}
                  onChange={(e) =>
                    setEmployeeModal({
                      ...employeeModal,
                      form: {
                        ...employeeModal.form,
                        statut: e.target.value as ContractantEmployeeStatut,
                      },
                    })
                  }
                >
                  {CONTRACTANT_EMPLOYEE_STATUTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" disabled={employeeModal.saving} onClick={() => setEmployeeModal(null)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" disabled={employeeModal.saving} onClick={() => void saveEmployee()}>
                {employeeModal.saving ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" />
                    Enregistrement…
                  </>
                ) : (
                  'Enregistrer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewEmployee && (
        <div className="modal-overlay open" onClick={() => setViewEmployee(null)}>
          <div className="modal contractants-modal contractants-view-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Détail employé</h3>
              <button
                type="button"
                className="modal-close dashboard-list-close"
                onClick={() => setViewEmployee(null)}
                aria-label="Fermer"
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <dl className="contractants-view-grid">
                <div><dt>Noms et post-noms</dt><dd>{viewEmployee.nom}</dd></div>
                <div><dt>Contractant</dt><dd>{viewEmployee.contractantNom}</dd></div>
                <div><dt>Sexe</dt><dd>{viewEmployee.sexe || '—'}</dd></div>
                <div><dt>État civil</dt><dd>{etatCivilLabel(viewEmployee.etatCivil)}</dd></div>
                <div><dt>Lieu d&apos;affectation</dt><dd>{viewEmployee.lieuAffectation || '—'}</dd></div>
                <div><dt>Fonction</dt><dd>{viewEmployee.fonction || '—'}</dd></div>
                <div><dt>Département</dt><dd>{viewEmployee.departement || '—'}</dd></div>
                <div><dt>Téléphone</dt><dd>{viewEmployee.telephone || '—'}</dd></div>
                <div><dt>Statut</dt><dd>{viewEmployee.statut}</dd></div>
                <div><dt>Type de service</dt><dd>{viewEmployee.typeService || '—'}</dd></div>
              </dl>
            </div>
            <div className="modal-footer">
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const emp = viewEmployee;
                    setViewEmployee(null);
                    openEditEmployee(emp, emp.contractantId);
                  }}
                >
                  Modifier
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={() => setViewEmployee(null)}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={importFileRef}
        type="file"
        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        hidden
        onChange={(e) => void handleImportFileChange(e)}
      />

      {contextMenu && buildContextItems().length > 0 && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextItems()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </PermissionGate>
  );
}
