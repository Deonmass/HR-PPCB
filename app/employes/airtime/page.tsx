'use client';

import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import AirtimeDrcMap, { airtimePlaceKey, airtimePlaceLabel, type AirtimePlaceSlice, type AirtimePlaceStat } from '@/components/airtime/AirtimeDrcMap';
import AirtimePolicyTable from '@/components/airtime/AirtimePolicyTable';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import EmployeeViewModal from '@/components/EmployeeViewModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { buildColumnFilterValues, matchesColumnFilter } from '@/lib/table-column-filters';
import type { AirtimeAssignment, AirtimeBundle, AirtimeDirectoryPerson, AirtimeLineInput } from '@/lib/airtime-types';
import type { Contractant, ContractantEmployee } from '@/lib/contractants-types';
import { confirmDelete } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import { usePermissions } from '@/contexts/PermissionContext';

const MENU = 'employes.airtime';

type TabId = 'dashboard' | 'base';
type DrillId =
  | 'lines'
  | 'withCug'
  | 'withoutCug'
  | 'sim'
  | 'ppc'
  | 'ppcCug'
  | 'ppcNoCug'
  | 'contractant'
  | 'contractantCug'
  | 'contractantNoCug'
  | 'quota'
  | 'actual'
  | 'ecart';
type Drill =
  | { kind: 'kpi'; id: DrillId }
  | { kind: 'place'; place: string; slice: AirtimePlaceSlice };
type FilterKey =
  | 'matricule'
  | 'nom'
  | 'compagnie'
  | 'grade'
  | 'departement'
  | 'centreCout'
  | 'position'
  | 'localisation'
  | 'quota'
  | 'actual'
  | 'ecart'
  | 'msisdn'
  | 'statut';

const FILTER_KEYS: FilterKey[] = [
  'matricule', 'nom', 'compagnie', 'grade', 'departement', 'centreCout', 'position',
  'localisation', 'quota', 'actual', 'ecart', 'msisdn', 'statut',
];

const DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'matricule', label: 'Matricule' },
  { key: 'nom', label: 'Nom' },
  { key: 'compagnie', label: 'Compagnie' },
  { key: 'grade', label: 'Grade' },
  { key: 'departement', label: 'Département' },
  { key: 'centre', label: 'Centre de coût' },
  { key: 'position', label: 'Position' },
  { key: 'numero', label: 'Numéro CUG' },
  { key: 'statut', label: 'Statut' },
];

function statusLabel(row: AirtimeAssignment): string {
  return row.msisdn ? 'Attribué' : 'Non attribué';
}

function displayCompany(value: string): string {
  const folded = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (folded.includes('ppc barnet') || folded === 'ppc') return 'PPC';
  return value;
}

