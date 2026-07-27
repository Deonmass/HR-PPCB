'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import SideDrawer from '@/components/SideDrawer';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import VillageDashboardTab from '@/components/village/VillageDashboardTab';
import VillageListeTab from '@/components/village/VillageListeTab';
import VillagePhotoViewer from '@/components/village/VillagePhotoViewer';
import VillageSkeleton from '@/components/village/VillageSkeleton';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Dependant } from '@/lib/dependants-types';
import type { Employee } from '@/lib/types';
import { formatDisplayName } from '@/lib/format-display-name';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import { compareMaisonNumero } from '@/lib/table-sort';
import {
  buildMaisonOccupancy,
  buildZambaAgentsFromEmployees,
  splitVillageKimpese,
} from '@/lib/village-agents';
import { downloadVillageExport } from '@/lib/village-export';
import type { VillageMaison, VillageMaisonOccupancy, VillageTaille } from '@/lib/village-types';

type Tab = 'dashboard' | 'liste' | 'maisons' | 'vides' | 'tailles' | 'photo';
type DrawerKind = 'maison' | 'taille';

const VILLAGE_PHOTO_SRC = '/img/village.jpg';

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

interface HistoRow {
  date: string;
  action: string;
  matricule: string;
  nom: string;
  numeroVilla: string;
  typeMaison: string;
  ancienNumero: string;
  raison: string;
  commentaire: string;
}

interface SuggestionRow {
  id: string;
  numeroVilla: string;
  matricule: string;
  nom: string;
  commentaire: string;
  createdAt: string;
}

interface SuggestionForm {
  id: string;
  numeroVilla: string;
  matricule: string;
  commentaire: string;
}

function HouseIcon() {
  return (
    <svg className="village-house-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M3 10.5 12 3l9 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 10v10h14V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 20v-6h4v6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle cx="12" cy="5" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="19" r="1.7" fill="currentColor" />
    </svg>
  );
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

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ApproveIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        d="M20 6 9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function resolveTailleLabel(raw: string, tailles: VillageTaille[]): string {
  const key = raw.trim().toLowerCase();
  if (!key) return 'Sans type';
  const byCode = tailles.find((t) => t.code.toLowerCase() === key);
  if (byCode) return byCode.label || byCode.code;
  const byLabel = tailles.find((t) => (t.label || t.code).toLowerCase() === key);
  if (byLabel) return byLabel.label || byLabel.code;
  return raw.trim();
}

const emptySuggestionForm = (): SuggestionForm => ({
  id: '',
  numeroVilla: '',
  matricule: '',
  commentaire: '',
});

export default function VillageMaisonsPage() {
  return (
    <Suspense
      fallback={
        <div className="dependants-page village-maisons-page">
          <div className="dependants-dashboard-body village-dashboard-body">
            <div className="panel panel-padded village-maisons-panel">
              <VillageSkeleton variant="maisons" />
            </div>
          </div>
        </div>
      }
    >
      <VillageMaisonsPageInner />
    </Suspense>
  );
}

