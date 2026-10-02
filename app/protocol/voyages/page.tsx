'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
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
import {
  PROTOCOL_VOYAGE_COST_NATURES,
  computeCoutHotel,
  computeCoutTotal,
  type ProtocolVoyageCout,
  type ProtocolVoyageCostNature,
} from '@/lib/protocol-voyage-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

const MENU = 'protocol.voyages';
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

type Tab = 'dashboard' | 'liste';

type FormState = {
  id: string;
  date: string;
  voyageur: string;
  voyageurMatricule: string;
  destination: string;
  ticketAvion: string;
  visaVolant: string;
  lettreLegaliser: string;
  goPass: string;
  transfert: string;
  hotelNuit: string;
  nbreNuits: string;
  categorieHotel: string;
  appartement: string;
};

const DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'date', label: 'Date' },
  { key: 'voyageur', label: 'Voyageur' },
  { key: 'destination', label: 'Destination' },
  { key: 'billets', label: 'Billets', align: 'right' },
  { key: 'hebergement', label: 'Hébergement', align: 'right' },
  { key: 'total', label: 'Total', align: 'right' },
];

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function padMonth(month: number): string {
  return String(month).padStart(2, '0');
}

function moneyLabel(value: number): string {
  const text = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `$${text}`;
}

function num(value: string): number {
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function emptyForm(): FormState {
  return {
    id: '',
    date: todayIso(),
    voyageur: '',
    voyageurMatricule: '',
    destination: '',
    ticketAvion: '',
    visaVolant: '',
    lettreLegaliser: '',
    goPass: '',
    transfert: '',
    hotelNuit: '',
    nbreNuits: '',
    categorieHotel: '',
    appartement: '',
  };
}

function formFrom(item: ProtocolVoyageCout): FormState {
  const text = (value: number) => (value ? String(value) : '');
  return {
    id: item.id,
    date: item.date,
    voyageur: item.voyageur,
    voyageurMatricule: item.voyageurMatricule,
    destination: item.destination,
    ticketAvion: text(item.ticketAvion),
    visaVolant: text(item.visaVolant),
    lettreLegaliser: text(item.lettreLegaliser),
    goPass: text(item.goPass),
    transfert: text(item.transfert),
    hotelNuit: text(item.hotelNuit),
    nbreNuits: item.nbreNuits ? String(item.nbreNuits) : '',
    categorieHotel: item.categorieHotel,
    appartement: text(item.appartement),
  };
}

async function readError(response: Response): Promise<string> {
  const data = await response.json().catch(() => ({} as { error?: string }));
  return data.error || 'Erreur inattendue';
}

export default function ProtocolVoyagesPage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create');
  const canEdit = can(MENU, 'edit');
  const canDelete = can(MENU, 'delete');
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [items, setItems] = useState<ProtocolVoyageCout[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [drill, setDrill] = useState<{ title: string; items: ProtocolVoyageCout[] } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: ProtocolVoyageCout } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [voyagesRes, employeesRes] = await Promise.all([
        fetch('/api/protocol/voyages'),
        fetch('/api/employees'),
      ]);
      if (!voyagesRes.ok) throw new Error(await readError(voyagesRes));
      const voyages = (await voyagesRes.json()) as ProtocolVoyageCout[];
      setItems(Array.isArray(voyages) ? voyages : []);
      if (employeesRes.ok) {
        const people = (await employeesRes.json()) as Employee[];
        setEmployees(Array.isArray(people) ? people : []);
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
      const value = Number(item.date.slice(0, 4));
      if (Number.isFinite(value) && value > 1900) set.add(value);
    }
    return [...set].sort((a, b) => b - a);
  }, [items]);

  const periodItems = useMemo(() => items.filter((item) => {
    if (!item.date.startsWith(String(year))) return false;
    if (month === 0) return true;
    return item.date.startsWith(`${year}-${padMonth(month)}`);
  }), [items, month, year]);

  const totals = useMemo(() => {
    const sum = (pick: (item: ProtocolVoyageCout) => number) => periodItems.reduce((acc, item) => acc + pick(item), 0);
    const count = periodItems.length;
    const global = sum((item) => item.coutTotal);
    return {
      global,
      count,
      moyen: count ? global / count : 0,
      nuits: sum((item) => item.nbreNuits),
      hebergement: sum((item) => item.coutHotel),
      ticket: sum((item) => item.ticketAvion),
      visa: sum((item) => item.visaVolant),
      lettre: sum((item) => item.lettreLegaliser),
      goPass: sum((item) => item.goPass),
      transfert: sum((item) => item.transfert),
      tauxBillets: global ? sum((item) => item.ticketAvion) / global : 0,
    };
  }, [periodItems]);

  const monthly = useMemo(() => MONTHS_SHORT.map((label, index) => ({
    label,
    value: items
      .filter((item) => item.date.startsWith(`${year}-${padMonth(index + 1)}`))
      .reduce((sum, item) => sum + item.coutTotal, 0),
  })), [items, year]);

  const destinations = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of periodItems) map.set(item.destination, (map.get(item.destination) ?? 0) + item.coutTotal);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
  }, [periodItems]);

  const natures = useMemo(() => PROTOCOL_VOYAGE_COST_NATURES.map((nature) => ({
    label: nature.label,
    value: periodItems.reduce((sum, item) => sum + item[nature.id], 0),
  })), [periodItems]);

  const voyageurs = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of periodItems) map.set(item.voyageur, (map.get(item.voyageur) ?? 0) + item.coutTotal);
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value }));
  }, [periodItems]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return periodItems;
    return periodItems.filter((item) => [
      item.numero, item.voyageur, item.destination, item.categorieHotel,
    ].join(' ').toLowerCase().includes(q));
  }, [periodItems, search]);

  const previewHotel = computeCoutHotel(num(form?.hotelNuit ?? ''), Math.round(num(form?.nbreNuits ?? '')));
  const previewTotal = form ? computeCoutTotal({
    ticketAvion: num(form.ticketAvion),
    visaVolant: num(form.visaVolant),
    lettreLegaliser: num(form.lettreLegaliser),
    goPass: num(form.goPass),
    transfert: num(form.transfert),
    coutHotel: previewHotel,
    appartement: num(form.appartement),
  }) : 0;

  function openDrill(title: string, list: ProtocolVoyageCout[]) {
    setDrill({ title: `Voir la liste — ${title}`, items: list });
  }

  function drillRows(list: ProtocolVoyageCout[]): DashboardListRow[] {
    return list.map((item) => ({
      id: item.id,
      cells: {
        date: formatDate(item.date),
        voyageur: item.voyageur,
        destination: item.destination,
        billets: moneyLabel(item.ticketAvion),
        hebergement: moneyLabel(item.coutHotel + item.appartement),
        total: moneyLabel(item.coutTotal),
      },
    }));
  }

  function natureItems(id: ProtocolVoyageCostNature): ProtocolVoyageCout[] {
    return periodItems.filter((item) => item[id] > 0);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    try {
      const payload = {
        date: form.date,
        voyageur: form.voyageur.trim(),
        voyageurMatricule: form.voyageurMatricule.trim(),
        destination: form.destination.trim(),
        ticketAvion: num(form.ticketAvion),
        visaVolant: num(form.visaVolant),
        lettreLegaliser: num(form.lettreLegaliser),
        goPass: num(form.goPass),
        transfert: num(form.transfert),
        hotelNuit: num(form.hotelNuit),
        nbreNuits: Math.round(num(form.nbreNuits)),
        categorieHotel: form.categorieHotel.trim(),
        appartement: num(form.appartement),
      };
      const response = await fetch(form.id ? `/api/protocol/voyages/${form.id}` : '/api/protocol/voyages', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await readError(response));
      setForm(null);
      await showSuccess(form.id ? 'Voyage mis à jour' : 'Voyage enregistré');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: ProtocolVoyageCout) {
    const ok = await confirmDelete('Supprimer ce voyage ?', `${item.numero} — ${item.voyageur}`);
    if (!ok) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/protocol/voyages/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(await readError(response));
      await showSuccess('Voyage supprimé');
      await load(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  }

  function menuItems(item: ProtocolVoyageCout): ContextMenuItem[] {
    const actions: ContextMenuItem[] = [];
    if (canEdit) actions.push({ id: 'edit', label: 'Modifier', icon: 'edit', onClick: () => setForm(formFrom(item)) });
    if (canDelete) actions.push({ id: 'delete', label: 'Supprimer', icon: 'delete', danger: true, onClick: () => void remove(item) });
    return actions;
  }

  const kpi = (label: string, value: string, tone: string, list?: ProtocolVoyageCout[]) => {
    const className = `card card-glow ${tone} guest-house-kpi-card charroi-kpi-card dependants-kpi-clickable`;
    if (!list) {
      return (
        <div className={`card card-glow ${tone} guest-house-kpi-card charroi-kpi-card`}>
          <div className="guest-house-kpi-text">
            <div className="card-label">{label}</div>
            <div className="card-value">{value}</div>
          </div>
        </div>
      );
    }
    return (
      <button type="button" className={className} title={`Voir la liste — ${label}`} onClick={() => openDrill(label, list)}>
        <div className="guest-house-kpi-text">
          <div className="card-label">{label}</div>
          <div className="card-value">{value}</div>
        </div>
      </button>
    );
  };

  return (
    <PermissionGate menuId={MENU} action="view">
      <div className="charroi-page protocol-voyage-page">
        <div className="page-header page-header-with-tabs">
          <div>
            <div className="page-header-title-row">
              <h2>Gestion de voyage</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
            <p>Suivi des coûts : billets, visas, Go Pass, transferts et hébergement.</p>
          </div>
          <div className="guest-house-header-actions">
            <div className="guest-house-toolbar-right">
              <div className="tabs header-tabs header-tabs-compact guest-house-main-tabs">
                <button type="button" className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`} onClick={() => setTab('dashboard')}>Dashboard</button>
                <button type="button" className={`tab-btn tab-btn-sm${tab === 'liste' ? ' active' : ''}`} onClick={() => setTab('liste')}>Voyages</button>
              </div>
              <div className="charroi-voyage-period">
                <label>
                  Année
                  <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                    {years.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  Mois
                  <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                    <option value={0}>Tous</option>
                    {MONTHS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
                  </select>
                </label>
              </div>
              {canCreate && (
                <button type="button" className="btn btn-accent charroi-voyage-add" title="Nouveau voyage" aria-label="Nouveau voyage" onClick={() => setForm(emptyForm())}>
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
            <div className="protocol-voyage-kpis">
              {kpi('Coût global', moneyLabel(totals.global), 'card-glow-cyan', periodItems)}
              {kpi('Voyages', String(totals.count), 'card-glow-amber', periodItems)}
              {kpi('Coût moyen / voyage', moneyLabel(totals.moyen), 'card-glow-violet')}
              {kpi('Nuits réservées', String(totals.nuits), 'card-glow-green', periodItems.filter((item) => item.nbreNuits > 0))}
              {kpi('Hébergement', moneyLabel(totals.hebergement), 'card-glow-red', periodItems.filter((item) => item.coutHotel > 0))}
            </div>
            <div className="protocol-voyage-stats">
              {([
                ['Visa volant', totals.visa, 'visaVolant'],
                ['Lettre à légaliser', totals.lettre, 'lettreLegaliser'],
                ['Go Pass', totals.goPass, 'goPass'],
                ['Transferts', totals.transfert, 'transfert'],
              ] as const).map(([label, value, key]) => (
                <button key={key} type="button" title={`Voir la liste — ${label}`} onClick={() => openDrill(label, natureItems(key))}>
                  <span>{label}</span>
                  <strong>{moneyLabel(value)}</strong>
                </button>
              ))}
              <div>
                <span>Taux billets avion</span>
                <strong>{Math.round(totals.tauxBillets * 1000) / 10}%</strong>
              </div>
            </div>
            <DependantsBarChart
              title={`Coût par mois — ${year}`}
              items={monthly}
              compact
              fitAll
              formatValue={moneyLabel}
              onItemClick={(label) => {
                const index = MONTHS_SHORT.indexOf(label);
                openDrill(`${label} ${year}`, items.filter((item) => item.date.startsWith(`${year}-${padMonth(index + 1)}`)));
              }}
            />
            <div className="protocol-voyage-charts">
              <DependantsBarChart
                title="Top destinations"
                items={destinations}
                compact
                formatValue={moneyLabel}
                onItemClick={(label) => openDrill(label, periodItems.filter((item) => item.destination === label))}
              />
              <DependantsBarChart
                title="Nature de coût"
                items={natures}
                compact
                fitAll
                formatValue={moneyLabel}
                onItemClick={(label) => {
                  const nature = PROTOCOL_VOYAGE_COST_NATURES.find((item) => item.label === label);
                  if (!nature) return;
                  openDrill(label, natureItems(nature.id));
                }}
              />
              <DependantsBarChart
                title="Top voyageurs"
                items={voyageurs}
                compact
                formatValue={moneyLabel}
                onItemClick={(label) => openDrill(label, periodItems.filter((item) => item.voyageur === label))}
              />
            </div>
          </div>
        )}

        {!loading && tab === 'liste' && (
          <>
            <div className="panel docs-filter-bar-compact charroi-filters">
              <input className="search-input" type="search" placeholder="Rechercher voyageur, destination…" value={search} onChange={(event) => setSearch(event.target.value)} />
              <span className="text-muted charroi-voyage-hint">Clic droit : actions. {month === 0 ? `Année ${year}` : `${MONTHS[month - 1]} ${year}`}.</span>
            </div>
            {filtered.length === 0 ? (
              <div className="charroi-voyage-empty">
                <svg className="charroi-voyage-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                  <path d="M3 17h2l1.2-3.2A2 2 0 0 1 8.1 12h7.8a2 2 0 0 1 1.9 1.4L19 17h2" />
                  <circle cx="7.5" cy="17.5" r="1.5" />
                  <circle cx="16.5" cy="17.5" r="1.5" />
                  <path d="M4 8c2.2-3 4.6-4.5 8-4.5S17.8 5 20 8" />
                </svg>
                <p>Aucun voyage pour ce filtre.</p>
              </div>
            ) : (
              <div className="table-wrap charroi-table-wrap">
                <table className="data-table charroi-table protocol-voyage-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Voyageur</th>
                      <th>Destination</th>
                      <th>Billets</th>
                      <th>Hôtel</th>
                      <th>Autres</th>
                      <th>Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr
                        key={item.id}
                        title="Clic droit pour les actions"
                        onContextMenu={(event) => {
                          event.preventDefault();
                          if (menuItems(item).length === 0) return;
                          setContextMenu({ x: event.clientX, y: event.clientY, item });
                        }}
                      >
                        <td>{formatDate(item.date)}</td>
                        <td><strong>{item.voyageur}</strong></td>
                        <td>{item.destination}</td>
                        <td>{moneyLabel(item.ticketAvion)}</td>
                        <td>{moneyLabel(item.coutHotel)}{item.nbreNuits ? <div className="text-muted">{item.nbreNuits} nuit{item.nbreNuits > 1 ? 's' : ''}</div> : null}</td>
                        <td>{moneyLabel(item.visaVolant + item.lettreLegaliser + item.goPass + item.transfert + item.appartement)}</td>
                        <td><strong>{moneyLabel(item.coutTotal)}</strong></td>
                        <td className="charroi-actions-cell">
                          <CardActionMenu items={menuItems(item)} ariaLabel={`Actions — ${item.numero}`} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {form && (
          <div className="modal-overlay open" onClick={() => setForm(null)}>
            <div className="modal modal-lg modal-form" onClick={(event) => event.stopPropagation()}>
              <form onSubmit={(event) => void save(event)}>
                <div className="modal-header">
                  <h3>{form.id ? 'Modifier le voyage' : 'Nouveau voyage'}</h3>
                  <button type="button" className="modal-close" onClick={() => setForm(null)}>×</button>
                </div>
                <div className="modal-body">
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Date</label>
                      <input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Voyageur</label>
                      <EmployeeSuggestInput
                        employees={employees}
                        value={form.voyageur}
                        required
                        placeholder="Nom — suggestion interne ou saisie libre"
                        onChange={(value) => setForm({ ...form, voyageur: value, voyageurMatricule: '' })}
                        onEmployeeSelect={(employee) => setForm({ ...form, voyageur: employee.nom, voyageurMatricule: employee.matricule })}
                      />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Destination</label>
                      <input required value={form.destination} placeholder="Kinshasa - Nairobi - Kinshasa" onChange={(event) => setForm({ ...form, destination: event.target.value })} />
                    </div>
                    {([
                      ['ticketAvion', 'Ticket avion ($)'],
                      ['visaVolant', 'Visa volant ($)'],
                      ['lettreLegaliser', 'Lettre à légaliser ($)'],
                      ['goPass', 'Go Pass ($)'],
                      ['transfert', 'Transfert aéroport–ville ($)'],
                      ['appartement', 'Appartement ($)'],
                    ] as const).map(([key, label]) => (
                      <div className="form-group" key={key}>
                        <label>{label}</label>
                        <input type="number" min={0} step="0.01" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
                      </div>
                    ))}
                    <div className="form-group">
                      <label>Hôtel / nuit ($)</label>
                      <input type="number" min={0} step="0.01" value={form.hotelNuit} onChange={(event) => setForm({ ...form, hotelNuit: event.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Nombre de nuits</label>
                      <input type="number" min={0} step="1" value={form.nbreNuits} onChange={(event) => setForm({ ...form, nbreNuits: event.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Catégorie hôtel</label>
                      <input value={form.categorieHotel} onChange={(event) => setForm({ ...form, categorieHotel: event.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Coût hôtel</label>
                      <input readOnly value={moneyLabel(previewHotel)} />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Coût total</label>
                      <input readOnly value={moneyLabel(previewTotal)} />
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline" onClick={() => setForm(null)} disabled={busy}>Fermer</button>
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy && <span className="btn-spinner" aria-hidden="true" />}
                    {busy ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
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
            items={menuItems(contextMenu.item)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </PermissionGate>
  );
}
