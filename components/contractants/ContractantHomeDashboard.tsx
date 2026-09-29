'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import ContractantsDashboard from '@/components/contractants/ContractantsDashboard';
import type { FlatContractantEmployee } from '@/lib/contractant-portal';
import { greetingForHour, recentExits, topNewHires } from '@/lib/contractant-portal';
import { isContractantEffectifEmployee } from '@/lib/capital-hr-effectif';
import type { Contractant } from '@/lib/contractants-types';

interface Props {
  userName: string;
  contractorLabel: string;
  contractants: Contractant[];
  employees: FlatContractantEmployee[];
  disciplineOpenCount?: number;
  hideContractantFilter?: boolean;
}

function formatDate(value: string): string {
  if (!value) return '—';
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR');
}

export default function ContractantHomeDashboard({
  userName,
  contractorLabel,
  contractants,
  employees,
  disciplineOpenCount = 0,
  hideContractantFilter = false,
}: Props) {
  const effectifEmployees = useMemo(
    () =>
      employees.filter((e) => isContractantEffectifEmployee(e, e.contractantNom)),
    [employees],
  );
  const news = useMemo(() => topNewHires(effectifEmployees, 10), [effectifEmployees]);
  const exits = useMemo(() => recentExits(employees, 10), [employees]);
  const greeting = greetingForHour();
  const firstName = userName.trim().split(/\s+/)[0] || userName;

  return (
    <div className="contractant-home is-compact">
      <section className="contractant-home-hero">
        <div className="contractant-home-hero-main">
          <p className="contractant-home-kicker">{contractorLabel}</p>
          <h2 className="contractant-home-greeting">
            {greeting}, {firstName}
          </h2>
        </div>
        <div className="contractant-home-hero-meta">
          <Link
            href="/employes/contractants/discipline"
            className="contractant-home-chip"
            title="Voir les cas disciplinaires"
          >
            Cas ouverts
            <strong>{disciplineOpenCount}</strong>
          </Link>
          <span className="contractant-home-chip is-muted">
            Effectif
            <strong>{effectifEmployees.length}</strong>
          </span>
        </div>
      </section>

      <ContractantsDashboard
        contractants={contractants}
        employees={effectifEmployees}
        hideContractantFilter={hideContractantFilter}
        compact
      />

      <div className="contractant-home-grid">
        <section className="contractant-home-panel">
          <header>
            <h3>Top 10 — Nouveaux</h3>
            <span>Dernières arrivées</span>
          </header>
          {news.length === 0 ? (
            <p className="contractant-home-empty">Aucune arrivée récente.</p>
          ) : (
            <ol className="contractant-home-list">
              {news.map((e, index) => (
                <li key={`${e.contractantId}-${e.id}`}>
                  <span className="contractant-home-rank">{index + 1}</span>
                  <div>
                    <strong>{e.nom}</strong>
                    <small>
                      {e.fonction || '—'} · {e.lieuAffectation || '—'}
                    </small>
                  </div>
                  <time>{formatDate(e.dateEmbauche || e.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="contractant-home-panel">
          <header>
            <h3>Sorties récentes</h3>
            <span>Date de sortie renseignée</span>
          </header>
          {exits.length === 0 ? (
            <p className="contractant-home-empty">Aucune sortie enregistrée.</p>
          ) : (
            <ol className="contractant-home-list">
              {exits.map((e, index) => (
                <li key={`exit-${e.contractantId}-${e.id}`}>
                  <span className="contractant-home-rank">{index + 1}</span>
                  <div>
                    <strong>{e.nom}</strong>
                    <small>
                      {e.fonction || '—'} · {e.lieuAffectation || '—'}
                    </small>
                  </div>
                  <time>{formatDate(e.dateSortie)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