function VillageMaisonsPageInner() {
  const { can } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>('maisons');
  const [maisons, setMaisons] = useState<VillageMaison[]>([]);
  const [tailles, setTailles] = useState<VillageTaille[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerKind, setDrawerKind] = useState<DrawerKind>('maison');
  const [editingNumero, setEditingNumero] = useState<string | null>(null);

  const [maisonForm, setMaisonForm] = useState({
    numero: '',
    taille: '',
    typeMaison: '',
    commentaires: '',
  });
  const [tailleForm, setTailleForm] = useState({
    code: '',
    label: '',
    capacite: '',
    commentaires: '',
  });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyMaison, setHistoryMaison] = useState('');
  const [historyRows, setHistoryRows] = useState<HistoRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionForm, setSuggestionForm] = useState<SuggestionForm>(emptySuggestionForm);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'assign' | 'replace'>('assign');
  const [assignMaison, setAssignMaison] = useState<VillageMaisonOccupancy | null>(null);
  const [assignSelection, setAssignSelection] = useState<EmployeeSelection | null>(null);
  const [assignRaison, setAssignRaison] = useState('');

  const [search, setSearch] = useState('');
  const [filterTaille, setFilterTaille] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [expandedVides, setExpandedVides] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    kind: 'maison' | 'taille';
    maison?: VillageMaisonOccupancy;
    taille?: VillageTaille;
  } | null>(null);

  const canEdit = can('village.maisons', 'edit') || can('village.maisons', 'create');
  const canDelete = can('village.maisons', 'delete');
  const canViewMaisons = can('village.maisons', 'view');
  const canViewDashboard = can('village.dependants-dashboard', 'view');
  const canViewListe = can('village.dependants-liste', 'view');
  const canExport =
    can('village.maisons', 'export')
    || can('village.dependants-dashboard', 'export')
    || can('village.dependants-liste', 'export');

  const selectTab = useCallback(
    (next: Tab) => {
      setTab(next);
      const url = next === 'maisons' ? '/village/maisons' : `/village/maisons?tab=${next}`;
      router.replace(url, { scroll: false });
    },
    [router],
  );

  useEffect(() => {
    const allowed: Tab[] = [];
    if (canViewDashboard) allowed.push('dashboard');
    if (canViewListe) allowed.push('liste');
    if (canViewMaisons) {
      allowed.push('maisons', 'vides', 'tailles', 'photo');
    }
    if (!allowed.length) return;

    const fromQuery =
      tabParam === 'dashboard'
      || tabParam === 'liste'
      || tabParam === 'maisons'
      || tabParam === 'vides'
      || tabParam === 'tailles'
      || tabParam === 'photo'
        ? (tabParam as Tab)
        : null;
    if (fromQuery && allowed.includes(fromQuery)) {
      setTab(fromQuery);
      return;
    }
    setTab((current) => (allowed.includes(current) ? current : allowed[0]!));
  }, [tabParam, canViewDashboard, canViewListe, canViewMaisons]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [resMaisons, resEmployees, resDependants, resSuggestions] = await Promise.all([
        fetch('/api/village/maisons', { cache: 'no-store' }),
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/dependants', { cache: 'no-store' }),
        fetch('/api/village/suggestions', { cache: 'no-store' }),
      ]);
      const maisonsJson = (await resMaisons.json()) as {
        maisons?: VillageMaison[];
        tailles?: VillageTaille[];
      };
      const employeesJson = (await resEmployees.json()) as Employee[] | { error?: string };
      const dependantsJson = (await resDependants.json()) as { dependants?: Dependant[] };
      const suggestionsJson = (await resSuggestions.json()) as {
        suggestions?: SuggestionRow[];
        error?: string;
      };
      setMaisons(maisonsJson.maisons ?? []);
      setTailles(maisonsJson.tailles ?? []);
      setEmployees(Array.isArray(employeesJson) ? employeesJson : []);
      setDependants(dependantsJson.dependants ?? []);
      setSuggestions(suggestionsJson.suggestions ?? []);
    } catch {
      setMaisons([]);
      setTailles([]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setContextMenu(null);
    setSearch('');
    setFilterTaille('');
    setFilterStatut('');
    setDrawerOpen(false);
    setSuggestionOpen(false);
    setHistoryOpen(false);
    setAssignOpen(false);
  }, [tab]);

  const occupancy = useMemo(() => {
    const zamba = buildZambaAgentsFromEmployees(employees, dependants);
    const { village } = splitVillageKimpese(zamba);
    return buildMaisonOccupancy(maisons, tailles, village, dependants);
  }, [employees, dependants, maisons, tailles]);

  const kimpeseAgents = useMemo(() => {
    const zamba = buildZambaAgentsFromEmployees(employees, dependants);
    return splitVillageKimpese(zamba).kimpese;
  }, [employees, dependants]);

  const kimpesePickerEmployees = useMemo(
    () =>
      kimpeseAgents.map(
        (a) =>
          ({
            matricule: a.matricule,
            nom: a.nom,
            departement: a.departement,
          }) as Employee,
      ),
    [kimpeseAgents],
  );

  const emptyMaisons = useMemo(
    () =>
      occupancy
        .filter((m) => !m.occupied)
        .slice()
        .sort((a, b) => compareMaisonNumero(a.numero, b.numero)),
    [occupancy],
  );

  const emptyCount = emptyMaisons.length;

  const suggestionsByMaison = useMemo(() => {
    const map = new Map<string, SuggestionRow[]>();
    for (const s of suggestions) {
      const key = s.numeroVilla.trim().toLowerCase();
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [suggestions]);

  const openAssignDrawer = (
    maison: VillageMaisonOccupancy,
    mode: 'assign' | 'replace',
  ) => {
    setAssignMode(mode);
    setAssignMaison(maison);
    setAssignSelection(null);
    setAssignRaison('');
    setAssignOpen(true);
  };

  const releaseMaison = async (maison: VillageMaisonOccupancy) => {
    const occupant = maison.occupants[0];
    if (!occupant) return;
    try {
      const res = await fetch('/api/village/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          occupant.externe || !occupant.matricule
            ? {
                externe: true,
                numeroVilla: '',
                nom: occupant.nom,
                ancienNumero: maison.numero,
              }
            : {
                matricule: occupant.matricule,
                numeroVilla: '',
                nom: occupant.nom,
                ancienNumero: maison.numero,
              },
        ),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Libération impossible');
      await showSuccess(`Maison ${maison.numero} libérée`);
      await load();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Libération impossible');
    }
  };

  const submitAssignDrawer = async () => {
    const maison = assignMaison;
    if (!maison) return;
    const nom = assignSelection?.nom?.trim() ?? '';
    if (!nom) {
      await showError('Saisissez ou choisissez un occupant');
      return;
    }
    const matricule = assignSelection?.matricule?.trim() ?? '';
    const isExterne = !matricule;
    setSaving(true);
    try {
      if (assignMode === 'replace') {
        const occupant = maison.occupants[0];
        if (occupant) {
          const releaseRes = await fetch('/api/village/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              occupant.externe || !occupant.matricule
                ? {
                    externe: true,
                    numeroVilla: '',
                    nom: occupant.nom,
                    ancienNumero: maison.numero,
                  }
                : {
                    matricule: occupant.matricule,
                    numeroVilla: '',
                    nom: occupant.nom,
                    ancienNumero: maison.numero,
                  },
            ),
          });
          const releaseJson = (await releaseRes.json()) as { error?: string };
          if (!releaseRes.ok) throw new Error(releaseJson.error || 'Libération impossible');
        }
      }

      const assignRes = await fetch('/api/village/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isExterne
            ? {
                externe: true,
                numeroVilla: maison.numero,
                nom,
                raison: assignRaison || '',
                action: assignMode === 'replace' ? 'Remplacer' : 'Affecter',
                ancienNumero: assignMode === 'replace' ? maison.numero : '',
              }
            : {
                matricule,
                numeroVilla: maison.numero,
                setLocalisationZamba: true,
                nom,
                raison: assignRaison || '',
                ancienNumero: assignMode === 'replace' ? maison.numero : '',
                action: assignMode === 'replace' ? 'Remplacer' : 'Affecter',
              },
        ),
      });
      const assignJson = (await assignRes.json()) as { error?: string };
      if (!assignRes.ok) throw new Error(assignJson.error || 'Affectation impossible');

      setAssignOpen(false);
      setAssignMaison(null);
      setAssignSelection(null);
      setAssignRaison('');
      setSaving(false);
      await load();
      await showSuccess(
        assignMode === 'replace'
          ? `Maison ${maison.numero} : occupant remplacé`
          : `Maison ${maison.numero} affectée`,
      );
    } catch (err) {
      setSaving(false);
      await showError(err instanceof Error ? err.message : 'Affectation impossible');
    }
  };

  const openHistorique = async (maison: VillageMaisonOccupancy) => {
    setHistoryMaison(maison.numero);
    setHistoryRows([]);
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/village/historique?numero=${encodeURIComponent(maison.numero)}`,
        { cache: 'no-store' },
      );
      const json = (await res.json()) as { history?: HistoRow[]; error?: string };
      if (!res.ok) throw new Error(json.error || 'Historique indisponible');
      setHistoryRows(json.history ?? []);
    } catch (err) {
      setHistoryOpen(false);
      await showError(err instanceof Error ? err.message : 'Historique indisponible');
    } finally {
      setHistoryLoading(false);
    }
  };

  /** Libellés de taille uniquement (pas les codes). */
  const tailleLabels = useMemo(() => {
    const labels = tailles.map((t) => (t.label || t.code).trim()).filter(Boolean);
    const fromMaisons = occupancy.map((m) => resolveTailleLabel(m.taille, tailles));
    return [...new Set([...labels, ...fromMaisons])]
      .filter((l) => l !== 'Sans type')
      .sort((a, b) => a.localeCompare(b, 'fr'));
  }, [tailles, occupancy]);

  const filteredMaisons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return occupancy.filter((m) => {
      const tailleLabel = resolveTailleLabel(m.taille, tailles);
      if (filterTaille && tailleLabel !== filterTaille) return false;
      if (filterStatut === 'occupee' && !m.occupied) return false;
      if (filterStatut === 'vide' && m.occupied) return false;
      if (!q) return true;
      const hay = [
        m.numero,
        m.taille,
        tailleLabel,
        m.typeMaison,
        m.occupied ? 'occupee' : 'vide',
        m.commentaires,
        ...m.occupants.map((o) => `${o.nom} ${o.matricule}`),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [occupancy, search, filterTaille, filterStatut, tailles]);

  const groupedByTaille = useMemo(() => {
    const map = new Map<string, VillageMaisonOccupancy[]>();
    for (const m of filteredMaisons) {
      const label = resolveTailleLabel(m.taille, tailles);
      const list = map.get(label) ?? [];
      list.push(m);
      map.set(label, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => compareMaisonNumero(a.numero, b.numero));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'));
  }, [filteredMaisons, tailles]);

  const filteredTailles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tailles;
    return tailles.filter((t) =>
      `${t.code} ${t.label} ${t.capacite ?? ''} ${t.commentaires}`.toLowerCase().includes(q),
    );
  }, [tailles, search]);

  const filteredEmptyMaisons = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emptyMaisons.filter((m) => {
      const tailleLabel = resolveTailleLabel(m.taille, tailles);
      if (filterTaille && tailleLabel !== filterTaille) return false;
      if (!q) return true;
      const sug = suggestionsByMaison.get(m.numero.trim().toLowerCase()) ?? [];
      const hay = [
        m.numero,
        tailleLabel,
        m.typeMaison,
        m.commentaires,
        ...sug.map((s) => `${s.nom} ${s.matricule} ${s.commentaire}`),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [emptyMaisons, search, filterTaille, tailles, suggestionsByMaison]);

  const openCreateMaison = () => {
    setDrawerKind('maison');
    setEditingNumero(null);
    setMaisonForm({ numero: '', taille: '', typeMaison: '', commentaires: '' });
    setDrawerOpen(true);
  };

  const openEditMaison = (m: VillageMaisonOccupancy) => {
    setDrawerKind('maison');
    setEditingNumero(m.numero);
    setMaisonForm({
      numero: m.numero,
      taille: resolveTailleLabel(m.taille, tailles),
      typeMaison: m.typeMaison || resolveTailleLabel(m.taille, tailles),
      commentaires: m.commentaires || '',
    });
    setDrawerOpen(true);
  };

  const openCreateTaille = () => {
    setDrawerKind('taille');
    setTailleForm({ code: '', label: '', capacite: '', commentaires: '' });
    setDrawerOpen(true);
  };

  const openEditTaille = (t: VillageTaille) => {
    setDrawerKind('taille');
    setTailleForm({
      code: t.code,
      label: t.label,
      capacite: t.capacite == null ? '' : String(t.capacite),
      commentaires: t.commentaires || '',
    });
    setDrawerOpen(true);
  };

  const openCreateSuggestion = (numeroVilla = '') => {
    setSuggestionForm({
      id: '',
      numeroVilla,
      matricule: '',
      commentaire: '',
    });
    setSuggestionOpen(true);
  };

  const openEditSuggestion = (s: SuggestionRow) => {
    setSuggestionForm({
      id: s.id,
      numeroVilla: s.numeroVilla,
      matricule: s.matricule,
      commentaire: s.commentaire,
    });
    setSuggestionOpen(true);
  };

  const saveMaison = async () => {
    if (!maisonForm.numero.trim()) {
      showError('Numéro requis');
      return;
    }
    if (!maisonForm.taille.trim()) {
      showError('Type de maison requis');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/village/maisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numero: maisonForm.numero,
          taille: maisonForm.taille,
          typeMaison: maisonForm.typeMaison || maisonForm.taille,
          commentaires: maisonForm.commentaires,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setDrawerOpen(false);
      setMaisonForm({ numero: '', taille: '', typeMaison: '', commentaires: '' });
      setEditingNumero(null);
      setSaving(false);
      await load();
      await showSuccess('Maison enregistrée');
    } catch (err) {
      setSaving(false);
      showError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const saveTaille = async () => {
    if (!tailleForm.code.trim()) {
      showError('Code type de maison requis');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/village/tailles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: tailleForm.code,
          label: tailleForm.label || tailleForm.code,
          capacite: tailleForm.capacite === '' ? null : Number(tailleForm.capacite),
          commentaires: tailleForm.commentaires,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setTailleForm({ code: '', label: '', capacite: '', commentaires: '' });
      setDrawerOpen(false);
      setSaving(false);
      await load();
      await showSuccess('Type de maison enregistré');
    } catch (err) {
      setSaving(false);
      showError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const saveSuggestion = async () => {
    if (!suggestionForm.numeroVilla.trim()) {
      showError('Maison requise');
      return;
    }
    if (!suggestionForm.matricule.trim()) {
      showError('Agent requis');
      return;
    }
    const agent = kimpeseAgents.find((a) => a.matricule === suggestionForm.matricule);
    setSaving(true);
    try {
      const res = await fetch('/api/village/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: suggestionForm.id || undefined,
          numeroVilla: suggestionForm.numeroVilla,
          matricule: suggestionForm.matricule,
          nom: agent?.nom || '',
          commentaire: suggestionForm.commentaire,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setSuggestionOpen(false);
      setSuggestionForm(emptySuggestionForm());
      setSaving(false);
      await load();
      await showSuccess(suggestionForm.id ? 'Suggestion mise à jour' : 'Suggestion ajoutée');
    } catch (err) {
      setSaving(false);
      showError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const removeSuggestion = async (s: SuggestionRow) => {
    const ok = await confirmDelete(
      `Retirer la suggestion pour ${formatDisplayName(s.nom)} ?`,
      `Maison ${s.numeroVilla}`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/village/suggestions?id=${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || 'Suppression impossible');
      await showSuccess('Suggestion retirée');
      await load();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Suppression impossible');
    }
  };

  const approveSuggestion = async (s: SuggestionRow) => {
    try {
      const assignRes = await fetch('/api/village/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: s.matricule,
          numeroVilla: s.numeroVilla,
          setLocalisationZamba: true,
          nom: s.nom,
          raison: s.commentaire || '',
          ancienNumero: '',
        }),
      });
      const assignJson = (await assignRes.json()) as { error?: string };
      if (!assignRes.ok) throw new Error(assignJson.error || 'Affectation impossible');

      const delRes = await fetch(`/api/village/suggestions?id=${encodeURIComponent(s.id)}`, {
        method: 'DELETE',
      });
      if (!delRes.ok) {
        const delJson = (await delRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(delJson.error || 'Suggestion non retirée après affectation');
      }

      await showSuccess(`Maison ${s.numeroVilla} affectée`);
      await load();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Approbation impossible');
    }
  };

  const removeMaison = async (numero: string) => {
    const ok = await confirmDelete(`Supprimer la maison ${numero} ?`);
    if (!ok) return;
    const res = await fetch(`/api/village/maisons?numero=${encodeURIComponent(numero)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showError(json.error || 'Suppression impossible');
      return;
    }
    await load();
  };

  const removeTaille = async (code: string) => {
    const ok = await confirmDelete(`Supprimer le type de maison ${code} ?`);
    if (!ok) return;
    const res = await fetch(`/api/village/tailles?code=${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      showError(json.error || 'Suppression impossible');
      return;
    }
    await load();
  };

  const toggleVideExpanded = (numero: string) => {
    setExpandedVides((prev) => ({ ...prev, [numero]: !prev[numero] }));
  };

  const contextItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    if (contextMenu.kind === 'maison' && contextMenu.maison) {
      const m = contextMenu.maison;
      const items: ContextMenuItem[] = [];
      if (canEdit) {
        if (!m.occupied) {
          items.push({
            id: 'assign',
            label: 'Affecter',
            icon: 'home',
            onClick: () => {
              openAssignDrawer(m, 'assign');
            },
          });
        } else {
          items.push({
            id: 'replace',
            label: 'Remplacer',
            icon: 'home',
            onClick: () => {
              openAssignDrawer(m, 'replace');
            },
          });
          items.push({
            id: 'release',
            label: 'Libérer',
            icon: 'toggle',
            onClick: () => {
              void releaseMaison(m);
            },
          });
        }
        items.push({
          id: 'edit',
          label: 'Modifier',
          icon: 'edit',
          onClick: () => openEditMaison(m),
        });
      }
      items.push({
        id: 'history',
        label: 'Historique',
        icon: 'view',
        onClick: () => {
          void openHistorique(m);
        },
      });
      if (canDelete) {
        items.push({
          id: 'delete',
          label: 'Supprimer',
          icon: 'delete',
          danger: true,
          onClick: () => {
            void removeMaison(m.numero);
          },
        });
      }
      return items;
    }
    if (contextMenu.kind === 'taille' && contextMenu.taille) {
      const t = contextMenu.taille;
      const items: ContextMenuItem[] = [];
      if (canEdit) {
        items.push({
          id: 'edit',
          label: 'Modifier',
          icon: 'edit',
          onClick: () => openEditTaille(t),
        });
      }
      if (canDelete) {
        items.push({
          id: 'delete',
          label: 'Supprimer',
          icon: 'delete',
          danger: true,
          onClick: () => {
            void removeTaille(t.code);
          },
        });
      }
      return items;
    }
    return [];
  }, [contextMenu, canEdit, canDelete, tailles]);

  const drawerTitle =
    drawerKind === 'taille'
      ? tailleForm.code
        ? `Type de maison — ${tailleForm.code}`
        : 'Nouveau type de maison'
      : editingNumero
        ? `Maison ${editingNumero}`
        : 'Nouvelle maison';

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'village.maisons', action: 'view' },
        { menuId: 'village.dependants-dashboard', action: 'view' },
        { menuId: 'village.dependants-liste', action: 'view' },
      ]}
    >
      <div className="dependants-page village-maisons-page">
        <div className="dependants-sticky check-docs-sticky">
          <div className="page-header page-header-with-tabs check-docs-header dependants-header">
            <div className="check-docs-header-left">
              <div className="page-header-title-row">
                <h2>Village / Kimpese</h2>
                <RefreshButton
                  onClick={() => void load()}
                  loading={loading && (tab === 'maisons' || tab === 'vides' || tab === 'tailles')}
                />
              </div>
              <p className="dependants-header-sub">
                {tab === 'dashboard'
                  ? 'Indicateurs Zamba, logements et répartition'
                  : tab === 'liste'
                    ? 'Familles Village et Kimpese'
                    : tab === 'photo'
                      ? 'Photo du village'
                      : (
                      <>
                        Feuilles Excel <strong>MAISON</strong> et <strong>TYPE</strong> · {maisons.length}{' '}
                        maison(s) · {emptyCount} vide(s) · {suggestions.length} suggestion(s)
                        {canEdit || canDelete ? ' · clic droit pour les actions' : ''}
                      </>
                    )}
              </p>
            </div>
            <div className="check-docs-header-actions">
              <div className="tabs header-tabs header-tabs-compact">
                {canViewDashboard && (
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`}
                    onClick={() => selectTab('dashboard')}
                  >
                    Dashboard
                  </button>
                )}
                {canViewListe && (
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === 'liste' ? ' active' : ''}`}
                    onClick={() => selectTab('liste')}
                  >
                    Liste
                  </button>
                )}
                {canViewMaisons && (
                  <>
                    <button
                      type="button"
                      className={`tab-btn tab-btn-sm${tab === 'maisons' ? ' active' : ''}`}
                      onClick={() => selectTab('maisons')}
                    >
                      Maisons ({maisons.length})
                    </button>
                    <button
                      type="button"
                      className={`tab-btn tab-btn-sm${tab === 'vides' ? ' active' : ''}`}
                      onClick={() => selectTab('vides')}
                    >
                      Vides ({emptyCount})
                    </button>
                    <button
                      type="button"
                      className={`tab-btn tab-btn-sm${tab === 'tailles' ? ' active' : ''}`}
                      onClick={() => selectTab('tailles')}
                    >
                      Type de maison ({tailles.length})
                    </button>
                    <button
                      type="button"
                      className={`tab-btn tab-btn-sm${tab === 'photo' ? ' active' : ''}`}
                      onClick={() => selectTab('photo')}
                    >
                      Photo
                    </button>
                  </>
                )}
              </div>
              {canExport && (
                <button
                  type="button"
                  className="btn btn-secondary btn-with-icon"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await downloadVillageExport();
                    } catch (err) {
                      showError(err instanceof Error ? err.message : 'Export impossible');
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  {exporting ? <span className="btn-spinner" aria-hidden="true" /> : <ExportIcon />}
                  {exporting ? 'Export…' : 'Exporter'}
                </button>
              )}
            </div>
          </div>
        </div>

        {tab === 'dashboard' ? (
          <div className="dependants-dashboard-body village-dashboard-body">
            <VillageDashboardTab />
          </div>
        ) : tab === 'liste' ? (
          <div className="dependants-dashboard-body village-dashboard-body">
            <VillageListeTab />
          </div>
        ) : tab === 'photo' ? (
          <div className="dependants-dashboard-body village-dashboard-body">
            <div className="panel panel-padded village-maisons-panel village-photo-panel">
              <VillagePhotoViewer src={VILLAGE_PHOTO_SRC} />
            </div>
          </div>
        ) : loading ? (
          <div className="dependants-dashboard-body village-dashboard-body">
            <div className="panel panel-padded village-maisons-panel">
              <VillageSkeleton
                variant={tab === 'tailles' || tab === 'vides' ? 'table' : 'maisons'}
              />
            </div>
          </div>
        ) : (
          <div className="dependants-dashboard-body village-dashboard-body">
        {tab === 'tailles' ? (
          <div className="panel panel-padded village-maisons-panel">
            <div className="village-toolbar-row">
              <input
                type="search"
                className="search-input village-toolbar-search"
                placeholder="Filtrer types de maison…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {canEdit && (
                <button type="button" className="btn btn-primary" onClick={openCreateTaille}>
                  Nouveau type
                </button>
              )}
            </div>
            <div className="village-table-scroll">
              <table className="dependants-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Libellé (type de maison)</th>
                    <th>Capacité</th>
                    <th>Commentaires</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTailles.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="empty-cell">Aucun type de maison.</td>
                    </tr>
                  ) : (
                    filteredTailles.map((t) => (
                      <tr
                        key={t.code}
                        className={canEdit || canDelete ? 'has-context-menu' : undefined}
                        onContextMenu={(e) => {
                          if (!canEdit && !canDelete) return;
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            kind: 'taille',
                            taille: t,
                          });
                        }}
                      >
                        <td>{t.code}</td>
                        <td>{t.label || t.code}</td>
                        <td>{t.capacite ?? '—'}</td>
                        <td>{t.commentaires || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : tab === 'vides' ? (
          <div className="panel panel-padded village-maisons-panel">
            <div className="village-toolbar-row">
              <input
                type="search"
                className="search-input village-toolbar-search"
                placeholder="Rechercher maison, suggestion…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="filter-select village-toolbar-filter"
                value={filterTaille}
                onChange={(e) => setFilterTaille(e.target.value)}
              >
                <option value="">Tous types</option>
                {tailleLabels.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => openCreateSuggestion()}
                >
                  Ajouter une suggestion
                </button>
              )}
            </div>
            <div className="village-table-scroll">
              <table className="dependants-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Numéro</th>
                    <th>Type de maison</th>
                    <th>Suggestions</th>
                    {canEdit ? <th style={{ width: 120 }} /> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredEmptyMaisons.length === 0 ? (
                    <tr>
                      <td colSpan={canEdit ? 5 : 4} className="empty-cell">
                        Aucune maison vide.
                      </td>
                    </tr>
                  ) : (
                    filteredEmptyMaisons.flatMap((m) => {
                      const tailleLabel = resolveTailleLabel(m.taille, tailles);
                      const sugList =
                        suggestionsByMaison.get(m.numero.trim().toLowerCase()) ?? [];
                      const isOpen = expandedVides[m.numero] ?? false;
                      const head = (
                        <tr key={m.numero} className="dependants-family-row">
                          <td>
                            <button
                              type="button"
                              className="btn-icon village-collapse-btn"
                              aria-expanded={isOpen}
                              onClick={() => toggleVideExpanded(m.numero)}
                              title={isOpen ? 'Replier' : 'Déplier'}
                            >
                              <CollapseIcon open={isOpen} />
                            </button>
                          </td>
                          <td><strong>{m.numero}</strong></td>
                          <td>{m.typeMaison || tailleLabel || '—'}</td>
                          <td>{sugList.length}</td>
                          {canEdit ? (
                            <td>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => openCreateSuggestion(m.numero)}
                              >
                                Suggestion
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      );
                      if (!isOpen) return [head];
                      return [
                        head,
                        <tr key={`${m.numero}-suggestions`} className="dependants-member-row">
                          <td colSpan={canEdit ? 5 : 4}>
                            {sugList.length === 0 ? (
                              <p className="empty-state" style={{ margin: '0.35rem 0' }}>
                                Aucune suggestion pour cette maison.
                              </p>
                            ) : (
                              <div className="village-vide-suggestions">
                                {sugList.map((s) => (
                                  <div key={s.id} className="village-vide-suggestion-row">
                                    <div className="village-vide-suggestion-meta">
                                      <strong>{formatDisplayName(s.nom)}</strong>
                                      <span>
                                        {s.matricule}
                                        {s.commentaire ? ` · ${s.commentaire}` : ''}
                                      </span>
                                    </div>
                                    {canEdit && (
                                      <div className="village-vide-suggestion-actions">
                                        <button
                                          type="button"
                                          className="btn-icon"
                                          title="Modifier"
                                          onClick={() => openEditSuggestion(s)}
                                        >
                                          <EditIcon />
                                        </button>
                                        <button
                                          type="button"
                                          className="btn-icon"
                                          title="Retirer"
                                          onClick={() => {
                                            void removeSuggestion(s);
                                          }}
                                        >
                                          <RemoveIcon />
                                        </button>
                                        <button
                                          type="button"
                                          className="btn-icon"
                                          title="Approuver"
                                          onClick={() => {
                                            void approveSuggestion(s);
                                          }}
                                        >
                                          <ApproveIcon />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>,
                      ];
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="panel panel-padded village-maisons-panel">
            <div className="village-toolbar-row">
              <input
                type="search"
                className="search-input village-toolbar-search"
                placeholder="Rechercher n°, occupant, type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="filter-select village-toolbar-filter"
                value={filterTaille}
                onChange={(e) => setFilterTaille(e.target.value)}
              >
                <option value="">Tous types</option>
                {tailleLabels.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                className="filter-select village-toolbar-filter"
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value)}
              >
                <option value="">Tous statuts</option>
                <option value="occupee">Occupées</option>
                <option value="vide">Vides</option>
              </select>
              {canEdit && (
                <button type="button" className="btn btn-primary" onClick={openCreateMaison}>
                  Nouvelle maison
                </button>
              )}
            </div>

            <div className="village-maisons-scroll">
              {groupedByTaille.length === 0 ? (
                <p className="empty-state">Aucune maison pour ces filtres.</p>
              ) : (
                groupedByTaille.map(([tailleLabel, list]) => (
                  <section key={tailleLabel} className="village-taille-group">
                    <header className="village-taille-group-head">
                      <h3>{tailleLabel}</h3>
                      <span>
                        {list.length} maison{list.length > 1 ? 's' : ''} ·{' '}
                        {list.filter((x) => x.occupied).length} occupée
                        {list.filter((x) => x.occupied).length > 1 ? 's' : ''} ·{' '}
                        {list.filter((x) => !x.occupied).length} vide
                        {list.filter((x) => !x.occupied).length > 1 ? 's' : ''}
                      </span>
                    </header>
                    <div className="village-house-grid">
                      {list.map((m) => {
                        const occupant = m.occupants[0];
                        return (
                          <div
                            key={m.numero}
                            className={`village-house-card${m.occupied ? ' is-occupied' : ' is-empty'}`}
                            title={
                              m.occupied
                                ? `${m.numero} — ${formatDisplayName(occupant?.nom ?? '')}`
                                : `${m.numero} — Vide`
                            }
                            onDoubleClick={() => {
                              if (canEdit) openEditMaison(m);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                kind: 'maison',
                                maison: m,
                              });
                            }}
                          >
                            <div className="village-house-card-top">
                              <HouseIcon />
                              <strong className="village-house-numero">{m.numero}</strong>
                              <button
                                type="button"
                                className="village-house-more"
                                title="Actions"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    kind: 'maison',
                                    maison: m,
                                  });
                                }}
                              >
                                <MoreIcon />
                              </button>
                            </div>
                            <div className="village-house-status">
                              {m.occupied ? 'Occupée' : 'Vide'}
                            </div>
                            <div
                              className={`village-house-occupant${
                                occupant?.externe ? ' is-externe' : ''
                              }`}
                            >
                              {occupant ? formatDisplayName(occupant.nom) : '—'}
                            </div>
                            {m.typeMaison && m.typeMaison !== tailleLabel ? (
                              <div className="village-house-type">{m.typeMaison}</div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        )}
          </div>
        )}

        <SideDrawer
          open={drawerOpen}
          title={drawerTitle}
          onClose={() => {
            if (saving) return;
            setDrawerOpen(false);
          }}
          footer={
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void (drawerKind === 'taille' ? saveTaille() : saveMaison())}
            >
              {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          }
        >
          {drawerKind === 'taille' ? (
            <div className="side-drawer-form">
              <label>
                Code
                <input
                  className="filter-select"
                  value={tailleForm.code}
                  onChange={(e) => setTailleForm((f) => ({ ...f, code: e.target.value }))}
                />
              </label>
              <label>
                Type de maison (libellé)
                <input
                  className="filter-select"
                  value={tailleForm.label}
                  onChange={(e) => setTailleForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="ex. High Standard"
                />
              </label>
              <label>
                Capacité
                <input
                  className="filter-select"
                  type="number"
                  value={tailleForm.capacite}
                  onChange={(e) => setTailleForm((f) => ({ ...f, capacite: e.target.value }))}
                />
              </label>
              <label>
                Commentaires
                <input
                  className="filter-select"
                  value={tailleForm.commentaires}
                  onChange={(e) =>
                    setTailleForm((f) => ({ ...f, commentaires: e.target.value }))
                  }
                />
              </label>
            </div>
          ) : (
            <div className="side-drawer-form">
              <label>
                Numéro
                <input
                  className="filter-select"
                  value={maisonForm.numero}
                  onChange={(e) => setMaisonForm((f) => ({ ...f, numero: e.target.value }))}
                  disabled={Boolean(editingNumero)}
                />
              </label>
              <label>
                Type de maison
                <select
                  className="filter-select"
                  value={maisonForm.taille}
                  onChange={(e) => {
                    const value = e.target.value;
                    setMaisonForm((f) => ({
                      ...f,
                      taille: value,
                      typeMaison: value,
                    }));
                  }}
                >
                  <option value="">Choisir un type…</option>
                  {tailleLabels.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Commentaires
                <input
                  className="filter-select"
                  value={maisonForm.commentaires}
                  onChange={(e) =>
                    setMaisonForm((f) => ({ ...f, commentaires: e.target.value }))
                  }
                />
              </label>
            </div>
          )}
        </SideDrawer>

        <SideDrawer
          open={historyOpen}
          title={historyMaison ? `Historique — maison ${historyMaison}` : 'Historique'}
          onClose={() => setHistoryOpen(false)}
        >
          {historyLoading ? (
            <p className="empty-state">Chargement…</p>
          ) : historyRows.length === 0 ? (
            <p className="empty-state">Aucun historique pour cette maison.</p>
          ) : (
            <div className="village-history-list">
              {historyRows.map((h, idx) => (
                <div
                  key={`${h.date}-${h.matricule}-${h.action}-${idx}`}
                  className="village-history-item"
                >
                  <div className="village-history-item-head">
                    <span>{h.date || '—'}</span>
                    <span>{h.action || '—'}</span>
                  </div>
                  <strong>{formatDisplayName(h.nom) || h.matricule || '—'}</strong>
                  {h.raison ? <div>Raison : {h.raison}</div> : null}
                  {h.commentaire ? <div>Commentaire : {h.commentaire}</div> : null}
                </div>
              ))}
            </div>
          )}
        </SideDrawer>

        <SideDrawer
          open={suggestionOpen}
          title={suggestionForm.id ? 'Modifier suggestion' : 'Ajouter une suggestion'}
          onClose={() => {
            if (saving) return;
            setSuggestionOpen(false);
          }}
          footer={
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void saveSuggestion()}
            >
              {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          }
        >
          <div className="side-drawer-form">
            <label>
              Maison vide
              <select
                className="filter-select"
                value={suggestionForm.numeroVilla}
                disabled={Boolean(suggestionForm.id)}
                onChange={(e) =>
                  setSuggestionForm((f) => ({ ...f, numeroVilla: e.target.value }))
                }
              >
                <option value="">Choisir une maison…</option>
                {emptyMaisons.map((m) => (
                  <option key={m.numero} value={m.numero}>
                    {m.numero} — {resolveTailleLabel(m.taille, tailles)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Agent (Kimpese)
              <select
                className="filter-select"
                value={suggestionForm.matricule}
                onChange={(e) =>
                  setSuggestionForm((f) => ({ ...f, matricule: e.target.value }))
                }
              >
                <option value="">Choisir un agent…</option>
                {kimpeseAgents.map((a) => (
                  <option key={a.matricule} value={a.matricule}>
                    {a.matricule} — {formatDisplayName(a.nom)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Commentaire
              <input
                className="filter-select"
                value={suggestionForm.commentaire}
                onChange={(e) =>
                  setSuggestionForm((f) => ({ ...f, commentaire: e.target.value }))
                }
                placeholder="ex. Priorité famille…"
              />
            </label>
          </div>
        </SideDrawer>

        <SideDrawer
          open={assignOpen}
          title={
            assignMaison
              ? `${assignMode === 'replace' ? 'Remplacer' : 'Affecter'} — maison ${assignMaison.numero}`
              : 'Affectation'
          }
          onClose={() => {
            if (saving) return;
            setAssignOpen(false);
          }}
          footer={
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !assignSelection?.nom?.trim()}
              onClick={() => void submitAssignDrawer()}
            >
              {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
              {saving
                ? 'Enregistrement…'
                : assignMode === 'replace'
                  ? 'Remplacer'
                  : 'Affecter'}
            </button>
          }
        >
          <div className="side-drawer-form">
            {assignMode === 'replace' && assignMaison?.occupants[0] ? (
              <p className="village-assign-current">
                Occupant actuel :{' '}
                <span
                  className={
                    assignMaison.occupants[0].externe
                      ? 'village-occupant-externe'
                      : undefined
                  }
                >
                  {formatDisplayName(assignMaison.occupants[0].nom)}
                </span>
                {assignMaison.occupants[0].externe ? ' (hors effectif)' : ''}
              </p>
            ) : null}
            <label>
              Occupant
              <EmployeePicker
                employees={kimpesePickerEmployees}
                value={assignSelection}
                onChange={setAssignSelection}
              />
              <span className="field-hint">
                Choisissez un agent Kimpese ou saisissez un nom hors effectif.
              </span>
              {assignSelection?.nom && !assignSelection.matricule ? (
                <span className="village-occupant-externe-hint">
                  Nom hors effectif — affichage en couleur distincte.
                </span>
              ) : null}
            </label>
            <label>
              Raison
              <input
                className="filter-select"
                value={assignRaison}
                onChange={(e) => setAssignRaison(e.target.value)}
                placeholder="ex. Mutation, nouvel arrivant…"
              />
            </label>
          </div>
        </SideDrawer>

        {contextMenu && contextItems.length > 0 && (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextItems}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </PermissionGate>
  );
}