function usd(value: number): string {
  return `$ ${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function cellText(row: AirtimeAssignment, key: FilterKey): string {
  if (key === 'quota') return row.quotaAirtime == null ? '' : String(row.quotaAirtime);
  if (key === 'actual') return row.actualAirtime == null ? '' : String(row.actualAirtime);
  if (key === 'ecart') return row.ecart == null ? '' : String(row.ecart);
  if (key === 'statut') return statusLabel(row);
  if (key === 'compagnie') return displayCompany(String(row.compagnie || ''));
  return String(row[key] || '');
}

function matchesDrill(row: AirtimeAssignment, drill: Drill): boolean {
  if (drill.kind === 'place') {
    if (airtimePlaceKey(row.localisation || row.excelPlace || '') !== drill.place) return false;
    if (drill.slice === 'ppc') return row.matched;
    if (drill.slice === 'contractant') return row.contractantMatched;
    if (drill.slice === 'sim') return row.simLine && !row.matched && !row.contractantMatched;
    if (drill.slice === 'other') return !row.matched && !row.contractantMatched && !row.simLine;
    if (drill.slice === 'assigned') return Boolean(row.msisdn);
    if (drill.slice === 'unassigned') return !row.msisdn;
    return true;
  }
  if (drill.id === 'lines') return true;
  if (drill.id === 'withCug') return Boolean(row.msisdn);
  if (drill.id === 'withoutCug') return !row.msisdn;
  if (drill.id === 'sim') return row.simLine;
  if (drill.id === 'ppc') return row.matched;
  if (drill.id === 'ppcCug') return row.matched && Boolean(row.msisdn);
  if (drill.id === 'ppcNoCug') return row.matched && !row.msisdn;
  if (drill.id === 'contractant') return row.contractantMatched;
  if (drill.id === 'contractantCug') return row.contractantMatched && Boolean(row.msisdn);
  if (drill.id === 'contractantNoCug') return row.contractantMatched && !row.msisdn;
  if (drill.id === 'quota') return row.quotaAirtime != null;
  if (drill.id === 'actual') return row.actualAirtime != null;
  return row.ecart != null;
}

function toDrillRow(row: AirtimeAssignment, index: number): DashboardListRow {
  return {
    id: `${row.matricule || 'x'}-${row.msisdn || index}-${index}`,
    cells: {
      matricule: row.matricule || '—',
      nom: row.nom || '—',
      compagnie: displayCompany(row.compagnie || '') || '—',
      grade: row.grade || '—',
      departement: row.departement || '—',
      centre: row.centreCout || '—',
      position: row.position || '—',
      numero: row.msisdn || 'pas de numéro CUG',
      statut: statusLabel(row),
    },
  };
}

export default function AirtimePage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create');
  const canEdit = can(MENU, 'edit');
  const canDelete = can(MENU, 'delete');
  const [tab, setTab] = useState<TabId>('dashboard');
  const [bundle, setBundle] = useState<AirtimeBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [columnFilters, setColumnFilters] = useState<Partial<Record<FilterKey, string[]>>>({});
  const [grilleOpen, setGrilleOpen] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [contractantFiche, setContractantFiche] = useState<{
    company: string;
    person: ContractantEmployee;
  } | null>(null);
  const [opening, setOpening] = useState(false);
  const [editor, setEditor] = useState<{ lineIndex: number | null; line: AirtimeLineInput; picked: boolean } | null>(null);
  const [personQuery, setPersonQuery] = useState('');
  const [directory, setDirectory] = useState<AirtimeDirectoryPerson[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number; row: AirtimeAssignment } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/employes/airtime');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Chargement impossible');
      setBundle(data.bundle as AirtimeBundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!editor || directory.length > 0) return;
    let cancelled = false;
    setDirectoryError('');
    void fetch('/api/employes/airtime/directory')
      .then(async (response) => {
        const data = await response.json() as { people?: AirtimeDirectoryPerson[]; error?: string };
        if (!response.ok || !data.people) throw new Error(data.error || 'Annuaire indisponible');
        return data.people;
      })
      .then((people) => {
        if (!cancelled) setDirectory(people);
      })
      .catch((err: unknown) => {
        if (!cancelled) setDirectoryError(err instanceof Error ? err.message : 'Annuaire indisponible');
      });
    return () => {
      cancelled = true;
    };
  }, [editor, directory.length]);

  const rows = bundle?.rows ?? [];
  const stats = bundle?.stats;
  const places = useMemo(() => {
    const map = new Map<string, AirtimePlaceStat & { sim: number; other: number }>();
    for (const row of rows) {
      const id = airtimePlaceKey(row.localisation || row.excelPlace || '');
      const current = map.get(id) || {
        id,
        label: airtimePlaceLabel(id),
        total: 0,
        ppc: 0,
        contractant: 0,
        assigned: 0,
        unassigned: 0,
        sim: 0,
        other: 0,
      };
      current.total += 1;
      if (row.matched) current.ppc += 1;
      else if (row.contractantMatched) current.contractant += 1;
      else if (row.simLine) current.sim += 1;
      else current.other += 1;
      if (row.msisdn) current.assigned += 1;
      else current.unassigned += 1;
      map.set(id, current);
    }
    return [...map.values()]
      .map((site) => ({
        ...site,
        facts: [
          { id: 'ppc', label: 'PPC', value: site.ppc },
          { id: 'contractant', label: 'Contractant', value: site.contractant },
          { id: 'sim', label: 'Matériel SIM', value: site.sim },
          { id: 'other', label: 'Non rattaché', value: site.other },
        ].filter((fact) => fact.value > 0),
      }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'fr'));
  }, [rows]);

  const filterValues = useMemo(() => buildColumnFilterValues(rows, {
    matricule: (row) => row.matricule,
    nom: (row) => row.nom,
    compagnie: (row) => row.compagnie,
    grade: (row) => row.grade,
    departement: (row) => row.departement,
    centreCout: (row) => row.centreCout,
    position: (row) => row.position,
    localisation: (row) => row.localisation,
    quota: (row) => cellText(row, 'quota'),
    actual: (row) => cellText(row, 'actual'),
    ecart: (row) => cellText(row, 'ecart'),
    msisdn: (row) => row.msisdn,
    statut: (row) => cellText(row, 'statut'),
  }), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (FILTER_KEYS.some((key) => !matchesColumnFilter(columnFilters[key] || [], cellText(row, key)))) {
        return false;
      }
      if (!q) return true;
      return [row.nom, row.matricule, row.msisdn, row.grade, row.departement, row.centreCout, row.position, row.compagnie]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, columnFilters]);

  const drillRows = useMemo(() => {
    if (!drill) return [];
    return rows.filter((row) => matchesDrill(row, drill)).map(toDrillRow);
  }, [drill, rows]);

  const drillTitle = useMemo(() => {
    if (!drill || !stats) return '';
    if (drill.kind === 'place') {
      const label = airtimePlaceLabel(drill.place);
      const sliceLabel = drill.slice === 'ppc'
        ? 'PPC'
        : drill.slice === 'contractant'
          ? 'contractants'
          : drill.slice === 'sim'
            ? 'matériel SIM'
            : drill.slice === 'other'
              ? 'non rattaché'
              : drill.slice === 'assigned'
                ? 'attribué'
                : drill.slice === 'unassigned'
                  ? 'non attribué'
                  : 'toutes les lignes';
      return `Voir la liste — ${label} · ${sliceLabel}`;
    }
    const titles: Record<DrillId, string> = {
      lines: 'Voir la liste — toutes les lignes',
      withCug: 'Voir la liste — avec numéro CUG',
      withoutCug: 'Voir la liste — sans numéro CUG',
      sim: 'Voir la liste — matériel SIM',
      ppc: 'Voir la liste — Total PPC',
      ppcCug: 'Voir la liste — PPC avec CUG',
      ppcNoCug: 'Voir la liste — PPC sans CUG',
      contractant: 'Voir la liste — Total contractants',
      contractantCug: 'Voir la liste — Contractants avec CUG',
      contractantNoCug: 'Voir la liste — Contractants sans CUG',
      quota: 'Voir la liste — quota airtime',
      actual: 'Voir la liste — consommation',
      ecart: 'Voir la liste — écart quota',
    };
    return titles[drill.id];
  }, [drill, stats]);

  async function openRow(row: AirtimeAssignment) {
    if (opening) return;
    if (row.matched && row.matricule) {
      setOpening(true);
      try {
        const response = await fetch(`/api/employees/${encodeURIComponent(row.matricule)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Fiche introuvable');
        const person = data as Employee;
        setEmployee({ ...person, telephone: person.telephone || row.msisdn || '' });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fiche introuvable');
      } finally {
        setOpening(false);
      }
      return;
    }
    if (row.contractantMatched && row.contractantId) {
      setOpening(true);
      try {
        const response = await fetch(`/api/employes/contractants/${encodeURIComponent(row.contractantId)}`);
        const data = await response.json() as Contractant & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Fiche introuvable');
        const person = data.employees?.find((item) => item.id === row.contractantEmployeeId);
        if (!person) throw new Error('Contractant introuvable');
        setContractantFiche({
          company: data.denomination,
          person: { ...person, telephone: person.telephone || row.msisdn || '' },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fiche introuvable');
      } finally {
        setOpening(false);
      }
    }
  }

  function emptyLine(): AirtimeLineInput {
    return {
      matricule: '',
      nom: '',
      grade: '',
      centreCout: '',
      title: '',
      societe: '',
      department: '',
      place: '',
      msisdn: '',
      actualAirtime: null,
    };
  }

  function openCreate() {
    setPersonQuery('');
    setEditor({ lineIndex: null, line: emptyLine(), picked: false });
  }

  function openEdit(row: AirtimeAssignment) {
    setPersonQuery('');
    setEditor({
      lineIndex: row.lineIndex,
      picked: true,
      line: {
        matricule: row.matricule,
        nom: row.excelName || row.nom,
        grade: row.excelGrade || row.grade,
        centreCout: row.excelCentreCout || row.centreCout,
        title: row.excelTitle || row.position,
        societe: row.excelSociete || row.compagnie,
        department: row.excelDepartment || row.departement,
        place: row.excelPlace || row.localisation,
        msisdn: row.msisdn,
        actualAirtime: row.actualAirtime,
      },
    });
  }

  function pickPerson(person: AirtimeDirectoryPerson) {
    setPersonQuery('');
    setEditor((current) => {
      if (!current) return current;
      const keepAirtime = current.lineIndex != null;
      return {
        lineIndex: current.lineIndex,
        picked: true,
        line: {
          matricule: person.kind === 'ppc' ? person.matricule : '',
          nom: person.nom,
          grade: person.grade || (keepAirtime ? current.line.grade : ''),
          centreCout: person.centreCout || (keepAirtime ? current.line.centreCout : ''),
          title: person.title,
          societe: person.societe,
          department: person.department,
          place: person.place,
          msisdn: keepAirtime ? current.line.msisdn : (person.telephone || current.line.msisdn),
          actualAirtime: current.line.actualAirtime,
        },
      };
    });
  }

  function changePerson() {
    setPersonQuery('');
    setEditor((current) => (current ? { ...current, picked: false } : current));
  }

  function openRowMenu(event: MouseEvent<HTMLTableRowElement>, row: AirtimeAssignment) {
    event.preventDefault();
    if (!canEdit && !canDelete && !row.matched && !row.contractantMatched) return;
    setMenu({ x: event.clientX, y: event.clientY, row });
  }

  async function saveEditor() {
    if (!editor || saving) return;
    if (!editor.picked) {
      setError('Choisissez un employé ou un contractant.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/employes/airtime', {
        method: editor.lineIndex == null ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editor.lineIndex == null
          ? { line: editor.line }
          : { lineIndex: editor.lineIndex, line: editor.line }),
      });
      const data = await response.json() as { bundle?: AirtimeBundle; error?: string };
      if (!response.ok || !data.bundle) throw new Error(data.error || 'Enregistrement impossible');
      setBundle(data.bundle);
      setEditor(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }

  async function removeRow(row: AirtimeAssignment) {
    const ok = await confirmDelete('Supprimer cette ligne ?', row.nom || row.matricule || 'Ligne airtime');
    if (!ok) return;
    setError('');
    try {
      const response = await fetch('/api/employes/airtime', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIndex: row.lineIndex }),
      });
      const data = await response.json() as { bundle?: AirtimeBundle; error?: string };
      if (!response.ok || !data.bundle) throw new Error(data.error || 'Suppression impossible');
      setBundle(data.bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suppression impossible');
    }
  }

  const personHits = useMemo(() => {
    const q = personQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return directory
      .filter((person) => `${person.nom} ${person.matricule} ${person.societe} ${person.place} ${person.title}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [directory, personQuery]);

  const menuItems: ContextMenuItem[] = menu ? [
    ...(menu.row.matched || menu.row.contractantMatched
      ? [{ id: 'view', label: 'Voir la fiche', icon: 'view' as const, onClick: () => void openRow(menu.row) }]
      : []),
    ...(canEdit ? [{ id: 'edit', label: 'Modifier', icon: 'edit' as const, onClick: () => openEdit(menu.row) }] : []),
    ...(canDelete ? [{ id: 'delete', label: 'Supprimer', icon: 'delete' as const, danger: true, onClick: () => void removeRow(menu.row) }] : []),
  ] : [];

  return (
    <PermissionGate menuId={MENU} action="view" fallback={<p className="docs-hub-empty">Accès refusé.</p>}>
      <div className={`airtime-page${tab === 'base' ? ' is-base' : ' is-dash'}`}>
        <div className="page-header airtime-header">
          <h2>Airtime</h2>
          <div className="airtime-header-actions">
            <div className="airtime-tabs" role="tablist">
              <button type="button" className={tab === 'dashboard' ? 'is-on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
              <button type="button" className={tab === 'base' ? 'is-on' : ''} onClick={() => setTab('base')}>Base de données</button>
            </div>
            <button type="button" className="btn btn-secondary airtime-grille-btn" onClick={() => setGrilleOpen(true)} title="Voir la grille airtime">
              <IconInfo />
              Grille Airtime
            </button>
            <RefreshButton onClick={() => void load()} loading={loading} />
          </div>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {tab === 'dashboard' && stats ? (
          <div className="airtime-board">
            <div className="airtime-summaries">
              <Summary
                title="Couverture"
                tone="slate"
                hero={stats.totalLines}
                heroLabel="Lignes"
                onHero={() => setDrill({ kind: 'kpi', id: 'lines' })}
                rows={[
                  { label: 'Avec CUG', value: stats.withNumber, onClick: () => setDrill({ kind: 'kpi', id: 'withCug' }) },
                  { label: 'Sans CUG', value: stats.withoutNumber, onClick: () => setDrill({ kind: 'kpi', id: 'withoutCug' }) },
                  { label: 'Matériel SIM', value: stats.simLines, onClick: () => setDrill({ kind: 'kpi', id: 'sim' }) },
                ]}
              />
              <Summary
                title="Montants"
                tone="blue"
                hero={usd(stats.totalQuota - stats.totalActual)}
                heroLabel="Écart"
                heroNegative={stats.totalQuota - stats.totalActual < 0}
                onHero={() => setDrill({ kind: 'kpi', id: 'ecart' })}
                rows={[
                  { label: 'Quota', value: usd(stats.totalQuota), onClick: () => setDrill({ kind: 'kpi', id: 'quota' }) },
                  { label: 'Consommation', value: usd(stats.totalActual), onClick: () => setDrill({ kind: 'kpi', id: 'actual' }) },
                ]}
              />
              <Summary
                title="PPC"
                tone="red"
                hero={stats.ppcTotal}
                heroLabel="Employés"
                onHero={() => setDrill({ kind: 'kpi', id: 'ppc' })}
                rows={[
                  { label: 'Avec CUG', value: stats.ppcWithCug, onClick: () => setDrill({ kind: 'kpi', id: 'ppcCug' }) },
                  { label: 'Sans CUG', value: stats.ppcWithoutCug, onClick: () => setDrill({ kind: 'kpi', id: 'ppcNoCug' }) },
                ]}
              />
              <Summary
                title="Contractants"
                tone="violet"
                hero={stats.contractantTotal}
                heroLabel="Agents"
                onHero={() => setDrill({ kind: 'kpi', id: 'contractant' })}
                rows={[
                  { label: 'Avec CUG', value: stats.contractantWithCug, onClick: () => setDrill({ kind: 'kpi', id: 'contractantCug' }) },
                  { label: 'Sans CUG', value: stats.contractantWithoutCug, onClick: () => setDrill({ kind: 'kpi', id: 'contractantNoCug' }) },
                ]}
              />
            </div>
            <div className="airtime-map-stage">
              <AirtimeDrcMap
                bare
                sites={places}
                onSelect={(place, slice) => setDrill({ kind: 'place', place, slice: slice as AirtimePlaceSlice })}
              />
            </div>
          </div>
        ) : null}

        {tab === 'base' ? (
          <div className="airtime-base">
            <div className="airtime-toolbar">
              <input
                className="airtime-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom, matricule, numéro, grade…"
                aria-label="Rechercher"
              />
              <span className="airtime-count">{visible.length}</span>
              {canCreate ? (
                <button type="button" className="btn btn-accent btn-sm" onClick={openCreate}>Ajouter</button>
              ) : null}
            </div>
            <div className="airtime-table-wrap">
              <table className="airtime-table">
                <colgroup>
                  <col style={{ width: '6%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '4%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '6%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <FilterTh label="Matricule" filterKey="matricule" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Nom" filterKey="nom" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Compagnie" filterKey="compagnie" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Grade" filterKey="grade" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Département" filterKey="departement" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Centre de coût" filterKey="centreCout" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Position" filterKey="position" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Lieu" filterKey="localisation" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Quota" filterKey="quota" values={filterValues} selected={columnFilters} onChange={setColumnFilters} align="num" />
                    <FilterTh label="Quota actuel" filterKey="actual" values={filterValues} selected={columnFilters} onChange={setColumnFilters} align="num" />
                    <FilterTh label="Écart" filterKey="ecart" values={filterValues} selected={columnFilters} onChange={setColumnFilters} align="num" />
                    <FilterTh label="Numéro" filterKey="msisdn" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                    <FilterTh label="Statut" filterKey="statut" values={filterValues} selected={columnFilters} onChange={setColumnFilters} />
                  </tr>
                </thead>
                <tbody>
                  {loading && !bundle ? (
                    <tr><td colSpan={13}>Chargement…</td></tr>
                  ) : visible.length === 0 ? (
                    <tr><td colSpan={13}>Aucune ligne.</td></tr>
                  ) : visible.map((row, index) => {
                    const assigned = Boolean(row.msisdn);
                    const clickable = row.matched || row.contractantMatched;
                    return (
                      <tr key={`${row.lineIndex}-${row.matricule}-${index}`} onContextMenu={(event) => openRowMenu(event, row)}>
                        <td className="airtime-matricule">{row.matricule || '—'}</td>
                        <td className="airtime-nom">
                          {clickable ? (
                            <button type="button" className="airtime-name" onClick={() => void openRow(row)}>
                              {row.nom || '—'}
                            </button>
                          ) : (row.nom || '—')}
                        </td>
                        <td>{displayCompany(row.compagnie || '') || '—'}</td>
                        <td>{row.grade || '—'}</td>
                        <td>{row.departement || '—'}</td>
                        <td>{row.centreCout || '—'}</td>
                        <td>{row.position || '—'}</td>
                        <td>{row.localisation || '—'}</td>
                        <td className="num">{row.quotaAirtime ?? '—'}</td>
                        <td className="num">{row.actualAirtime ?? '—'}</td>
                        <td className={`num${row.ecart != null && row.ecart < 0 ? ' is-neg' : ''}`}>{row.ecart ?? '—'}</td>
                        <td className="mono">{row.msisdn || '—'}</td>
                        <td><span className={`airtime-pill is-${assigned ? 'assigned' : 'missing'}`}>{statusLabel(row)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {grilleOpen ? (
        <div className="modal-overlay" onClick={() => setGrilleOpen(false)} role="presentation">
          <div className="modal modal-form airtime-grille-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="airtime-grille-title">
            <div className="modal-header">
              <h3 id="airtime-grille-title">Grille Airtime</h3>
              <button type="button" className="modal-close" onClick={() => setGrilleOpen(false)} aria-label="Fermer">×</button>
            </div>
            <div className="modal-body">
              <AirtimePolicyTable />
            </div>
          </div>
        </div>
      ) : null}

      {drill ? (
        <DashboardListModal
          title={drillTitle}
          columns={DRILL_COLUMNS}
          rows={drillRows}
          onClose={() => setDrill(null)}
          className="airtime-list-modal"
          searchPlaceholder="Filtrer la liste…"
        />
      ) : null}

      {employee ? (
        <EmployeeViewModal employee={employee} onClose={() => setEmployee(null)} />
      ) : null}

      {contractantFiche ? (
        <div className="modal-overlay" onClick={() => setContractantFiche(null)} role="presentation">
          <div className="modal modal-form" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="airtime-contractant-title">
            <div className="modal-header">
              <h3 id="airtime-contractant-title">{contractantFiche.person.nom}</h3>
              <button type="button" className="modal-close" onClick={() => setContractantFiche(null)} aria-label="Fermer">×</button>
            </div>
            <div className="modal-body">
              <table className="employee-view-table">
                <tbody>
                  <FicheRow label="Compagnie" value={displayCompany(contractantFiche.company)} />
                  <FicheRow label="Fonction" value={contractantFiche.person.fonction} />
                  <FicheRow label="Département" value={contractantFiche.person.departement} />
                  <FicheRow label="Lieu" value={contractantFiche.person.lieuAffectation} />
                  <FicheRow label="Statut" value={contractantFiche.person.statut} />
                  <FicheRow label="Numéro CUG" value={contractantFiche.person.telephone || 'pas de numéro CUG'} />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {editor ? (
        <div className="modal-overlay" onClick={() => setEditor(null)} role="presentation">
          <div className="modal modal-form airtime-editor" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="airtime-editor-title">
            <div className="modal-header">
              <h3 id="airtime-editor-title">{editor.lineIndex == null ? 'Nouvelle ligne' : 'Modifier la ligne'}</h3>
              <button type="button" className="modal-close" onClick={() => setEditor(null)} aria-label="Fermer">×</button>
            </div>
            <div className="modal-body">
              {error ? <p className="form-error">{error}</p> : null}
              <div className="airtime-form">
                {!editor.picked ? (
                  <div className="airtime-person-search">
                    <label>
                      {editor.lineIndex == null ? 'Employé ou contractant' : 'Nouvel agent'}
                      <input
                        value={personQuery}
                        autoFocus
                        placeholder="Nom, matricule, compagnie…"
                        onChange={(event) => setPersonQuery(event.target.value)}
                      />
                    </label>
                    {directoryError ? <p className="form-error">{directoryError}</p> : null}
                    {editor.lineIndex != null ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditor({ ...editor, picked: true })}>
                        Garder l&apos;agent actuel
                      </button>
                    ) : null}
                    <ul className="airtime-person-results">
                      {personHits.length === 0 ? (
                        <li className="airtime-person-empty">
                          {directory.length === 0 && !directoryError
                            ? 'Chargement…'
                            : personQuery.trim().length < 2
                              ? 'Saisissez au moins 2 caractères.'
                              : 'Aucune personne.'}
                        </li>
                      ) : personHits.map((person) => (
                        <li key={person.key}>
                          <button type="button" onClick={() => pickPerson(person)}>
                            <strong>{person.nom}</strong>
                            <span>{person.kind === 'ppc' ? 'PPC' : displayCompany(person.societe) || 'Contractant'}{person.matricule ? ` · ${person.matricule}` : ''}{person.place ? ` · ${person.place}` : ''}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="airtime-identity">
                    <Identity label="Nom" value={editor.line.nom} />
                    <Identity label="Matricule" value={editor.line.matricule} />
                    <Identity label="Compagnie" value={displayCompany(editor.line.societe)} />
                    <Identity label="Grade" value={editor.line.grade} />
                    <Identity label="Département" value={editor.line.department} />
                    <Identity label="Centre de coût" value={editor.line.centreCout} />
                    <Identity label="Position" value={editor.line.title} />
                    <Identity label="Lieu" value={editor.line.place} />
                    <button type="button" className="btn btn-secondary btn-sm airtime-change-person" onClick={changePerson}>
                      Changer d&apos;agent
                    </button>
                  </div>
                )}
                <label>Numéro CUG<input value={editor.line.msisdn} onChange={(event) => setEditor({ ...editor, line: { ...editor.line, msisdn: event.target.value } })} /></label>
                <label>Quota actuel<input inputMode="decimal" value={editor.line.actualAirtime ?? ''} onChange={(event) => setEditor({ ...editor, line: { ...editor.line, actualAirtime: event.target.value === '' ? null : Number(event.target.value) } })} /></label>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditor(null)}>Annuler</button>
              <button type="button" className="btn btn-accent" disabled={saving || !editor.picked} onClick={() => void saveEditor()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {menu && menuItems.length > 0 ? (
        <RowContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      ) : null}
    </PermissionGate>
  );
}

function Identity({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span>{label}</span>
      <b>{value || '—'}</b>
    </p>
  );
}

function FicheRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value || '—'}</td>
    </tr>
  );
}

function FilterTh({
  label,
  filterKey,
  values,
  selected,
  onChange,
  align,
}: {
  label: string;
  filterKey: FilterKey;
  values: Record<FilterKey, string[]>;
  selected: Partial<Record<FilterKey, string[]>>;
  onChange: (next: Partial<Record<FilterKey, string[]>>) => void;
  align?: 'num';
}) {
  return (
    <th className={align}>
      <TableHeaderFilter
        label={label}
        values={values[filterKey]}
        selected={selected[filterKey] || []}
        onChange={(next) => onChange({ ...selected, [filterKey]: next })}
      />
    </th>
  );
}

function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="11" x2="12" y2="16" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function Summary({
  title,
  tone,
  hero,
  heroLabel,
  heroNegative = false,
  onHero,
  rows,
}: {
  title: string;
  tone: 'slate' | 'blue' | 'red' | 'violet';
  hero: string | number;
  heroLabel: string;
  heroNegative?: boolean;
  onHero: () => void;
  rows: { label: string; value: string | number; negative?: boolean; onClick: () => void }[];
}) {
  return (
    <section className={`airtime-summary is-${tone}`}>
      <h3>{title}</h3>
      <button type="button" className="airtime-summary-hero" onClick={onHero} title={`Voir la liste — ${heroLabel}`}>
        <strong className={heroNegative ? 'is-neg' : ''}>{hero}</strong>
        <span>{heroLabel}</span>
      </button>
      <div className="airtime-summary-rows">
        {rows.map((row) => (
          <button key={row.label} type="button" onClick={row.onClick} title={`Voir la liste — ${row.label}`}>
            <span>{row.label}</span>
            <b className={row.negative ? 'is-neg' : ''}>{row.value}</b>
          </button>
        ))}
      </div>
    </section>
  );
}
