'use client';

import { useMemo, useState } from 'react';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import {
  formatSanteDateFr,
  isFamilyPatientType,
  santeDisplayName,
  santePathologieBadgeStyle,
} from '@/lib/sante-utils';
import type { SanteVisit } from '@/lib/sante-types';

type FilterKey =
  | 'date'
  | 'patient'
  | 'lien'
  | 'type'
  | 'pathologie'
  | 'traitement'
  | 'reference';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  date: [],
  patient: [],
  lien: [],
  type: [],
  pathologie: [],
  traitement: [],
  reference: [],
};

interface Props {
  visits: SanteVisit[];
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (visit: SanteVisit) => void;
  onHistory: (visit: SanteVisit) => void;
  onDelete: (visit: SanteVisit) => void;
}

function lienLabel(visit: SanteVisit): string {
  if (!visit.employeeMatricule) return '—';
  if (isFamilyPatientType(visit.typeMalade)) {
    return `${visit.employeeNom || '—'} (${visit.employeeMatricule})`;
  }
  return visit.employeeMatricule;
}

export default function SanteDataView({
  visits,
  canEdit,
  canDelete,
  onEdit,
  onHistory,
  onDelete,
}: Props) {
  const [colFilters, setColFilters] = useState(EMPTY_FILTERS);
  const [menu, setMenu] = useState<{ x: number; y: number; visit: SanteVisit } | null>(null);

  const rows = useMemo(
    () =>
      visits.map((visit) => ({
        visit,
        date: formatSanteDateFr(visit.date),
        patient: santeDisplayName(visit) || '—',
        lien: lienLabel(visit),
        type: visit.typeMalade || '—',
        pathologie: visit.pathologie || '—',
        traitement: visit.traitement || '—',
        reference: visit.reference || 'NON',
      })),
    [visits],
  );

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(rows, {
        date: (row) => row.date,
        patient: (row) => row.patient,
        lien: (row) => row.lien,
        type: (row) => row.type,
        pathologie: (row) => row.pathologie,
        traitement: (row) => row.traitement,
        reference: (row) => row.reference,
      }),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesColumnFilter(colFilters.date, row.date)
          && matchesColumnFilter(colFilters.patient, row.patient)
          && matchesColumnFilter(colFilters.lien, row.lien)
          && matchesColumnFilter(colFilters.type, row.type)
          && matchesColumnFilter(colFilters.pathologie, row.pathologie)
          && matchesColumnFilter(colFilters.traitement, row.traitement)
          && matchesColumnFilter(colFilters.reference, row.reference),
      ),
    [rows, colFilters],
  );

  const activeFilters = countActiveColumnFilters(colFilters);

  const menuItems = (visit: SanteVisit): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      { id: 'history', label: 'Historique', icon: 'view', onClick: () => onHistory(visit) },
    ];
    if (canEdit) {
      items.push({ id: 'edit', label: 'Modifier', icon: 'edit', onClick: () => onEdit(visit) });
    }
    if (canDelete) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => onDelete(visit),
      });
    }
    return items;
  };

  return (
    <>
      {activeFilters > 0 ? (
        <p className="sante-filter-hint">{activeFilters} filtre(s) de colonnes actif(s)</p>
      ) : null}
      <div className="table-wrap sante-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th className="th-filter">
              <TableHeaderFilter
                label="Date"
                values={filterValues.date}
                selected={colFilters.date}
                onChange={(v) => setColFilters((prev) => ({ ...prev, date: v }))}
              />
            </th>
            <th className="th-filter">
              <TableHeaderFilter
                label="Patient"
                values={filterValues.patient}
                selected={colFilters.patient}
                onChange={(v) => setColFilters((prev) => ({ ...prev, patient: v }))}
              />
            </th>
            <th>Sexe</th>
            <th>Âge</th>
            <th className="th-filter">
              <TableHeaderFilter
                label="Type"
                values={filterValues.type}
                selected={colFilters.type}
                onChange={(v) => setColFilters((prev) => ({ ...prev, type: v }))}
              />
            </th>
            <th className="th-filter">
              <TableHeaderFilter
                label="Agent lié"
                values={filterValues.lien}
                selected={colFilters.lien}
                onChange={(v) => setColFilters((prev) => ({ ...prev, lien: v }))}
              />
            </th>
            <th className="th-filter">
              <TableHeaderFilter
                label="Pathologie"
                values={filterValues.pathologie}
                selected={colFilters.pathologie}
                onChange={(v) => setColFilters((prev) => ({ ...prev, pathologie: v }))}
              />
            </th>
            <th className="th-filter">
              <TableHeaderFilter
                label="Traitement"
                values={filterValues.traitement}
                selected={colFilters.traitement}
                onChange={(v) => setColFilters((prev) => ({ ...prev, traitement: v }))}
              />
            </th>
            <th className="th-filter">
              <TableHeaderFilter
                label="Référence"
                values={filterValues.reference}
                selected={colFilters.reference}
                onChange={(v) => setColFilters((prev) => ({ ...prev, reference: v }))}
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="empty-state">
                Aucun cas trouvé.
              </td>
            </tr>
          ) : (
            filtered.map((row) => {
              const pathoTone = santePathologieBadgeStyle(row.pathologie);
              return (
              <tr
                key={row.visit.id}
                onClick={() => onHistory(row.visit)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, visit: row.visit });
                }}
                title="Voir l’historique — clic. Clic droit pour modifier."
              >
                <td>{row.date}</td>
                <td>
                  <strong>{row.patient}</strong>
                </td>
                <td>{row.visit.sexe || '—'}</td>
                <td>{row.visit.age ?? '—'}</td>
                <td>{row.type}</td>
                <td>{row.lien}</td>
                <td>
                  {pathoTone ? (
                    <span className="sante-patho-pill" style={pathoTone} title={row.pathologie}>
                      {row.pathologie}
                    </span>
                  ) : (
                    row.pathologie
                  )}
                </td>
                <td>{row.traitement}</td>
                <td>
                  <span className={row.reference.toUpperCase() === 'NON' ? '' : 'sante-ref-pill'}>
                    {row.reference}
                  </span>
                </td>
              </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
      {menu ? (
        <RowContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.visit)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}
