'use client';

import { useEffect, useMemo, useState } from 'react';
import AirtimeDrcMap, {
  airtimePlaceKey,
  airtimePlaceLabel,
  type AirtimePlaceStat,
} from '@/components/airtime/AirtimeDrcMap';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import type { Contractant } from '@/lib/contractants-types';
import type { Employee } from '@/lib/types';

const COLORS = ['#e30613', '#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#db2777', '#0891b2', '#ea580c', '#64748b', '#16a34a'];

interface Person {
  id: string;
  nom: string;
  company: string;
  lieu: string;
  place: string;
  kind: 'Interne' | 'Externe';
}

interface Drill {
  title: string;
  rows: DashboardListRow[];
}

const COLUMNS: DashboardListColumn[] = [
  { key: 'nom', label: 'Nom' },
  { key: 'company', label: 'Compagnie' },
  { key: 'kind', label: 'Origine' },
  { key: 'lieu', label: 'Localisation' },
];

function shortCompany(value: string): string {
  const folded = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (folded.includes('quarry')) return 'PPC Quarrying';
  if (!folded || folded === 'ppc' || folded.includes('ppc barnet')) return 'PPC';
  return value.trim() || '—';
}

function isActiveEmployee(employee: Employee): boolean {
  return !/^(inact|exit)/i.test(employee.statut || '');
}

export default function HomeWorkforceMap() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [drill, setDrill] = useState<Drill | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [employeesRes, contractantsRes] = await Promise.all([
          fetch('/api/employees', { cache: 'no-store' }),
          fetch('/api/employes/contractants', { cache: 'no-store' }),
        ]);
        const next: Person[] = [];
        if (employeesRes.ok) {
          const employees = await employeesRes.json() as Employee[];
          for (const employee of Array.isArray(employees) ? employees : []) {
            if (!isActiveEmployee(employee)) continue;
            const lieu = employee.localisation?.trim() || 'Non renseigné';
            next.push({
              id: `ppc-${employee.matricule}`,
              nom: employee.nom,
              company: shortCompany(employee.company || 'PPC'),
              lieu,
              place: airtimePlaceKey(lieu),
              kind: 'Interne',
            });
          }
        }
        if (contractantsRes.ok) {
          const payload = await contractantsRes.json() as { contractants?: Contractant[] };
          for (const contractant of payload.contractants || []) {
            for (const employee of contractant.employees || []) {
              if (String(employee.dateSortie || '').trim()) continue;
              const lieu = employee.lieuAffectation?.trim() || 'Non renseigné';
              next.push({
                id: `ext-${contractant.id}-${employee.id}`,
                nom: employee.nom,
                company: shortCompany(contractant.denomination),
                lieu,
                place: airtimePlaceKey(lieu),
                kind: 'Externe',
              });
            }
          }
        }
        if (!cancelled) setPeople(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const companies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const person of people) counts.set(person.company, (counts.get(person.company) || 0) + 1);
    const names = [...counts.entries()].sort((a, b) => {
      if (a[0] === 'PPC') return -1;
      if (b[0] === 'PPC') return 1;
      return b[1] - a[1] || a[0].localeCompare(b[0], 'fr');
    });
    let palette = 1;
    return names.map(([name, count]) => {
      if (name === 'PPC') return { name, count, color: '#e30613' };
      const color = COLORS[palette % COLORS.length];
      palette += 1;
      return { name, count, color };
    });
  }, [people]);

  const colorOf = useMemo(() => {
    const map = new Map(companies.map((company) => [company.name, company.color]));
    return (name: string) => map.get(name) || '#64748b';
  }, [companies]);

  const sites = useMemo((): AirtimePlaceStat[] => {
    const buckets = new Map<string, Map<string, number>>();
    for (const person of people) {
      const companiesAtPlace = buckets.get(person.place) || new Map<string, number>();
      companiesAtPlace.set(person.company, (companiesAtPlace.get(person.company) || 0) + 1);
      buckets.set(person.place, companiesAtPlace);
    }
    return [...buckets.entries()]
      .map(([place, counts]) => {
        const facts = [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
          .map(([company, value]) => ({
            id: company,
            label: company,
            value,
            color: colorOf(company),
          }));
        const total = facts.reduce((sum, fact) => sum + fact.value, 0);
        return {
          id: place,
          label: airtimePlaceLabel(place),
          total,
          ppc: counts.get('PPC') || 0,
          contractant: total - (counts.get('PPC') || 0),
          assigned: 0,
          unassigned: 0,
          facts: [
            ...facts,
            { id: 'total', label: 'Total', value: total },
          ],
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [people, colorOf]);

  function openList(title: string, list: Person[]) {
    setDrill({
      title,
      rows: list
        .slice()
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
        .map((person) => ({
          id: person.id,
          cells: {
            nom: person.nom,
            company: person.company,
            kind: person.kind,
            lieu: person.lieu,
          },
        })),
    });
  }

  return (
    <section className="panel home-module-panel home-workforce-map">
      <div className="home-module-head">
        <div>
          <h3>Effectif par localisation</h3>
          <p>Employés internes et externes, une couleur par compagnie</p>
        </div>
      </div>
      {loading ? (
        <p className="empty-state">Chargement de la carte…</p>
      ) : sites.length === 0 ? (
        <p className="empty-state">Aucune donnée disponible.</p>
      ) : (
        <>
          <AirtimeDrcMap
            bare
            sites={sites}
            onSelect={(place, slice) => {
              const atPlace = people.filter((person) => person.place === place);
              const label = airtimePlaceLabel(place);
              if (slice === 'total' || slice === 'all') {
                openList(`Voir la liste — ${label}`, atPlace);
                return;
              }
              openList(
                `Voir la liste — ${label} · ${slice}`,
                atPlace.filter((person) => person.company === slice),
              );
            }}
          />
          <div className="home-workforce-legend">
            {companies.map((company) => (
              <button
                key={company.name}
                type="button"
                title={`Voir la liste — ${company.name}`}
                onClick={() => openList(`Voir la liste — ${company.name}`, people.filter((person) => person.company === company.name))}
              >
                <i style={{ background: company.color }} />
                <span>{company.name}</span>
                <b>{company.count}</b>
              </button>
            ))}
          </div>
        </>
      )}
      {drill ? (
        <DashboardListModal
          title={drill.title}
          columns={COLUMNS}
          rows={drill.rows}
          onClose={() => setDrill(null)}
          searchPlaceholder="Filtrer la liste…"
        />
      ) : null}
    </section>
  );
}
