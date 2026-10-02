'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import VoyageMonthlyChart, { type VoyageMonthRow } from '@/components/charroi/VoyageMonthlyChart';
import CardActionMenu from '@/components/CardActionMenu';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import { CHARROI_ROUTE_AUTRE, CHARROI_ROUTE_PLACES, isCharroiRoutePlace } from '@/lib/charroi-routes';
import {
  CHARROI_VOYAGE_BUDGET_LINES,
  CHARROI_VOYAGE_STATUSES,
  voyageBudgetTotal,
  type CharroiVoyage,
  type CharroiVoyageStatus,
} from '@/lib/charroi-types';
import { confirmAction, confirmDelete, showError, showSuccess } from '@/lib/swal';
import { emptyEmployeeHrProfile, type Employee } from '@/lib/types';

const MENU = 'charroi.voyages';
const VIEW_ANY = [
  { menuId: MENU, action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];

type Tab = 'dashboard' | 'demandes' | 'effectues';
type DemandeFilter = 'toutes' | CharroiVoyageStatus;

type FleetVehicle = {
  id: string;
  plaque: string;
  marque: string;
  type: string;
  province: string;
  user: string;
};

type RankItem = {
  key: string;
  label: string;
  meta?: string;
  count: number;
};
type SlimEmployee = {
  matricule: string;
  nom: string;
  departement: string;
  jobTitle: string;
  localisation: string;
};

type RequestForm = {
  id: string;
  passagerInterne: boolean;
  passagerNom: string;
  passagerMatricule: string;
  depart: string;
  destination: string;
  dateDepart: string;
  heureDepart: string;
  nombrePersonnes: string;
  motif: string;
  notes: string;
};

type ConfirmForm = {
  id: string;
  chauffeurInterne: boolean;
  chauffeurNom: string;
  chauffeurMatricule: string;
  vehiculeMode: 'flotte' | 'location';
  vehiculeId: string;
  vehiculeLocation: string;
  foodAllowance: string;
  foodForTheRoad: string;
  tollGate: string;
};

type CompleteForm = {
  id: string;
  dateArrivee: string;
  heureArrivee: string;
};

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'] as const;

const DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'numero', label: 'N°' },
  { key: 'passager', label: 'Passager' },
  { key: 'personnes', label: 'Pers.' },
  { key: 'trajet', label: 'Trajet' },
  { key: 'depart', label: 'Départ' },
  { key: 'statut', label: 'Statut' },
  { key: 'chauffeur', label: 'Chauffeur' },
  { key: 'vehicule', label: 'Véhicule' },
];

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function inPeriod(voyage: CharroiVoyage, year: number, month: number): boolean {
  return voyage.dateDepart.startsWith(periodKey(year, month));
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyRequest(): RequestForm {
  return {
    id: '',
    passagerInterne: true,
    passagerNom: '',
    passagerMatricule: '',
    depart: 'Kinshasa',
    destination: '',
    dateDepart: todayIso(),
    heureDepart: '07:00',
    nombrePersonnes: '1',
    motif: '',
    notes: '',
  };
}

function statusLabel(status: CharroiVoyageStatus): string {
  return CHARROI_VOYAGE_STATUSES.find((item) => item.id === status)?.label ?? status;
}

function statusClass(status: CharroiVoyageStatus): string {
  if (status === 'pending') return 'is-pending';
  if (status === 'effectue') return 'is-effectue';
  if (status === 'annule') return 'is-annule';
  return 'is-demande';
}

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function formatWhen(date: string, time: string): string {
  const day = formatDate(date);
  return time ? `${day} ${time}` : day;
}

function vehicleLabel(vehicle: FleetVehicle): string {
  const identity = [vehicle.plaque, vehicle.marque, vehicle.type].filter(Boolean).join(' · ');
  const extra = [vehicle.province, vehicle.user].filter(Boolean).join(' — ');
  return extra ? `${identity} — ${extra}` : identity;
}

function countBy(items: CharroiVoyage[], keyOf: (item: CharroiVoyage) => string): RankItem[] {
  const map = new Map<string, RankItem>();
  for (const item of items) {
    const key = keyOf(item).trim();
    if (!key) continue;
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { key, label: key, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
}

function toEmployee(row: SlimEmployee): Employee {
  return {
    ...emptyEmployeeHrProfile(),
    matricule: row.matricule,
    nom: row.nom,
    departement: row.departement,
    grade: '',
    jobTitle: row.jobTitle,
    localisation: row.localisation,
    documents: {},
  };
}

function haystack(voyage: CharroiVoyage): string {
  return [
    voyage.numero,
    voyage.passagerNom,
    voyage.passagerMatricule,
    voyage.depart,
    voyage.destination,
    voyage.motif,
    voyage.chauffeurNom,
    voyage.vehiculeLibelle,
    statusLabel(voyage.status),
  ].join(' ').toLowerCase();
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({} as { error?: string }));
  return data.error || 'Erreur inattendue';
}

function PlaceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const known = isCharroiRoutePlace(value);
  const [autre, setAutre] = useState(value !== '' && !known);
  const selectValue = autre ? CHARROI_ROUTE_AUTRE : value;

  return (
    <div className="form-group">
      <label>{label}</label>
      <select
        value={selectValue}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CHARROI_ROUTE_AUTRE) {
            setAutre(true);
            onChange('');
            return;
          }
          setAutre(false);
          onChange(next);
        }}
        required={!autre}
      >
        <option value="">Choisir…</option>
        {CHARROI_ROUTE_PLACES.map((place) => (
          <option key={place} value={place}>{place}</option>
        ))}
        <option value={CHARROI_ROUTE_AUTRE}>Autre localité…</option>
      </select>
      {autre && (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Préciser la localité du tronçon"
          required
          style={{ marginTop: '0.4rem' }}
        />
      )}
    </div>
  );
}

