'use client';

import type { FactureGroupNode, FactureStage } from '@/lib/factures-fournisseurs/types';
import { formatUsdLike, stageColumnLabels } from '@/lib/factures-fournisseurs/utils';

interface Props {
  stage: FactureStage;
  groups: FactureGroupNode[];
  selectedIds: Set<string>;
  onToggleSelectMany: (ids: string[], selected: boolean) => void;
  onOpenGroup: (group: FactureGroupNode) => void;
  canEdit?: boolean;
}

export default function FacturesSuiviStageList({
  stage,
  groups,
  selectedIds,
  onToggleSelectMany,
  onOpenGroup,
  canEdit,
}: Props) {
  const labels = stageColumnLabels(stage);

  if (!groups.length) {
    return <p className="empty-state">Aucune entrée {stage}.</p>;
  }

  return (
    <div className="factures-suivi-table-wrap">
      <table className="factures-suivi-table factures-suivi-stage-table">
        <thead>
          <tr>
            <th className="col-check" />
            <th className="col-row-num">#</th>
            <th>{labels.date}</th>
            <th>{labels.numero}</th>
            <th>Montant</th>
            <th>Nombre de factures</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, index) => {
            const ids = (group.factures ?? []).map((f) => f.id);
            const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
            const someSelected = ids.some((id) => selectedIds.has(id));

            return (
              <tr
                key={group.key}
                className="factures-suivi-row is-group-line"
                onClick={() => onOpenGroup(group)}
                title="Cliquez pour voir les factures"
              >
                <td
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {canEdit && ids.length > 0 ? (
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected && !allSelected;
                      }}
                      onChange={(e) => onToggleSelectMany(ids, e.target.checked)}
                      aria-label={`Sélectionner ${group.label} ${group.ref}`}
                    />
                  ) : null}
                </td>
                <td className="col-row-num is-num">{index + 1}</td>
                <td>{group.date || '—'}</td>
                <td>
                  <span className="factures-suivi-group-badge">{group.label}</span>
                  <strong className="factures-suivi-group-ref">{group.ref || '—'}</strong>
                </td>
                <td className="is-num">
                  <strong>{formatUsdLike(group.montant)} $</strong>
                </td>
                <td>
                  <span className="factures-suivi-group-count">
                    {group.count} facture{group.count > 1 ? 's' : ''}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
