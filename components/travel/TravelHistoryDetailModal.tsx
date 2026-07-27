'use client';

import { useCallback, useEffect, useState } from 'react';
import { computeBudgetLineTotal, computeTripDays } from '@/lib/travel-form';
import type { TravelHistoryRow } from '@/lib/travel-history-types';
import type { CashRequestRecord } from '@/lib/travel-types';

interface Props {
  row: TravelHistoryRow | null;
  onClose: () => void;
}

function formatMoney(value: number): string {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('fr-FR');
    }
  }
  return value;
}

function DetailField({ label, value }: { label: string; value: string | number }) {
  const display = value === '' || value === undefined || value === null ? '—' : value;
  return (
    <div className="travel-history-detail-field">
      <span className="travel-history-detail-label">{label}</span>
      <strong>{display}</strong>
    </div>
  );
}

function DetailGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="travel-history-detail-group">
      <h4 className="travel-history-detail-group-title">{title}</h4>
      <div className="travel-history-detail-grid">{children}</div>
    </section>
  );
}

export default function TravelHistoryDetailModal({ row, onClose }: Props) {
  const [record, setRecord] = useState<CashRequestRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecord = useCallback(async (missionRef: string, recordId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const endpoints = [
        recordId ? `/api/travel/cash-requests/${recordId}` : null,
        `/api/travel/cash-requests/by-ref/${encodeURIComponent(missionRef)}`,
      ].filter(Boolean) as string[];

      for (const endpoint of endpoints) {
        const res = await fetch(endpoint);
        const json = await res.json();
        if (res.ok) {
          setRecord(json as CashRequestRecord);
          return;
        }
      }

      setRecord(null);
      setError('Détail introuvable');
    } catch {
      setRecord(null);
      setError('Erreur de chargement du détail');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!row) {
      setRecord(null);
      setError(null);
      return;
    }
    if (row.recordId) {
      void loadRecord(row.ref, row.recordId);
      return;
    }
    void loadRecord(row.ref);
  }, [row, loadRecord]);

  if (!row) return null;

  const travel = record?.travel;
  const budgetLines = (travel?.budgetLines ?? []).filter((line) => line.label.trim());
  const peopleCount = travel?.peopleCount ?? 1;
  const tripDays = travel
    ? computeTripDays(travel.departureDate, travel.returnDate)
    : row.tripDays;
  const budgetTotal = budgetLines.length
    ? budgetLines.reduce(
        (sum, line) => sum + computeBudgetLineTotal(line.amount, peopleCount, tripDays),
        0,
      )
    : record?.total ?? row.totalBudget;

  return (
    <div className="modal-overlay travel-history-detail-overlay" onClick={onClose}>
      <div
        className="modal modal-lg travel-history-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="travel-history-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 id="travel-history-detail-title">{row.ref}</h3>
            <p className="travel-history-detail-subtitle">{row.employee}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body">
          <DetailGroup title="Mission">
            <DetailField label="Date d'enregistrement" value={formatDate(row.date)} />
            <DetailField label="Référence" value={row.ref} />
            <DetailField label="Objet / Trip purpose" value={record?.objet || travel?.tripPurpose || ''} />
            <DetailField label="Total budget" value={formatMoney(budgetTotal)} />
          </DetailGroup>

          {loading && <div className="loading travel-history-detail-loading">Chargement du détail…</div>}
          {error && !loading && <div className="alert alert-danger">{error}</div>}

          {!loading && record && (
            <>
              <DetailGroup title="Identité">
                <DetailField label="Nom employé" value={record.employeeName} />
                <DetailField label="Matricule" value={record.employeeMatricule} />
                <DetailField label="Position" value={travel?.position || ''} />
                <DetailField label="Département" value={travel?.department || record.employeeDepartment} />
                <DetailField label="Centre de coût" value={travel?.costCenter || record.costCenter} />
                <DetailField label="Company name" value={travel?.companyName || ''} />
              </DetailGroup>

              <DetailGroup title="Voyage">
                <DetailField label="Date document" value={formatDate(travel?.documentDate || record.requestDate)} />
                <DetailField label="Departure date" value={formatDate(travel?.departureDate || '')} />
                <DetailField label="Return date" value={formatDate(travel?.returnDate || '')} />
                <DetailField label="Nombre de jours" value={tripDays} />
                <DetailField label="Nombre de personnes" value={peopleCount} />
                <DetailField label="Departure place" value={travel?.departurePlace || ''} />
                <DetailField label="Destination place" value={travel?.destinationPlace || ''} />
                <DetailField label="Department to work with" value={travel?.departmentToWorkWith || ''} />
                <DetailField label="Contact person" value={travel?.contactPerson || ''} />
                <DetailField label="Moyen de transport" value={travel?.transportMeans || ''} />
                <DetailField
                  label="Signataire ordre de paiement"
                  value={travel?.paymentOrderSignatory || ''}
                />
              </DetailGroup>

              <section className="travel-history-detail-group">
                <h4 className="travel-history-detail-group-title">Budget voyage</h4>
                <div className="table-wrap">
                  <table className="travel-history-budget-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th>Montant unitaire (USD)</th>
                        <th># Pers.</th>
                        <th># Jours</th>
                        <th>Total ligne</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetLines.length > 0 ? (
                        budgetLines.map((line, index) => {
                          const lineTotal = computeBudgetLineTotal(
                            line.amount,
                            peopleCount,
                            tripDays,
                          );
                          return (
                            <tr key={`${line.label}-${index}`}>
                              <td>{line.label}</td>
                              <td>{formatMoney(line.amount)}</td>
                              <td className="travel-history-budget-num">{peopleCount}</td>
                              <td className="travel-history-budget-num">{tripDays}</td>
                              <td>{lineTotal > 0 ? formatMoney(lineTotal) : '—'}</td>
                            </tr>
                          );
                        })
                      ) : (
                        record.lines.map((line) => (
                          <tr key={`${line.ref}-${line.description}`}>
                            <td>{line.description}</td>
                            <td>—</td>
                            <td className="travel-history-budget-num">{peopleCount}</td>
                            <td className="travel-history-budget-num">{tripDays}</td>
                            <td>{formatMoney(line.amount)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>Total</td>
                        <td>{formatMoney(budgetTotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>

              {record.files && record.files.length > 0 && (
                <section className="travel-history-detail-group">
                  <h4 className="travel-history-detail-group-title">Documents générés</h4>
                  <ul className="travel-history-files-list">
                    {record.files.map((file) => (
                      <li key={file.type}>
                        <a
                          href={`/api/travel/cash-requests/${record.id}/download?type=${encodeURIComponent(file.type)}`}
                          className="travel-history-file-link"
                        >
                          {file.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