function RankCard({
  title,
  hint,
  items,
  tone,
  onOpen,
}: {
  title: string;
  hint: string;
  items: RankItem[];
  tone: string;
  onOpen: (item: RankItem) => void;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <section className="panel charroi-voyage-panel">
      <h3>{title}</h3>
      <p className="text-muted charroi-voyage-hint">{hint}</p>
      {items.length === 0 ? <p className="text-muted">Aucune course pour l’instant.</p> : (
        <div className="charroi-voyage-rank">
          {items.map((item, index) => (
            <button
              key={item.key}
              type="button"
              title={`Voir la liste — ${item.label}`}
              style={{ animationDelay: `${index * 70}ms` }}
              onClick={() => onOpen(item)}
            >
              <span className={`charroi-voyage-rank-index is-${tone}`}>{index + 1}</span>
              <span className="charroi-voyage-rank-body">
                <span className="charroi-voyage-rank-label">{item.label}</span>
                {item.meta ? <span className="text-muted">{item.meta}</span> : null}
                <span className="charroi-voyage-rank-track">
                  <span
                    className={`charroi-voyage-rank-fill is-${tone}`}
                    style={{
                      width: `${Math.max(8, (item.count / max) * 100)}%`,
                      animationDelay: `${120 + index * 80}ms`,
                    }}
                  />
                </span>
              </span>
              <strong>{item.count}</strong>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ActionButton({
  busy,
  busyLabel,
  children,
  className,
  type = 'submit',
  onClick,
}: {
  busy: boolean;
  busyLabel: string;
  children: string;
  className: string;
  type?: 'submit' | 'button';
  onClick?: () => void;
}) {
  return (
    <button type={type} className={className} disabled={busy} onClick={onClick}>
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      {busy ? busyLabel : children}
    </button>
  );
}

function PersonFields({
  legend,
  interne,
  nom,
  employees,
  externeEmployees,
  onInterne,
  onNom,
  onPick,
}: {
  legend: string;
  interne: boolean;
  nom: string;
  employees: Employee[];
  externeEmployees?: Employee[];
  onInterne: (value: boolean) => void;
  onNom: (value: string) => void;
  onPick: (employee: Employee) => void;
}) {
  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label>{legend}</label>
      <div className="charroi-voyage-toggle">
        <button type="button" className={interne ? 'is-active' : ''} onClick={() => onInterne(true)}>
          Interne
        </button>
        <button type="button" className={!interne ? 'is-active' : ''} onClick={() => onInterne(false)}>
          Externe
        </button>
      </div>
      {interne ? (
        <EmployeeSuggestInput
          employees={employees}
          value={nom}
          onChange={onNom}
          onEmployeeSelect={onPick}
          placeholder="Nom de l’employé — suggestions internes"
          required
        />
      ) : externeEmployees ? (
        <EmployeeSuggestInput
          employees={externeEmployees}
          value={nom}
          onChange={onNom}
          onEmployeeSelect={onPick}
          placeholder="Contractant — suggestions, ou saisie libre"
          required
        />
      ) : (
        <input
          value={nom}
          onChange={(event) => onNom(event.target.value)}
          placeholder="Nom en saisie libre"
          required
        />
      )}
    </div>
  );
}

export default function CharroiVoyagesPage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create') || can('charroi', 'create');
  const canEdit = can(MENU, 'edit') || can('charroi', 'edit');
  const canDelete = can(MENU, 'delete') || can('charroi', 'delete');

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [items, setItems] = useState<CharroiVoyage[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [contractantDrivers, setContractantDrivers] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [demandeFilter, setDemandeFilter] = useState<DemandeFilter>('toutes');
  const [requestForm, setRequestForm] = useState<RequestForm | null>(null);
  const [confirmForm, setConfirmForm] = useState<ConfirmForm | null>(null);
  const [completeForm, setCompleteForm] = useState<CompleteForm | null>(null);
  const [drill, setDrill] = useState<{ title: string; items: CharroiVoyage[] } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; voyage: CharroiVoyage } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [voyagesRes, optionsRes] = await Promise.all([
        fetch('/api/charroi/voyages'),
        fetch('/api/charroi/voyages/options'),
      ]);
      if (!voyagesRes.ok) throw new Error(await readError(voyagesRes));
      const voyages = (await voyagesRes.json()) as CharroiVoyage[];
      setItems(Array.isArray(voyages) ? voyages : []);
      if (optionsRes.ok) {
        const options = (await optionsRes.json()) as {
          vehicules?: FleetVehicle[];
          employees?: SlimEmployee[];
          contractants?: SlimEmployee[];
        };
        const fleet = Array.isArray(options.vehicules) ? options.vehicules : [];
        fleet.sort((a, b) => String(a.plaque || '').localeCompare(String(b.plaque || ''), 'fr'));
        setVehicles(fleet);
        setEmployees((options.employees ?? []).map(toEmployee));
        setContractantDrivers((options.contractants ?? []).map(toEmployee));
      }
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()]);
    for (const item of items) {
      const value = Number(item.dateDepart.slice(0, 4));
      if (Number.isFinite(value) && value > 1900) set.add(value);
    }
    return [...set].sort((a, b) => b - a);
  }, [items]);

  const periodItems = useMemo(
    () => items.filter((item) => inPeriod(item, year, month)),
    [items, month, year],
  );

  const counts = useMemo(() => ({
    demande: periodItems.filter((item) => item.status === 'demande').length,
    pending: periodItems.filter((item) => item.status === 'pending').length,
    effectue: periodItems.filter((item) => item.status === 'effectue').length,
    annule: periodItems.filter((item) => item.status === 'annule').length,
  }), [periodItems]);

  const activeTrips = useMemo(
    () => periodItems.filter((item) => item.status !== 'annule'),
    [periodItems],
  );
  const assignedTrips = useMemo(
    () => periodItems.filter((item) => item.status === 'pending' || item.status === 'effectue'),
    [periodItems],
  );

  const monthlyRows = useMemo((): VoyageMonthRow[] => {
    return MONTHS.map((label, index) => {
      const key = periodKey(year, index + 1);
      const monthItems = items.filter((item) => item.dateDepart.startsWith(key));
      const row: VoyageMonthRow = {
        key,
        label,
        demande: 0,
        pending: 0,
        effectue: 0,
        annule: 0,
        total: 0,
      };
      for (const item of monthItems) {
        row[item.status] += 1;
        row.total += 1;
      }
      return row;
    });
  }, [items, year]);

  const destinations = useMemo(
    () => countBy(activeTrips, (item) => item.destination).map((item) => ({
      label: item.label,
      value: item.count,
    })),
    [activeTrips],
  );

  const topCourses = useMemo(() => {
    const map = new Map<string, RankItem>();
    for (const item of activeTrips) {
      const key = `${item.depart}→${item.destination}`;
      const prev = map.get(key);
      if (prev) prev.count += 1;
      else {
        map.set(key, {
          key,
          label: `${item.depart} → ${item.destination}`,
          count: 1,
        });
      }
    }
    return [...map.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
      .slice(0, 5);
  }, [activeTrips]);

  const topDrivers = useMemo(
    () => countBy(assignedTrips, (item) => item.chauffeurNom).slice(0, 5),
    [assignedTrips],
  );

  const topVehicles = useMemo(() => {
    const map = new Map<string, RankItem & { people: number }>();
    for (const item of assignedTrips) {
      const key = item.vehiculeLibelle.trim();
      if (!key) continue;
      const people = item.nombrePersonnes || 1;
      const prev = map.get(key);
      if (prev) {
        prev.count += 1;
        prev.people += people;
      } else {
        map.set(key, { key, label: key, count: 1, people });
      }
    }
    return [...map.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'))
      .slice(0, 5)
      .map((item) => ({ ...item, meta: `${item.people} pers.` }));
  }, [assignedTrips]);

  const upcoming = useMemo(() => {
    return periodItems
      .filter((item) => item.status === 'demande' || item.status === 'pending')
      .sort((a, b) => `${a.dateDepart}T${a.heureDepart}`.localeCompare(`${b.dateDepart}T${b.heureDepart}`))
      .slice(0, 8);
  }, [periodItems]);

  const query = search.trim().toLowerCase();
  const demandes = useMemo(() => periodItems.filter((item) => {
    if (item.status === 'effectue') return false;
    if (demandeFilter !== 'toutes' && item.status !== demandeFilter) return false;
    return !query || haystack(item).includes(query);
  }), [demandeFilter, periodItems, query]);

  const effectues = useMemo(() => periodItems.filter((item) => {
    if (item.status !== 'effectue') return false;
    return !query || haystack(item).includes(query);
  }), [periodItems, query]);

  function openDrill(title: string, list: CharroiVoyage[]) {
    setDrill({ title: `Voir la liste — ${title}`, items: list });
  }

  function openCreate() {
    setRequestForm(emptyRequest());
  }

  function openEdit(voyage: CharroiVoyage) {
    setRequestForm({
      id: voyage.id,
      passagerInterne: voyage.passagerInterne,
      passagerNom: voyage.passagerNom,
      passagerMatricule: voyage.passagerMatricule,
      depart: voyage.depart,
      destination: voyage.destination,
      dateDepart: voyage.dateDepart,
      heureDepart: voyage.heureDepart,
      nombrePersonnes: String(voyage.nombrePersonnes || 1),
      motif: voyage.motif,
      notes: voyage.notes,
    });
  }

  function moneyField(value: number): string {
    return value > 0 ? String(value) : '';
  }

  function openConfirm(voyage: CharroiVoyage) {
    setConfirmForm({
      id: voyage.id,
      chauffeurInterne: voyage.chauffeurInterne || !voyage.chauffeurNom,
      chauffeurNom: voyage.chauffeurNom,
      chauffeurMatricule: voyage.chauffeurMatricule,
      vehiculeMode: voyage.vehiculeMode === 'location' ? 'location' : 'flotte',
      vehiculeId: voyage.vehiculeId,
      vehiculeLocation: voyage.vehiculeMode === 'location' ? voyage.vehiculeLibelle : '',
      foodAllowance: moneyField(voyage.foodAllowance),
      foodForTheRoad: moneyField(voyage.foodForTheRoad),
      tollGate: moneyField(voyage.tollGate),
    });
  }

  function openComplete(voyage: CharroiVoyage) {
    setCompleteForm({
      id: voyage.id,
      dateArrivee: voyage.dateArrivee || voyage.dateDepart,
      heureArrivee: voyage.heureArrivee,
    });
  }

  async function saveRequest(event: FormEvent) {
    event.preventDefault();
    if (!requestForm || busy) return;
    setBusy(true);
    try {
      const payload = {
        passagerNom: requestForm.passagerNom.trim(),
        passagerMatricule: requestForm.passagerInterne ? requestForm.passagerMatricule.trim() : '',
        passagerInterne: requestForm.passagerInterne,
        depart: requestForm.depart.trim(),
        destination: requestForm.destination.trim(),
        dateDepart: requestForm.dateDepart,
        heureDepart: requestForm.heureDepart,
        nombrePersonnes: Math.max(1, Number(requestForm.nombrePersonnes) || 1),
        motif: requestForm.motif.trim(),
        notes: requestForm.notes.trim(),
      };
      const response = await fetch(
        requestForm.id ? `/api/charroi/voyages/${requestForm.id}` : '/api/charroi/voyages',
        {
          method: requestForm.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      setRequestForm(null);
      await showSuccess(requestForm.id ? 'Demande mise à jour' : 'Demande de voyage enregistrée');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function saveConfirm(event: FormEvent) {
    event.preventDefault();
    if (!confirmForm || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/charroi/voyages/${confirmForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          chauffeurNom: confirmForm.chauffeurNom.trim(),
          chauffeurMatricule: confirmForm.chauffeurInterne ? confirmForm.chauffeurMatricule.trim() : '',
          chauffeurInterne: confirmForm.chauffeurInterne,
          vehiculeMode: confirmForm.vehiculeMode,
          vehiculeId: confirmForm.vehiculeMode === 'flotte' ? confirmForm.vehiculeId : '',
          vehiculeLocation: confirmForm.vehiculeMode === 'location' ? confirmForm.vehiculeLocation.trim() : '',
          foodAllowance: Number(confirmForm.foodAllowance) || 0,
          foodForTheRoad: Number(confirmForm.foodForTheRoad) || 0,
          tollGate: Number(confirmForm.tollGate) || 0,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setConfirmForm(null);
      await showSuccess('Voyage approuvé');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Confirmation impossible');
    } finally {
      setBusy(false);
    }
  }

  async function saveComplete(event: FormEvent) {
    event.preventDefault();
    if (!completeForm || busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/charroi/voyages/${completeForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          dateArrivee: completeForm.dateArrivee,
          heureArrivee: completeForm.heureArrivee,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setCompleteForm(null);
      await showSuccess('Date d’arrivée enregistrée');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Mise à jour impossible');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(voyage: CharroiVoyage, action: 'cancel' | 'reopen') {
    const ok = await confirmAction(
      action === 'cancel' ? 'Annuler ce voyage ?' : 'Rouvrir ce voyage ?',
      `${voyage.numero} — ${voyage.passagerNom}`,
      action === 'cancel' ? 'Annuler' : 'Rouvrir',
    );
    if (!ok) return;
    setPendingId(voyage.id);
    setBusy(true);
    try {
      const response = await fetch(`/api/charroi/voyages/${voyage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Action impossible');
    } finally {
      setBusy(false);
      setPendingId(null);
    }
  }

  async function downloadDriverDocs(voyage: CharroiVoyage) {
    setPendingId(voyage.id);
    try {
      const response = await fetch(`/api/charroi/voyages/${voyage.id}/documents`);
      if (!response.ok) throw new Error(await readError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Documents voyage chauffeur - ${voyage.numero}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Génération impossible');
    } finally {
      setPendingId(null);
    }
  }

  async function remove(voyage: CharroiVoyage) {
    const ok = await confirmDelete('Supprimer ce voyage ?', `${voyage.numero} — ${voyage.passagerNom}`);
    if (!ok) return;
    setPendingId(voyage.id);
    setBusy(true);
    try {
      const response = await fetch(`/api/charroi/voyages/${voyage.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      await showSuccess('Voyage supprimé');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setBusy(false);
      setPendingId(null);
    }
  }

  function drillRows(list: CharroiVoyage[]): DashboardListRow[] {
    return list.map((item) => ({
      id: item.id,
      cells: {
        numero: item.numero,
        passager: item.passagerMatricule ? `${item.passagerNom} (${item.passagerMatricule})` : item.passagerNom,
        personnes: String(item.nombrePersonnes || 1),
        trajet: `${item.depart} → ${item.destination}`,
        depart: formatWhen(item.dateDepart, item.heureDepart),
        statut: statusLabel(item.status),
        chauffeur: item.chauffeurNom || '—',
        vehicule: item.vehiculeLibelle || '—',
      },
    }));
  }

  function menuItems(voyage: CharroiVoyage): ContextMenuItem[] {
    const itemsMenu: ContextMenuItem[] = [];
    if (canEdit) {
      itemsMenu.push({ id: 'edit', label: 'Modifier', icon: 'edit', onClick: () => openEdit(voyage) });
    }
    if (canEdit && (voyage.status === 'demande' || voyage.status === 'pending')) {
      itemsMenu.push({
        id: 'confirm',
        label: voyage.status === 'pending' ? 'Modifier l’affectation' : 'Approuver et affecter',
        icon: 'add',
        onClick: () => openConfirm(voyage),
      });
    }
    if (voyage.chauffeurNom && voyage.vehiculeLibelle) {
      itemsMenu.push({
        id: 'docs',
        label: 'Générer les documents du chauffeur',
        icon: 'doc',
        onClick: () => void downloadDriverDocs(voyage),
      });
    }
    if (canEdit && voyage.status === 'effectue') {
      itemsMenu.push({ id: 'done', label: 'Date d’arrivée', icon: 'toggle', onClick: () => openComplete(voyage) });
    }
    if (canEdit && (voyage.status === 'demande' || voyage.status === 'pending')) {
      itemsMenu.push({ id: 'cancel', label: 'Annuler', icon: 'cancel', onClick: () => void runAction(voyage, 'cancel') });
    }
    if (canEdit && (voyage.status === 'annule' || voyage.status === 'effectue')) {
      itemsMenu.push({ id: 'reopen', label: 'Rouvrir', icon: 'move', onClick: () => void runAction(voyage, 'reopen') });
    }
    if (canDelete) {
      itemsMenu.push({ id: 'delete', label: 'Supprimer', icon: 'delete', danger: true, onClick: () => void remove(voyage) });
    }
    return itemsMenu;
  }

  function renderTable(list: CharroiVoyage[], empty: string, compact = false) {
    if (list.length === 0 && !compact) {
      return (
        <div className="charroi-voyage-empty">
          <svg className="charroi-voyage-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <path d="M3 17h2l1.2-3.2A2 2 0 0 1 8.1 12h7.8a2 2 0 0 1 1.9 1.4L19 17h2" />
            <circle cx="7.5" cy="17.5" r="1.5" />
            <circle cx="16.5" cy="17.5" r="1.5" />
            <path d="M4 10c2.5-4 5-6 8-6s5.5 2 8 6" />
            <path d="M8 7.5h.01M12 6.2h.01M16 7.5h.01" strokeLinecap="round" />
          </svg>
          <p>{empty}</p>
        </div>
      );
    }
    if (list.length === 0) {
      return <p className="text-muted">{empty}</p>;
    }
    return (
      <div className="table-wrap charroi-table-wrap charroi-voyage-table-wrap">
        <table className={`data-table charroi-table charroi-voyage-table${compact ? ' is-compact' : ''}`}>
          <thead>
            <tr>
              {!compact && <th>N°</th>}
              <th>Passager</th>
              <th>Pers.</th>
              <th>Trajet</th>
              <th>Départ</th>
              <th>Statut</th>
              {!compact && <th>Chauffeur</th>}
              {!compact && <th>Véhicule</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((voyage) => (
              <tr
                key={voyage.id}
                className={pendingId === voyage.id ? 'is-pending' : undefined}
                title="Clic droit pour les actions"
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  const actions = menuItems(voyage);
                  if (actions.length === 0) return;
                  setContextMenu({ x: event.clientX, y: event.clientY, voyage });
                }}
              >
                {!compact && <td>{voyage.numero}</td>}
                <td>
                  <strong>{voyage.passagerNom}</strong>
                  {voyage.passagerMatricule ? <div className="text-muted">{voyage.passagerMatricule}</div> : null}
                  {!voyage.passagerInterne ? <div className="text-muted">Externe</div> : null}
                </td>
                <td>{voyage.nombrePersonnes || 1}</td>
                <td>{voyage.depart} → {voyage.destination}</td>
                <td>
                  {formatWhen(voyage.dateDepart, voyage.heureDepart)}
                  {voyage.dateArrivee ? <div className="text-muted">Arrivée {formatWhen(voyage.dateArrivee, voyage.heureArrivee)}</div> : null}
                  {voyage.motif ? <div className="text-muted">{voyage.motif}</div> : null}
                </td>
                <td><span className={`charroi-status ${statusClass(voyage.status)}`}>{statusLabel(voyage.status)}</span></td>
                {!compact && <td>{voyage.chauffeurNom || '—'}</td>}
                {!compact && <td>{voyage.vehiculeLibelle || '—'}</td>}
                <td className="charroi-actions-cell" onClick={(event) => event.stopPropagation()}>
                  {pendingId === voyage.id ? (
                    <span className="btn-spinner charroi-voyage-row-spinner" aria-label="Action en cours" />
                  ) : (
                    <CardActionMenu items={menuItems(voyage)} ariaLabel={`Actions — ${voyage.numero}`} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const kpi = (
    label: string,
    count: number,
    tone: string,
    list: CharroiVoyage[],
    delay: number,
  ) => (
    <button
      type="button"
      className={`card card-glow ${tone} guest-house-kpi-card charroi-kpi-card charroi-voyage-kpi dependants-kpi-clickable`}
      title={`Voir la liste — ${label}`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={() => openDrill(label, list)}
    >
      <div className="guest-house-kpi-text">
        <div className="card-label">{label}</div>
        <div className="card-value">{count}</div>
      </div>
    </button>
  );

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === confirmForm?.vehiculeId) ?? null;
  const confirmingTrip = items.find((item) => item.id === confirmForm?.id) ?? null;
  const sharedTrips = items.filter((item) => {
    if (!confirmForm || !confirmingTrip || item.id === confirmingTrip.id || item.status === 'annule') return false;
    if (confirmForm.vehiculeMode === 'flotte') {
      return Boolean(confirmForm.vehiculeId) && item.vehiculeId === confirmForm.vehiculeId;
    }
    const label = confirmForm.vehiculeLocation.trim().toLowerCase();
    return Boolean(label) && item.vehiculeLibelle.trim().toLowerCase() === label;
  });
  const sharedPeople = sharedTrips.reduce((sum, item) => sum + (item.nombrePersonnes || 1), 0);

  return (
    <PermissionGate anyOf={VIEW_ANY}>
      <div className="charroi-page charroi-voyage-page">
        <div className="page-header page-header-with-tabs">
          <div>
            <div className="page-header-title-row">
              <h2>Voyage par route</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
            <p>Demandes, affectations et voyages effectués.</p>
          </div>
          <div className="guest-house-header-actions">
            <div className="guest-house-toolbar-right">
              <div className="tabs header-tabs header-tabs-compact guest-house-main-tabs charroi-voyage-main-tabs">
                <button type="button" className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`} onClick={() => setTab('dashboard')}>
                  Dashboard
                </button>
                <button type="button" className={`tab-btn tab-btn-sm${tab === 'demandes' ? ' active' : ''}`} onClick={() => setTab('demandes')}>
                  Demandes
                </button>
                <button type="button" className={`tab-btn tab-btn-sm${tab === 'effectues' ? ' active' : ''}`} onClick={() => setTab('effectues')}>
                  Voyages effectués
                </button>
              </div>
              <div className="charroi-voyage-period">
                <label>
                  Année
                  <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                    {years.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Mois
                  <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                    {MONTHS.map((label, index) => (
                      <option key={label} value={index + 1}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {canCreate && (
                <button
                  type="button"
                  className="btn btn-accent charroi-voyage-add"
                  aria-label="Nouvelle demande"
                  title="Nouvelle demande"
                  onClick={openCreate}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? <p className="text-muted">Chargement…</p> : null}

        {!loading && tab === 'dashboard' && (
          <div className="charroi-voyage-dash">
            <div className="charroi-voyage-kpis">
              {kpi('Demandes', counts.demande, 'card-glow-amber', periodItems.filter((item) => item.status === 'demande'), 0)}
              {kpi('Pending', counts.pending, 'card-glow-cyan', periodItems.filter((item) => item.status === 'pending'), 70)}
              {kpi('Effectués', counts.effectue, 'card-glow-green', periodItems.filter((item) => item.status === 'effectue'), 140)}
              {kpi('Annulés', counts.annule, 'card-glow-red', periodItems.filter((item) => item.status === 'annule'), 210)}
            </div>
            <VoyageMonthlyChart
              title={`Mouvements ${year}`}
              rows={monthlyRows}
              selectedKey={periodKey(year, month)}
              onItemClick={(key) => {
                const monthIndex = Number(key.slice(5, 7)) - 1;
                const label = MONTHS[monthIndex] ?? key;
                openDrill(
                  `${label} ${year}`,
                  items.filter((item) => item.dateDepart.startsWith(key)),
                );
              }}
            />
            <div className="charroi-voyage-charts">
              <DependantsBarChart
                title="Voyages par destination"
                items={destinations}
                compact
                fitAll={destinations.length > 0 && destinations.length <= 12}
                onItemClick={(label) => openDrill(
                  label,
                  activeTrips.filter((item) => item.destination === label),
                )}
              />
              <section className="panel charroi-voyage-panel charroi-voyage-upcoming">
                <h3>Départs du mois</h3>
                <p className="text-muted charroi-voyage-hint">Clic droit : actions.</p>
                {upcoming.length === 0 ? <p className="text-muted">Aucun départ ce mois.</p> : renderTable(upcoming, '', true)}
              </section>
            </div>
            <div className="charroi-voyage-ranks">
              <RankCard
                title="Top 5 des courses"
                hint="Trajets du mois"
                tone="route"
                items={topCourses}
                onOpen={(item) => {
                  const [depart, destination] = item.key.split('→');
                  openDrill(item.label, activeTrips.filter((trip) => trip.depart === depart && trip.destination === destination));
                }}
              />
              <RankCard
                title="Top chauffeurs"
                hint="Pending et effectués"
                tone="driver"
                items={topDrivers}
                onOpen={(item) => openDrill(item.label, assignedTrips.filter((trip) => trip.chauffeurNom === item.key))}
              />
              <RankCard
                title="Top véhicules"
                hint="Courses et personnes"
                tone="fleet"
                items={topVehicles}
                onOpen={(item) => openDrill(item.label, assignedTrips.filter((trip) => trip.vehiculeLibelle === item.key))}
              />
            </div>
          </div>
        )}

        {!loading && tab !== 'dashboard' && (
          <div className="panel docs-filter-bar-compact charroi-filters">
            <input
              type="search"
              className="search-input"
              placeholder="Rechercher passager, trajet, chauffeur, véhicule…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="text-muted charroi-voyage-hint">Clic droit : actions. Période : {MONTHS[month - 1]} {year}.</span>
            {tab === 'demandes' && (
              <div className="charroi-voyage-toggle">
                {([
                  ['toutes', 'Toutes'],
                  ['demande', 'En attente'],
                  ['pending', 'Pending'],
                  ['annule', 'Annulés'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={demandeFilter === id ? 'is-active' : ''}
                    onClick={() => setDemandeFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && tab === 'demandes' && renderTable(demandes, 'Aucune demande pour ce filtre.')}
        {!loading && tab === 'effectues' && renderTable(effectues, 'Aucun voyage effectué.')}

        {requestForm && (
          <div className="modal-overlay open" onClick={() => setRequestForm(null)}>
            <div className="modal modal-lg modal-form" onClick={(event) => event.stopPropagation()}>
              <form onSubmit={(event) => void saveRequest(event)}>
                <div className="modal-header">
                  <h3>{requestForm.id ? 'Modifier la demande' : 'Nouvelle demande de voyage'}</h3>
                  <button type="button" className="modal-close" onClick={() => setRequestForm(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="form-grid">
                    <PersonFields
                      legend="Passager"
                      interne={requestForm.passagerInterne}
                      nom={requestForm.passagerNom}
                      employees={employees}
                      onInterne={(value) => setRequestForm({
                        ...requestForm,
                        passagerInterne: value,
                        passagerMatricule: value ? requestForm.passagerMatricule : '',
                      })}
                      onNom={(value) => setRequestForm({ ...requestForm, passagerNom: value, passagerMatricule: '' })}
                      onPick={(employee) => setRequestForm({
                        ...requestForm,
                        passagerInterne: true,
                        passagerNom: employee.nom,
                        passagerMatricule: employee.matricule,
                      })}
                    />
                    <PlaceField
                      label="Départ"
                      value={requestForm.depart}
                      onChange={(depart) => setRequestForm({ ...requestForm, depart })}
                    />
                    <PlaceField
                      label="Destination"
                      value={requestForm.destination}
                      onChange={(destination) => setRequestForm({ ...requestForm, destination })}
                    />
                    <div className="form-group">
                      <label>Date de départ</label>
                      <input
                        type="date"
                        value={requestForm.dateDepart}
                        onChange={(event) => setRequestForm({ ...requestForm, dateDepart: event.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Nombre de personnes</label>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        value={requestForm.nombrePersonnes}
                        onChange={(event) => setRequestForm({ ...requestForm, nombrePersonnes: event.target.value })}
                        required
                      />
                      <span className="text-muted charroi-voyage-hint">Passager principal et accompagnants.</span>
                    </div>
                    <div className="form-group">
                      <label>Heure de départ</label>
                      <input
                        type="time"
                        value={requestForm.heureDepart}
                        onChange={(event) => setRequestForm({ ...requestForm, heureDepart: event.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Motif</label>
                      <input
                        value={requestForm.motif}
                        onChange={(event) => setRequestForm({ ...requestForm, motif: event.target.value })}
                        placeholder="Optionnel"
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Notes</label>
                      <textarea
                        rows={3}
                        value={requestForm.notes}
                        onChange={(event) => setRequestForm({ ...requestForm, notes: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setRequestForm(null)} disabled={busy}>Fermer</button>
                  <ActionButton busy={busy} busyLabel="Enregistrement…" className="btn btn-primary">
                    {requestForm.id ? 'Enregistrer' : 'Enregistrer la demande'}
                  </ActionButton>
                </div>
              </form>
            </div>
          </div>
        )}

        {confirmForm && (
          <div className="modal-overlay open" onClick={() => setConfirmForm(null)}>
            <div className="modal modal-lg modal-form" onClick={(event) => event.stopPropagation()}>
              <form onSubmit={(event) => void saveConfirm(event)}>
                <div className="modal-header">
                  <h3>Approuver et affecter</h3>
                  <button type="button" className="modal-close" onClick={() => setConfirmForm(null)}>×</button>
                </div>
                <div className="modal-body">
                  <p className="text-muted">Affectez un chauffeur et un véhicule de la flotte, ou un véhicule en location.</p>
                  <div className="form-grid">
                    <PersonFields
                      legend="Chauffeur"
                      interne={confirmForm.chauffeurInterne}
                      nom={confirmForm.chauffeurNom}
                      employees={employees}
                      externeEmployees={contractantDrivers}
                      onInterne={(value) => setConfirmForm({
                        ...confirmForm,
                        chauffeurInterne: value,
                        chauffeurMatricule: value ? confirmForm.chauffeurMatricule : '',
                      })}
                      onNom={(value) => setConfirmForm({ ...confirmForm, chauffeurNom: value, chauffeurMatricule: '' })}
                      onPick={(employee) => setConfirmForm({
                        ...confirmForm,
                        chauffeurInterne: confirmForm.chauffeurInterne,
                        chauffeurNom: employee.nom,
                        chauffeurMatricule: employee.matricule,
                      })}
                    />
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Véhicule</label>
                      <div className="charroi-voyage-toggle">
                        <button
                          type="button"
                          className={confirmForm.vehiculeMode === 'flotte' ? 'is-active' : ''}
                          onClick={() => setConfirmForm({ ...confirmForm, vehiculeMode: 'flotte' })}
                        >
                          Flotte
                        </button>
                        <button
                          type="button"
                          className={confirmForm.vehiculeMode === 'location' ? 'is-active' : ''}
                          onClick={() => setConfirmForm({ ...confirmForm, vehiculeMode: 'location' })}
                        >
                          Location
                        </button>
                      </div>
                      {confirmForm.vehiculeMode === 'flotte' ? (
                        <>
                          <select
                            value={confirmForm.vehiculeId}
                            onChange={(event) => setConfirmForm({ ...confirmForm, vehiculeId: event.target.value })}
                            required
                          >
                            <option value="">Choisir un véhicule…</option>
                            {vehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>{vehicleLabel(vehicle)}</option>
                            ))}
                          </select>
                          {selectedVehicle && (
                            <div className="charroi-voyage-vehicle-meta">
                              <span>Province <strong>{selectedVehicle.province || '—'}</strong></span>
                              <span>Responsable <strong>{selectedVehicle.user || '—'}</strong></span>
                            </div>
                          )}
                        </>
                      ) : (
                        <input
                          value={confirmForm.vehiculeLocation}
                          onChange={(event) => setConfirmForm({ ...confirmForm, vehiculeLocation: event.target.value })}
                          placeholder="Société, plaque ou description du véhicule loué"
                          required
                        />
                      )}
                      <p className="text-muted charroi-voyage-hint">
                        {confirmingTrip ? `${confirmingTrip.nombrePersonnes || 1} pers. sur cette demande. ` : ''}
                        {sharedTrips.length > 0
                          ? `Déjà ${sharedTrips.length} autre${sharedTrips.length > 1 ? 's' : ''} affectation${sharedTrips.length > 1 ? 's' : ''} (${sharedPeople} pers.). `
                          : ''}
                        Un véhicule peut recevoir plusieurs demandes.
                      </p>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Budget du voyage</label>
                      <table className="data-table charroi-voyage-budget">
                        <thead>
                          <tr>
                            <th>Ligne</th>
                            <th>Montant ($)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {CHARROI_VOYAGE_BUDGET_LINES.map((line) => (
                            <tr key={line.id}>
                              <td>{line.label}</td>
                              <td>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={confirmForm[line.id]}
                                  onChange={(event) => setConfirmForm({
                                    ...confirmForm,
                                    [line.id]: event.target.value,
                                  })}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td>Total</td>
                            <td>
                              {voyageBudgetTotal({
                                foodAllowance: Number(confirmForm.foodAllowance) || 0,
                                foodForTheRoad: Number(confirmForm.foodForTheRoad) || 0,
                                tollGate: Number(confirmForm.tollGate) || 0,
                              }).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setConfirmForm(null)} disabled={busy}>Fermer</button>
                  <ActionButton busy={busy} busyLabel="Confirmation…" className="btn btn-primary">
                    Approuver l’affectation
                  </ActionButton>
                </div>
              </form>
            </div>
          </div>
        )}

        {completeForm && (
          <div className="modal-overlay open" onClick={() => setCompleteForm(null)}>
            <div className="modal modal-form" onClick={(event) => event.stopPropagation()}>
              <form onSubmit={(event) => void saveComplete(event)}>
                <div className="modal-header">
                  <h3>Date d’arrivée</h3>
                  <button type="button" className="modal-close" onClick={() => setCompleteForm(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Date d’arrivée</label>
                      <input
                        type="date"
                        value={completeForm.dateArrivee}
                        onChange={(event) => setCompleteForm({ ...completeForm, dateArrivee: event.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label>Heure d’arrivée</label>
                      <input
                        type="time"
                        value={completeForm.heureArrivee}
                        onChange={(event) => setCompleteForm({ ...completeForm, heureArrivee: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setCompleteForm(null)} disabled={busy}>Fermer</button>
                  <ActionButton busy={busy} busyLabel="Enregistrement…" className="btn btn-primary">
                    Enregistrer
                  </ActionButton>
                </div>
              </form>
            </div>
          </div>
        )}

        {drill && (
          <DashboardListModal
            title={drill.title}
            columns={DRILL_COLUMNS}
            rows={drillRows(drill.items)}
            onClose={() => setDrill(null)}
            searchPlaceholder="Rechercher un voyage…"
          />
        )}
        {contextMenu && (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={menuItems(contextMenu.voyage)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </PermissionGate>
  );
}
