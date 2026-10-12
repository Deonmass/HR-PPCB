'use client';

import { useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import DependantsBarChart from '@/components/dependants/DependantsBarChart';
import HomeDonutChart from '@/components/home/HomeDonutChart';
import type { PpcDisciplineCase } from '@/lib/ppc-discipline-types';
import { showError } from '@/lib/swal';
import * as XLSX from 'xlsx';

const MONTHS = [
  { value: 1, label: 'Janvier', short: 'Jan' },
  { value: 2, label: 'Février', short: 'Fév' },
  { value: 3, label: 'Mars', short: 'Mar' },
  { value: 4, label: 'Avril', short: 'Avr' },
  { value: 5, label: 'Mai', short: 'Mai' },
  { value: 6, label: 'Juin', short: 'Juin' },
  { value: 7, label: 'Juillet', short: 'Juil' },
  { value: 8, label: 'Août', short: 'Aoû' },
  { value: 9, label: 'Septembre', short: 'Sep' },
  { value: 10, label: 'Octobre', short: 'Oct' },
  { value: 11, label: 'Novembre', short: 'Nov' },
  { value: 12, label: 'Décembre', short: 'Déc' },
] as const;

const STATUT_COLORS: Record<string, string> = {
  Ouvert: '#f59e0b',
  "Demande d'explication": '#06b6d4',
  'Réponse reçue': '#8b5cf6',
  Clos: '#22c55e',
};

const COLUMNS: DashboardListColumn[] = [
  { key: 'agent', label: 'Agent' },
  { key: 'matricule', label: 'Matricule' },
  { key: 'departement', label: 'Département' },
  { key: 'date', label: 'Date' },
  { key: 'motif', label: 'Motif' },
  { key: 'statut', label: 'Statut' },
  { key: 'sanction', label: 'Sanction' },
];

type DrillState = {
  title: string;
  predicate: (c: PpcDisciplineCase) => boolean;
};

function formatDate(value: string): string {
  if (!value) return '—';
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR');
}

function incidentParts(item: PpcDisciplineCase): { year: number; month: number } | null {
  const raw = (item.dateIncident || item.createdAt || '').slice(0, 10);
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function inPeriod(item: PpcDisciplineCase, year: number | '', month: number | ''): boolean {
  if (year === '' && month === '') return true;
  const parts = incidentParts(item);
  if (!parts) return false;
  if (year !== '' && parts.year !== year) return false;
  if (month !== '' && parts.month !== month) return false;
  return true;
}

function isSansReponse(item: PpcDisciplineCase): boolean {
  return Boolean(item.demandeLien || item.demandeDate)
    && !item.reponseLien
    && !item.reponseDate
    && item.statut !== 'Clos';
}

function shareLabel(count: number, total: number): string {
  if (!total) return '0 % du total';
  return `${Math.round((count / total) * 100)} % du total`;
}

function deptLabel(value: string): string {
  const trimmed = value.trim();
  return trimmed || 'Non renseigné';
}

function toRows(list: PpcDisciplineCase[]): DashboardListRow[] {
  return list.map((c) => ({
    id: c.id,
    cells: {
      agent: c.employeeName || '—',
      matricule: c.matricule || '—',
      departement: c.departement || '—',
      date: formatDate(c.dateIncident),
      motif: c.motif || '—',
      statut: c.statut,
      sanction: c.sanction || '—',
    },
  }));
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function PpcDisciplineDashboard({ cases }: { cases: PpcDisciplineCase[] }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [yearFilter, setYearFilter] = useState<number | ''>(currentYear);
  const [monthFilter, setMonthFilter] = useState<number | ''>(currentMonth);
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [exporting, setExporting] = useState(false);

  const yearOptions = useMemo(() => {
    const years = new Set<number>([currentYear]);
    for (const item of cases) {
      const parts = incidentParts(item);
      if (parts) years.add(parts.year);
    }
    return [...years].sort((a, b) => b - a);
  }, [cases, currentYear]);

  const filtered = useMemo(
    () => cases.filter((item) => inPeriod(item, yearFilter, monthFilter)),
    [cases, yearFilter, monthFilter],
  );

  const evolutionYear = yearFilter === '' ? currentYear : yearFilter;

  const monthly = useMemo(
    () => MONTHS.map((month) => ({
      label: month.short,
      month: month.value,
      name: month.label,
      value: cases.filter((item) => {
        const parts = incidentParts(item);
        return parts?.year === evolutionYear && parts.month === month.value;
      }).length,
    })),
    [cases, evolutionYear],
  );

  const byDepartment = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of filtered) {
      const label = deptLabel(item.departement);
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'fr'));
  }, [filtered]);

  const statutSlices = useMemo(() => {
    const order = ['Ouvert', "Demande d'explication", 'Réponse reçue', 'Clos'];
    return order
      .map((label) => ({
        label,
        value: filtered.filter((item) => item.statut === label).length,
        color: STATUT_COLORS[label] || '#94a3b8',
      }))
      .filter((slice) => slice.value > 0);
  }, [filtered]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const ouvert = filtered.filter((item) => item.statut === 'Ouvert').length;
    const demande = filtered.filter((item) => item.statut === "Demande d'explication").length;
    const reponse = filtered.filter((item) => item.statut === 'Réponse reçue').length;
    const clos = filtered.filter((item) => item.statut === 'Clos').length;
    const sansReponse = filtered.filter(isSansReponse).length;
    return { total, ouvert, demande, reponse, clos, sansReponse };
  }, [filtered]);

  const periodLabel = useMemo(() => {
    if (yearFilter === '') return 'Toutes périodes';
    if (monthFilter === '') return `Année ${yearFilter}`;
    const month = MONTHS.find((item) => item.value === monthFilter)?.label || '';
    return `${month} ${yearFilter}`;
  }, [yearFilter, monthFilter]);

  function openList(title: string, predicate: (item: PpcDisciplineCase) => boolean) {
    setDrill({ title: `Voir la liste — ${title}`, predicate });
  }

  function periodAnd(extra: (item: PpcDisciplineCase) => boolean) {
    return (item: PpcDisciplineCase) => inPeriod(item, yearFilter, monthFilter) && extra(item);
  }

  async function exportCases() {
    if (filtered.length === 0) {
      await showError('Aucun cas à exporter pour cette période');
      return;
    }
    setExporting(true);
    try {
      const rows = filtered.map((item) => ({
        Agent: item.employeeName || '',
        Matricule: item.matricule || '',
        Département: item.departement || '',
        Fonction: item.jobTitle || '',
        'Date incident': item.dateIncident || '',
        Motif: item.motif || '',
        Faits: item.faits || '',
        Statut: item.statut || '',
        'Date demande': item.demandeDate || '',
        'Échéance réponse': item.demandeEcheance || '',
        'Lien demande': item.demandeLien || '',
        'Date réponse': item.reponseDate || '',
        'Lien réponse': item.reponseLien || '',
        Sanction: item.sanction || '',
        'Date sanction': item.dateSanction || '',
      }));
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet['!cols'] = [
        { wch: 28 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 14 },
        { wch: 36 }, { wch: 40 }, { wch: 22 }, { wch: 14 }, { wch: 16 },
        { wch: 36 }, { wch: 14 }, { wch: 36 }, { wch: 22 }, { wch: 14 },
      ];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Cas');
      const slug = periodLabel
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      XLSX.writeFile(book, `cas-disciplinaires-${slug || 'tous'}.xlsx`);
    } catch {
      await showError('Export impossible');
    } finally {
      setExporting(false);
    }
  }

  const drillRows = useMemo(
    () => (drill ? toRows(cases.filter(drill.predicate)) : []),
    [cases, drill],
  );

  return (
    <div className="ppc-discipline-dashboard">
      <div className="contractants-dash-filters">
        <select
          className="filter-select"
          value={yearFilter === '' ? '' : String(yearFilter)}
          onChange={(event) => {
            const value = event.target.value;
            setYearFilter(value ? Number(value) : '');
            if (!value) setMonthFilter('');
          }}
          aria-label="Filtrer par année"
          title="Filtrer par année de l'incident"
        >
          <option value="">Toutes les années</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>{year}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={monthFilter === '' ? '' : String(monthFilter)}
          onChange={(event) => {
            const value = event.target.value;
            setMonthFilter(value ? Number(value) : '');
          }}
          disabled={yearFilter === ''}
          aria-label="Filtrer par mois"
          title={yearFilter === '' ? 'Choisissez d’abord une année' : 'Filtrer par mois de l’incident'}
        >
          <option value="">Tous les mois</option>
          {MONTHS.map((month) => (
            <option key={month.value} value={month.value}>{month.label}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-outline btn-export btn-with-icon"
          disabled={exporting}
          onClick={() => void exportCases()}
          title={`Exporter les cas — ${periodLabel}`}
        >
          {exporting ? <span className="btn-spinner" aria-hidden="true" /> : <ExportIcon />}
          {exporting ? 'Export…' : 'Export'}
        </button>
      </div>

      <div className="contractants-kpi-row">
        <button type="button" className="card card-glow card-glow-red contractants-kpi is-clickable" title="Voir la liste — Tous les cas" onClick={() => openList(periodLabel === 'Toutes périodes' ? 'Tous les cas' : periodLabel, periodAnd(() => true))}>
          <div className="card-label">Total</div>
          <div className="card-value">{kpis.total}</div>
          <div className="contractants-kpi-detail">{periodLabel}</div>
        </button>
        <button type="button" className="card card-glow card-glow-amber contractants-kpi is-clickable" title="Voir la liste — Ouvert" onClick={() => openList('Ouvert', periodAnd((item) => item.statut === 'Ouvert'))}>
          <div className="card-label">Ouvert</div>
          <div className="card-value">{kpis.ouvert}</div>
          <div className="contractants-kpi-detail">{shareLabel(kpis.ouvert, kpis.total)}</div>
        </button>
        <button type="button" className="card card-glow card-glow-cyan contractants-kpi is-clickable" title="Voir la liste — Demande d'explication" onClick={() => openList("Demande d'explication", periodAnd((item) => item.statut === "Demande d'explication"))}>
          <div className="card-label">Demande</div>
          <div className="card-value">{kpis.demande}</div>
          <div className="contractants-kpi-detail">{shareLabel(kpis.demande, kpis.total)}</div>
        </button>
        <button type="button" className="card card-glow card-glow-violet contractants-kpi is-clickable" title="Voir la liste — Réponse reçue" onClick={() => openList('Réponse reçue', periodAnd((item) => item.statut === 'Réponse reçue'))}>
          <div className="card-label">Réponse</div>
          <div className="card-value">{kpis.reponse}</div>
          <div className="contractants-kpi-detail">{shareLabel(kpis.reponse, kpis.total)}</div>
        </button>
        <button type="button" className="card card-glow card-glow-green contractants-kpi is-clickable" title="Voir la liste — Clos" onClick={() => openList('Clos', periodAnd((item) => item.statut === 'Clos'))}>
          <div className="card-label">Clos</div>
          <div className="card-value">{kpis.clos}</div>
          <div className="contractants-kpi-detail">{shareLabel(kpis.clos, kpis.total)}</div>
        </button>
        <button type="button" className="card card-glow card-glow-amber contractants-kpi is-clickable" title="Voir la liste — Sans réponse" onClick={() => openList('Sans réponse', periodAnd(isSansReponse))}>
          <div className="card-label">Sans réponse</div>
          <div className="card-value">{kpis.sansReponse}</div>
          <div className="contractants-kpi-detail">{shareLabel(kpis.sansReponse, kpis.total)}</div>
        </button>
      </div>

      <div className="ppc-discipline-evolution">
        <DependantsBarChart
          title={`Évolution annuelle — ${evolutionYear}`}
          items={monthly.map((item) => ({ label: item.label, value: item.value }))}
          fitAll
          barClassName="dependants-bar-fill"
          onItemClick={(label) => {
            const item = monthly.find((month) => month.label === label);
            if (!item) return;
            openList(`${item.name} ${evolutionYear}`, (row) => {
              const parts = incidentParts(row);
              return parts?.year === evolutionYear && parts.month === item.month;
            });
          }}
        />
      </div>

      <div className="ppc-discipline-charts">
        <DependantsBarChart
          title="Par département"
          items={byDepartment}
          fitAll
          compact
          barClassName="employees-bar-fill-dept"
          onItemClick={(label) => openList(`Département · ${label}`, periodAnd((item) => deptLabel(item.departement) === label))}
        />
        <HomeDonutChart
          title="Par statut"
          slices={statutSlices}
          centerLabel="Cas"
          emptyLabel="Aucun cas"
          onTitleClick={() => openList(periodLabel === 'Toutes périodes' ? 'Tous les cas' : periodLabel, periodAnd(() => true))}
          onItemClick={(label) => openList(label, periodAnd((item) => item.statut === label))}
        />
      </div>

      {drill && (
        <DashboardListModal
          title={drill.title}
          columns={COLUMNS}
          rows={drillRows}
          onClose={() => setDrill(null)}
          searchPlaceholder="Rechercher dans la liste…"
        />
      )}
    </div>
  );
}
