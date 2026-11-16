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
  formatSickMonthLabel,
  isSickAttestationYes,
  SICK_LEAVE_PROVENANCES,
} from '@/lib/sick-leave-utils';
import type { SickLeaveCompareRow } from '@/lib/sick-leave-types';

type FilterKey = 'mois' | 'nom' | 'department' | 'site' | 'bucket' | 'attestation' | 'provenance';

const EMPTY: Record<FilterKey, string[]> = {
  mois: [],
  nom: [],
  department: [],
  site: [],
  bucket: [],
  attestation: [],
  provenance: [],
};

const BUCKET_LABEL: Record<SickLeaveCompareRow['bucket'], string> = {
  'attestation-only': 'Attestation sans application',
  'application-only': 'Application sans attestation',
  both: 'Les deux',
  none: 'Sans écart',
};

interface Props {
  rows: SickLeaveCompareRow[];
  canEdit: boolean;
  canDelete: boolean;
  onAddAttestation: (row: SickLeaveCompareRow) => void;
  onEditAttestation: (row: SickLeaveCompareRow) => void;
  onDeleteAttestation: (row: SickLeaveCompareRow) => void;
  onPatchRow: (row: SickLeaveCompareRow, patch: { attestationImported?: string; provenance?: string }) => void;
}

export default function SickLeaveDataView({
  rows,
  canEdit,
  canDelete,
  onAddAttestation,
  onEditAttestation,
  onDeleteAttestation,
  onPatchRow,
}: Props) {
  const [colFilters, setColFilters] = useState(EMPTY);
  const [menu, setMenu] = useState<{ x: number; y: number; row: SickLeaveCompareRow } | null>(null);

  const mapped = useMemo(
    () =>
      rows.map((row) => {
        const attOui = row.hasAttestation || isSickAttestationYes(row.attestationImported);
        return {
          row,
          mois: formatSickMonthLabel(row.month, row.year),
          nom: row.nom || '—',
          nomLabel: `${row.nom || '—'} (${row.matricule})`,
          department: row.department || '—',
          site: row.site || '—',
          attestation: attOui ? 'Oui' : 'Non',
          bucket: BUCKET_LABEL[row.bucket],
          provenance: row.provenance || '—',
        };
      }),
    [rows],
  );

  const filtered = useMemo(
    () =>
      mapped.filter((item) =>
        matchesColumnFilter(colFilters.mois, item.mois)
        && matchesColumnFilter(colFilters.nom, item.nomLabel)
        && matchesColumnFilter(colFilters.department, item.department)
        && matchesColumnFilter(colFilters.site, item.site)
        && matchesColumnFilter(colFilters.bucket, item.bucket)
        && matchesColumnFilter(colFilters.attestation, item.attestation)
        && matchesColumnFilter(colFilters.provenance, item.provenance)
      ),
    [mapped, colFilters],
  );

  const values = useMemo(
    () =>
      buildColumnFilterValues(mapped, {
        mois: (item) => item.mois,
        nom: (item) => item.nomLabel,
        department: (item) => item.department,
        site: (item) => item.site,
        bucket: (item) => item.bucket,
        attestation: (item) => item.attestation,
        provenance: (item) => item.provenance,
      }),
    [mapped],
  );

  const items: ContextMenuItem[] = menu
    ? [
        ...(canEdit
          ? [{
              id: menu.row.attestationId ? 'edit' : 'add',
              label: menu.row.attestationId ? 'Modifier l’attestation' : 'Saisir l’attestation',
              icon: 'edit' as const,
              onClick: () => (menu.row.attestationId ? onEditAttestation(menu.row) : onAddAttestation(menu.row)),
            }]
          : []),
        ...(menu.row.attestationId && canDelete
          ? [{ id: 'delete', label: 'Supprimer l’attestation', icon: 'delete' as const, danger: true, onClick: () => onDeleteAttestation(menu.row) }]
          : []),
      ]
    : [];

  return (
    <div className="sick-leave-data-view">
      {countActiveColumnFilters(colFilters) > 0 ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setColFilters(EMPTY)}>
          Réinitialiser les filtres
        </button>
      ) : null}
      <div className="table-wrap sante-table-wrap sick-leave-table-wrap">
        <table className="data-table sick-leave-table">
          <thead>
            <tr>
              <th className="th-filter sl-col-mois">
                <TableHeaderFilter label="Mois" values={values.mois} selected={colFilters.mois} onChange={(v) => setColFilters((p) => ({ ...p, mois: v }))} />
              </th>
              <th className="th-filter sl-col-nom">
                <TableHeaderFilter label="Nom" values={values.nom} selected={colFilters.nom} onChange={(v) => setColFilters((p) => ({ ...p, nom: v }))} />
              </th>
              <th className="th-filter sl-col-dept">
                <TableHeaderFilter label="Département" values={values.department} selected={colFilters.department} onChange={(v) => setColFilters((p) => ({ ...p, department: v }))} />
              </th>
              <th className="th-filter sl-col-site">
                <TableHeaderFilter label="Site" values={values.site} selected={colFilters.site} onChange={(v) => setColFilters((p) => ({ ...p, site: v }))} />
              </th>
              <th className="sl-col-days">Jours SL</th>
              <th className="th-filter sl-col-att">
                <TableHeaderFilter label="Attestation" values={values.attestation} selected={colFilters.attestation} onChange={(v) => setColFilters((p) => ({ ...p, attestation: v }))} />
              </th>
              <th className="th-filter sl-col-bucket">
                <TableHeaderFilter label="Écart" values={values.bucket} selected={colFilters.bucket} onChange={(v) => setColFilters((p) => ({ ...p, bucket: v }))} />
              </th>
              <th className="th-filter sl-col-prov">
                <TableHeaderFilter label="Provenance" values={values.provenance} selected={colFilters.provenance} onChange={(v) => setColFilters((p) => ({ ...p, provenance: v }))} />
              </th>
              <th className="sl-col-obs">Observations</th>
              <th className="sl-col-hosp">Hôpital</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-state">Aucune ligne.</td>
              </tr>
            ) : filtered.map((item) => {
              const missingAtt = item.row.hasApplication && item.attestation !== 'Oui';
              return (
                <tr
                  key={item.row.key}
                  className={[
                    item.row.parti ? 'sick-leave-row-exit' : '',
                    missingAtt ? 'sick-leave-row-missing-att' : '',
                  ].filter(Boolean).join(' ') || undefined}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ x: event.clientX, y: event.clientY, row: item.row });
                  }}
                >
                  <td title={item.mois}>{item.mois}</td>
                  <td
                    className={item.row.parti ? 'sick-leave-name-exit' : undefined}
                    title={item.row.parti ? `${item.nomLabel} — sorti` : item.nomLabel}
                  >
                    <strong>{item.nom}</strong>
                    <span className="sick-leave-matr">{item.row.matricule}</span>
                  </td>
                  <td title={item.department}>{item.department}</td>
                  <td title={item.site}>{item.site}</td>
                  <td className={missingAtt ? 'sick-leave-missing-att' : undefined}>{item.row.days ?? '—'}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="sick-leave-cell-select"
                        value={item.attestation}
                        aria-label="Attestation"
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.stopPropagation()}
                        onChange={(event) => onPatchRow(item.row, { attestationImported: event.target.value })}
                      >
                        <option value="Non">Non</option>
                        <option value="Oui">Oui</option>
                      </select>
                    ) : item.attestation}
                  </td>
                  <td title={item.bucket}>{item.bucket}</td>
                  <td>
                    {canEdit ? (
                      <select
                        className="sick-leave-cell-select"
                        value={item.row.provenance || ''}
                        aria-label="Provenance"
                        onClick={(event) => event.stopPropagation()}
                        onContextMenu={(event) => event.stopPropagation()}
                        onChange={(event) => onPatchRow(item.row, { provenance: event.target.value })}
                      >
                        <option value="">—</option>
                        {SICK_LEAVE_PROVENANCES.map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    ) : item.provenance}
                  </td>
                  <td title={item.row.observations || undefined}>{item.row.observations || '—'}</td>
                  <td title={item.row.hospital || undefined}>{item.row.hospital || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {menu && items.length ? (
        <RowContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />
      ) : null}
    </div>
  );
}
